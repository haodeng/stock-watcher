import { CandlestickSeries, createChart, CrosshairMode, HistogramSeries, LineSeries, type SeriesAttachedParameter, type Time } from "lightweight-charts";
import { IconCheck, IconChevronDown, IconCopy, IconNote, IconPencil, IconPlus, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { chartTime, fairValueGaps, swings, type FairValueGap } from "./shared";
import "./style.css";

type Stock = { id: number; code: string; providerSymbol: string; note: string | null; noteUpdatedAt: string | null; last: number | null; change: number | null; changePercent: number | null };
type MarketStock = { code: string; name: string; sector: string };
type Watchlist = { id: number; name: string };
type Bar = { time: string; open: number; high: number; low: number; close: number; volume: number };
type Alert = { id: number; code: string; direction: string; target: number; armed: number };

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "request failed");
  return data;
}

function formatPrice(value: number | null) { return value == null ? "-" : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatChange(value: number | null, percent = false) { return value == null ? "-" : `${value > 0 ? "+" : ""}${percent ? value.toFixed(2) + "%" : formatPrice(value)}`; }
function tone(value: number | null) { return value == null ? "neutral" : value > 0 ? "positive" : value < 0 ? "negative" : "neutral"; }
function formatNoteTime(value: string | null) { return value ? new Date(`${value.replace(" ", "T")}Z`).toLocaleString() : ""; }
const badgeColors = ["#1537ad", "#11765c", "#7c3f9b", "#a24d16", "#9c234d", "#176b87"];
function badge(code: string) { return { background: badgeColors[[...code].reduce((sum, character) => sum + character.charCodeAt(0), 0) % badgeColors.length] } as CSSProperties; }
function badgeText(code: string) { return code.replace(/_DK$/, "").split("_").map((part) => part[0]).join("").slice(0, 2); }
const sectorColors: Record<string, string> = { "Communication Services": "#38bdf8", "Consumer Discretionary": "#f59e0b", "Consumer Staples": "#facc15", Energy: "#fb7185", Financials: "#60a5fa", "Health Care": "#f472b6", Industrials: "#a78bfa", "Information Technology": "#34d399", Materials: "#d97706", "Real Estate": "#c084fc", Utilities: "#2dd4bf" };
function sectorColor(sector: string | undefined) { return sectorColors[sector ?? ""] ?? "#6b7280"; }

class FvgZones {
  private chart?: SeriesAttachedParameter["chart"];
  private series?: SeriesAttachedParameter["series"];
  constructor(private zones: FairValueGap[], private bars: Bar[]) {}
  attached({ chart, series }: SeriesAttachedParameter) { this.chart = chart; this.series = series; }
  paneViews() { return [this]; }
  zOrder() { return "bottom" as const; }
  renderer() {
    return { draw: () => {}, drawBackground: (target: any) => target.useMediaCoordinateSpace((scope: any) => {
      if (!this.chart || !this.series) return;
      for (const zone of this.zones) {
        const x = this.chart.timeScale().timeToCoordinate(chartTime(this.bars[zone.index].time) as Time), top = this.series.priceToCoordinate(zone.top), bottom = this.series.priceToCoordinate(zone.bottom);
        if (x == null || top == null || bottom == null) continue;
        scope.context.fillStyle = zone.direction === "bullish" ? "#21b89a20" : "#f04d6120";
        scope.context.fillRect(x, top, scope.mediaSize.width - x, bottom - top);
      }
    }) };
  }
}

function Chart({ bars, fit, swingMultiplier }: { bars: Bar[]; fit: boolean; swingMultiplier: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showZigZag, setShowZigZag] = useState(true), [showFvg, setShowFvg] = useState(true);
  useEffect(() => {
    if (!ref.current || !bars.length) return;
    const chart = createChart(ref.current, { width: ref.current.clientWidth, height: 500, layout: { background: { color: "#101214" }, textColor: "#a8afb9" }, grid: { vertLines: { color: "#20252b" }, horzLines: { color: "#20252b" } }, crosshair: { mode: CrosshairMode.Normal }, rightPriceScale: { borderColor: "#343a42" }, timeScale: { borderColor: "#343a42" } });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#21b89a", downColor: "#f04d61", borderVisible: false, wickUpColor: "#21b89a", wickDownColor: "#f04d61" });
    series.setData(bars.map((bar) => ({ ...bar, time: chartTime(bar.time) as Time })));
    if (showFvg) series.attachPrimitive(new FvgZones(fairValueGaps(bars), bars));
    if (showZigZag) {
      const swingPoints = swings(bars, swingMultiplier);
      const zigZag = chart.addSeries(LineSeries, { color: "#d8b469", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      zigZag.setData(swingPoints.map(({ index, direction }) => ({ time: chartTime(bars[index].time) as Time, value: direction === "high" ? bars[index].high : bars[index].low })));
      for (const direction of ["high", "low"] as const) {
        const dots = chart.addSeries(LineSeries, { color: direction === "high" ? "#f04d61b3" : "#21b89ab3", lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 2, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
        dots.setData(swingPoints.filter((point) => point.direction === direction).map(({ index }) => { const bar = bars[index]; const offset = (bar.high - bar.low) / 2; return { time: chartTime(bar.time) as Time, value: direction === "high" ? bar.high + offset : bar.low - offset }; }));
      }
    }
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volume.setData(bars.map((bar) => ({ time: chartTime(bar.time) as Time, value: bar.volume, color: bar.close >= bar.open ? "#21b89a80" : "#f04d6180" })));
    if (fit) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 300), to: bars.length - 1 }); else chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: ref.current?.clientWidth ?? 0 }));
    observer.observe(ref.current);
    return () => { observer.disconnect(); chart.remove(); };
  }, [bars, fit, showFvg, showZigZag, swingMultiplier]);
  return <div className="chart">{bars.length ? <><button className={`fit-chart zigzag-toggle ${showZigZag ? "selected" : ""}`} aria-pressed={showZigZag} onClick={() => setShowZigZag((value) => !value)}>ZigZag {showZigZag ? "on" : "off"}</button><button className={`fit-chart zigzag-toggle ${showFvg ? "selected" : ""}`} aria-pressed={showFvg} onClick={() => setShowFvg((value) => !value)}>FVG {showFvg ? "on" : "off"}</button><div ref={ref} /></> : <p>No price history for this timeframe.</p>}</div>;
}

function Login({ done }: { done: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  return <main className="login"><h1>Stock Watcher</h1><form onSubmit={async (event) => { event.preventDefault(); try { await api("/api/session", "POST", { key }); done(); } catch (reason) { setError((reason as Error).message); } }}><label>Access key<input type="password" autoFocus value={key} onChange={(event) => setKey(event.target.value)} /></label><button>Sign in</button>{error && <p className="error">{error}</p>}</form></main>;
}

function SymbolPicker({ stocks, loading, error, adding, onAdd, onClose }: { stocks: MarketStock[]; loading: boolean; error: string; adding: boolean; onAdd: (codes: string[]) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = stocks.filter((stock) => `${stock.code} ${stock.name}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = (code: string) => setSelected((current) => current.includes(code) ? current.filter((value) => value !== code) : [...current, code]);
  return <div className="symbol-backdrop" role="presentation" onMouseDown={onClose}><section className="symbol-picker" role="dialog" aria-modal="true" aria-labelledby="symbol-title" onMouseDown={(event) => event.stopPropagation()}><header><h2 id="symbol-title">Add symbol</h2><button className="icon-button" aria-label="Close" onClick={onClose}><IconX size={26} /></button></header><label className="symbol-search"><IconSearch size={22} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Denmark stocks" aria-label="Search Denmark stocks" /></label><p className="market-filter">🇩🇰 Denmark · Stocks · Nasdaq Copenhagen</p><div className="symbol-results">{loading ? <p>Loading Denmark stocks…</p> : error ? <p className="error">{error}</p> : filtered.map((stock) => { const checked = selected.includes(stock.code); return <button key={stock.code} className={`symbol-result ${checked ? "selected" : ""}`} aria-pressed={checked} disabled={adding} onClick={() => toggle(stock.code)}><span><strong>{stock.code}</strong><small>{stock.name}</small></span><small>CPH</small>{checked ? <IconCheck size={24} /> : <IconPlus size={26} />}</button>; })}{!loading && !error && !filtered.length && <p>No Denmark stock found.</p>}</div><footer className="symbol-actions"><span>{selected.length ? `${selected.length} selected` : "Select stocks to add"}</span><button disabled={!selected.length || adding} onClick={() => onAdd(selected)}>{adding ? "Adding…" : "Add selected"}</button></footer></section></div>;
}

function StockNote({ stock, refresh, message }: { stock: Stock | undefined; refresh: () => Promise<void>; message: (value: string) => void }) {
  if (!stock) return null;
  return <form className="note-form" key={stock.id} onSubmit={(event) => { event.preventDefault(); const note = new FormData(event.currentTarget).get("note"); void api(`/api/stocks/${stock.id}/note`, "PUT", { note }).then(refresh).then(() => message("Note saved.")).catch((error) => message(error.message)); }}><label><strong>Note</strong><textarea name="note" defaultValue={stock.note ?? ""} maxLength={2000} placeholder="Your thesis, levels, or reminders…" /></label>{stock.noteUpdatedAt && <small className="note-time">Last updated {formatNoteTime(stock.noteUpdatedAt)}</small>}<div><button>Save note</button>{stock.note && <button type="button" className="quiet-button" onClick={() => void api(`/api/stocks/${stock.id}/note`, "DELETE").then(refresh).then(() => message("Note removed.")).catch((error) => message(error.message))}>Remove note</button>}</div></form>;
}

function Dashboard() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]), [watchlistId, setWatchlistId] = useState<number>(), [stocks, setStocks] = useState<Stock[]>([]), [stockId, setStockId] = useState<number>(), [bars, setBars] = useState<Bar[]>([]), [timeframe, setTimeframe] = useState("1d"), [alerts, setAlerts] = useState<Alert[]>([]), [message, setMessage] = useState(""), [syncing, setSyncing] = useState(false), [pickerOpen, setPickerOpen] = useState(false), [marketStocks, setMarketStocks] = useState<MarketStock[]>([]), [marketError, setMarketError] = useState(""), [adding, setAdding] = useState(false), [copyOpen, setCopyOpen] = useState(false), [changeSort, setChangeSort] = useState<"asc" | "desc">(), [symbolSort, setSymbolSort] = useState<"asc" | "desc">(), [sectorSort, setSectorSort] = useState<"asc" | "desc">(), [sectorFilter, setSectorFilter] = useState(""), [fit, setFit] = useState(false), [swingMultiplier, setSwingMultiplier] = useState(3);
  const loadWatchlists = async () => { const data = await api<Watchlist[]>("/api/watchlists"); setWatchlists(data); setWatchlistId((current) => current ?? data[0]?.id); };
  const loadStocks = async (id: number) => { const data = await api<Stock[]>(`/api/watchlists/${id}/stocks`); setStocks(data); setStockId((current) => data.some((stock) => stock.id === current) ? current : data[0]?.id); };
  const loadAlerts = () => api<Alert[]>("/api/alerts").then(setAlerts);
  const loadMarketStocks = () => api<MarketStock[]>("/api/market/denmark").then((data) => { setMarketStocks(data); setMarketError(""); }).catch((error) => setMarketError(error.message));
  useEffect(() => { void loadWatchlists().catch((error) => setMessage(error.message)); void loadAlerts(); void loadMarketStocks(); }, []);
  useEffect(() => { if (watchlistId) void loadStocks(watchlistId).catch((error) => setMessage(error.message)); }, [watchlistId]);
  useEffect(() => { if (stockId) void api<{ bars: Bar[] }>(`/api/bars?stock=${stockId}&timeframe=${timeframe}`).then((data) => setBars(data.bars)).catch((error) => setMessage(error.message)); }, [stockId, timeframe]);
  const addStocks = async (codes: string[]) => { setAdding(true); try { for (const code of codes) await api("/api/stocks", "POST", { code, watchlistId, sync: false }); await loadWatchlists(); if (watchlistId) await loadStocks(watchlistId); setPickerOpen(false); setMessage(`${codes.length} stock${codes.length === 1 ? "" : "s"} added. Sync data when ready.`); } catch (error) { setMarketError((error as Error).message); } finally { setAdding(false); } };
  const syncSelectedStock = async () => { if (!stockId) return; setSyncing(true); setMessage("Syncing stock…"); try { await api(`/api/stocks/${stockId}/sync`, "POST"); if (watchlistId) await loadStocks(watchlistId); const data = await api<{ bars: Bar[] }>(`/api/bars?stock=${stockId}&timeframe=${timeframe}`); setBars(data.bars); setMessage("Stock synced."); } catch (error) { setMessage((error as Error).message); } finally { setSyncing(false); } };
  const openPicker = () => { setPickerOpen(true); if (!marketStocks.length) void loadMarketStocks(); };
  const addFromPicker = (codes: string[]) => { void addStocks(codes); };
  const renameWatchlist = async () => { if (!watchlistId) return; const name = prompt("Watchlist name", watchlists.find((watchlist) => watchlist.id === watchlistId)?.name); if (!name) return; await api(`/api/watchlists/${watchlistId}`, "PUT", { name }); await loadWatchlists(); setMessage("Watchlist renamed."); };
  const removeStock = async () => { if (!watchlistId || !stockId || !confirm("Remove this stock from the current watchlist?")) return; await api(`/api/watchlists/${watchlistId}/stocks/${stockId}`, "DELETE"); await loadStocks(watchlistId); setBars([]); setMessage("Stock removed from this watchlist."); };
  const copyStock = async (form: HTMLFormElement) => { if (!stockId) return; const destination = Number(new FormData(form).get("watchlistId")); await api(`/api/watchlists/${destination}/stocks`, "POST", { stockId }); setCopyOpen(false); setMessage("Stock copied to the selected watchlist."); };
  const selected = stocks.find((stock) => stock.id === stockId);
  const companyName = (code: string | undefined) => marketStocks.find((stock) => stock.code === code)?.name;
  const stockSector = (code: string | undefined) => marketStocks.find((stock) => stock.code === code)?.sector;
  const sectors = [...new Set(stocks.map((stock) => stockSector(stock.code)).filter(Boolean))].sort();
  const filteredStocks = sectorFilter ? stocks.filter((stock) => stockSector(stock.code) === sectorFilter) : stocks;
  const displayedStocks = sectorSort ? [...filteredStocks].sort((left, right) => sectorSort === "asc" ? (stockSector(left.code) ?? "").localeCompare(stockSector(right.code) ?? "") : (stockSector(right.code) ?? "").localeCompare(stockSector(left.code) ?? "")) : symbolSort ? [...filteredStocks].sort((left, right) => symbolSort === "asc" ? left.code.localeCompare(right.code) : right.code.localeCompare(left.code)) : changeSort ? [...filteredStocks].sort((left, right) => left.changePercent == null ? 1 : right.changePercent == null ? -1 : changeSort === "asc" ? left.changePercent - right.changePercent : right.changePercent - left.changePercent) : filteredStocks;
  const refreshStocks = async () => { if (watchlistId) await loadStocks(watchlistId); };
  return <main className="terminal"><header className="app-header"><div className="app-title"><div><h1>Stock Watcher</h1><p>Denmark stocks · manual sync</p></div><div className="header-actions"><button onClick={openPicker}><IconPlus size={18} /> Add symbol</button><button disabled={syncing} onClick={() => { setSyncing(true); setMessage("Syncing data…"); void api("/api/sync", "POST").then(() => { setMessage("Data synced."); return stockId ? api<{ bars: Bar[] }>(`/api/bars?stock=${stockId}&timeframe=${timeframe}`).then((data) => setBars(data.bars)) : undefined; }).catch((error) => setMessage(error.message)).finally(() => setSyncing(false)); }}>{syncing ? "Syncing…" : "Sync data"}</button></div></div><button className="quiet-button" onClick={() => api("/api/session", "DELETE").then(() => location.reload())}>Sign out</button></header>{message && <p className="message">{message}</p>}<div className="terminal-layout"><aside className="watchlist-panel"><div className="watchlist-title"><div className="watchlist-select-actions"><button className="icon-button" title="New watchlist" onClick={() => { const name = prompt("Watchlist name"); if (name) void api("/api/watchlists", "POST", { name }).then(loadWatchlists).catch((error) => setMessage(error.message)); }}><IconPlus size={20} /></button><label><select value={watchlistId ?? ""} onChange={(event) => setWatchlistId(Number(event.target.value))}>{watchlists.map((watchlist) => <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>)}</select><IconChevronDown size={18} /></label></div><div><button className="icon-button" title="Rename watchlist" disabled={!watchlistId} onClick={() => void renameWatchlist().catch((error) => setMessage(error.message))}><IconPencil size={20} /></button><button className="icon-button" title="Copy selected stock" disabled={!stockId || watchlists.length < 2} onClick={() => setCopyOpen((open) => !open)}><IconCopy size={20} /></button><button className="icon-button remove" title="Remove selected stock" disabled={!stockId} onClick={() => void removeStock().catch((error) => setMessage(error.message))}><IconTrash size={20} /></button></div></div>{copyOpen && <form className="copy-form" onSubmit={(event) => { event.preventDefault(); void copyStock(event.currentTarget).catch((error) => setMessage(error.message)); }}><select name="watchlistId">{watchlists.filter((watchlist) => watchlist.id !== watchlistId).map((watchlist) => <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>)}</select><button>Copy</button><button type="button" className="quiet-button" onClick={() => setCopyOpen(false)}>Cancel</button></form>}<label className="sector-filter">Sector<select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)}><option value="">All sectors</option>{sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}</select></label><div className="quote-head"><button onClick={() => { setSymbolSort((current) => current === "asc" ? "desc" : "asc"); setChangeSort(undefined); setSectorSort(undefined); }} aria-label={`Sort symbol ${symbolSort === "asc" ? "descending" : "ascending"}`}>Symbol {symbolSort === "asc" ? "↑" : symbolSort === "desc" ? "↓" : ""}</button><span>Last</span><span>Chg</span><button onClick={() => { setChangeSort((current) => current === "desc" ? "asc" : "desc"); setSymbolSort(undefined); setSectorSort(undefined); }} aria-label={`Sort change percent ${changeSort === "desc" ? "ascending" : "descending"}`}>Chg% {changeSort === "asc" ? "↑" : changeSort === "desc" ? "↓" : ""}</button><button className="sector-sort" onClick={() => { setSectorSort((current) => current === "asc" ? "desc" : "asc"); setSymbolSort(undefined); setChangeSort(undefined); }} aria-label={`Sort sector ${sectorSort === "asc" ? "descending" : "ascending"}`} title="Sort sector">● {sectorSort === "asc" ? "↑" : sectorSort === "desc" ? "↓" : ""}</button></div><div className="quote-list">{displayedStocks.length ? displayedStocks.map((stock) => <button key={stock.id} title={[companyName(stock.code), stockSector(stock.code)].filter(Boolean).join(" · ") || stock.code} className={`quote-row ${stock.id === stockId ? "selected" : ""}`} onClick={() => setStockId(stock.id)}><span className="quote-symbol"><i style={badge(stock.code)}>{badgeText(stock.code)}</i><strong>{stock.code}</strong>{stock.note && <IconNote className="note-indicator" size={17} aria-label="Has note" />}</span><span>{formatPrice(stock.last)}</span><span className={tone(stock.change)}>{formatChange(stock.change)}</span><span className={tone(stock.changePercent)}>{formatChange(stock.changePercent, true)}</span><span className="sector-cell" title={stockSector(stock.code) || "No sector"}><i style={{ background: sectorColor(stockSector(stock.code)) }} /></span></button>) : <p className="watchlist-empty">{sectorFilter ? "No stocks in this sector." : "Add a Denmark ticker to this watchlist."}</p>}</div></aside><section className="chart-pane"><div className="chart-header"><div className="chart-identity"><div><h2>{selected?.code ?? "Choose a stock"}</h2><span>{companyName(selected?.code) ?? selected?.providerSymbol ?? ""}</span>{stockSector(selected?.code) && <small className="sector-label" style={{ color: sectorColor(stockSector(selected?.code)) }}>{stockSector(selected?.code)}</small>}</div>{selected?.note && <p className="chart-note" title={selected.note}><IconNote size={16} />{selected.note}</p>}</div>{selected && <div className="quote-summary"><strong>{formatPrice(selected.last)} <small>DKK</small></strong><span className={tone(selected.change)}>{formatChange(selected.change)} · {formatChange(selected.changePercent, true)}</span></div>}<div className="timeframes">{[["1d", "1D"], ["1wk", "1W"], ["1mo", "1M"], ["4h", "4H"], ["1h", "1H"]].map(([value, label]) => <button key={value} className={timeframe === value ? "selected" : ""} onClick={() => setTimeframe(value)}>{label}</button>)}</div><select aria-label="Swing sensitivity" value={swingMultiplier} onChange={(event) => setSwingMultiplier(Number(event.target.value))}><option value={1.5}>Swing 1.5× ATR</option><option value={2}>Swing 2× ATR</option><option value={3}>Swing 3× ATR</option></select><button className="sync-stock" disabled={!selected || syncing} onClick={() => void syncSelectedStock()}>{syncing ? "Syncing…" : "Sync stock"}</button><button className={`fit-chart ${fit ? "selected" : ""}`} aria-pressed={fit} onClick={() => setFit((value) => !value)}>Fit {fit ? "on" : "off"}</button></div><Chart bars={bars} fit={fit} swingMultiplier={swingMultiplier} /><StockNote stock={selected} refresh={refreshStocks} message={setMessage} /><form className="alert-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void api("/api/alerts", "POST", { stockId, direction: form.get("direction"), target: form.get("target") }).then(() => { event.currentTarget.reset(); return loadAlerts(); }).catch((error) => setMessage(error.message)); }}><strong>Price alert</strong><select name="direction"><option value="above">crosses above</option><option value="below">crosses below</option></select><input name="target" type="number" min="0.01" step="0.01" placeholder="DKK target" required /><button disabled={!stockId}>Create</button></form><section className="alerts"><h2>Alerts</h2>{alerts.map((alert) => <div key={alert.id}>{alert.code} {alert.direction} {alert.target.toFixed(2)} DKK · {alert.armed ? "armed" : <button className="quiet-button" onClick={() => void api(`/api/alerts/${alert.id}/rearm`, "POST").then(loadAlerts)}>Re-arm</button>}</div>)}</section></section></div>{pickerOpen && <SymbolPicker stocks={marketStocks} loading={!marketStocks.length && !marketError} error={marketError} adding={adding} onAdd={addFromPicker} onClose={() => setPickerOpen(false)} />}</main>;
}

function App() { const [signedIn, setSignedIn] = useState<boolean>(); useEffect(() => { void fetch("/api/session").then((response) => setSignedIn(response.ok)); }, []); return signedIn === undefined ? <main className="login">Loading…</main> : signedIn ? <Dashboard /> : <Login done={() => setSignedIn(true)} />; }
createRoot(document.getElementById("root")!).render(<App />);
