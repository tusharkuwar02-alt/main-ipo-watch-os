import fs from "node:fs/promises";
import path from "node:path";
import { evaluateSmartMoney, sma } from "../lib/smart-money.mjs";
import { institutionalFeatures, institutionalPresentation, parseInstitutionalHoldingsXbrl } from "../lib/institutional-confirmation.mjs";

const outputPath = new URL("../data/smart-money-latest.json", import.meta.url);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const institutionalCache = path.join(root, ".cache", "institutional-confirmation", "live");
const headers = { "User-Agent": "Mozilla/5.0 (compatible; TusharSmartMoneyOS/1.0)", Accept: "text/csv,*/*" };
const nseHeaders = { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*", Referer: "https://www.nseindia.com/" };
const institutionalGaps = [];
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function csvLine(line) {
  const values = [];
  let value = "", quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

async function fetchText(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.text();
}

function archiveName(date) {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${day}${month}${date.getUTCFullYear()}.csv`;
}

function parseBhavcopy(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = csvLine(lines[0]).map(value => value.trim());
  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  return lines.slice(1).map(csvLine).filter(row => row[index.SERIES] === "EQ").map(row => {
    const close = Number(row[index.CLOSE_PRICE]);
    const deliveryQty = Number(row[index.DELIV_QTY]) || 0;
    const rawDate = row[index.DATE1];
    const date = new Date(`${rawDate} UTC`).toISOString().slice(0, 10);
    return {
      symbol: row[index.SYMBOL], date,
      open: Number(row[index.OPEN_PRICE]), high: Number(row[index.HIGH_PRICE]), low: Number(row[index.LOW_PRICE]), close,
      volume: Number(row[index.TTL_TRD_QNTY]), deliveryQty, deliveryPct: Number(row[index.DELIV_PER]) || 0,
      deliverableValue: close * deliveryQty, turnoverCr: (Number(row[index.TURNOVER_LACS]) || 0) / 100
    };
  }).filter(row => [row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite));
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const position = cursor++;
      results[position] = await worker(items[position]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function companyMap(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = csvLine(lines[0]).map(value => value.trim());
  const symbol = header.indexOf("SYMBOL");
  const name = header.indexOf("NAME OF COMPANY");
  return new Map(lines.slice(1).map(csvLine).map(row => [row[symbol], row[name] || row[symbol]]));
}

function addUtcDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nseDate(value) {
  if (!value) return null;
  const match = String(value).toUpperCase().match(/(\d{1,2})-([A-Z]{3})-(\d{4})/);
  if (!match) return null;
  const month = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 }[match[2]];
  return month == null ? null : new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString().slice(0, 10);
}

function monthRange(endDate, count) {
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`), months = [];
  for (let offset = count - 1; offset >= 0; offset--) months.push(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - offset, 1)));
  return months;
}

function apiRange(date) {
  const year = date.getUTCFullYear(), month = date.getUTCMonth(), last = new Date(Date.UTC(year, month + 1, 0));
  return {
    first: `01-${String(month + 1).padStart(2, "0")}-${year}`,
    last: `${String(last.getUTCDate()).padStart(2, "0")}-${String(month + 1).padStart(2, "0")}-${year}`
  };
}

async function cachedNseJson(kind, key, url) {
  const directory = path.join(institutionalCache, kind), file = path.join(directory, `${key}.json`);
  await fs.mkdir(directory, { recursive: true });
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch {}
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: nseHeaders, signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`${response.status}`);
      const json = await response.json();
      await fs.writeFile(file, JSON.stringify(json));
      return json;
    } catch (error) {
      if (attempt === 2) { institutionalGaps.push(`${kind}:${key}:${error.message}`); return []; }
      await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)));
    }
  }
  return [];
}

async function loadHoldingXbrl(record) {
  const directory = path.join(institutionalCache, "shareholding-xbrl");
  const key = (record.xbrl.split("/").at(-1) || record.recordId).replace(/[^a-z0-9_.-]/gi, "_");
  const file = path.join(directory, key);
  await fs.mkdir(directory, { recursive: true });
  let xml;
  try { xml = await fs.readFile(file, "utf8"); }
  catch {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(record.xbrl, { headers: { ...nseHeaders, Accept: "application/xml,text/xml,*/*" }, signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw new Error(`${response.status}`);
        xml = await response.text();
        if (xml.length < 500) throw new Error("short XBRL");
        await fs.writeFile(file, xml);
        break;
      } catch (error) {
        if (attempt === 2) { institutionalGaps.push(`xbrl:${record.symbol}:${error.message}`); return null; }
        await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
  }
  const parsed = parseInstitutionalHoldingsXbrl(xml);
  return parsed ? { ...record, ...parsed } : null;
}

async function currentHoldings(targetSymbols, marketDate) {
  const pages = await mapLimit(monthRange(marketDate, 15), 4, async date => {
    const { first, last } = apiRange(date), key = date.toISOString().slice(0, 7);
    return cachedNseJson("shareholding-meta", key, `https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&from_date=${first}&to_date=${last}`);
  });
  const metadata = pages.flatMap(page => Array.isArray(page) ? page : page?.data || []).map(row => {
    const filed = nseDate(row.broadcastDate || row.submissionDate);
    return { symbol: row.symbol, quarterEnd: nseDate(row.date), availableDate: filed ? addUtcDays(filed, 1) : null, xbrl: row.xbrl, recordId: String(row.recordId || "") };
  }).filter(row => targetSymbols.has(row.symbol) && row.quarterEnd && row.availableDate && row.availableDate <= marketDate && /^https:\/\//.test(row.xbrl || ""));

  const grouped = new Map();
  for (const row of metadata) {
    if (!grouped.has(row.symbol)) grouped.set(row.symbol, []);
    grouped.get(row.symbol).push(row);
  }
  const required = new Map();
  for (const records of grouped.values()) {
    const byQuarter = new Map();
    for (const row of records) {
      const existing = byQuarter.get(row.quarterEnd);
      if (!existing || row.availableDate > existing.availableDate) byQuarter.set(row.quarterEnd, row);
    }
    for (const row of [...byQuarter.values()].sort((a, b) => a.quarterEnd.localeCompare(b.quarterEnd)).slice(-3)) required.set(row.xbrl, row);
  }
  const parsed = (await mapLimit([...required.values()], 10, loadHoldingXbrl)).filter(Boolean), bySymbol = new Map();
  for (const row of parsed) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }
  return { bySymbol, metadataRows: metadata.length, required: required.size, parsed: parsed.length };
}

async function recentLargeDeals(targetSymbols, marketDate) {
  const requests = monthRange(marketDate, 4).flatMap(date => ["bulk_deals", "block_deals"].map(type => ({ date, type })));
  const pages = await mapLimit(requests, 2, async ({ date, type }) => {
    const { first, last } = apiRange(date), key = date.toISOString().slice(0, 7);
    return cachedNseJson(type, key, `https://www.nseindia.com/api/historicalOR/bulk-block-short-deals?optionType=${type}&from=${first}&to=${last}`);
  });
  return pages.flatMap(page => Array.isArray(page) ? page : page?.data || []).map(row => ({
    date: nseDate(row.BD_DT_DATE), symbol: row.BD_SYMBOL, client: String(row.BD_CLIENT_NAME || "").trim().toUpperCase(),
    signedQty: (String(row.BD_BUY_SELL || "").toUpperCase().startsWith("B") ? 1 : -1) * (Number(row.BD_QTY_TRD) || 0)
  })).filter(row => row.date && row.date < marketDate && targetSymbols.has(row.symbol) && row.client && row.signedQty);
}

function largeDealMetrics(deals, symbol, marketDate, bars) {
  const start = addUtcDays(marketDate, -90), clientNet = new Map();
  for (const deal of deals) {
    if (deal.symbol !== symbol || deal.date < start || deal.date >= marketDate) continue;
    clientNet.set(deal.client, (clientNet.get(deal.client) || 0) + deal.signedQty);
  }
  const clientValues = [...clientNet.values()];
  const netQuantity = clientValues.reduce((sum, value) => sum + value, 0);
  const netBuyQuantity = clientValues.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
  const averageVolume20 = average(bars.slice(-21, -1).map(bar => bar.volume));
  return averageVolume20 > 0 ? { netDirectionRatio: netQuantity / averageVolume20, netBuyRatio: netBuyQuantity / averageVolume20 } : { netDirectionRatio: 0, netBuyRatio: 0 };
}

async function enrichWithInstitutions(rows, histories, marketDate) {
  const targetSymbols = new Set(rows.filter(row => row.actionable).map(row => row.symbol));
  if (!marketDate || !targetSymbols.size) return { rows, summary: { status: "no-shortlist", targetCount: 0, coveredCount: 0, strongCount: 0, sourceGapCount: 0 } };
  const [holdings, deals] = await Promise.all([currentHoldings(targetSymbols, marketDate), recentLargeDeals(targetSymbols, marketDate)]);
  let coveredCount = 0, strongCount = 0;
  const enriched = rows.map(row => {
    if (!targetSymbols.has(row.symbol)) return { ...row, institutional: { evaluated: false, institutionalStatus: "Outside strategy shortlist", institutionalQualified: false } };
    const dealMetrics = largeDealMetrics(deals, row.symbol, marketDate, histories.get(row.symbol) || []);
    const features = institutionalFeatures(holdings.bySymbol.get(row.symbol) || [], marketDate, dealMetrics.netBuyRatio);
    const presentation = institutionalPresentation(features, marketDate);
    if (features.disclosureCovered) coveredCount++;
    if (presentation.institutionalQualified) strongCount++;
    return { ...row, institutional: { evaluated: true, ...features, ...presentation, largeDealNetDirectionRatio: +dealMetrics.netDirectionRatio.toFixed(3) } };
  });
  return {
    rows: enriched,
    summary: {
      status: coveredCount === targetSymbols.size ? "complete" : coveredCount ? "partial" : "unavailable",
      targetCount: targetSymbols.size, coveredCount, strongCount, sourceGapCount: institutionalGaps.length,
      metadataRows: holdings.metadataRows, requiredFilings: holdings.required, parsedFilings: holdings.parsed,
      method: "Point-in-time NSE shareholding XBRL plus prior client-netted bulk/block deals; aggregate FII/DII excluded"
    }
  };
}

async function main() {
  const startedAt = new Date();
  const dates = Array.from({ length: 125 }, (_, offset) => {
    const date = new Date(startedAt);
    date.setUTCDate(date.getUTCDate() - offset);
    return date;
  });
  const [namesText, files] = await Promise.all([
    fetchText("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"),
    mapLimit(dates, 12, async date => {
      try { return parseBhavcopy(await fetchText(archiveName(date))); }
      catch { return []; }
    })
  ]);
  const sessions = files.filter(rows => rows.length > 500).sort((a, b) => a[0].date.localeCompare(b[0].date));
  const names = companyMap(namesText);
  const histories = new Map();
  for (const rows of sessions) for (const row of rows) {
    if (!histories.has(row.symbol)) histories.set(row.symbol, []);
    histories.get(row.symbol).push(row);
  }
  const eligible = [...histories.entries()].filter(([symbol, bars]) => names.has(symbol) && bars.length >= 52);
  const returns20 = eligible.map(([, bars]) => bars.at(-1).close / bars.at(-21).close - 1).sort((a, b) => a - b);
  const marketReturn20 = returns20[Math.floor(returns20.length / 2)] || 0;
  const breadth20 = eligible.filter(([, bars]) => bars.at(-1).close > sma(bars.map(bar => bar.close), 20)).length / Math.max(1, eligible.length);
  const breadth50 = eligible.filter(([, bars]) => bars.at(-1).close > sma(bars.map(bar => bar.close), 50)).length / Math.max(1, eligible.length);
  const marketRegime = breadth20 >= .58 && breadth50 >= .52 ? "Bullish" : breadth20 <= .42 && breadth50 <= .45 ? "Bearish" : "Sideways";
  const marketDate = sessions.at(-1)?.[0]?.date || "";
  const baseRows = eligible.map(([symbol, bars]) => evaluateSmartMoney(symbol, names.get(symbol) || symbol, bars, { marketReturn20, marketRegime })).filter(Boolean);
  const institutional = await enrichWithInstitutions(baseRows, histories, marketDate);
  const rows = institutional.rows.sort((a, b) => Number(b.actionable) - Number(a.actionable) || Number(b.institutional?.institutionalQualified) - Number(a.institutional?.institutionalQualified) || (b.institutional?.institutionalScore || 0) - (a.institutional?.institutionalScore || 0) || b.accumulationScore - a.accumulationScore || b.directionScore - a.directionScore);
  const scan = {
    meta: {
      name: "Smart Money Footprint OS", asOf: startedAt.toISOString(), marketDate, dataFreshness: "fresh",
      exchange: "NSE", segment: "EQ", source: "Official NSE security-wise price, volume and delivery archives",
      scannedCount: eligible.length, resultCount: rows.length, actionableCount: rows.filter(row => row.actionable).length,
      sessions: sessions.length, marketRegime, breadth20: +(breadth20 * 100).toFixed(1), breadth50: +(breadth50 * 100).toFixed(1),
      institutional: institutional.summary,
      publicDataLimits: "Institution-level stock and derivative hedge positions cannot be linked from public daily data",
      userBacktestRequired: false
    },
    stocks: rows
  };
  if (sessions.length < 52 || rows.length < 500) throw new Error(`Unsafe Smart Money snapshot blocked: ${sessions.length} sessions, ${rows.length} stocks`);
  const temporary = new URL("../data/smart-money-latest.next.json", import.meta.url);
  await fs.writeFile(temporary, JSON.stringify(scan, null, 2) + "\n");
  await fs.rename(temporary, outputPath);
  console.log(JSON.stringify({ marketDate, sessions: sessions.length, scanned: eligible.length, actionable: scan.meta.actionableCount, regime: marketRegime }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
