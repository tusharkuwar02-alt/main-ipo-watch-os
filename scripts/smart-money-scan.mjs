import fs from "node:fs/promises";
import { evaluateSmartMoney, sma } from "../lib/smart-money.mjs";

const outputPath = new URL("../data/smart-money-latest.json", import.meta.url);
const headers = { "User-Agent": "Mozilla/5.0 (compatible; TusharSmartMoneyOS/1.0)", Accept: "text/csv,*/*" };

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
  const rows = eligible.map(([symbol, bars]) => evaluateSmartMoney(symbol, names.get(symbol) || symbol, bars, { marketReturn20, marketRegime })).filter(Boolean);
  rows.sort((a, b) => Number(b.actionable) - Number(a.actionable) || b.accumulationScore - a.accumulationScore || b.directionScore - a.directionScore);
  const marketDate = sessions.at(-1)?.[0]?.date || "";
  const scan = {
    meta: {
      name: "Smart Money Footprint OS", asOf: startedAt.toISOString(), marketDate, dataFreshness: "fresh",
      exchange: "NSE", segment: "EQ", source: "Official NSE security-wise price, volume and delivery archives",
      scannedCount: eligible.length, resultCount: rows.length, actionableCount: rows.filter(row => row.actionable).length,
      sessions: sessions.length, marketRegime, breadth20: +(breadth20 * 100).toFixed(1), breadth50: +(breadth50 * 100).toFixed(1),
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
