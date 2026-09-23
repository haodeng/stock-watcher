export type Direction = "above" | "below";
type PriceBar = { high: number; low: number; close: number };
type OhlcBar = PriceBar & { open: number };
type Swing = { index: number; direction: "high" | "low" };
export type FairValueGap = { index: number; direction: "bullish" | "bearish"; top: number; bottom: number };
export type OrderBlock = FairValueGap & { confirmedAt: number };

export function parseCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*_DK$/.test(code)) throw new Error("stock code must be SYMBOL_DK, for example NDA_DK");
  return code;
}

export function yahooSymbol(code: string): string {
  const base = parseCode(code).slice(0, -3).replaceAll("_", "-");
  return `${base === "NDA" ? "NDA-DK" : base}.CO`;
}

export function nasdaqCode(symbol: string): string {
  const base = symbol.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${base === "NDA_DKK" || base === "NDA_DK" ? "NDA" : base}_DK`;
}

export function stockNote(value: unknown): string | null {
  if (typeof value !== "string") throw new Error("note must be text");
  const note = value.trim();
  if (note.length > 2_000) throw new Error("note must be 2,000 characters or less");
  return note || null;
}

export function chartTime(value: string): string | number {
  if (!value.includes("T")) return value;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new Error("invalid bar timestamp");
  return Math.floor(timestamp / 1000);
}

export function watchlistName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 40) throw new Error("watchlist name must be 1 to 40 characters");
  return name;
}

export function crossed(direction: Direction, target: number, previous: number, current: number): boolean {
  return direction === "above" ? previous < target && current >= target : previous > target && current <= target;
}

function atr(bars: PriceBar[], index: number): number {
  return bars.slice(index - 13, index + 1).reduce((total, bar, offset) => {
    const previous = bars[index - 14 + offset]?.close ?? bar.close;
    return total + Math.max(bar.high - bar.low, Math.abs(bar.high - previous), Math.abs(bar.low - previous));
  }, 0) / 14;
}

export function swings(bars: PriceBar[], multiplier = 2): Swing[] {
  const candidates = bars.flatMap<Swing>((bar, index) => {
    if (index < 14 || index + 5 >= bars.length) return [];
    const nearby = [...bars.slice(index - 5, index), ...bars.slice(index + 1, index + 6)];
    return bar.high > Math.max(...nearby.map((other) => other.high)) ? [{ index, direction: "high" as const }] : bar.low < Math.min(...nearby.map((other) => other.low)) ? [{ index, direction: "low" as const }] : [];
  });
  return candidates.reduce<Swing[]>((result, swing) => {
    const previous = result.at(-1);
    if (!previous) return [swing];
    const stronger = swing.direction === "high" ? bars[swing.index].high > bars[previous.index].high : bars[swing.index].low < bars[previous.index].low;
    if (previous.direction === swing.direction) return stronger ? [...result.slice(0, -1), swing] : result;
    const reversal = Math.abs((swing.direction === "high" ? bars[swing.index].high : bars[swing.index].low) - (previous.direction === "high" ? bars[previous.index].high : bars[previous.index].low));
    return reversal >= atr(bars, swing.index) * multiplier ? [...result, swing] : result;
  }, []);
}

export function fairValueGaps(bars: PriceBar[], minAtr = 0.5, limit = 3): FairValueGap[] {
  const active: FairValueGap[] = [];
  for (let index = 14; index < bars.length; index++) {
    const bar = bars[index];
    for (let zoneIndex = active.length - 1; zoneIndex >= 0; zoneIndex--) {
      const zone = active[zoneIndex];
      if (zone.direction === "bullish" ? bar.low <= zone.bottom : bar.high >= zone.top) active.splice(zoneIndex, 1);
    }
    const zone = fairValueGapAt(bars, index, minAtr);
    if (zone) active.push(zone);
  }
  return ["bullish", "bearish"].flatMap((direction) => active.filter((zone) => zone.direction === direction).slice(-Math.max(1, Math.floor(limit))));
}

function fairValueGapAt(bars: PriceBar[], index: number, minAtr = 0.5): FairValueGap | undefined {
  const first = bars[index - 2], bar = bars[index], gap = atr(bars, index) * Math.max(0, minAtr);
  if (bar.low - first.high >= gap) return { index, direction: "bullish", top: bar.low, bottom: first.high };
  if (first.low - bar.high >= gap) return { index, direction: "bearish", top: first.low, bottom: bar.high };
}

export function orderBlocks(bars: OhlcBar[], swingMultiplier = 3, displacementAtr = 1.5, limit = 2, fvgMinAtr = 0.5): OrderBlock[] {
  const points = swings(bars, swingMultiplier), blocks: OrderBlock[] = [], broken = new Set<number>();
  for (let index = 14; index < bars.length - 2; index++) {
    const high = [...points].reverse().find((point) => point.direction === "high" && point.index + 5 < index && !broken.has(point.index));
    const low = [...points].reverse().find((point) => point.direction === "low" && point.index + 5 < index && !broken.has(point.index));
    const direction = high && bars[index].close > bars[high.index].high ? "bullish" : low && bars[index].close < bars[low.index].low ? "bearish" : undefined;
    if (!direction || Math.abs(bars[index].close - bars[index].open) < atr(bars, index) * Math.max(0, displacementAtr)) continue;
    broken.add(direction === "bullish" ? high!.index : low!.index);
    const fvg = [index, index + 1, index + 2].map((fvgIndex) => fairValueGapAt(bars, fvgIndex, fvgMinAtr)).find((zone) => zone?.direction === direction);
    const candle = [...bars.slice(Math.max(0, index - 5), index)].map((bar, offset) => ({ bar, index: Math.max(0, index - 5) + offset })).reverse().find(({ bar }) => direction === "bullish" ? bar.close < bar.open : bar.close > bar.open);
    if (fvg && candle) blocks.push({ index: candle.index, confirmedAt: fvg.index, direction, top: candle.bar.high, bottom: candle.bar.low });
  }
  return ["bullish", "bearish"].flatMap((direction) => blocks.filter((block) => block.direction === direction && !bars.slice(block.confirmedAt + 1).some((bar) => direction === "bullish" ? bar.close < block.bottom : bar.close > block.top)).slice(-Math.max(1, Math.floor(limit))));
}

export function zoneNearby(bars: PriceBar[], zones: Array<Pick<FairValueGap, "top" | "bottom">>): boolean {
  const last = bars.at(-1);
  if (!last) return false;
  return zones.some((zone) => last.low <= zone.top && last.high >= zone.bottom || Math.min(Math.abs(last.close - zone.top), Math.abs(last.close - zone.bottom)) <= atr(bars, bars.length - 1) / 4);
}

export function sameSecret(actual: string, expected: string): boolean {
  let different = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index++) different |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  return different === 0;
}
