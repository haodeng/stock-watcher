export type Direction = "above" | "below";

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

export function sameSecret(actual: string, expected: string): boolean {
  let different = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index++) different |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  return different === 0;
}
