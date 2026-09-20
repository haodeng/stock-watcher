import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { crossed, parseCode, sameSecret, yahooSymbol } from "../src/shared";
import { aggregateDailyBars, syncRanges } from "../src/worker";

test("Danish codes map to Yahoo symbols", () => {
  assert.equal(parseCode("nda_dk"), "NDA_DK");
  assert.equal(yahooSymbol("nda_dk"), "NDA-DK.CO");
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
});

test("manual sync requests full history", () => {
  assert.deepEqual(syncRanges(), { daily: "10y", hourly: "2y" });
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
