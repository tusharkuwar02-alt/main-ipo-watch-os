import test from "node:test";
import assert from "node:assert/strict";
import { RR2_FAMILIES, RR2_MANAGEMENT } from "../lib/institutional-fast-mover-rr2.mjs";

test("candidate tournament is bounded and contains distinct families", () => {
  assert.equal(RR2_FAMILIES.length, 5);
  assert.equal(new Set(RR2_FAMILIES).size, 5);
  assert.equal(RR2_MANAGEMENT.length, 5);
});

test("every exit plan keeps the first objective at or above 2R", () => {
  for (const plan of RR2_MANAGEMENT) {
    assert.ok(plan.t1R >= 2, plan.name);
    assert.ok(plan.t2R > plan.t1R, plan.name);
    assert.ok(plan.t1ExitPct > 0 && plan.t1ExitPct <= 1, plan.name);
  }
});
