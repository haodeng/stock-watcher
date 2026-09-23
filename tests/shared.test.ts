import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chartTime, crossed, fairValueGaps, freshBullishZoneNearby, nasdaqCode, orderBlocks, parseCode, sameSecret, stockNote, swings, watchlistName, yahooSymbol, zoneNearby } from "../src/shared";
import { aggregateDailyBars, aggregateHourlyBars, syncRanges } from "../src/worker";

test("Danish codes map to Yahoo symbols", () => {
  assert.equal(parseCode("nda_dk"), "NDA_DK");
  assert.equal(parseCode("novo_b_dk"), "NOVO_B_DK");
  assert.equal(yahooSymbol("nda_dk"), "NDA-DK.CO");
  assert.equal(yahooSymbol("novo_b_dk"), "NOVO-B.CO");
  assert.equal(nasdaqCode("NDA DKK"), "NDA_DK");
  assert.equal(nasdaqCode("NDA DK"), "NDA_DK");
  assert.equal(nasdaqCode("NOVO B"), "NOVO_B_DK");
  assert.equal(stockNote("  review earnings  "), "review earnings");
  assert.equal(stockNote(""), null);
  assert.equal(watchlistName(" Focus "), "Focus");
  assert.throws(() => stockNote("x".repeat(2_001)));
  assert.throws(() => parseCode("NDA_US"));
});
test("alerts fire only on a price crossing", () => {
  assert.equal(crossed("above", 100, 99, 100), true);
  assert.equal(crossed("above", 100, 100, 101), false);
  assert.equal(crossed("below", 100, 101, 100), true);
});
test("access key comparison rejects differences", () => {
  assert.equal(sameSecret("correct", "correct"), true);
  assert.equal(sameSecret("wrong", "correct"), false);
});

test("Worker binds static assets and has no scheduled trigger", async () => {
  const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  assert.equal(config.assets.binding, "ASSETS");
  assert.equal(config.triggers, undefined);
  assert.match(await readFile("src/worker.ts", "utf8"), /market=CPH/);
  assert.match(await readFile("src/worker.ts", "utf8"), /sector: stock\.sector/);
  assert.match(await readFile("src/worker.ts", "utf8"), /FROM stocks s JOIN watchlist_stocks ws/);
  assert.match(await readFile("src/worker.ts", "utf8"), /body\.sync !== false/);
  assert.match(await readFile("src/worker.ts", "utf8"), /api\.put\("\/api\/watchlists\/:watchlistId"/);
  assert.match(await readFile("src/worker.ts", "utf8"), /api\.post\("\/api\/stocks\/:stockId\/sync"/);
  assert.match(await readFile("src/worker.ts", "utf8"), /api\.delete\("\/api\/watchlists\/:watchlistId\/stocks"/);
  assert.match(await readFile("src/style.css", "utf8"), /\.symbol-results \{ min-height: 0; flex: 1; overflow: auto; \}/);
  assert.match(await readFile("src/frontend.tsx", "utf8"), /displayedStocks\.map/);
  assert.match(await readFile("src/frontend.tsx", "utf8"), /bars\.length - 300/);
  assert.match(await readFile("src/frontend.tsx", "utf8"), /sectorSort/);
  assert.match(await readFile("src/frontend.tsx", "utf8"), /All sectors/);
  assert.match(await readFile("src/frontend.tsx", "utf8"), /api<ZoneScan>\("\/api\/scans\/zones"[\s\S]*location\.reload\(\)/);
  assert.match(await readFile("src/frontend.tsx", "utf8"), /for \(const stock of stocks\.values\(\)\) await api\(`\/api\/stocks\/\$\{stock\.id\}\/sync`, "POST"\)/);
  assert.match(await readFile("src/worker.ts", "utf8"), /index \+= 500/);
  assert.match(await readFile("src/worker.ts", "utf8"), /WHERE \$\{table\}\.open IS NOT excluded\.open/);
});

test("manual sync requests full history", () => {
  assert.deepEqual(syncRanges(), { daily: "10y", hourly: "2y" });
});

test("an existing stock syncs only recent bars", () => {
  assert.deepEqual(syncRanges(true, true), { daily: "5d", hourly: "5d" });
});

test("hourly timestamps become chart timestamps", () => {
  assert.equal(chartTime("2026-09-22T14:00:00.000Z"), 1_790_085_600);
  assert.equal(chartTime("2026-09-22"), "2026-09-22");
});

test("ATR-filtered swings ignore minor reversals", () => {
  const bars = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 35, 24, 23, 22, 21, 20, 21, 22, 23, 24, 36, 24, 23, 22, 21, 20].map((value) => ({ high: value + 1, low: value - 1, close: value }));
  assert.deepEqual(swings(bars), [{ index: 15, direction: "high" }, { index: 20, direction: "low" }, { index: 25, direction: "high" }]);
});

test("fair value gaps remain until price fills them", () => {
  const bars = Array.from({ length: 14 }, () => ({ high: 101, low: 99, close: 100 })).concat([{ high: 100, low: 99, close: 100 }, { high: 105, low: 100, close: 104 }, { high: 107, low: 102, close: 106 }]);
  assert.deepEqual(fairValueGaps(bars), [{ index: 16, direction: "bullish", top: 102, bottom: 100 }]);
  assert.deepEqual(fairValueGaps(bars, 2), []);
  bars.push({ high: 104, low: 99, close: 100 });
  assert.deepEqual(fairValueGaps(bars), []);
});

test("zone scanner includes a touch or nearby price", () => {
  const bars = Array.from({ length: 14 }, () => ({ high: 101, low: 99, close: 100 })).concat([{ high: 102.4, low: 102.2, close: 102.3 }]);
  assert.equal(zoneNearby(bars, [{ top: 102, bottom: 100 }]), true);
  assert.equal(zoneNearby(bars, [{ top: 102, bottom: 100 }], 0), false);
  assert.equal(zoneNearby(bars, [{ top: 90, bottom: 88 }]), false);
});

test("fresh zone scanner excludes a zone entered by an earlier wick", () => {
  const bars = Array.from({ length: 14 }, () => ({ high: 101, low: 99, close: 100 })).concat([{ high: 102.4, low: 102.2, close: 102.3 }]);
  const zone = { index: 13, top: 102, bottom: 100 };
  assert.equal(freshBullishZoneNearby(bars, [zone]), true);
  bars[14] = { high: 102.4, low: 101.9, close: 102.3 };
  assert.equal(freshBullishZoneNearby(bars, [zone]), false);
});

test("order blocks require a displaced structure break with an FVG", () => {
  const values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 35, 24, 23, 22, 21, 20, 21, 22, 24, 40, 44, 46, 45, 44, 43, 42];
  const bars = values.map((close) => ({ open: close - 1, high: close + 1, low: close - 1, close }));
  bars[23] = { open: 25, high: 26, low: 23, close: 24 };
  bars[24] = { open: 24, high: 41, low: 24, close: 40 };
  bars[25] = { open: 40, high: 45, low: 39, close: 44 };
  bars[26] = { open: 44, high: 47, low: 44, close: 46 };
  assert.deepEqual(orderBlocks(bars), [{ index: 23, confirmedAt: 25, direction: "bullish", top: 26, bottom: 23 }]);
  assert.deepEqual(orderBlocks(bars, 3, 10), []);
  bars.push({ open: 22, high: 23, low: 20, close: 21 });
  assert.deepEqual(orderBlocks(bars), []);
});

test("four-hour candles follow Copenhagen trading sessions", () => {
  const bars = Array.from({ length: 8 }, (_, index) => ({ time: `2024-09-18T${String(index + 7).padStart(2, "0")}:00:00.000Z`, open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 10 }));
  assert.deepEqual(aggregateHourlyBars(bars), [
    { time: "2024-09-18T07:00:00.000Z", open: 100, high: 105, low: 99, close: 104, volume: 40 },
    { time: "2024-09-18T11:00:00.000Z", open: 104, high: 109, low: 103, close: 108, volume: 40 },
  ]);
});

test("weekly and monthly candles are derived from daily bars", () => {
  const bars = [
    { time: "2026-09-14", open: 100, high: 103, low: 99, close: 102, volume: 10 },
    { time: "2026-09-18", open: 102, high: 106, low: 101, close: 105, volume: 20 },
    { time: "2026-10-01", open: 106, high: 108, low: 104, close: 107, volume: 30 },
  ];
  assert.deepEqual(aggregateDailyBars(bars, "1wk"), [
    { time: "2026-09-14", open: 100, high: 106, low: 99, close: 105, volume: 30 },
    { time: "2026-09-28", open: 106, high: 108, low: 104, close: 107, volume: 30 },
  ]);
  assert.deepEqual(aggregateDailyBars(bars, "1mo"), [
    { time: "2026-09-01", open: 100, high: 106, low: 99, close: 105, volume: 30 },
    { time: "2026-10-01", open: 106, high: 108, low: 104, close: 107, volume: 30 },
  ]);
});
