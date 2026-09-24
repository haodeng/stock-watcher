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
import {
  chartTime,
  fairValueGaps,
  orderBlocks,
  swings,
  type FairValueGap,
} from "../shared";
import type { Bar, ZoneSettings } from "./types";

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

export function Chart({
  bars,
  fit,
  settings,
  onSettingsChange,
}: {
  bars: Bar[];
  fit: boolean;
  settings: ZoneSettings;
  onSettingsChange: (settings: ZoneSettings) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showZigZag, setShowZigZag] = useState(true),
    [showFvg, setShowFvg] = useState(true),
    [showOb, setShowOb] = useState(true);
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
          fairValueGaps(bars, settings.fvgMinAtr, settings.fvgLimit),
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
            settings.swingMultiplier,
            settings.obDisplacementAtr,
            settings.obLimit,
            settings.fvgMinAtr,
          ),
          bars,
          "#22c55e",
          "#ef4444",
          "38",
          true,
        ),
      );
    if (showZigZag) {
      const swingPoints = swings(bars, settings.swingMultiplier);
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
    settings,
    fit,
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
                  value={settings.swingMultiplier}
                  onChange={(event) =>
                    onSettingsChange({
                      ...settings,
                      swingMultiplier: Number(event.target.value),
                    })
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
                    value={settings.fvgMinAtr}
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        fvgMinAtr: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                  />
                </label>
                <label>
                  Max zones
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={settings.fvgLimit}
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        fvgLimit: Math.max(
                          1,
                          Math.floor(Number(event.target.value) || 1),
                        ),
                      })
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
                    value={settings.obDisplacementAtr}
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        obDisplacementAtr: Math.max(
                          0,
                          Number(event.target.value) || 0,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Max zones
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={settings.obLimit}
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        obLimit: Math.max(
                          1,
                          Math.floor(Number(event.target.value) || 1),
                        ),
                      })
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
    </div>
  );
}
