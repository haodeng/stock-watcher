import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chartTime, crossed, nasdaqCode, parseCode, sameSecret, stockNote, watchlistName, yahooSymbol } from "../src/shared";
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
  assert.match(await readFile("src/style.css", "utf8"), /\.symbol-results \{ min-height: 0; flex: 1; overflow: auto; \}/);
  assert.match(await readFile("src/frontend.tsx", "utf8"), /displayedStocks\.map/);
  assert.match(await readFile("src/frontend.tsx", "utf8"), /bars\.length - 300/);
  assert.match(await readFile("src/frontend.tsx", "utf8"), /sectorSort/);
  assert.match(await readFile("src/frontend.tsx", "utf8"), /All sectors/);
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
