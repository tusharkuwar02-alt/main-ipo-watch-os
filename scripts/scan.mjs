import fs from "node:fs/promises";
import { parseNseListingCsv, parseIpoWatchPerformance, parseIpoWatchListingPage, buildRollingUniverse } from "../lib/universe.mjs";
import { evaluateStock, SYSTEMS } from "../lib/framework.mjs";

const URLS = {
  nseMaster: "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
  ipoPerformance: "https://ipowatch.in/ipo-performance-tracker/",
  ipoListings: "https://ipowatch.in/new-ipo-listing-today-ipo-listing-date/",
  ipo2021: "https://ipowatch.in/mainboard-ipos-2021/"
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
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=history`;
  const payload = JSON.parse(await fetchText(url, 2));
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(payload?.chart?.error?.description || "No chart result");
  const q = result.indicators.quote[0];
  return result.timestamp.map((time, index) => ({
    date: new Date(time * 1000).toISOString().slice(0, 10), open: q.open[index], high: q.high[index],
    low: q.low[index], close: q.close[index], volume: q.volume[index]
  })).filter(b => [b.open, b.high, b.low, b.close, b.volume].every(Number.isFinite));
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
  const [nseCsv, performanceHtml, listingHtml, archive2021Html, niftyBars] = await Promise.all([
    fetchText(URLS.nseMaster), fetchText(URLS.ipoPerformance), fetchText(URLS.ipoListings), fetchText(URLS.ipo2021), history("^NSEI")
  ]);
  const currentListings = parseIpoWatchListingPage(listingHtml);
  const archive2021 = parseIpoWatchListingPage(archive2021Html);
  const performanceRows = [...parseIpoWatchPerformance(performanceHtml), ...archive2021.map(row => ({ ...row, issuePrice: row.issuePrice || 0 }))];
  const built = buildRollingUniverse(parseNseListingCsv(nseCsv), performanceRows, currentListings, now);
  const historyFailures = [];
  const rows = await mapLimit(built.universe, 8, async stock => {
    try {
      const bars = await history(`${stock.symbol}.NS`);
      const evaluated = evaluateStock(stock, bars, niftyBars, now);
      return evaluated.matches.length ? {
        symbol: stock.symbol, company: stock.company, listingDate: stock.listingDate, issuePrice: stock.issuePrice,
        price: evaluated.diagnostics.close, changePct: evaluated.diagnostics.changePct,
        volumeRatio: evaluated.diagnostics.volumeRatio, matchCount: evaluated.matches.length,
        priority: Math.min(100, evaluated.matches.length * 12 + Math.max(0, evaluated.diagnostics.changePct)),
        matches: evaluated.matches
      } : null;
    } catch (error) {
      historyFailures.push({ symbol: stock.symbol, reason: error.message });
      return null;
    }
  });
  const stocks = rows.filter(Boolean).sort((a, b) => b.matchCount - a.matchCount || b.priority - a.priority);
  const scan = {
    meta: {
      name: "Main IPO Watch OS", frameworkVersion: "locked-20-v1.1", asOf: now.toISOString(),
      exchange: "NSE", segment: "Mainboard", rollingWindowStart: built.cutoff,
      universeCount: built.universe.length, qualifyingCount: stocks.length,
      historyFailures: historyFailures.length, validationFailures: built.failures.length,
      durationMs: Date.now() - started, sourceStatus: { nseMaster: "ok", ipoWatchPerformance: "ok", ipoWatchListingDate: "ok", yahooHistory: historyFailures.length ? "partial" : "ok" },
      rules: { oneMatchIncludes: true, noTopNCap: true, smeExcluded: true, smaTolerancePct: 2, ipoBaseMaxDepthPct: 12, removedSystems: ["Monthly 51-Period High Breakout", "50-Day SMA Proximity"] }
    },
    systems: SYSTEMS,
    stocks,
    failures: { history: historyFailures, validation: built.failures }
  };
  await fs.writeFile(new URL("../data/latest-scan.json", import.meta.url), JSON.stringify(scan, null, 2) + "\n");
  console.log(JSON.stringify({ universe: built.universe.length, qualifying: stocks.length, historyFailures: historyFailures.length, validationFailures: built.failures.length, durationMs: Date.now() - started }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
