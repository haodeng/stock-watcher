export type Direction = "above" | "below";

export function parseCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]+_DK$/.test(code)) throw new Error("stock code must be SYMBOL_DK, for example NDA_DK");
  return code;
}

export function yahooSymbol(code: string): string { return `${parseCode(code).slice(0, -3)}-DK.CO`; }

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
