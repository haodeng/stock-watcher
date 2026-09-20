import { Hono } from "hono";
import { crossed, parseCode, sameSecret, type Direction, watchlistName, yahooSymbol } from "./shared";

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
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`);
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

async function saveBars(db: D1Database, stockId: number, table: "daily_bars" | "hourly_bars", column: "trading_date" | "trading_time", bars: Bar[]): Promise<void> {
  for (let index = 0; index < bars.length; index += 50) {
    await db.batch(bars.slice(index, index + 50).map((bar) => db.prepare(`INSERT INTO ${table} (stock_id, ${column}, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(stock_id, ${column}) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume`).bind(stockId, bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume)));
  }
}

export function syncRanges(): { daily: string; hourly: string } {
  return { daily: "10y", hourly: "2y" };
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

async function syncStock(env: Env, stockId: number, symbol: string): Promise<void> {
  const ranges = syncRanges();
  const [daily, hourly] = await Promise.all([yahooBars(symbol, "1d", ranges.daily), yahooBars(symbol, "1h", ranges.hourly)]);
  await saveBars(env.DB, stockId, "daily_bars", "trading_date", daily);
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
  const stocks = await env.DB.prepare("SELECT id, provider_symbol FROM stocks").all<{ id: number; provider_symbol: string }>();
  for (const stock of stocks.results) await syncStock(env, stock.id, stock.provider_symbol);
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
api.post("/api/watchlists", async (context) => {
  const body = await context.req.json<{ name?: string }>();
  const result = await context.env.DB.prepare("INSERT INTO watchlists (name) VALUES (?)").bind(watchlistName(String(body.name ?? ""))).run();
  return context.json({ id: result.meta.last_row_id }, 201);
});
api.get("/api/watchlists/:watchlistId/stocks", async (context) => {
  const rows = await context.env.DB.prepare("SELECT s.id, s.code, s.provider_symbol AS providerSymbol, (SELECT close FROM daily_bars WHERE stock_id=s.id ORDER BY trading_date DESC LIMIT 1) AS last FROM stocks s JOIN watchlist_stocks ws ON ws.stock_id=s.id WHERE ws.watchlist_id=? ORDER BY s.code").bind(id(context.req.param("watchlistId"))).all();
  return context.json(rows.results);
});
api.post("/api/watchlists/:watchlistId/stocks", async (context) => {
  const body = await context.req.json<{ stockId?: number }>();
  await context.env.DB.prepare("INSERT OR IGNORE INTO watchlist_stocks (watchlist_id, stock_id) VALUES (?, ?)").bind(id(context.req.param("watchlistId")), number(body.stockId, "stockId must be numeric")).run();
  return context.json({ ok: true });
});
api.post("/api/stocks", async (context) => {
  const body = await context.req.json<{ code?: string }>();
  const code = parseCode(String(body.code ?? ""));
  const symbol = yahooSymbol(code);
  const result = await context.env.DB.prepare("INSERT INTO stocks (code, provider_symbol) VALUES (?, ?)").bind(code, symbol).run();
  const stockId = Number(result.meta.last_row_id);
  const main = await context.env.DB.prepare("SELECT id FROM watchlists ORDER BY id LIMIT 1").first<{ id: number }>();
  const watchlistId = main?.id ?? Number((await context.env.DB.prepare("INSERT INTO watchlists (name) VALUES ('Main')").run()).meta.last_row_id);
  await context.env.DB.prepare("INSERT INTO watchlist_stocks (watchlist_id, stock_id) VALUES (?, ?)").bind(watchlistId, stockId).run();
  await syncStock(context.env, stockId, symbol);
  return context.json({ id: stockId }, 201);
});
api.post("/api/sync", async (context) => {
  await syncAll(context.env);
  return context.json({ ok: true });
});
api.get("/api/bars", async (context) => {
  const stockId = id(context.req.query("stock") ?? "");
  const timeframe = context.req.query("timeframe");
  if (timeframe !== "1d" && timeframe !== "1h" && timeframe !== "1wk" && timeframe !== "1mo") throw new Error("timeframe must be 1d, 1wk, 1mo, or 1h");
  const table = timeframe === "1h" ? "hourly_bars" : "daily_bars";
  const column = timeframe === "1h" ? "trading_time" : "trading_date";
  const bars = await context.env.DB.prepare(`SELECT ${column} AS time, open, high, low, close, volume FROM ${table} WHERE stock_id=? ORDER BY ${column}`).bind(stockId).all();
  return context.json({ bars: timeframe === "1wk" || timeframe === "1mo" ? aggregateDailyBars(bars.results as Bar[], timeframe) : bars.results });
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
