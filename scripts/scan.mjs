import fs from "node:fs/promises";
import { parseNseListingCsv, parseIpoWatchPerformance, parseIpoWatchListingPage, buildRollingUniverse } from "../lib/universe.mjs";
import { evaluateStock, marketDateInIndia, scoreConfluence } from "../lib/framework.mjs";
import { parseNseTradingHolidays, previousTradingDate } from "../lib/market-calendar.mjs";
import { aggregateBacktests, assessScanQuality, backtestStock } from "../lib/scan-quality.mjs";

const URLS = {
  nseMaster: "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
  ipoPerformance: "https://ipowatch.in/ipo-performance-tracker/",
  ipoListings: "https://ipowatch.in/new-ipo-listing-today-ipo-listing-date/",
  ipo2021: "https://ipowatch.in/mainboard-ipos-2021/",
  nseHolidays: "https://www.nseindia.com/api/holiday-master?type=trading"
};
const headers = { "User-Agent": "Mozilla/5.0 (compatible; MainIPOWatchOS/1.0)", Accept: "text/html,application/json,text/csv,*/*" };

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function history(symbol, range = "5y") {
  let lastError;
  for (const host of ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=history`;
      const payload = JSON.parse(await fetchText(url, 2));
      const result = payload?.chart?.result?.[0];
      if (!result) throw new Error(payload?.chart?.error?.description || "No chart result");
      const q = result.indicators.quote[0];
      const bars = result.timestamp.map((time, index) => ({
        date: new Date(time * 1000).toISOString().slice(0, 10), open: q.open[index], high: q.high[index],
        low: q.low[index], close: q.close[index], volume: q.volume[index]
      })).filter(b => [b.open, b.high, b.low, b.close, b.volume].every(Number.isFinite));
      if (!bars.length) throw new Error("Empty price history");
      return { bars, provider: host.startsWith("query2") ? "Yahoo query2" : "Yahoo query1 fallback" };
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
      await new Promise(resolve => setTimeout(resolve, 90));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  const started = Date.now();
  const now = new Date();
  const previousPath = new URL("../data/latest-scan.json", import.meta.url);
  const previous = JSON.parse(await fs.readFile(previousPath, "utf8"));
  const [nseCsv, performanceHtml, listingHtml, archive2021Html, niftyHistory, holidayResult] = await Promise.all([
    fetchText(URLS.nseMaster), fetchText(URLS.ipoPerformance), fetchText(URLS.ipoListings), fetchText(URLS.ipo2021), history("^NSEI")
    , fetchText(URLS.nseHolidays, 2).then(text => ({ holidays: parseNseTradingHolidays(JSON.parse(text)), status: "ok" })).catch(() => ({ holidays: [], status: "fallback-weekdays" }))
  ]);
  const niftyBars = niftyHistory.bars;
  const holidays = holidayResult.holidays;
  const marketDate = niftyBars.at(-1)?.date || "";
  const indiaDate = marketDateInIndia(now);
  const expectedMarketDate = previousTradingDate(indiaDate, holidays);
  const currentListings = parseIpoWatchListingPage(listingHtml);
  const archive2021 = parseIpoWatchListingPage(archive2021Html);
  const performanceRows = [...parseIpoWatchPerformance(performanceHtml), ...archive2021.map(row => ({ ...row, issuePrice: row.issuePrice || 0 }))];
  const built = buildRollingUniverse(parseNseListingCsv(nseCsv), performanceRows, currentListings, now);
  const historyFailures = [];
  let fallbackHistories = niftyHistory.provider.includes("fallback") ? 1 : 0;
  const rows = await mapLimit(built.universe, 8, async stock => {
    try {
      const stockHistory = await history(`${stock.symbol}.NS`);
      if (stockHistory.provider.includes("fallback")) fallbackHistories++;
      const bars = stockHistory.bars;
      const context = { marketDate, holidays };
      const evaluated = evaluateStock(stock, bars, niftyBars, now, context);
      const confluence = scoreConfluence(evaluated.matches);
      const result = evaluated.matches.length ? {
        symbol: stock.symbol, company: stock.company, listingDate: stock.listingDate, issuePrice: stock.issuePrice,
        matchConfidence: stock.matchConfidence,
        price: evaluated.diagnostics.close, changePct: evaluated.diagnostics.changePct,
        volumeRatio: evaluated.diagnostics.volumeRatio, dailySma21: evaluated.diagnostics.dailySma21, dailySma30: evaluated.diagnostics.dailySma30,
        marketDate: bars.at(-1)?.date, matchCount: evaluated.matches.length,
        priority: confluence.confluenceScore, ...confluence,
        matches: evaluated.matches
      } : null;
      return { stock: result, backtest: backtestStock(stock, bars, niftyBars, context) };
    } catch (error) {
      historyFailures.push({ symbol: stock.symbol, reason: error.message });
      return { stock: null, backtest: null };
    }
  });
  const stocks = rows.map(row => row.stock).filter(Boolean).sort((a, b) => b.priority - a.priority || b.matchCount - a.matchCount);
  const systems = aggregateBacktests(rows.map(row => row.backtest).filter(Boolean));
  const scan = {
    meta: {
      name: "Main IPO Watch OS", frameworkVersion: "locked-20-v2", asOf: now.toISOString(), lastSuccessfulScanAt: now.toISOString(),
      exchange: "NSE", segment: "Mainboard", rollingWindowStart: built.cutoff,
      marketDate, expectedMarketDate, dataFreshness: marketDate >= expectedMarketDate ? "fresh" : "stale",
      universeCount: built.universe.length, qualifyingCount: stocks.length,
      historyFailures: historyFailures.length, validationFailures: built.failures.length,
      durationMs: Date.now() - started,
      sourceStatus: { nseMaster: "ok", nseHolidayCalendar: holidayResult.status, ipoWatchPerformance: "ok", ipoWatchListingDate: "ok", yahooHistory: historyFailures.length ? "partial" : fallbackHistories ? `ok (${fallbackHistories} fallback)` : "ok" },
      backtest: { status: "ready", lookbackSessions: 126, forwardHorizons: [5, 10, 20], note: "Indicative historical forward returns; not a guarantee" },
      rules: { oneMatchIncludes: true, noTopNCap: true, smeExcluded: true, smaTolerancePct: 2, ipoBaseMaxDepthPct: 12, independentFamilyScoring: true, safeSnapshotGuard: true, removedSystems: ["Monthly 51-Period High Breakout", "50-Day SMA Proximity"] }
    },
    systems,
    stocks,
    failures: { history: historyFailures, validation: built.failures }
  };
  const quality = assessScanQuality(scan, previous);
  scan.meta.scanQuality = quality.healthy ? "healthy" : "blocked";
  scan.meta.warnings = quality.warnings;
  if (!quality.healthy) throw new Error(`Unsafe scan blocked; previous snapshot preserved: ${quality.warnings.join("; ")}`);
  const temporaryPath = new URL("../data/latest-scan.next.json", import.meta.url);
  await fs.writeFile(temporaryPath, JSON.stringify(scan, null, 2) + "\n");
  await fs.rename(temporaryPath, previousPath);
  console.log(JSON.stringify({ universe: built.universe.length, qualifying: stocks.length, marketDate, scanQuality: scan.meta.scanQuality, historyFailures: historyFailures.length, validationFailures: built.failures.length, durationMs: Date.now() - started }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
