import test from "node:test";
import assert from "node:assert/strict";
import { parseNseListingCsv, parseIpoWatchListingPage, buildRollingUniverse } from "../lib/universe.mjs";

test("IPOWatch parser uses actual Listing Date, not Open Date", () => {
  const html = `<h2>Mainboard IPO Listing 2026</h2><table><tr><th>IPO</th><th>Open Date</th><th>Listing Date</th><th>NSE Symbol</th></tr><tr><td>Alpha Limited</td><td>August 1, 2026</td><td>August 10, 2026</td><td>ALPHA</td></tr></table>`;
  const rows = parseIpoWatchListingPage(html);
  assert.equal(rows[0].listingDate, "2026-08-10");
  assert.notEqual(rows[0].listingDate, "2026-08-01");
});

test("SME section is excluded and rolling five-year window is enforced", () => {
  const csv = `SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING,PAID UP VALUE,MARKET LOT,ISIN NUMBER,FACE VALUE\nALPHA,Alpha Limited,EQ,10-AUG-2026,10,1,INE000A01001,10\nSMALL,Small Limited,SM,10-AUG-2026,10,1,INE000A01002,10\nOLD,Old Limited,EQ,01-JAN-2020,10,1,INE000A01003,10`;
  const performance = [{ company: "Alpha", issuePrice: 100, year: 2026 }, { company: "Small", issuePrice: 50, year: 2026 }, { company: "Old", issuePrice: 10, year: 2020 }];
  const result = buildRollingUniverse(parseNseListingCsv(csv), performance, [], new Date("2026-09-02T00:00:00Z"));
  assert.deepEqual(result.universe.map(x => x.symbol), ["ALPHA"]);
});

test("listing-date disagreement fails validation", () => {
  const csv = `SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING,PAID UP VALUE,MARKET LOT,ISIN NUMBER,FACE VALUE\nALPHA,Alpha Limited,EQ,10-AUG-2026,10,1,INE000A01001,10`;
  const result = buildRollingUniverse(parseNseListingCsv(csv), [{ company: "Alpha", issuePrice: 100, year: 2026 }], [{ company: "Alpha", symbol: "ALPHA", listingDate: "2026-08-11" }], new Date("2026-09-02T00:00:00Z"));
  assert.equal(result.universe.length, 0);
  assert.match(result.failures[0].reason, /mismatch/i);
});

test("mainboard BE surveillance series is retained while SME SM series is excluded", () => {
  const csv = `SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING,PAID UP VALUE,MARKET LOT,ISIN NUMBER,FACE VALUE\nWATCH,Watch Limited,BE,10-AUG-2026,10,1,INE000A01001,10\nSMALL,Small Limited,SM,10-AUG-2026,10,1,INE000A01002,10`;
  const result = buildRollingUniverse(parseNseListingCsv(csv), [{ company: "Watch", issuePrice: 100 }], [], new Date("2026-09-02T00:00:00Z"));
  assert.deepEqual(result.universe.map(x => x.symbol), ["WATCH"]);
});
