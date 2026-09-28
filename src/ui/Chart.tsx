import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type SeriesAttachedParameter,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  chartTime,
  fairValueGaps,
  orderBlocks,
  swings,
  type FairValueGap,
} from "../shared";
import type { Bar, ChartDrawing, ChartPoint, ZoneSettings } from "./types";

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
  drawings,
  onDrawingsChange,
}: {
  bars: Bar[];
  fit: boolean;
  settings: ZoneSettings;
  onSettingsChange: (settings: ZoneSettings) => void;
  drawings: ChartDrawing[];
  onDrawingsChange: (drawings: ChartDrawing[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(undefined);
  const seriesRef = useRef<any>(undefined);
  const [showZigZag, setShowZigZag] = useState(true),
    [showFvg, setShowFvg] = useState(true),
    [showOb, setShowOb] = useState(true),
    [drawing, setDrawing] = useState(false),
    [draft, setDraft] = useState<ChartPoint[]>([]),
    [selected, setSelected] = useState<number>(),
    [drag, setDrag] = useState<{ index: number; startX: number; startY: number; x: number; y: number }>(),
    [, redraw] = useState(0);
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
    chartRef.current = chart;
    seriesRef.current = series;
    const refresh = () => redraw((value) => value + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(refresh);
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
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(refresh);
      chartRef.current = undefined;
      seriesRef.current = undefined;
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
  const storedTime = (time: any): string | number => typeof time === "object" ? `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}` : time;
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect(), chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return;
    const time = chart.timeScale().coordinateToTime(event.clientX - box.left), price = series.coordinateToPrice(event.clientY - box.top);
    return time != null && price != null ? { time: storedTime(time), price } : undefined;
  };
  const path = (points: ChartPoint[]) => points.map((point, index) => {
    const time = typeof point.time === "number" ? point.time as Time : chartTime(point.time) as Time;
    const x = chartRef.current?.timeScale().timeToCoordinate(time), y = seriesRef.current?.priceToCoordinate(point.price);
    return x == null || y == null ? "" : `${index ? "L" : "M"}${x},${y}`;
  }).join(" ");
  const move = (stroke: ChartDrawing, xOffset: number, yOffset: number): ChartDrawing => ({
    points: stroke.points.map((point) => {
      const time = typeof point.time === "number" ? point.time as Time : chartTime(point.time) as Time;
      const x = chartRef.current?.timeScale().timeToCoordinate(time), y = seriesRef.current?.priceToCoordinate(point.price);
      const nextTime = x == null ? null : chartRef.current?.timeScale().coordinateToTime(x + xOffset);
      const nextPrice = y == null ? null : seriesRef.current?.coordinateToPrice(y + yOffset);
      return nextTime == null || nextPrice == null ? point : { time: storedTime(nextTime), price: nextPrice };
    }),
  });
  useEffect(() => {
    const removeSelected = (event: KeyboardEvent) => {
      if ((event.key !== "Delete" && event.key !== "Backspace") || selected == null || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      event.preventDefault();
      onDrawingsChange(drawings.filter((_, index) => index !== selected));
      setSelected(undefined);
    };
    window.addEventListener("keydown", removeSelected);
    return () => window.removeEventListener("keydown", removeSelected);
  }, [drawings, onDrawingsChange, selected]);
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
          <button className={`fit-chart zigzag-toggle ${drawing ? "selected" : ""}`} aria-pressed={drawing} onClick={() => setDrawing((value) => !value)}>
            Draw {drawing ? "on" : "off"}
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
          <div className="chart-surface" ref={ref}>
            <svg className={`drawing-layer ${drawing ? "active" : ""}`}
              onPointerDown={(event) => { if (!drawing) return; const first = point(event); if (first) { event.currentTarget.setPointerCapture(event.pointerId); setSelected(undefined); setDraft([first]); } }}
              onPointerMove={(event) => { if (!draft.length) return; const next = point(event); if (next) setDraft((current) => current.length < 1_000 ? [...current, next] : current); }}
              onPointerUp={() => { if (draft.length > 1) onDrawingsChange([...drawings, { points: draft }]); setDraft([]); }}
            >
              {drawings.map((stroke, index) => <path key={index} className={selected === index ? "selected" : ""} d={path(stroke.points)} transform={drag?.index === index ? `translate(${drag.x - drag.startX} ${drag.y - drag.startY})` : undefined}
                onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelected(index); setDrag({ index, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY }); }}
                onPointerMove={(event) => { if (drag?.index === index) { event.stopPropagation(); setDrag({ ...drag, x: event.clientX, y: event.clientY }); } }}
                onPointerUp={(event) => { if (drag?.index !== index) return; event.stopPropagation(); const xOffset = event.clientX - drag.startX, yOffset = event.clientY - drag.startY; if (xOffset || yOffset) onDrawingsChange(drawings.map((drawing, current) => current === index ? move(drawing, xOffset, yOffset) : drawing)); setDrag(undefined); }}
              />)}
              {draft.length > 1 && <path d={path(draft)} />}
            </svg>
          </div>
        </>
      ) : (
        <p>No price history for this timeframe.</p>
      )}
    </div>
  );
}
