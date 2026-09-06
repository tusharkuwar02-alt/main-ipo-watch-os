import test from "node:test";
import assert from "node:assert/strict";
import { rsiAt, SWING_CONFIGS, SWING_MANAGEMENT } from "../lib/smart-money-triple-confirm-swing.mjs";

test("RSI2 identifies a sharp two-session pullback", () => {
  const rsi = rsiAt([100, 102, 104, 106, 108, 110, 104, 96], 2);
  assert.ok(rsi < 10);
});

test("RSI remains bounded and handles a flat series", () => {
  assert.equal(rsiAt([100, 100, 100], 2), 50);
  assert.ok(rsiAt([100, 101, 102], 2) <= 100);
});

test("all variants use exactly the same three core indicator families", () => {
  assert.equal(SWING_CONFIGS.length, 4);
  for (const config of SWING_CONFIGS) {
    assert.ok(config.rsiMax > 0);
    assert.ok(config.momentumPercentile >= 80);
    assert.ok(config.atrMinPct >= 2);
  }
});

test("all management variants keep first target at 1.5R or higher", () => {
  assert.equal(SWING_MANAGEMENT.length, 4);
  assert.ok(SWING_MANAGEMENT.every(rule => rule.t1R >= 1.5 && rule.t2R > rule.t1R));
});
