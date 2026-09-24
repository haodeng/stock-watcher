import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type SeriesAttachedParameter,
  type Time,
} from "lightweight-charts";
import {
  IconChevronDown,
  IconCopy,
  IconNote,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./ui/api";
import { AlertsPanel } from "./ui/AlertsPanel";
import { Chart } from "./ui/Chart";
import { StockNote } from "./ui/StockNote";
import { SymbolPicker } from "./ui/SymbolPicker";
import type {
  Alert,
  Bar,
  MarketStock,
  Stock,
  Watchlist,
  ZoneScan,
} from "./ui/types";
import "./style.css";

function formatPrice(value: number | null) {
  return value == null
    ? "-"
    : value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}
function formatChange(value: number | null, percent = false) {
  return value == null
    ? "-"
    : `${value > 0 ? "+" : ""}${percent ? value.toFixed(2) + "%" : formatPrice(value)}`;
}
function tone(value: number | null) {
  return value == null
    ? "neutral"
    : value > 0
      ? "positive"
      : value < 0
        ? "negative"
        : "neutral";
}
const badgeColors = [
  "#1537ad",
  "#11765c",
  "#7c3f9b",
  "#a24d16",
  "#9c234d",
  "#176b87",
];
function badge(code: string) {
  return {
    background:
      badgeColors[
        [...code].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
          badgeColors.length
      ],
  } as CSSProperties;
}
function badgeText(code: string) {
  return code
    .replace(/_DK$/, "")
    .split("_")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}
const sectorColors: Record<string, string> = {
  "Communication Services": "#38bdf8",
  "Consumer Discretionary": "#f59e0b",
  "Consumer Staples": "#facc15",
  Energy: "#fb7185",
  Financials: "#60a5fa",
  "Health Care": "#f472b6",
  Industrials: "#a78bfa",
  "Information Technology": "#34d399",
  Materials: "#d97706",
  "Real Estate": "#c084fc",
  Utilities: "#2dd4bf",
};
function sectorColor(sector: string | undefined) {
  return sectorColors[sector ?? ""] ?? "#6b7280";
}

function Login({ done }: { done: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="login">
      <h1>Stock Watcher</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api("/api/session", "POST", { key });
            done();
          } catch (reason) {
            setError((reason as Error).message);
          }
        }}
      >
        <label>
          Access key
          <input
            type="password"
            autoFocus
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <button>Sign in</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}

function Dashboard() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]),
    [watchlistId, setWatchlistId] = useState<number>(),
    [stocks, setStocks] = useState<Stock[]>([]),
    [stockId, setStockId] = useState<number>(),
    [bars, setBars] = useState<Bar[]>([]),
    [timeframe, setTimeframe] = useState("1d"),
    [alerts, setAlerts] = useState<Alert[]>([]),
    [message, setMessage] = useState(""),
    [syncing, setSyncing] = useState(false),
    [pickerOpen, setPickerOpen] = useState(false),
    [marketStocks, setMarketStocks] = useState<MarketStock[]>([]),
    [marketError, setMarketError] = useState(""),
    [adding, setAdding] = useState(false),
    [copyOpen, setCopyOpen] = useState(false),
    [changeSort, setChangeSort] = useState<"asc" | "desc">(),
    [symbolSort, setSymbolSort] = useState<"asc" | "desc">(),
    [sectorSort, setSectorSort] = useState<"asc" | "desc">(),
    [sectorFilter, setSectorFilter] = useState(""),
    [stockSearch, setStockSearch] = useState(""),
    [alertsOpen, setAlertsOpen] = useState(false),
    [fit, setFit] = useState(false),
    [swingMultiplier, setSwingMultiplier] = useState(3);
  const loadWatchlists = async () => {
    const data = await api<Watchlist[]>("/api/watchlists"),
      cleared = Number(sessionStorage.getItem("clearedWatchlist"));
    sessionStorage.removeItem("clearedWatchlist");
    setWatchlists(data);
    setWatchlistId(
      (current) =>
        current ??
        data.find((watchlist) => watchlist.id === cleared)?.id ??
        data[0]?.id,
    );
  };
  const loadStocks = async (id: number) => {
    const data = await api<Stock[]>(`/api/watchlists/${id}/stocks`);
    setStocks(data);
    setStockId((current) =>
      data.some((stock) => stock.id === current) ? current : data[0]?.id,
    );
  };
  const loadAlerts = () => api<Alert[]>("/api/alerts").then(setAlerts);
  const loadMarketStocks = () =>
    api<MarketStock[]>("/api/market/denmark")
      .then((data) => {
        setMarketStocks(data);
        setMarketError("");
      })
      .catch((error) => setMarketError(error.message));
  useEffect(() => {
    void loadWatchlists().catch((error) => setMessage(error.message));
    void loadAlerts();
    void loadMarketStocks();
  }, []);
  useEffect(() => {
    if (watchlistId)
      void loadStocks(watchlistId).catch((error) => setMessage(error.message));
  }, [watchlistId]);
  useEffect(() => {
    if (stockId)
      void api<{ bars: Bar[] }>(
        `/api/bars?stock=${stockId}&timeframe=${timeframe}`,
      )
        .then((data) => setBars(data.bars))
        .catch((error) => setMessage(error.message));
  }, [stockId, timeframe]);
  const addStocks = async (codes: string[]) => {
    setAdding(true);
    try {
      for (const code of codes)
        await api("/api/stocks", "POST", { code, watchlistId, sync: false });
      await loadWatchlists();
      if (watchlistId) await loadStocks(watchlistId);
      setPickerOpen(false);
      setMessage(
        `${codes.length} stock${codes.length === 1 ? "" : "s"} added. Sync data when ready.`,
      );
    } catch (error) {
      setMarketError((error as Error).message);
    } finally {
      setAdding(false);
    }
  };
  const syncSelectedStock = async () => {
    if (!stockId) return;
    setSyncing(true);
    setMessage("Syncing stock…");
    try {
      await api(`/api/stocks/${stockId}/sync`, "POST");
      if (watchlistId) await loadStocks(watchlistId);
      const data = await api<{ bars: Bar[] }>(
        `/api/bars?stock=${stockId}&timeframe=${timeframe}`,
      );
      setBars(data.bars);
      setMessage("Stock synced.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSyncing(false);
    }
  };
  const openPicker = () => {
    setPickerOpen(true);
    if (!marketStocks.length) void loadMarketStocks();
  };
  const addFromPicker = (codes: string[]) => {
    void addStocks(codes);
  };
  const renameWatchlist = async () => {
    if (!watchlistId) return;
    const name = prompt(
      "Watchlist name",
      watchlists.find((watchlist) => watchlist.id === watchlistId)?.name,
    );
    if (!name) return;
    await api(`/api/watchlists/${watchlistId}`, "PUT", { name });
    await loadWatchlists();
    setMessage("Watchlist renamed.");
  };
  const removeStock = async () => {
    if (
      !watchlistId ||
      !stockId ||
      !confirm("Remove this stock from the current watchlist?")
    )
      return;
    await api(`/api/watchlists/${watchlistId}/stocks/${stockId}`, "DELETE");
    await loadStocks(watchlistId);
    setBars([]);
    setMessage("Stock removed from this watchlist.");
  };
  const copyStock = async (form: HTMLFormElement) => {
    if (!stockId) return;
    const destination = Number(new FormData(form).get("watchlistId"));
    await api(`/api/watchlists/${destination}/stocks`, "POST", { stockId });
    setCopyOpen(false);
    setMessage("Stock copied to the selected watchlist.");
  };
  const selected = stocks.find((stock) => stock.id === stockId);
  const companyName = (code: string | undefined) =>
    marketStocks.find((stock) => stock.code === code)?.name;
  const stockSector = (code: string | undefined) =>
    marketStocks.find((stock) => stock.code === code)?.sector;
  const sectors = [
    ...new Set(stocks.map((stock) => stockSector(stock.code)).filter(Boolean)),
  ].sort();
  const filteredStocks = stocks.filter(
    (stock) =>
      (!sectorFilter || stockSector(stock.code) === sectorFilter) &&
      stock.code.toLowerCase().includes(stockSearch.trim().toLowerCase()),
  );
  const displayedStocks = sectorSort
    ? [...filteredStocks].sort((left, right) =>
        sectorSort === "asc"
          ? (stockSector(left.code) ?? "").localeCompare(
              stockSector(right.code) ?? "",
            )
          : (stockSector(right.code) ?? "").localeCompare(
              stockSector(left.code) ?? "",
            ),
      )
    : symbolSort
      ? [...filteredStocks].sort((left, right) =>
          symbolSort === "asc"
            ? left.code.localeCompare(right.code)
            : right.code.localeCompare(left.code),
        )
      : changeSort
        ? [...filteredStocks].sort((left, right) =>
            left.changePercent == null
              ? 1
              : right.changePercent == null
                ? -1
                : changeSort === "asc"
                  ? left.changePercent - right.changePercent
                  : right.changePercent - left.changePercent,
          )
        : filteredStocks;
  const refreshStocks = async () => {
    if (watchlistId) await loadStocks(watchlistId);
  };
  return (
    <main className="terminal">
      <header className="app-header">
        <div className="app-title">
          <div>
            <h1>Stock Watcher</h1>
            <p>Denmark stocks · manual sync</p>
          </div>
          <div className="header-actions">
            <button onClick={openPicker}>
              <IconPlus size={18} /> Add symbol
            </button>
            <button
              disabled={syncing}
              onClick={() => {
                setSyncing(true);
                setMessage("Syncing data…");
                void api("/api/sync", "POST")
                  .then(() => {
                    setMessage("Data synced.");
                    return stockId
                      ? api<{ bars: Bar[] }>(
                          `/api/bars?stock=${stockId}&timeframe=${timeframe}`,
                        ).then((data) => setBars(data.bars))
                      : undefined;
                  })
                  .catch((error) => setMessage(error.message))
                  .finally(() => setSyncing(false));
              }}
            >
              {syncing ? "Syncing…" : "Sync data"}
            </button>
          </div>
        </div>
        <button
          className="quiet-button"
          onClick={() =>
            api("/api/session", "DELETE").then(() => location.reload())
          }
        >
          Sign out
        </button>
      </header>
      {message && <p className="message">{message}</p>}
      <div className="terminal-layout">
        <aside className="watchlist-panel">
          <div className="watchlist-title">
            <div className="watchlist-select-actions">
              <button
                className="icon-button"
                title="New watchlist"
                onClick={() => {
                  const name = prompt("Watchlist name");
                  if (name)
                    void api("/api/watchlists", "POST", { name })
                      .then(loadWatchlists)
                      .catch((error) => setMessage(error.message));
                }}
              >
                <IconPlus size={20} />
              </button>
              <label>
                <select
                  value={watchlistId ?? ""}
                  onChange={(event) =>
                    setWatchlistId(Number(event.target.value))
                  }
                >
                  {watchlists.map((watchlist) => (
                    <option key={watchlist.id} value={watchlist.id}>
                      {watchlist.name}
                    </option>
                  ))}
                </select>
                <IconChevronDown size={18} />
              </label>
            </div>
            <div>
              <button
                className="icon-button"
                title="Rename watchlist"
                disabled={!watchlistId}
                onClick={() =>
                  void renameWatchlist().catch((error) =>
                    setMessage(error.message),
                  )
                }
              >
                <IconPencil size={20} />
              </button>
              <button
                className="icon-button"
                title="Copy selected stock"
                disabled={!stockId || watchlists.length < 2}
                onClick={() => setCopyOpen((open) => !open)}
              >
                <IconCopy size={20} />
              </button>
              <button
                className="icon-button remove"
                title="Remove selected stock"
                disabled={!stockId}
                onClick={() =>
                  void removeStock().catch((error) => setMessage(error.message))
                }
              >
                <IconTrash size={20} />
              </button>
            </div>
          </div>
          {copyOpen && (
            <form
              className="copy-form"
              onSubmit={(event) => {
                event.preventDefault();
                void copyStock(event.currentTarget).catch((error) =>
                  setMessage(error.message),
                );
              }}
            >
              <select name="watchlistId">
                {watchlists
                  .filter((watchlist) => watchlist.id !== watchlistId)
                  .map((watchlist) => (
                    <option key={watchlist.id} value={watchlist.id}>
                      {watchlist.name}
                    </option>
                  ))}
              </select>
              <button>Copy</button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => setCopyOpen(false)}
              >
                Cancel
              </button>
            </form>
          )}
          <div className="watchlist-filters">
            <label className="sector-filter">
              Sector
              <select
                value={sectorFilter}
                onChange={(event) => setSectorFilter(event.target.value)}
              >
                <option value="">All sectors</option>
                {sectors.map((sector) => (
                  <option key={sector} value={sector}>
                    {sector}
                  </option>
                ))}
              </select>
            </label>
            <label className="watchlist-search">
              <IconSearch size={16} />
              <input
                type="search"
                value={stockSearch}
                onChange={(event) => setStockSearch(event.target.value)}
                placeholder="Filter by stock code"
                aria-label="Filter watchlist by stock code"
              />
            </label>
          </div>
          <div className="quote-head">
            <button
              onClick={() => {
                setSymbolSort((current) =>
                  current === "asc" ? "desc" : "asc",
                );
                setChangeSort(undefined);
                setSectorSort(undefined);
              }}
              aria-label={`Sort symbol ${symbolSort === "asc" ? "descending" : "ascending"}`}
            >
              Symbol{" "}
              {symbolSort === "asc" ? "↑" : symbolSort === "desc" ? "↓" : ""}
            </button>
            <span>Last</span>
            <span>Chg</span>
            <button
              onClick={() => {
                setChangeSort((current) =>
                  current === "desc" ? "asc" : "desc",
                );
                setSymbolSort(undefined);
                setSectorSort(undefined);
              }}
              aria-label={`Sort change percent ${changeSort === "desc" ? "ascending" : "descending"}`}
            >
              Chg%{" "}
              {changeSort === "asc" ? "↑" : changeSort === "desc" ? "↓" : ""}
            </button>
            <button
              className="sector-sort"
              onClick={() => {
                setSectorSort((current) =>
                  current === "asc" ? "desc" : "asc",
                );
                setSymbolSort(undefined);
                setChangeSort(undefined);
              }}
              aria-label={`Sort sector ${sectorSort === "asc" ? "descending" : "ascending"}`}
              title="Sort sector"
            >
              ● {sectorSort === "asc" ? "↑" : sectorSort === "desc" ? "↓" : ""}
            </button>
          </div>
          <div className="quote-list">
            {displayedStocks.length ? (
              displayedStocks.map((stock) => (
                <button
                  key={stock.id}
                  title={
                    [companyName(stock.code), stockSector(stock.code)]
                      .filter(Boolean)
                      .join(" · ") || stock.code
                  }
                  className={`quote-row ${stock.id === stockId ? "selected" : ""}`}
                  onClick={() => setStockId(stock.id)}
                >
                  <span className="quote-symbol">
                    <i style={badge(stock.code)}>{badgeText(stock.code)}</i>
                    <strong>{stock.code}</strong>
                    {stock.note && (
                      <IconNote
                        className="note-indicator"
                        size={17}
                        aria-label="Has note"
                      />
                    )}
                  </span>
                  <span>{formatPrice(stock.last)}</span>
                  <span className={tone(stock.change)}>
                    {formatChange(stock.change)}
                  </span>
                  <span className={tone(stock.changePercent)}>
                    {formatChange(stock.changePercent, true)}
                  </span>
                  <span
                    className="sector-cell"
                    title={stockSector(stock.code) || "No sector"}
                  >
                    <i
                      style={{
                        background: sectorColor(stockSector(stock.code)),
                      }}
                    />
                  </span>
                </button>
              ))
            ) : (
              <p className="watchlist-empty">
                {sectorFilter
                  ? "No stocks in this sector."
                  : "Add a Denmark ticker to this watchlist."}
              </p>
            )}
          </div>
        </aside>
        <section className="chart-pane">
          <div className="chart-header">
            <div className="chart-identity">
              <div>
                <h2>{selected?.code ?? "Choose a stock"}</h2>
                <span>
                  {companyName(selected?.code) ??
                    selected?.providerSymbol ??
                    ""}
                </span>
                {stockSector(selected?.code) && (
                  <small
                    className="sector-label"
                    style={{ color: sectorColor(stockSector(selected?.code)) }}
                  >
                    {stockSector(selected?.code)}
                  </small>
                )}
              </div>
            </div>
            {selected && (
              <div className="quote-summary">
                <strong>
                  {formatPrice(selected.last)} <small>DKK</small>
                </strong>
                <span className={tone(selected.change)}>
                  {formatChange(selected.change)} ·{" "}
                  {formatChange(selected.changePercent, true)}
                </span>
              </div>
            )}
            <div className="timeframes">
              {[
                ["1d", "1D"],
                ["1wk", "1W"],
                ["1mo", "1M"],
                ["4h", "4H"],
                ["1h", "1H"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={timeframe === value ? "selected" : ""}
                  onClick={() => setTimeframe(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              aria-label="Swing sensitivity"
              value={swingMultiplier}
              onChange={(event) =>
                setSwingMultiplier(Number(event.target.value))
              }
            >
              <option value={1.5}>Swing 1.5× ATR</option>
              <option value={2}>Swing 2× ATR</option>
              <option value={3}>Swing 3× ATR</option>
            </select>
            <button
              className="sync-stock"
              disabled={!selected || syncing}
              onClick={() => void syncSelectedStock()}
            >
              {syncing ? "Syncing…" : "Sync stock"}
            </button>
            <button
              className={`fit-chart ${fit ? "selected" : ""}`}
              aria-pressed={fit}
              onClick={() => setFit((value) => !value)}
            >
              Fit {fit ? "on" : "off"}
            </button>
            <button
              className="alert-toggle"
              onClick={() => setAlertsOpen(true)}
            >
              Alerts{alerts.length ? ` (${alerts.length})` : ""}
            </button>
          </div>
          <Chart bars={bars} fit={fit} swingMultiplier={swingMultiplier} />
          <StockNote
            stock={selected}
            refresh={refreshStocks}
            message={setMessage}
          />
          {alertsOpen && (
            <AlertsPanel
              stockId={stockId}
              alerts={alerts}
              refresh={loadAlerts}
              message={setMessage}
              close={() => setAlertsOpen(false)}
            />
          )}
        </section>
      </div>
      {pickerOpen && (
        <SymbolPicker
          stocks={marketStocks}
          loading={!marketStocks.length && !marketError}
          error={marketError}
          adding={adding}
          onAdd={addFromPicker}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </main>
  );
}

function App() {
  const [signedIn, setSignedIn] = useState<boolean>();
  useEffect(() => {
    void fetch("/api/session").then((response) => setSignedIn(response.ok));
  }, []);
  return signedIn === undefined ? (
    <main className="login">Loading…</main>
  ) : signedIn ? (
    <Dashboard />
  ) : (
    <Login done={() => setSignedIn(true)} />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
