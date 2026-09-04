import fs from "node:fs/promises";
import path from "node:path";
import { evaluateSmartMoney, sma } from "../lib/smart-money.mjs";
import { groupSummary, looksLikeCorporateAction, simulateLongTrade, summarizeTrades } from "../lib/smart-money-backtest.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CACHE = path.join(ROOT, ".cache", "smart-money-bhavcopy");
const START = process.env.BACKTEST_START || "2022-01-01";
const DOWNLOAD_START = process.env.BACKTEST_DOWNLOAD_START || "2021-09-01";
const END = process.env.BACKTEST_END || new Date().toISOString().slice(0, 10);
const PRIMARY = { waitSessions: 3, maxHoldSessions: 5, targetR: 1.5, frictionPct: 0.003 };
const headers = { "User-Agent": "Mozilla/5.0 (compatible; TusharSmartMoneyOSBacktest/1.0)", Accept: "text/csv,*/*" };

function csvLine(line) {
  const values = []; let value = "", quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += char;
  }
  values.push(value.trim()); return values;
}

function parseBhavcopy(text) {
  const lines = text.trim().split(/\r?\n/); if (lines.length < 2) return [];
  const header = csvLine(lines[0]).map(value => value.trim());
  const at = Object.fromEntries(header.map((name, position) => [name, position]));
  return lines.slice(1).map(csvLine).filter(row => row[at.SERIES] === "EQ").map(row => {
    const close = Number(row[at.CLOSE_PRICE]); const deliveryQty = Number(row[at.DELIV_QTY]) || 0;
    return {
      symbol: row[at.SYMBOL], date: new Date(`${row[at.DATE1]} UTC`).toISOString().slice(0, 10),
      open: Number(row[at.OPEN_PRICE]), high: Number(row[at.HIGH_PRICE]), low: Number(row[at.LOW_PRICE]), close,
      volume: Number(row[at.TTL_TRD_QNTY]), deliveryQty, deliveryPct: Number(row[at.DELIV_PER]) || 0,
      deliverableValue: close * deliveryQty, turnoverCr: (Number(row[at.TURNOVER_LACS]) || 0) / 100
    };
  }).filter(row => row.symbol && [row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite));
}

function datesBetween(start, end) {
  const dates = []; const cursor = new Date(`${start}T00:00:00Z`); const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) { if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) dates.push(new Date(cursor)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return dates;
}

function archive(date) {
  const dd = String(date.getUTCDate()).padStart(2, "0"); const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dd}${mm}${date.getUTCFullYear()}.csv`;
}

async function loadDate(date) {
  const key = date.toISOString().slice(0, 10); const file = path.join(CACHE, `${key}.csv`);
  try { return parseBhavcopy(await fs.readFile(file, "utf8")); } catch {}
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(archive(date), { headers, signal: AbortSignal.timeout(45000) });
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`${response.status}`);
      const text = await response.text(); const rows = parseBhavcopy(text);
      if (rows.length < 500) throw new Error(`unsafe row count ${rows.length}`);
      await fs.writeFile(file, text); return rows;
    } catch (error) {
      if (attempt === 3) { console.warn(`download failed ${key}: ${error.message}`); return []; }
      await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length); let cursor = 0;
  async function run() { while (cursor < items.length) { const index = cursor++; results[index] = await worker(items[index]); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run)); return results;
}

function metricTable(groups) {
  return Object.entries(groups).map(([name, m]) => `| ${name} | ${m.trades} | ${m.winRatePct}% | ${m.targetHitRatePct}% | ${m.expectancyR}R | ${m.profitFactor ?? "—"} | ${m.averageHoldSessions} |`).join("\n");
}

function reportMarkdown(result) {
  const m = result.primary.metrics;
  return `# Smart Money Footprint OS — Full Historical Backtest\n\n` +
    `Generated: ${result.meta.generatedAt}\n\n` +
    `## Verdict\n\n` +
    `The point-in-time replay produced **${m.trades} non-overlapping trades**, a **${m.winRatePct}% net-profitable win rate**, **${m.targetHitRatePct}% target-hit rate**, **${m.expectancyR}R expectancy**, and **${m.profitFactor ?? "—"} profit factor** after 0.30% round-trip friction. ` +
    `This is historical evidence, not a guarantee of future profitability.\n\n` +
    `## Primary rules\n\n` +
    `- NSE EQ security-wise price, volume and deliverable-quantity archives\n` +
    `- Signal calculated after the daily close using only data available on that date\n` +
    `- Buy-stop at the OS entry level, valid for the next 3 sessions\n` +
    `- 1.5R target, OS stop, maximum 5-session hold\n` +
    `- If stop and target occur in the same daily candle, stop is counted first\n` +
    `- 0.30% round-trip friction; only one open/pending trade per stock\n` +
    `- Corporate-action-like discontinuities excluded; delisted symbols retained when present in historical files\n\n` +
    `## Coverage\n\n` +
    `| Item | Result |\n|---|---:|\n| Signal window | ${result.meta.signalStart} to ${result.meta.marketEnd} |\n| Trading sessions | ${result.meta.sessions} |\n| Historical EQ symbols | ${result.meta.symbols} |\n| Raw actionable signals | ${result.meta.rawSignals} |\n| Filled trades | ${m.trades} |\n| Unfilled orders | ${result.primary.unfilled} |\n| Excluded corporate-action windows | ${result.meta.corporateActionWindowsExcluded} |\n\n` +
    `## Primary result by year\n\n| Year | Trades | Win rate | Target hit | Expectancy | Profit factor | Avg hold |\n|---|---:|---:|---:|---:|---:|---:|\n${metricTable(result.primary.byYear)}\n\n` +
    `## By market regime\n\n| Regime | Trades | Win rate | Target hit | Expectancy | Profit factor | Avg hold |\n|---|---:|---:|---:|---:|---:|---:|\n${metricTable(result.primary.byRegime)}\n\n` +
    `## By confidence\n\n| Confidence | Trades | Win rate | Target hit | Expectancy | Profit factor | Avg hold |\n|---|---:|---:|---:|---:|---:|---:|\n${metricTable(result.primary.byConfidence)}\n\n` +
    `## Sensitivity\n\n| Variant | Trades | Win rate | Target hit | Expectancy | Profit factor | Avg hold |\n|---|---:|---:|---:|---:|---:|---:|\n${metricTable(result.sensitivity)}\n\n` +
    `## Important limitations\n\n` +
    `Daily candles do not reveal intraday path, so same-candle ambiguity is resolved conservatively. Delivery/volume footprints cannot identify a specific institution or link its cash position to its hedge. Corporate actions are detected heuristically rather than from a fully adjusted point-in-time corporate-action master. Trade-sequence drawdown is not a capital-weighted portfolio drawdown because many different stocks can overlap. Results can degrade through future regime change, gaps, liquidity, and execution costs.\n`;
}

async function main() {
  await fs.mkdir(CACHE, { recursive: true }); await fs.mkdir(path.join(ROOT, "reports"), { recursive: true });
  const dates = datesBetween(DOWNLOAD_START, END);
  console.log(`Downloading/loading ${dates.length} weekday archives...`);
  const files = await mapLimit(dates, 12, loadDate);
  const sessions = files.filter(rows => rows.length >= 500).sort((a, b) => a[0].date.localeCompare(b[0].date));
  if (sessions.length < 700) throw new Error(`Insufficient history: ${sessions.length} sessions`);

  const histories = new Map(); const signals = []; let corporateActionWindowsExcluded = 0;
  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
    const rows = sessions[sessionIndex]; const date = rows[0].date;
    for (const row of rows) { if (!histories.has(row.symbol)) histories.set(row.symbol, []); histories.get(row.symbol).push(row); }
    if (date < START) continue;
    const eligible = [...histories.entries()].filter(([, bars]) => bars.length >= 64 && bars.at(-1).date === date);
    const returns20 = eligible.map(([, bars]) => bars.at(-1).close / bars.at(-21).close - 1).sort((a, b) => a - b);
    const marketReturn20 = returns20[Math.floor(returns20.length / 2)] || 0;
    const breadth20 = eligible.filter(([, bars]) => bars.at(-1).close > sma(bars.map(b => b.close), 20)).length / Math.max(1, eligible.length);
    const breadth50 = eligible.filter(([, bars]) => bars.at(-1).close > sma(bars.map(b => b.close), 50)).length / Math.max(1, eligible.length);
    const marketRegime = breadth20 >= .58 && breadth50 >= .52 ? "Bullish" : breadth20 <= .42 && breadth50 <= .45 ? "Bearish" : "Sideways";
    for (const [symbol, bars] of eligible) {
      const recent = bars.slice(-64); let actionLike = false;
      for (let i = 1; i < recent.length; i++) if (looksLikeCorporateAction(recent[i - 1], recent[i])) { actionLike = true; break; }
      if (actionLike) { corporateActionWindowsExcluded++; continue; }
      const evaluation = evaluateSmartMoney(symbol, symbol, bars, { marketReturn20, marketRegime });
      if (evaluation?.actionable) signals.push({ ...evaluation, signalDate: date, barIndex: bars.length - 1, marketRegime });
    }
    if (sessionIndex % 100 === 0) console.log(`Replay ${date}: ${signals.length} signals`);
  }

  function runVariant(options) {
    const bySymbol = new Map();
    for (const signal of signals) { if (!bySymbol.has(signal.symbol)) bySymbol.set(signal.symbol, []); bySymbol.get(signal.symbol).push(signal); }
    const outcomes = [];
    for (const [symbol, symbolSignals] of bySymbol) {
      const bars = histories.get(symbol); let unavailableUntil = -1;
      for (const signal of symbolSignals.sort((a, b) => a.barIndex - b.barIndex)) {
        if (signal.barIndex <= unavailableUntil) continue;
        const outcome = simulateLongTrade(bars, signal.barIndex, signal, options);
        unavailableUntil = outcome.unavailableUntil ?? signal.barIndex;
        outcomes.push({ ...signal, ...outcome, year: outcome.exitDate?.slice(0, 4) || signal.signalDate.slice(0, 4) });
      }
    }
    return outcomes;
  }

  const primaryTrades = runVariant(PRIMARY);
  const variants = {
    "5d / 1.5R / 0.20%": { ...PRIMARY, frictionPct: .002 },
    "5d / 1.5R / 0.30% (Primary)": PRIMARY,
    "5d / 1.5R / 0.50%": { ...PRIMARY, frictionPct: .005 },
    "10d / 1.5R / 0.30%": { ...PRIMARY, maxHoldSessions: 10 },
    "10d / 2.5R / 0.30%": { ...PRIMARY, maxHoldSessions: 10, targetR: 2.5 },
    "20d / 2.5R / 0.30%": { ...PRIMARY, maxHoldSessions: 20, targetR: 2.5 }
  };
  const sensitivity = Object.fromEntries(Object.entries(variants).map(([name, options]) => [name, summarizeTrades(runVariant(options))]));
  const result = {
    meta: { name: "Smart Money Footprint OS full historical backtest", generatedAt: new Date().toISOString(), source: "Official NSE security-wise price/volume/delivery archives", downloadStart: DOWNLOAD_START, signalStart: START, requestedEnd: END, marketEnd: sessions.at(-1)[0].date, sessions: sessions.length, symbols: histories.size, rawSignals: signals.length, corporateActionWindowsExcluded },
    methodology: { pointInTime: true, nextSessionExecution: true, sameBarPolicy: "stop-first", onePositionPerSymbol: true, survivorshipBias: "historical EQ symbols retained", ...PRIMARY },
    primary: { metrics: summarizeTrades(primaryTrades), unfilled: primaryTrades.filter(t => t.status === "unfilled").length, byYear: groupSummary(primaryTrades, "year"), byRegime: groupSummary(primaryTrades, "marketRegime"), byConfidence: groupSummary(primaryTrades, "confidence"), bySetup: groupSummary(primaryTrades, "setup") },
    sensitivity
  };
  await fs.writeFile(path.join(ROOT, "data", "smart-money-backtest.json"), JSON.stringify(result, null, 2) + "\n");
  await fs.writeFile(path.join(ROOT, "reports", "smart-money-backtest-report.md"), reportMarkdown(result));
  const tradeHeader = ["symbol","signalDate","marketRegime","confidence","setup","entryDate","exitDate","entryPrice","exitPrice","exitReason","holdSessions","netReturnPct","netR"];
  const csv = [tradeHeader.join(","), ...primaryTrades.filter(t => t.status === "entered").map(t => tradeHeader.map(k => t[k]).join(","))].join("\n") + "\n";
  await fs.writeFile(path.join(ROOT, "reports", "smart-money-backtest-trades.csv"), csv);
  console.log(JSON.stringify({ ...result.meta, primary: result.primary.metrics, unfilled: result.primary.unfilled }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
