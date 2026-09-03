import test from "node:test";
import assert from "node:assert/strict";
import { parseNseTradingHolidays, previousTradingDate } from "../lib/market-calendar.mjs";

test("NSE CM holidays are normalized and used for expected trading date", () => {
  const holidays = parseNseTradingHolidays({ CM: [{ tradingDate: "04-Sep-2026" }] });
  assert.deepEqual(holidays, ["2026-09-04"]);
  assert.equal(previousTradingDate("2026-09-04", holidays), "2026-09-03");
});
