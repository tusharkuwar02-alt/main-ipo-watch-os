import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEMS, evaluateStock } from "../lib/framework.mjs";

const makeBars = (count = 90, slope = 0.2) => Array.from({ length: count }, (_, i) => {
  const close = 100 + i * slope;
  const date = new Date(Date.UTC(2026, 0, 1 + i));
  return { date: date.toISOString().slice(0, 10), open: close - .2, high: close + .5, low: close - .5, close, volume: 100000 };
});

test("framework has exactly 20 systems and excludes removed proposals", () => {
  assert.equal(SYSTEMS.length, 20);
  assert.equal(SYSTEMS.some(s => /Monthly 51|50-Day SMA/i.test(s.name)), false);
});

test("SMA proximity accepts ±2% regardless of SMA direction and reports direction", () => {
  const bars = makeBars(90, -0.1);
  const sma21 = bars.slice(-21).reduce((a, b) => a + b.close, 0) / 21;
  bars.at(-1).close = sma21 * 0.981;
  const result = evaluateStock({ issuePrice: 0 }, bars, makeBars(90, 0.05), new Date("2026-04-01T00:00:00Z"));
  const match = result.matches.find(m => m.id === "daily-sma21");
  assert.ok(match);
  assert.equal(match.smaDirection, "Falling");
});

test("IPO Base accepts depth at or below 12% and rejects deeper bases", () => {
  const bars = makeBars(90, 0);
  bars.slice(-41, -1).forEach((b, i) => { b.high = 100; b.low = i === 0 ? 88 : 94; b.close = 97; });
  bars.at(-1).close = 99; bars.at(-1).high = 100; bars.at(-1).low = 98;
  const valid = evaluateStock({ issuePrice: 0 }, bars, makeBars(90, 0), new Date("2026-04-01T00:00:00Z"));
  assert.ok(valid.matches.some(m => m.id === "ipo-base"));
  bars.at(-20).low = 87.9;
  const invalid = evaluateStock({ issuePrice: 0 }, bars, makeBars(90, 0), new Date("2026-04-01T00:00:00Z"));
  assert.equal(invalid.matches.some(m => m.id === "ipo-base"), false);
});

test("one match remains a qualifying result", () => {
  const bars = makeBars(90, 0);
  bars.at(-1).close = 100; bars.at(-1).volume = 50000;
  const result = evaluateStock({ issuePrice: 100 }, bars, makeBars(90, 0), new Date("2026-04-01T00:00:00Z"));
  assert.ok(result.matches.length >= 1);
});
