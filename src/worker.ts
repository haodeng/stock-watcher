import { Hono } from "hono";
import { crossed, fairValueGaps, freshBullishZoneNearby, nasdaqCode, orderBlocks, parseCode, sameSecret, stockNote, type Direction, watchlistName, yahooSymbol, zoneNearby } from "./shared";

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ACCESS_KEY: string;
  SESSION_SECRET: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};
export type Bar = { time: string; open: number; high: number; low: number; close: number; volume: number };
const api = new Hono<{ Bindings: Env }>();
const copenhagenClock = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
type MarketStock = { code: string; name: string; sector: string };
type NasdaqResponse = { data?: { instrumentListing?: { rows?: Array<{ symbol?: string; fullName?: string; sector?: string; isin?: string }> } } };
let denmarkStocks: { expires: number; stocks: MarketStock[] } | undefined;

function number(value: unknown, message: string): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(message);
  return result;
}

function id(value: string): number { return number(value, "id must be numeric"); }

async function signature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function session(secret: string): Promise<string> {
  const expires = String(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return `${expires}.${await signature(expires, secret)}`;
}

async function authenticated(cookie: string | undefined, secret: string): Promise<boolean> {
  const value = cookie?.match(/(?:^|; )sw_session=([^;]+)/)?.[1];
  if (!value) return false;
  const [expires, signed] = value.split(".");
  return Boolean(expires && signed && Number(expires) > Date.now() && sameSecret(signed, await signature(expires, secret)));
}

async function yahooBars(symbol: string, interval: "1d" | "1h", range: string): Promise<Bar[]> {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`, { headers: { "User-Agent": "stock-watcher/1.0" } });
  if (response.status === 429) throw new Error(`Yahoo Finance throttled this request${response.headers.get("retry-after") ? `; retry after ${response.headers.get("retry-after")}` : "; wait a few minutes before retrying"}`);
  if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);
  const result = (await response.json() as { chart?: { result?: Array<{ meta?: { dataGranularity?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> } }> } }).chart?.result?.[0];
  if (!result || result.meta?.dataGranularity !== interval) throw new Error(`Yahoo Finance returned no ${interval} data`);
  const quote = result.indicators?.quote?.[0] ?? {};
  return (result.timestamp ?? []).flatMap((timestamp, index) => {
    const [open, high, low, close, volume] = [quote.open?.[index], quote.high?.[index], quote.low?.[index], quote.close?.[index], quote.volume?.[index]];
    if ([open, high, low, close, volume].some((value) => value == null)) return [];
    const date = new Date(timestamp * 1000);
    return [{ time: interval === "1d" ? date.toISOString().slice(0, 10) : date.toISOString(), open: open!, high: high!, low: low!, close: close!, volume: volume! }];
  });
}

async function marketStocks(): Promise<MarketStock[]> {
  if (denmarkStocks && denmarkStocks.expires > Date.now()) return denmarkStocks.stocks;
  const urls = ["MAIN_MARKET", "FIRST_NORTH"].map((category) => `https://api.nasdaq.com/api/nordic/screener/shares?category=${category}&market=CPH&tableonly=false`);
  const responses = await Promise.all(urls.map((url) => fetch(url, { headers: { "User-Agent": "stock-watcher/1.0" } })));
  if (responses.some((response) => !response.ok)) throw new Error(`Nasdaq returned ${responses.find((response) => !response.ok)?.status} while loading Denmark stocks`);
  const payloads = await Promise.all(responses.map((response) => response.json() as Promise<NasdaqResponse>));
  const stocks = payloads.flatMap((payload) => payload.data?.instrumentListing?.rows ?? []).flatMap((stock) => stock.symbol ? [{ code: nasdaqCode(stock.symbol), name: stock.fullName ?? stock.symbol, sector: stock.sector ?? "" }] : []).sort((left, right) => left.code.localeCompare(right.code));
  denmarkStocks = { stocks, expires: Date.now() + 24 * 60 * 60 * 1000 };
  return stocks;
}

async function saveBars(db: D1Database, stockId: number, table: "daily_bars" | "hourly_bars", column: "trading_date" | "trading_time", bars: Bar[]): Promise<void> {
  for (let index = 0; index < bars.length; index += 50) {
    await db.batch(bars.slice(index, index + 50).map((bar) => db.prepare(`INSERT INTO ${table} (stock_id, ${column}, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(stock_id, ${column}) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume`).bind(stockId, bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume)));
  }
}

export function syncRanges(dailyExists = false, hourlyExists = false): { daily: string; hourly: string } {
  return { daily: dailyExists ? "5d" : "10y", hourly: hourlyExists ? "5d" : "2y" };
}

export function aggregateDailyBars(bars: Bar[], timeframe: "1wk" | "1mo"): Bar[] {
  const grouped = new Map<string, Bar>();
  for (const bar of bars) {
    const date = new Date(`${bar.time}T00:00:00Z`);
    if (timeframe === "1wk") date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = timeframe === "1wk" ? date.toISOString().slice(0, 10) : bar.time.slice(0, 7) + "-01";
    const current = grouped.get(key);
    grouped.set(key, current ? { ...current, high: Math.max(current.high, bar.high), low: Math.min(current.low, bar.low), close: bar.close, volume: current.volume + bar.volume } : { ...bar, time: key });
  }
  return [...grouped.values()];
}

export function aggregateHourlyBars(bars: Bar[]): Bar[] {
  const grouped = new Map<string, Bar>();
  for (const bar of bars) {
    const parts = copenhagenClock.formatToParts(new Date(bar.time));
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
    const hour = Number(part("hour"));
    if (hour < 9 || hour >= 17) continue;
    const key = `${part("year")}-${part("month")}-${part("day")}-${hour < 13 ? "09" : "13"}`;
    const current = grouped.get(key);
    grouped.set(key, current ? { ...current, high: Math.max(current.high, bar.high), low: Math.min(current.low, bar.low), close: bar.close, volume: current.volume + bar.volume } : { ...bar });
  }
  return [...grouped.values()];
}

async function syncStock(env: Env, stockId: number, symbol: string): Promise<void> {
  const [dailyExists, hourlyExists] = await Promise.all([
    env.DB.prepare("SELECT 1 AS value FROM daily_bars WHERE stock_id = ? LIMIT 1").bind(stockId).first(),
    env.DB.prepare("SELECT 1 AS value FROM hourly_bars WHERE stock_id = ? LIMIT 1").bind(stockId).first(),
  ]);
  const ranges = syncRanges(Boolean(dailyExists), Boolean(hourlyExists));
  const daily = await yahooBars(symbol, "1d", ranges.daily);
  await saveBars(env.DB, stockId, "daily_bars", "trading_date", daily);
  const hourly = await yahooBars(symbol, "1h", ranges.hourly);
  await saveBars(env.DB, stockId, "hourly_bars", "trading_time", hourly);
}

async function notify(env: Env, text: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }) });
  return response.ok;
}

async function checkAlerts(env: Env): Promise<void> {
  const alerts = await env.DB.prepare("SELECT a.id, a.stock_id, a.direction, a.target, s.code FROM alerts a JOIN stocks s ON s.id = a.stock_id WHERE a.armed = 1").all<{ id: number; stock_id: number; direction: Direction; target: number; code: string }>();
  for (const alert of alerts.results) {
    const prices = await env.DB.prepare("SELECT close FROM hourly_bars WHERE stock_id = ? ORDER BY trading_time DESC LIMIT 2").bind(alert.stock_id).all<{ close: number }>();
    if (prices.results.length !== 2 || !crossed(alert.direction, alert.target, prices.results[1].close, prices.results[0].close)) continue;
    if (await notify(env, `${alert.code} crossed ${alert.direction} ${alert.target.toFixed(2)} DKK (${prices.results[0].close.toFixed(2)} DKK).`)) {
      await env.DB.batch([env.DB.prepare("UPDATE alerts SET armed = 0 WHERE id = ?").bind(alert.id), env.DB.prepare("INSERT INTO alert_deliveries (alert_id, price) VALUES (?, ?)").bind(alert.id, prices.results[0].close)]);
    }
  }
}

async function syncAll(env: Env): Promise<void> {
  const stocks = await env.DB.prepare("SELECT DISTINCT s.id, s.code FROM stocks s JOIN watchlist_stocks ws ON ws.stock_id = s.id").all<{ id: number; code: string }>();
  for (const stock of stocks.results) {
    const symbol = yahooSymbol(stock.code);
    await env.DB.prepare("UPDATE stocks SET provider_symbol = ? WHERE id = ?").bind(symbol, stock.id).run();
    await syncStock(env, stock.id, symbol);
  }
  await checkAlerts(env);
}

api.onError((error, context) => context.json({ error: error.message || "request failed" }, 400));
api.use("/api/*", async (context, next) => {
  if (context.req.path === "/api/session" && context.req.method === "POST") return next();
  if (!(await authenticated(context.req.header("cookie"), context.env.SESSION_SECRET))) return context.json({ error: "sign in required" }, 401);
  return next();
});

api.post("/api/session", async (context) => {
  const body = await context.req.json<{ key?: string }>();
  if (!sameSecret(String(body.key ?? ""), context.env.APP_ACCESS_KEY)) return context.json({ error: "invalid access key" }, 401);
  context.header("Set-Cookie", `sw_session=${await session(context.env.SESSION_SECRET)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`);
  return context.json({ ok: true });
});
api.delete("/api/session", (context) => {
  context.header("Set-Cookie", "sw_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
  return context.json({ ok: true });
});
api.get("/api/session", (context) => context.json({ ok: true }));

api.get("/api/watchlists", async (context) => context.json((await context.env.DB.prepare("SELECT id, name FROM watchlists ORDER BY id").all()).results));
api.get("/api/market/denmark", async (context) => context.json(await marketStocks()));
api.post("/api/watchlists", async (context) => {
  const body = await context.req.json<{ name?: string }>();
  const result = await context.env.DB.prepare("INSERT INTO watchlists (name) VALUES (?)").bind(watchlistName(String(body.name ?? ""))).run();
  return context.json({ id: result.meta.last_row_id }, 201);
});
api.put("/api/watchlists/:watchlistId", async (context) => {
  const body = await context.req.json<{ name?: string }>();
  await context.env.DB.prepare("UPDATE watchlists SET name = ? WHERE id = ?").bind(watchlistName(String(body.name ?? "")), id(context.req.param("watchlistId"))).run();
  return context.json({ ok: true });
});
api.get("/api/watchlists/:watchlistId/stocks", async (context) => {
  const rows = await context.env.DB.prepare("SELECT s.id, s.code, s.provider_symbol AS providerSymbol, s.note, s.note_updated_at AS noteUpdatedAt, (SELECT close FROM daily_bars WHERE stock_id=s.id ORDER BY trading_date DESC LIMIT 1) AS last, (SELECT close FROM daily_bars WHERE stock_id=s.id ORDER BY trading_date DESC LIMIT 1 OFFSET 1) AS previous FROM stocks s JOIN watchlist_stocks ws ON ws.stock_id=s.id WHERE ws.watchlist_id=? ORDER BY s.code").bind(id(context.req.param("watchlistId"))).all<{ id: number; code: string; providerSymbol: string; note: string | null; noteUpdatedAt: string | null; last: number | null; previous: number | null }>();
  return context.json(rows.results.map(({ previous, ...stock }) => ({ ...stock, change: stock.last != null && previous != null ? stock.last - previous : null, changePercent: stock.last != null && previous ? (stock.last - previous) / previous * 100 : null })));
});
api.post("/api/watchlists/:watchlistId/stocks", async (context) => {
  const body = await context.req.json<{ stockId?: number }>();
  await context.env.DB.prepare("INSERT OR IGNORE INTO watchlist_stocks (watchlist_id, stock_id) VALUES (?, ?)").bind(id(context.req.param("watchlistId")), number(body.stockId, "stockId must be numeric")).run();
  return context.json({ ok: true });
});
api.delete("/api/watchlists/:watchlistId/stocks", async (context) => {
  await context.env.DB.prepare("DELETE FROM watchlist_stocks WHERE watchlist_id = ?").bind(id(context.req.param("watchlistId"))).run();
  return context.json({ ok: true });
});
api.delete("/api/watchlists/:watchlistId/stocks/:stockId", async (context) => {
  await context.env.DB.prepare("DELETE FROM watchlist_stocks WHERE watchlist_id = ? AND stock_id = ?").bind(id(context.req.param("watchlistId")), id(context.req.param("stockId"))).run();
  return context.json({ ok: true });
});
api.put("/api/stocks/:stockId/note", async (context) => {
  const body = await context.req.json<{ note?: unknown }>();
  await context.env.DB.prepare("UPDATE stocks SET note = ?, note_updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(stockNote(body.note), id(context.req.param("stockId"))).run();
  return context.json({ ok: true });
});
api.delete("/api/stocks/:stockId/note", async (context) => {
  await context.env.DB.prepare("UPDATE stocks SET note = NULL, note_updated_at = NULL WHERE id = ?").bind(id(context.req.param("stockId"))).run();
  return context.json({ ok: true });
});
api.post("/api/stocks", async (context) => {
  const body = await context.req.json<{ code?: string; watchlistId?: number; sync?: boolean }>();
  const code = parseCode(String(body.code ?? ""));
  const symbol = yahooSymbol(code);
  const existing = await context.env.DB.prepare("SELECT id FROM stocks WHERE code = ?").bind(code).first<{ id: number }>();
  const stockId = existing?.id ?? Number((await context.env.DB.prepare("INSERT INTO stocks (code, provider_symbol) VALUES (?, ?)").bind(code, symbol).run()).meta.last_row_id);
  const main = await context.env.DB.prepare("SELECT id FROM watchlists ORDER BY id LIMIT 1").first<{ id: number }>();
  const watchlistId = body.watchlistId == null ? (main?.id ?? Number((await context.env.DB.prepare("INSERT INTO watchlists (name) VALUES ('Main')").run()).meta.last_row_id)) : id(String(body.watchlistId));
  await context.env.DB.prepare("INSERT OR IGNORE INTO watchlist_stocks (watchlist_id, stock_id) VALUES (?, ?)").bind(watchlistId, stockId).run();
  if (!existing && body.sync !== false) await syncStock(context.env, stockId, symbol);
  return context.json({ id: stockId }, 201);
});
api.post("/api/sync", async (context) => {
  await syncAll(context.env);
  return context.json({ ok: true });
});
api.post("/api/stocks/:stockId/sync", async (context) => {
  const stockId = id(context.req.param("stockId"));
  const stock = await context.env.DB.prepare("SELECT code FROM stocks WHERE id = ?").bind(stockId).first<{ code: string }>();
  if (!stock) throw new Error("stock not found");
  const symbol = yahooSymbol(stock.code);
  await context.env.DB.prepare("UPDATE stocks SET provider_symbol = ? WHERE id = ?").bind(symbol, stockId).run();
  await syncStock(context.env, stockId, symbol);
  await checkAlerts(context.env);
  return context.json({ ok: true });
});
api.get("/api/bars", async (context) => {
  const stockId = id(context.req.query("stock") ?? "");
  const timeframe = context.req.query("timeframe");
  if (timeframe !== "1d" && timeframe !== "1h" && timeframe !== "4h" && timeframe !== "1wk" && timeframe !== "1mo") throw new Error("timeframe must be 1d, 1wk, 1mo, 4h, or 1h");
  const table = timeframe === "1h" || timeframe === "4h" ? "hourly_bars" : "daily_bars";
  const column = timeframe === "1h" || timeframe === "4h" ? "trading_time" : "trading_date";
  const bars = await context.env.DB.prepare(`SELECT ${column} AS time, open, high, low, close, volume FROM ${table} WHERE stock_id=? ORDER BY ${column}`).bind(stockId).all();
  return context.json({ bars: timeframe === "1wk" || timeframe === "1mo" ? aggregateDailyBars(bars.results as Bar[], timeframe) : timeframe === "4h" ? aggregateHourlyBars(bars.results as Bar[]) : bars.results });
});
api.post("/api/scans/zones", async (context) => {
  const body = await context.req.json<{ watchlistId?: number; zone?: string; timeframe?: string; swingMultiplier?: number; fvgMinAtr?: number; obDisplacementAtr?: number; proximityAtr?: number; freshOnly?: boolean }>();
  if (body.zone !== "fvg" && body.zone !== "ob") throw new Error("zone must be fvg or ob");
  if (body.timeframe !== "1d" && body.timeframe !== "1h" && body.timeframe !== "4h" && body.timeframe !== "1wk" && body.timeframe !== "1mo") throw new Error("timeframe must be 1d, 1wk, 1mo, 4h, or 1h");
  const watchlistId = number(body.watchlistId, "watchlistId must be numeric"), swingMultiplier = Math.max(0, body.swingMultiplier == null ? 3 : number(body.swingMultiplier, "swingMultiplier must be numeric")), fvgMinAtr = Math.max(0, body.fvgMinAtr == null ? 0.5 : number(body.fvgMinAtr, "fvgMinAtr must be numeric")), obDisplacementAtr = Math.max(0, body.obDisplacementAtr == null ? 1.5 : number(body.obDisplacementAtr, "obDisplacementAtr must be numeric")), proximityAtr = body.proximityAtr == null ? 0.25 : number(body.proximityAtr, "proximityAtr must be numeric");
  if (![0, 0.25, 0.5].includes(proximityAtr)) throw new Error("proximityAtr must be 0, 0.25, or 0.5");
  if (body.freshOnly != null && typeof body.freshOnly !== "boolean") throw new Error("freshOnly must be boolean");
  const freshOnly = body.freshOnly !== false && proximityAtr > 0;
  const hourly = body.timeframe === "1h" || body.timeframe === "4h", table = hourly ? "hourly_bars" : "daily_bars", column = hourly ? "trading_time" : "trading_date";
  const rows = await context.env.DB.prepare(`SELECT id, code, time, open, high, low, close, volume FROM (SELECT s.id, s.code, b.${column} AS time, b.open, b.high, b.low, b.close, b.volume, ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY b.${column} DESC) AS position FROM stocks s JOIN (SELECT DISTINCT stock_id FROM watchlist_stocks) ws ON ws.stock_id=s.id JOIN ${table} b ON b.stock_id=s.id) WHERE position <= 350 ORDER BY id, time`).all<{ id: number; code: string; time: string; open: number; high: number; low: number; close: number; volume: number }>();
  const grouped = new Map<number, { code: string; bars: Bar[] }>();
  for (const row of rows.results) { const current = grouped.get(row.id) ?? { code: row.code, bars: [] }; current.bars.push(row); grouped.set(row.id, current); }
  const matches = [...grouped].flatMap(([stockId, stock]) => {
    const bars = body.timeframe === "1wk" || body.timeframe === "1mo" ? aggregateDailyBars(stock.bars, body.timeframe) : body.timeframe === "4h" ? aggregateHourlyBars(stock.bars) : stock.bars;
    const zones = body.zone === "fvg" ? fairValueGaps(bars, fvgMinAtr) : orderBlocks(bars, swingMultiplier, obDisplacementAtr, 2, fvgMinAtr);
    const bullishZones = zones.filter((zone) => zone.direction === "bullish");
    return (freshOnly ? freshBullishZoneNearby(bars, bullishZones, proximityAtr) : zoneNearby(bars, bullishZones, proximityAtr)) ? [{ id: stockId, code: stock.code }] : [];
  });
  const writes = matches.length ? await context.env.DB.batch(matches.map((stock) => context.env.DB.prepare("INSERT OR IGNORE INTO watchlist_stocks (watchlist_id, stock_id) VALUES (?, ?)").bind(watchlistId, stock.id))) : [];
  return context.json({ matches, added: writes.reduce((total, write) => total + write.meta.changes, 0) });
});
api.get("/api/alerts", async (context) => context.json((await context.env.DB.prepare("SELECT a.id, s.code, a.direction, a.target, a.armed FROM alerts a JOIN stocks s ON s.id=a.stock_id ORDER BY a.id DESC").all()).results));
api.post("/api/alerts", async (context) => {
  const body = await context.req.json<{ stockId?: number; direction?: Direction; target?: number }>();
  if (body.direction !== "above" && body.direction !== "below") throw new Error("direction must be above or below");
  const result = await context.env.DB.prepare("INSERT INTO alerts (stock_id, direction, target) VALUES (?, ?, ?)").bind(number(body.stockId, "stockId must be numeric"), body.direction, number(body.target, "target must be numeric")).run();
  return context.json({ id: result.meta.last_row_id }, 201);
});
api.post("/api/alerts/:alertId/rearm", async (context) => {
  await context.env.DB.prepare("UPDATE alerts SET armed = 1 WHERE id = ?").bind(id(context.req.param("alertId"))).run();
  return context.json({ ok: true });
});

export default {
  fetch(request, env, execution) {
    return Promise.resolve(api.fetch(request, env, execution)).then((response: Response) => response.status === 404 ? env.ASSETS.fetch(request) : response);
  },
} satisfies ExportedHandler<Env>;
