import { IconTrash } from "@tabler/icons-react";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type SeriesAttachedParameter,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  chartTime,
  fairValueGaps,
  orderBlocks,
  swings,
  type FairValueGap,
} from "../shared";
import { api } from "./api";
import type { Bar, Stock, Watchlist, ZoneScan } from "./types";

class PriceZones {
  private chart?: SeriesAttachedParameter["chart"];
  private series?: SeriesAttachedParameter["series"];
  constructor(
    private zones: Array<
      Pick<FairValueGap, "index" | "direction" | "top" | "bottom">
    >,
    private bars: Bar[],
    private bullish: string,
    private bearish: string,
    private opacity: string,
    private border = false,
  ) {}
  attached({ chart, series }: SeriesAttachedParameter) {
    this.chart = chart;
    this.series = series;
  }
  paneViews() {
    return [this];
  }
  zOrder() {
    return "bottom" as const;
  }
  private paint(target: any, stroke: boolean) {
    target.useMediaCoordinateSpace((scope: any) => {
      if (!this.chart || !this.series) return;
      for (const zone of this.zones) {
        const x = this.chart
            .timeScale()
            .timeToCoordinate(chartTime(this.bars[zone.index].time) as Time),
          top = this.series.priceToCoordinate(zone.top),
          bottom = this.series.priceToCoordinate(zone.bottom);
        if (x == null || top == null || bottom == null) continue;
        const color = `${zone.direction === "bullish" ? this.bullish : this.bearish}${stroke ? "80" : this.opacity}`;
        if (stroke) {
          scope.context.strokeStyle = color;
          scope.context.strokeRect(
            x,
            top,
            scope.mediaSize.width - x,
            bottom - top,
          );
        } else {
          scope.context.fillStyle = color;
          scope.context.fillRect(
            x,
            top,
            scope.mediaSize.width - x,
            bottom - top,
          );
        }
      }
    });
  }
  renderer() {
    return {
      draw: (target: any) => {
        if (this.border) this.paint(target, true);
      },
      drawBackground: (target: any) => this.paint(target, false),
    };
  }
}

function ZoneScanner({
  watchlists,
  swingMultiplier,
  fvgMinAtr,
  obDisplacementAtr,
}: {
  watchlists: Watchlist[];
  swingMultiplier: number;
  fvgMinAtr: number;
  obDisplacementAtr: number;
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
        swingMultiplier,
        fvgMinAtr,
        obDisplacementAtr,
        proximityAtr,
        freshOnly,
      });
      if (data.added) location.reload();
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
  const form = (
    <form
      className="zone-scanner"
      onSubmit={(event) => {
        event.preventDefault();
        void scan();
      }}
    >
      <strong>Zone scanner</strong>
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
          {[
            ["1d", "1D"],
            ["1wk", "1W"],
            ["1mo", "1M"],
            ["4h", "4H"],
            ["1h", "1H"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
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
  return (
    <>
      {createPortal(
        form,
        document.querySelector(".header-actions") ?? document.body,
      )}
      <WatchlistClearer />
      <RowRemovers />
    </>
  );
}

function WatchlistClearer() {
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(
    () =>
      setTarget(document.querySelector(".watchlist-title > div:last-child")),
    [],
  );
  const clear = () => {
    const select = document.querySelector(
        ".watchlist-title select",
      ) as HTMLSelectElement | null,
      name = select?.selectedOptions[0]?.text ?? "this watchlist";
    if (!select?.value || !confirm(`Remove every stock from ${name}?`)) return;
    void api(`/api/watchlists/${select.value}/stocks`, "DELETE")
      .then(() => {
        sessionStorage.setItem("clearedWatchlist", select.value);
        location.reload();
      })
      .catch((error) => alert(error.message));
  };
  return target
    ? createPortal(
        <button
          type="button"
          className="quiet-button clear-watchlist"
          onClick={clear}
        >
          Clear all
        </button>,
        target,
      )
    : null;
}

function RowRemovers() {
  const [rows, setRows] = useState<Element[]>([]);
  useEffect(() => {
    const list = document.querySelector(".quote-list");
    if (!list) return;
    const update = () => setRows([...list.querySelectorAll(".quote-row")]);
    update();
    const observer = new MutationObserver(update);
    observer.observe(list, { childList: true });
    return () => observer.disconnect();
  }, []);
  const remove = async (row: Element) => {
    const select = document.querySelector(
        ".watchlist-title select",
      ) as HTMLSelectElement | null,
      code = row.querySelector("strong")?.textContent;
    if (
      !select?.value ||
      !code ||
      !confirm(`Remove ${code} from this watchlist?`)
    )
      return;
    try {
      const stock = (
        await api<Stock[]>(`/api/watchlists/${select.value}/stocks`)
      ).find((item) => item.code === code);
      if (!stock) return;
      await api(`/api/watchlists/${select.value}/stocks/${stock.id}`, "DELETE");
      sessionStorage.setItem("clearedWatchlist", select.value);
      location.reload();
    } catch (error) {
      alert((error as Error).message);
    }
  };
  return (
    <>
      {rows
        .filter((row) => row.isConnected)
        .map((row) =>
          createPortal(
            <span
              key="remove"
              role="button"
              tabIndex={0}
              className="icon-button remove row-remove"
              aria-label="Remove stock"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void remove(row);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  void remove(row);
                }
              }}
            >
              <IconTrash size={16} />
            </span>,
            row,
          ),
        )}
    </>
  );
}

export function Chart({
  bars,
  fit,
  swingMultiplier,
}: {
  bars: Bar[];
  fit: boolean;
  swingMultiplier: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showZigZag, setShowZigZag] = useState(true),
    [showFvg, setShowFvg] = useState(true),
    [showOb, setShowOb] = useState(true),
    [chartSwingMultiplier, setChartSwingMultiplier] = useState(swingMultiplier),
    [fvgMinAtr, setFvgMinAtr] = useState(0.5),
    [fvgLimit, setFvgLimit] = useState(3),
    [obDisplacementAtr, setObDisplacementAtr] = useState(1.5),
    [obLimit, setObLimit] = useState(2),
    [scanWatchlists, setScanWatchlists] = useState<Watchlist[]>([]);
  useEffect(() => {
    void api<Watchlist[]>("/api/watchlists").then(setScanWatchlists);
  }, []);
  useEffect(() => {
    if (!ref.current || !bars.length) return;
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 500,
      layout: { background: { color: "#101214" }, textColor: "#a8afb9" },
      grid: {
        vertLines: { color: "#20252b" },
        horzLines: { color: "#20252b" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#343a42" },
      timeScale: { borderColor: "#343a42" },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#21b89a",
      downColor: "#f04d61",
      borderVisible: false,
      wickUpColor: "#21b89a",
      wickDownColor: "#f04d61",
    });
    series.setData(
      bars.map((bar) => ({ ...bar, time: chartTime(bar.time) as Time })),
    );
    if (showFvg)
      series.attachPrimitive(
        new PriceZones(
          fairValueGaps(bars, fvgMinAtr, fvgLimit),
          bars,
          "#38bdf8",
          "#a78bfa",
          "20",
        ),
      );
    if (showOb)
      series.attachPrimitive(
        new PriceZones(
          orderBlocks(
            bars,
            chartSwingMultiplier,
            obDisplacementAtr,
            obLimit,
            fvgMinAtr,
          ),
          bars,
          "#22c55e",
          "#ef4444",
          "38",
          true,
        ),
      );
    if (showZigZag) {
      const swingPoints = swings(bars, chartSwingMultiplier);
      const zigZag = chart.addSeries(LineSeries, {
        color: "#d8b469",
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      zigZag.setData(
        swingPoints.map(({ index, direction }) => ({
          time: chartTime(bars[index].time) as Time,
          value: direction === "high" ? bars[index].high : bars[index].low,
        })),
      );
      for (const direction of ["high", "low"] as const) {
        const dots = chart.addSeries(LineSeries, {
          color: direction === "high" ? "#f04d61b3" : "#21b89ab3",
          lineVisible: false,
          pointMarkersVisible: true,
          pointMarkersRadius: 2,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        dots.setData(
          swingPoints
            .filter((point) => point.direction === direction)
            .map(({ index }) => {
              const bar = bars[index];
              const offset = (bar.high - bar.low) / 2;
              return {
                time: chartTime(bar.time) as Time,
                value:
                  direction === "high" ? bar.high + offset : bar.low - offset,
              };
            }),
        );
      }
    }
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volume.setData(
      bars.map((bar) => ({
        time: chartTime(bar.time) as Time,
        value: bar.volume,
        color: bar.close >= bar.open ? "#21b89a80" : "#f04d6180",
      })),
    );
    if (fit)
      chart
        .timeScale()
        .setVisibleLogicalRange({
          from: Math.max(0, bars.length - 300),
          to: bars.length - 1,
        });
    else chart.timeScale().fitContent();
    const observer = new ResizeObserver(() =>
      chart.applyOptions({ width: ref.current?.clientWidth ?? 0 }),
    );
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [
    bars,
    chartSwingMultiplier,
    fit,
    fvgLimit,
    fvgMinAtr,
    obDisplacementAtr,
    obLimit,
    showFvg,
    showOb,
    showZigZag,
  ]);
  return (
    <div className="chart">
      {bars.length ? (
        <>
          <button
            className={`fit-chart zigzag-toggle ${showZigZag ? "selected" : ""}`}
            aria-pressed={showZigZag}
            onClick={() => setShowZigZag((value) => !value)}
          >
            ZigZag {showZigZag ? "on" : "off"}
          </button>
          <button
            className={`fit-chart zigzag-toggle ${showFvg ? "selected" : ""}`}
            aria-pressed={showFvg}
            onClick={() => setShowFvg((value) => !value)}
          >
            FVG {showFvg ? "on" : "off"}
          </button>
          <button
            className={`fit-chart zigzag-toggle ${showOb ? "selected" : ""}`}
            aria-pressed={showOb}
            onClick={() => setShowOb((value) => !value)}
          >
            OB {showOb ? "on" : "off"}
          </button>
          <details className="zone-settings">
            <summary>Zone settings</summary>
            <div>
              <label className="zone-setting swing">
                Swing ATR
                <select
                  value={chartSwingMultiplier}
                  onChange={(event) =>
                    setChartSwingMultiplier(Number(event.target.value))
                  }
                >
                  <option value={1.5}>1.5× ATR</option>
                  <option value={2}>2× ATR</option>
                  <option value={3}>3× ATR</option>
                </select>
              </label>
              <section className="zone-setting">
                <strong>FVG</strong>
                <label>
                  Min ATR
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={fvgMinAtr}
                    onChange={(event) =>
                      setFvgMinAtr(Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                </label>
                <label>
                  Max zones
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={fvgLimit}
                    onChange={(event) =>
                      setFvgLimit(
                        Math.max(
                          1,
                          Math.floor(Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                </label>
              </section>
              <section className="zone-setting">
                <strong>OB</strong>
                <label>
                  Displacement ATR
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={obDisplacementAtr}
                    onChange={(event) =>
                      setObDisplacementAtr(
                        Math.max(0, Number(event.target.value) || 0),
                      )
                    }
                  />
                </label>
                <label>
                  Max zones
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={obLimit}
                    onChange={(event) =>
                      setObLimit(
                        Math.max(
                          1,
                          Math.floor(Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                </label>
              </section>
            </div>
          </details>
          <div ref={ref} />
        </>
      ) : (
        <p>No price history for this timeframe.</p>
      )}
      <ZoneScanner
        watchlists={scanWatchlists}
        swingMultiplier={chartSwingMultiplier}
        fvgMinAtr={fvgMinAtr}
        obDisplacementAtr={obDisplacementAtr}
      />
    </div>
  );
}
