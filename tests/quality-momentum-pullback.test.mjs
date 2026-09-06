import test from "node:test";
import assert from "node:assert/strict";
import { historicalFootprint, momentumInputs, zScoreRows } from "../lib/quality-momentum-pullback.mjs";

function bars(count = 253, daily = .001) {
  let close = 100;
  return Array.from({ length: count }, (_, index) => {
    const previous = close; close *= 1 + daily + (index % 7 === 0 ? .002 : -.0002);
    return { date: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10), open: previous, high: Math.max(previous, close) * 1.01, low: Math.min(previous, close) * .99, close, volume: 100000, deliverableValue: close * 50000, turnoverCr: 20 };
  });
}

test("momentum uses distinct six and twelve month windows", () => {
  const result = momentumInputs(bars());
  assert.ok(result.return6m > 0);
  assert.ok(result.return12m > result.return6m);
  assert.ok(Number.isFinite(result.ratio6m));
  assert.ok(Number.isFinite(result.ratio12m));
});

test("cross-sectional score gives the strongest row the highest percentile", () => {
  const ranked = zScoreRows([
    { symbol: "LOW", ratio6m: 1, ratio12m: 2 },
    { symbol: "MID", ratio6m: 2, ratio12m: 3 },
    { symbol: "HIGH", ratio6m: 3, ratio12m: 4 }
  ]);
  assert.equal(ranked.get("HIGH").percentile, 100);
  assert.equal(ranked.get("LOW").percentile, 0);
});

test("historical footprint recognizes repeated high-volume accumulation", () => {
  const sample = bars(70, 0);
  for (let index = 50; index < 70; index++) {
    sample[index].close = 100 + index * .2;
    sample[index].high = sample[index].close + 1;
    sample[index].low = sample[index].close - 3;
    sample[index].volume = index >= 66 ? 190000 : 100000;
    sample[index].deliverableValue = index >= 65 ? 15_000_000 : 10_000_000;
  }
  const footprint = historicalFootprint(sample);
  assert.equal(footprint.selected, true);
  assert.ok(footprint.score >= 45);
  assert.ok(footprint.surgeDays >= 1);
});

test("constant cross-section is rejected safely", () => {
  assert.equal(zScoreRows([{ symbol: "A", ratio6m: 1, ratio12m: 1 }, { symbol: "B", ratio6m: 1, ratio12m: 1 }]).size, 0);
});
