import test from "node:test";
import assert from "node:assert/strict";
import { aggregateBacktests, assessScanQuality } from "../lib/scan-quality.mjs";

test("scan guard rejects destructive empty or sharply reduced scans", () => {
  const previous = { meta: { universeCount: 300 } };
  const scan = { meta: { universeCount: 40, historyFailures: 0, validationFailures: 0, marketDate: "" }, stocks: [] };
  const quality = assessScanQuality(scan, previous);
  assert.equal(quality.healthy, false);
  assert.ok(quality.warnings.length >= 3);
});

test("historical performance aggregation reports forward returns", () => {
  const rows = aggregateBacktests([{ "daily-sma21": { samples: 2, wins5d: 1, returns5d: .1, returns10d: .2, returns20d: .3 } }]);
  const result = rows.find(row => row.id === "daily-sma21");
  assert.equal(result.performance.samples, 2);
  assert.equal(result.performance.winRate5d, 50);
  assert.equal(result.performance.avgReturn10d, 10);
});
