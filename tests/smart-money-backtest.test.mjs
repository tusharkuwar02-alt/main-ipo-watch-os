import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeCorporateAction, simulateLongTrade, simulateTwoTargetTrade, summarizeTrades } from "../lib/smart-money-backtest.mjs";

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

test("limit entry fills on a pullback without look-ahead", () => {
  const bars = [bar("2026-01-01", 104, 105, 102, 104), bar("2026-01-02", 104, 105, 100, 103), bar("2026-01-03", 103, 106, 102, 105)];
  const trade = simulateLongTrade(bars, 0, { entry: 101, stopLoss: 98 }, { orderType: "limit", targetR: 1.5, frictionPct: 0 });
  assert.equal(trade.entryDate, "2026-01-02"); assert.equal(trade.entryPrice, 101);
});

test("corporate action heuristic detects factor gaps", () => {
  assert.equal(looksLikeCorporateAction(bar("a", 100, 102, 98, 100), bar("b", 50, 52, 49, 51)), true);
  assert.equal(looksLikeCorporateAction(bar("a", 100, 102, 98, 100), bar("b", 92, 98, 90, 95)), false);
});

test("summary reports net profitable win rate and expectancy", () => {
  const result = summarizeTrades([{ status: "entered", netR: 1, netReturnPct: 2, holdSessions: 2, targetHit: true, exitReason: "Target", exitDate: "2026-01-02", symbol: "A" }, { status: "entered", netR: -1, netReturnPct: -2, holdSessions: 3, targetHit: false, exitReason: "Stop", exitDate: "2026-01-03", symbol: "B" }]);
  assert.equal(result.winRatePct, 50); assert.equal(result.expectancyR, 0); assert.equal(result.profitFactor, 1);
});

test("two-target simulator blends a 50% T1 and 50% T2 exit", () => {
  const bars = [bar("2026-01-01", 100, 101, 99, 100), bar("2026-01-02", 100, 104.2, 99.5, 104)];
  const trade = simulateTwoTargetTrade(bars, 0, { entry: 100, stopLoss: 98 }, { t1R: 1.5, t2R: 2, t1ExitPct: 0.5, frictionPct: 0 });
  assert.equal(trade.t1Hit, true); assert.equal(trade.t2Hit, true); assert.equal(trade.grossR, 1.75);
});

test("breakeven stop activates only after the T1 session", () => {
  const bars = [bar("2026-01-01", 100, 101, 99, 100), bar("2026-01-02", 100, 103.2, 99.5, 102.5), bar("2026-01-03", 101, 101.5, 99.8, 100)];
  const trade = simulateTwoTargetTrade(bars, 0, { entry: 100, stopLoss: 98 }, { t1R: 1.5, t2R: 2, t1ExitPct: 0.5, afterT1Stop: "breakeven", frictionPct: 0 });
  assert.equal(trade.exitReason, "Runner Stop"); assert.equal(trade.grossR, 0.75);
});

test("initial stop wins when stop and T1 share a daily candle", () => {
  const bars = [bar("2026-01-01", 100, 101, 99, 100), bar("2026-01-02", 100, 103.2, 97.5, 101)];
  const trade = simulateTwoTargetTrade(bars, 0, { entry: 100, stopLoss: 98 }, { t1R: 1.5, t2R: 2, t1ExitPct: 0.5, frictionPct: 0 });
  assert.equal(trade.exitReason, "Initial Stop (Same Bar)"); assert.equal(trade.grossR, -1);
});
