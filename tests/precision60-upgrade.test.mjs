import test from "node:test";
import assert from "node:assert/strict";
import { PRECISION60_CONFIGS, PRECISION60_MANAGEMENT } from "../lib/precision60-upgrade.mjs";

test("precision upgrade search is bounded and frozen",()=>{
  assert.equal(PRECISION60_CONFIGS.length,10);
  assert.equal(new Set(PRECISION60_CONFIGS.map(x=>x.name)).size,10);
  assert.equal(PRECISION60_MANAGEMENT.length,1);
});
test("precision upgrade never lowers the 2R first target",()=>{
  const x=PRECISION60_MANAGEMENT[0];
  assert.equal(x.t1R,2);assert.equal(x.t2R,3);assert.equal(x.t1ExitPct,.5);
});
