import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeCorporateAction, simulateLongTrade, summarizeTrades } from "../lib/smart-money-backtest.mjs";

const bar = (date, open, high, low, close) => ({ date, open, high, low, close });

test("uses next-session entry and counts target", () => {
  const bars = [bar("2026-01-01", 99, 101, 98, 100), bar("2026-01-02", 100, 104, 99.5, 103)];
  const trade = simulateLongTrade(bars, 0, { entry: 100, stopLoss: 98 }, { targetR: 1.5, frictionPct: 0 });
  assert.equal(trade.entryDate, "2026-01-02"); assert.equal(trade.exitReason, "Target"); assert.equal(trade.grossR, 1.5);
});

test("same candle stop and target is stop-first", () => {
  const bars = [bar("2026-01-01", 99, 101, 98, 100), bar("2026-01-02", 100, 104, 97, 101)];
  const trade = simulateLongTrade(bars, 0, { entry: 100, stopLoss: 98 }, { targetR: 1.5, frictionPct: 0 });
  assert.equal(trade.exitReason, "Stop (Same Bar)"); assert.equal(trade.grossR, -1);
});

test("unfilled order expires", () => {
  const bars = [bar("2026-01-01", 99, 100, 98, 99), bar("2026-01-02", 99, 99.5, 98, 99), bar("2026-01-03", 99, 100, 98, 99)];
  assert.equal(simulateLongTrade(bars, 0, { entry: 101, stopLoss: 98 }, { waitSessions: 2 }).status, "unfilled");
});

test("corporate action heuristic detects factor gaps", () => {
  assert.equal(looksLikeCorporateAction(bar("a", 100, 102, 98, 100), bar("b", 50, 52, 49, 51)), true);
  assert.equal(looksLikeCorporateAction(bar("a", 100, 102, 98, 100), bar("b", 92, 98, 90, 95)), false);
});

test("summary reports net profitable win rate and expectancy", () => {
  const result = summarizeTrades([{ status: "entered", netR: 1, netReturnPct: 2, holdSessions: 2, targetHit: true, exitReason: "Target", exitDate: "2026-01-02", symbol: "A" }, { status: "entered", netR: -1, netReturnPct: -2, holdSessions: 3, targetHit: false, exitReason: "Stop", exitDate: "2026-01-03", symbol: "B" }]);
  assert.equal(result.winRatePct, 50); assert.equal(result.expectancyR, 0); assert.equal(result.profitFactor, 1);
});
