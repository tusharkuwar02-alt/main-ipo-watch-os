import test from "node:test";
import assert from "node:assert/strict";
import { classifyDirection, evaluateSmartMoney } from "../lib/smart-money.mjs";

const bars = (count = 80, slope = 0.35) => Array.from({ length: count }, (_, index) => {
  const close = 100 + index * slope;
  return { date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10), open: close - .4, high: close + 1, low: close - 1, close, volume: 100000 + index * 800, deliverableValue: close * (50000 + index * 500) };
});

test("direction classifier separates trend and accumulation states", () => {
  assert.equal(classifyDirection(72, 70, 20, true), "Strong Bullish");
  assert.equal(classifyDirection(5, 72, 25, true), "Sideways Accumulation");
  assert.equal(classifyDirection(-72, 20, 75, false), "Strong Bearish");
});

test("smart money evaluation returns explicit trade levels and non-certain confirmation", () => {
  const rows = bars();
  rows.at(-1).volume *= 2;
  rows.at(-1).deliverableValue *= 2;
  const result = evaluateSmartMoney("TEST", "Test Limited", rows, { marketReturn20: .01, marketRegime: "Bullish" });
  assert.ok(result.directionScore > 0);
  assert.ok(result.target1 > result.entry);
  assert.ok(result.target2 > result.target1);
  assert.ok(Math.abs((result.target1 - result.entry) / 2 - (result.target2 - result.entry) / 3) < .02);
  assert.match(result.confirmation, /Probable/);
});
