import { CandlestickSeries, createChart, type Time } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Stock = { id: number; code: string; providerSymbol: string; last: number | null };
type Watchlist = { id: number; name: string };
type Bar = { time: string; open: number; high: number; low: number; close: number };
type Alert = { id: number; code: string; direction: string; target: number; armed: number };
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "request failed");
  return data;
}
function Chart({ bars }: { bars: Bar[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !bars.length) return;
    const chart = createChart(ref.current, { width: ref.current.clientWidth, height: 430, layout: { background: { color: "#101311" }, textColor: "#dce7df" }, grid: { vertLines: { color: "#243027" }, horzLines: { color: "#243027" } } });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#9fd36a", downColor: "#ed7b72", borderVisible: false, wickUpColor: "#9fd36a", wickDownColor: "#ed7b72" });
    series.setData(bars.map((bar) => ({ ...bar, time: bar.time as Time })));
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: ref.current?.clientWidth ?? 0 }));
    observer.observe(ref.current);
    return () => { observer.disconnect(); chart.remove(); };
  }, [bars]);
  return <div className="chart">{bars.length ? <div ref={ref} /> : "No price history yet."}</div>;
}
function Login({ done }: { done: () => void }) {
  const [key, setKey] = useState(""); const [error, setError] = useState("");
  return <main className="login"><h1>Stock Watcher</h1><form onSubmit={async (event) => { event.preventDefault(); try { await api("/api/session", "POST", { key }); done(); } catch (reason) { setError((reason as Error).message); } }}><label>Access key<input type="password" autoFocus value={key} onChange={(event) => setKey(event.target.value)} /></label><button>Sign in</button>{error && <p className="error">{error}</p>}</form></main>;
}
function Dashboard() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]), [watchlistId, setWatchlistId] = useState<number>(), [stocks, setStocks] = useState<Stock[]>([]), [stockId, setStockId] = useState<number>(), [bars, setBars] = useState<Bar[]>([]), [timeframe, setTimeframe] = useState("1d"), [alerts, setAlerts] = useState<Alert[]>([]), [message, setMessage] = useState("");
  const loadWatchlists = async () => { const data = await api<Watchlist[]>("/api/watchlists"); setWatchlists(data); setWatchlistId((current) => current ?? data[0]?.id); };
  const loadAlerts = () => api<Alert[]>("/api/alerts").then(setAlerts);
  useEffect(() => { void loadWatchlists().catch((error) => setMessage(error.message)); void loadAlerts(); }, []);
  useEffect(() => { if (!watchlistId) return; void api<Stock[]>(`/api/watchlists/${watchlistId}/stocks`).then((data) => { setStocks(data); setStockId((current) => data.some((stock) => stock.id === current) ? current : data[0]?.id); }).catch((error) => setMessage(error.message)); }, [watchlistId]);
  useEffect(() => { if (!stockId) return; void api<{ bars: Bar[] }>(`/api/bars?stock=${stockId}&timeframe=${timeframe}`).then((data) => setBars(data.bars)).catch((error) => setMessage(error.message)); }, [stockId, timeframe]);
  const addStock = async (form: HTMLFormElement) => { const code = new FormData(form).get("code"); await api("/api/stocks", "POST", { code }); form.reset(); await loadWatchlists(); setMessage("Stock added and history synced."); };
  return <main><header><div><h1>Stock Watcher</h1><p>Denmark stocks · Yahoo Finance · manual sync</p></div><button onClick={() => api("/api/session", "DELETE").then(() => location.reload())}>Sign out</button></header>{message && <p className="message">{message}</p>}<section className="toolbar"><select value={watchlistId ?? ""} onChange={(event) => setWatchlistId(Number(event.target.value))}>{watchlists.map((watchlist) => <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>)}</select><form onSubmit={(event) => { event.preventDefault(); void addStock(event.currentTarget).catch((error) => setMessage(error.message)); }}><input name="code" placeholder="NDA_DK" aria-label="Danish stock code" required /><button>Add stock</button></form><button onClick={() => { const name = prompt("Watchlist name"); if (name) void api("/api/watchlists", "POST", { name }).then(loadWatchlists).catch((error) => setMessage(error.message)); }}>New watchlist</button><button onClick={() => { setMessage("Syncing full history…"); void api("/api/sync", "POST").then(() => { setMessage("History synced."); return stockId ? api<{ bars: Bar[] }>(`/api/bars?stock=${stockId}&timeframe=${timeframe}`).then((data) => setBars(data.bars)) : undefined; }).catch((error) => setMessage(error.message)); }}>Sync all history</button></section><div className="layout"><aside><h2>Watchlist</h2>{stocks.map((stock) => <button key={stock.id} className={stock.id === stockId ? "stock selected" : "stock"} onClick={() => setStockId(stock.id)}><strong>{stock.code}</strong><span>{stock.last?.toFixed(2) ?? "—"} DKK</span></button>)}</aside><section><div className="controls"><h2>{stocks.find((stock) => stock.id === stockId)?.code ?? "Choose a stock"}</h2><button className={timeframe === "1d" ? "selected" : ""} onClick={() => setTimeframe("1d")}>Daily</button><button className={timeframe === "1wk" ? "selected" : ""} onClick={() => setTimeframe("1wk")}>Weekly</button><button className={timeframe === "1mo" ? "selected" : ""} onClick={() => setTimeframe("1mo")}>Monthly</button><button className={timeframe === "1h" ? "selected" : ""} onClick={() => setTimeframe("1h")}>Hourly</button></div><Chart bars={bars} /><form className="alert-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void api("/api/alerts", "POST", { stockId, direction: form.get("direction"), target: form.get("target") }).then(() => { event.currentTarget.reset(); return loadAlerts(); }).catch((error) => setMessage(error.message)); }}><strong>Price alert</strong><select name="direction"><option value="above">crosses above</option><option value="below">crosses below</option></select><input name="target" type="number" min="0.01" step="0.01" placeholder="DKK target" required /><button disabled={!stockId}>Create</button></form><section className="alerts"><h2>Alerts</h2>{alerts.map((alert) => <div key={alert.id}>{alert.code} {alert.direction} {alert.target.toFixed(2)} DKK · {alert.armed ? "armed" : <button onClick={() => void api(`/api/alerts/${alert.id}/rearm`, "POST").then(loadAlerts)}>re-arm</button>}</div>)}</section></section></div></main>;
}
function App() { const [signedIn, setSignedIn] = useState<boolean>(); useEffect(() => { void fetch("/api/session").then((response) => setSignedIn(response.ok)); }, []); return signedIn === undefined ? <main className="login">Loading…</main> : signedIn ? <Dashboard /> : <Login done={() => setSignedIn(true)} />; }
createRoot(document.getElementById("root")!).render(<App />);
