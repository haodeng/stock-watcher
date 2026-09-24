import { useEffect, useState } from "react";
import { api } from "./api";
import type { Watchlist, ZoneScan, ZoneSettings } from "./types";

export function ZoneScanner({
  watchlists,
  settings,
  refresh,
}: {
  watchlists: Watchlist[];
  settings: ZoneSettings;
  refresh: () => Promise<void>;
}) {
  const [zone, setZone] = useState("fvg"),
    [timeframe, setTimeframe] = useState("1d"),
    [proximityAtr, setProximityAtr] = useState(0.25),
    [freshOnly, setFreshOnly] = useState(true),
    [watchlistId, setWatchlistId] = useState<number>(),
    [loading, setLoading] = useState(false),
    [result, setResult] = useState("");
  useEffect(
    () => setWatchlistId((current) => current ?? watchlists[0]?.id),
    [watchlists],
  );
  const scan = async () => {
    if (!watchlistId) return;
    setLoading(true);
    setResult("");
    try {
      const data = await api<ZoneScan>("/api/scans/zones", "POST", {
        watchlistId,
        zone,
        timeframe,
        swingMultiplier: settings.swingMultiplier,
        fvgMinAtr: settings.fvgMinAtr,
        obDisplacementAtr: settings.obDisplacementAtr,
        proximityAtr,
        freshOnly,
      });
      if (data.added) await refresh();
      setResult(
        data.matches.length
          ? `${data.added} added · ${data.matches.map((stock) => stock.code).join(", ")}`
          : "No matching stocks.",
      );
    } catch (error) {
      setResult((error as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <form
      className="zone-scanner"
      onSubmit={(event) => {
        event.preventDefault();
        void scan();
      }}
    >
      <label>
        Zone
        <select value={zone} onChange={(event) => setZone(event.target.value)}>
          <option value="fvg">Bullish FVG</option>
          <option value="ob">Bullish OB</option>
        </select>
      </label>
      <label>
        Timeframe
        <select
          value={timeframe}
          onChange={(event) => setTimeframe(event.target.value)}
        >
          {["1d", "1wk", "1mo", "4h", "1h"].map((value) => (
            <option key={value} value={value}>
              {value.replace("wk", "W").replace("mo", "M").toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label>
        Proximity
        <select
          value={proximityAtr}
          onChange={(event) => setProximityAtr(Number(event.target.value))}
        >
          <option value={0}>In zone only</option>
          <option value={0.25}>Within 0.25 ATR</option>
          <option value={0.5}>Within 0.5 ATR</option>
        </select>
      </label>
      <label>
        Fresh only
        <input
          type="checkbox"
          checked={freshOnly}
          onChange={(event) => setFreshOnly(event.target.checked)}
        />
      </label>
      <label>
        Save to
        <select
          value={watchlistId ?? ""}
          onChange={(event) => setWatchlistId(Number(event.target.value))}
        >
          {watchlists.map((watchlist) => (
            <option key={watchlist.id} value={watchlist.id}>
              {watchlist.name}
            </option>
          ))}
        </select>
      </label>
      <button disabled={!watchlistId || loading}>
        {loading ? "Scanning…" : "Scan & save"}
      </button>
      {result && (
        <span>
          <button
            type="button"
            aria-label="Close scan result"
            onClick={() => setResult("")}
          >
            ×
          </button>
          {result}
        </span>
      )}
    </form>
  );
}
