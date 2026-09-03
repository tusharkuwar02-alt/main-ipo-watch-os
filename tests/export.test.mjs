import test from "node:test";
import assert from "node:assert/strict";
import { buildExcelWorkbook, buildTradingViewWatchlist, selectExportStocks } from "../lib/export.mjs";

const scan = {
  meta: { marketDate: "2026-09-03", asOf: "2026-09-03T13:30:00Z" },
  systems: [{ id: "daily-sma21", name: "Daily SMA 21 Proximity" }, { id: "ath", name: "ATH" }],
  stocks: [
    { symbol: "ALPHA", company: "Alpha & Co", price: 101.5, changePct: 1.2, listingDate: "2026-01-01", issuePrice: 90, confluenceScore: 40, priority: 40, signalFamilies: ["SMA Proximity"], matchCount: 1, marketDate: "2026-09-03", matches: [{ id: "daily-sma21", name: "Daily SMA 21 Proximity", family: "SMA Proximity", reason: "Price < SMA & within 2%" }] },
    { symbol: "BETA", company: "Beta Limited", price: 80, changePct: -1, listingDate: "2026-02-01", issuePrice: 100, confluenceScore: 20, priority: 20, signalFamilies: ["Breakout"], matchCount: 1, marketDate: "2026-09-03", matches: [{ id: "ath", name: "ATH", family: "Breakout", reason: "Near ATH" }] }
  ]
};

test("system exports include only stocks matching the selected system", () => {
  assert.deepEqual(selectExportStocks(scan, "daily-sma21").map(stock => stock.symbol), ["ALPHA"]);
  assert.throws(() => selectExportStocks(scan, "unknown"), /Unknown system/);
});

test("TradingView export uses NSE-prefixed comma-separated TXT format", () => {
  assert.equal(buildTradingViewWatchlist(scan, "all"), "NSE:ALPHA,NSE:BETA\n");
});

test("Excel export is a valid ZIP-based XLSX containing escaped stock data", () => {
  const workbook = buildExcelWorkbook(scan, "daily-sma21");
  assert.deepEqual([...workbook.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder().decode(workbook);
  assert.match(text, /Alpha &amp; Co/);
  assert.match(text, /Price &lt; SMA &amp; within 2%/);
});
