import test from "node:test";
import assert from "node:assert/strict";
import { atrAt, buildStrategyPlans, footprintMetrics, simulateTournamentTrade, summarizeTournamentTrades } from "../lib/smart-money-strategy-tournament.mjs";

const bar = (date, open, high, low, close, volume = 1000, turnoverCr = 20, deliverableValue = 100000) => ({ date, open, high, low, close, volume, turnoverCr, deliverableValue });

test("ATR uses only bars available at the requested endpoint", () => {
  const bars = Array.from({ length: 20 }, (_, index) => bar(`2026-01-${String(index + 1).padStart(2, "0")}`, 100, 102, 99, 101));
  assert.equal(atrAt(bars, 14, 15), 3);
});

test("footprint selector stays separate from a named chart setup", () => {
  const bars = Array.from({ length: 64 }, (_, index) => {
    const close = 100 + index * .1;
    const surge = index === 62 || index === 63;
    return bar(`2026-03-${String(index + 1).padStart(2, "0")}`, close - .5, close + .5, close - 1, close, surge ? 2200 : 1000, 20, surge ? 240000 : 100000);
  });
  const result = footprintMetrics(bars);
  assert.equal(result.selected, true);
  assert.ok(!Object.hasOwn(result, "strategy"));
});

test("fixed target uses next-session entry and stop-first same-bar handling", () => {
  const bars = [bar("2026-01-01", 100, 101, 99, 100), bar("2026-01-02", 100, 104, 97, 102)];
  const trade = simulateTournamentTrade(bars, 0, { entry: 100, stopLoss: 98, orderType: "stop", waitSessions: 1, atrValue: 2 }, { name: "1.5R", type: "fixed", targetR: 1.5 }, { frictionPct: 0 });
  assert.equal(trade.entryDate, "2026-01-02");
  assert.equal(trade.exitReason, "Stop (Same Bar)");
  assert.equal(trade.grossR, -1);
});

test("ATR trail activates after 1.5R and only tightens on a later session", () => {
  const bars = [
    bar("2026-01-01", 100, 101, 99, 100),
    bar("2026-01-02", 100, 103.2, 99.5, 103),
    bar("2026-01-03", 103, 104, 99.5, 100)
  ];
  const trade = simulateTournamentTrade(bars, 0, { entry: 100, stopLoss: 98, orderType: "stop", waitSessions: 1, atrValue: 2 }, { name: "trail", type: "trail", trailAtr: 1.5 }, { frictionPct: 0 });
  assert.equal(trade.targetHit, true);
  assert.equal(trade.exitReason, "ATR Trail");
  assert.equal(trade.grossR, 0);
});

test("strategy builder emits only named tournament families", () => {
  const bars = Array.from({ length: 70 }, (_, index) => {
    const close = 100 + index * .4;
    return bar(`2026-04-${String(index + 1).padStart(2, "0")}`, close - .4, close + .6, close - .8, close, index === 69 ? 2000 : 1000);
  });
  const names = new Set(buildStrategyPlans(bars, { rsRankPct: 90 }).map(plan => plan.strategy));
  for (const name of names) assert.ok(["VCP / Contraction breakout", "Relative-strength leader breakout", "Breakout + volume confirmation", "Momentum pullback", "Gap-up continuation", "Trend-following ATR trail"].includes(name));
});

test("summary includes charges in net expectancy", () => {
  const metrics = summarizeTournamentTrades([
    { status: "entered", symbol: "A", exitDate: "2026-01-02", netR: 1.4, netReturnPct: 2, holdSessions: 2, targetHit: true },
    { status: "entered", symbol: "B", exitDate: "2026-01-03", netR: -1.1, netReturnPct: -2, holdSessions: 2, targetHit: false }
  ]);
  assert.equal(metrics.winRatePct, 50);
  assert.equal(metrics.expectancyR, .15);
});
