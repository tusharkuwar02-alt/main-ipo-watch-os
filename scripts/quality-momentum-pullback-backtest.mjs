import fs from "node:fs/promises";
import path from "node:path";
import { looksLikeCorporateAction } from "../lib/smart-money-backtest.mjs";
import { QMP_CONFIGS, buildQmpPlan, momentumInputs, zScoreRows } from "../lib/quality-momentum-pullback.mjs";
import { simulateTournamentTrade, summarizeTournamentTrades, smaAt, wilsonLower } from "../lib/smart-money-strategy-tournament.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CACHE = path.join(ROOT, ".cache", "smart-money-bhavcopy");
const START = process.env.BACKTEST_START || "2022-01-01";
const DOWNLOAD_START = process.env.BACKTEST_DOWNLOAD_START || "2020-12-01";
const END = process.env.BACKTEST_END || new Date().toISOString().slice(0, 10);
const FRICTION_PCT = .003;
const MAX_HOLD_SESSIONS = 5;
const DEVELOPMENT = new Set(["2022", "2023", "2024"]);
const VALIDATION = new Set(["2025"]);
const HOLDOUT = new Set(["2026"]);
const MINIMUM_SAMPLES = { development: 200, validation: 60 };
const EXITS = [
  { name: "1.5R fixed target", type: "fixed", targetR: 1.5 },
  { name: "2R fixed target", type: "fixed", targetR: 2 },
  { name: "2.5R fixed target", type: "fixed", targetR: 2.5 },
  { name: "1.5R activation + 1.5ATR trail", type: "trail", trailAtr: 1.5 }
];
const headers = { "User-Agent": "Mozilla/5.0 (compatible; TusharSmartMoneyQMP/1.0)", Accept: "text/csv,*/*" };
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : NaN; };

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
  const header = csvLine(lines[0]); const at = Object.fromEntries(header.map((name, position) => [name.trim(), position]));
  return lines.slice(1).map(csvLine).filter(row => row[at.SERIES] === "EQ").map(row => {
    const close = Number(row[at.CLOSE_PRICE]); const deliveryQty = Number(row[at.DELIV_QTY]) || 0;
    return { symbol: row[at.SYMBOL], date: new Date(`${row[at.DATE1]} UTC`).toISOString().slice(0, 10), open: Number(row[at.OPEN_PRICE]), high: Number(row[at.HIGH_PRICE]), low: Number(row[at.LOW_PRICE]), close, volume: Number(row[at.TTL_TRD_QNTY]), deliveryQty, deliveryPct: Number(row[at.DELIV_PER]) || 0, deliverableValue: close * deliveryQty, turnoverCr: (Number(row[at.TURNOVER_LACS]) || 0) / 100 };
  }).filter(row => row.symbol && [row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite));
}

function datesBetween(start, end) {
  const dates = []; const cursor = new Date(`${start}T00:00:00Z`); const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) { if (![0, 6].includes(cursor.getUTCDay())) dates.push(new Date(cursor)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return dates;
}

function archive(date) {
  const dd = String(date.getUTCDate()).padStart(2, "0"), mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dd}${mm}${date.getUTCFullYear()}.csv`;
}

async function loadDate(date) {
  const key = date.toISOString().slice(0, 10), file = path.join(CACHE, `${key}.csv`);
  try { return parseBhavcopy(await fs.readFile(file, "utf8")); } catch {}
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(archive(date), { headers, signal: AbortSignal.timeout(45000) });
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`${response.status}`);
      const text = await response.text(), rows = parseBhavcopy(text);
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

function simulatePeriod(signals, histories, exit, years) {
  const unavailable = new Map(), trades = [];
  for (const signal of signals.filter(item => years.has(item.signalDate.slice(0, 4))).sort((a, b) => a.signalDate.localeCompare(b.signalDate) || a.symbol.localeCompare(b.symbol))) {
    if (signal.barIndex <= (unavailable.get(signal.symbol) ?? -1)) continue;
    const outcome = simulateTournamentTrade(histories.get(signal.symbol), signal.barIndex, signal, exit, { frictionPct: FRICTION_PCT, maxHoldSessions: MAX_HOLD_SESSIONS });
    unavailable.set(signal.symbol, outcome.unavailableUntil ?? signal.barIndex);
    if (outcome.status === "entered") trades.push({ ...signal, ...outcome, signalYear: signal.signalDate.slice(0, 4) });
  }
  return trades;
}

function selectionScore(development, validation) {
  const worstExp = Math.min(development.expectancyR, validation.expectancyR);
  const worstPf = Math.min(development.profitFactor || 0, validation.profitFactor || 0);
  const worstWr = Math.min(development.winRatePct, validation.winRatePct);
  const instability = Math.abs(development.expectancyR - validation.expectancyR) * 25 + Math.abs(development.winRatePct - validation.winRatePct) * .15;
  return +(worstExp * 100 + worstPf * 7 + worstWr * .12 + Math.min(development.realizedPayoffRatio || 0, validation.realizedPayoffRatio || 0) * 3 - instability).toFixed(3);
}

function metric(metrics) { return `${metrics.trades} / ${metrics.winRatePct}% / ${metrics.expectancyR}R / ${metrics.profitFactor ?? "—"}`; }

function reportMarkdown(result) {
  const winner = result.frozenVariant;
  const rows = result.preHoldoutRankings.map((row, index) => `| ${index + 1} | ${row.strategy} | ${row.exit} | ${metric(row.development)} | ${metric(row.validation)} | ${row.sampleSufficient ? "Yes" : "No"} | ${row.deployable ? "Yes" : "No"} |`).join("\n");
  return `# Smart Money Quality Momentum Pullback — Full Backtest\n\nGenerated: ${result.meta.generatedAt}\n\n## Direct decision\n\n` +
    `${result.deployableVariantFound ? `A variant passed the locked pre-holdout gate: **${winner.strategy} + ${winner.exit}**.` : `**No tested QMP variant passed the locked pre-holdout deployability gate.** The highest-ranked variant is shown only as the frozen research candidate, not as a live recommendation.`} ` +
    `The frozen variant produced ${winner.holdout.trades} untouched 2026 trades, ${winner.holdout.winRatePct}% win rate, ${winner.holdout.expectancyR}R expectancy, and ${winner.holdout.profitFactor ?? "—"} profit factor.\n\n` +
    `## Exact architecture\n\nThe selector uses cross-sectional 6- and 12-month returns divided by matching daily volatility, z-score normalization, and a percentile rank. It then requires a leader near its 52-week high, a rising 50-day trend, a controlled four-day pullback near EMA10/EMA20 on subdued volume, an earlier Smart Money footprint, and a positive market regime. Entry is a next-session stop order; exits are tested independently.\n\n` +
    `## Locked test design\n\n- Official NSE historical EQ daily archives; point-in-time universe\n- Development 2022–2024; validation 2025; untouched 2026 through ${result.meta.marketEnd}\n- 0.30% round-trip charges/slippage; conservative stop-first same-bar handling\n- Maximum five holding sessions; no overlapping position in the same symbol and variant\n- Minimum sample: ${MINIMUM_SAMPLES.development} development and ${MINIMUM_SAMPLES.validation} validation trades\n- Deployable only if expectancy > 0 and profit factor > 1 in both development and validation\n- 2026 was summarized only after the variant had been frozen\n\n` +
    `## All 16 variants — pre-holdout selection only\n\n| Rank | Setup | Exit | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | Deployable |\n|---:|---|---|---:|---:|---:|---:|\n${rows}\n\n` +
    `## Frozen candidate and untouched result\n\n- Setup: ${winner.strategy}\n- Exit: ${winner.exit}\n- Development: ${metric(winner.development)}\n- Validation: ${metric(winner.validation)}\n- Untouched 2026: ${metric(winner.holdout)}; 95% Wilson lower win-rate bound ${winner.holdout.wilsonLower95Pct}%\n\nThis is research, not a guarantee of future returns.\n`;
}

async function main() {
  await Promise.all([fs.mkdir(CACHE, { recursive: true }), fs.mkdir(path.join(ROOT, "reports"), { recursive: true }), fs.mkdir(path.join(ROOT, "data"), { recursive: true })]);
  const dates = datesBetween(DOWNLOAD_START, END);
  console.log(`Downloading/loading ${dates.length} weekday archives...`);
  const files = await mapLimit(dates, 12, loadDate);
  const sessions = files.filter(rows => rows.length >= 500).sort((a, b) => a[0].date.localeCompare(b[0].date));
  if (sessions.length < 1000) throw new Error(`Insufficient history: ${sessions.length} sessions`);

  const histories = new Map(), lastActionIndex = new Map(), signals = [];
  let eligibleObservations = 0, footprintSetupSignals = 0, actionWindowsExcluded = 0;
  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
    const rows = sessions[sessionIndex], date = rows[0].date;
    for (const row of rows) {
      if (!histories.has(row.symbol)) histories.set(row.symbol, []);
      const bars = histories.get(row.symbol), previous = bars.at(-1);
      bars.push(row);
      if (previous && looksLikeCorporateAction(previous, row)) lastActionIndex.set(row.symbol, bars.length - 1);
    }
    if (date < START) continue;
    const eligible = [...histories.entries()].filter(([, bars]) => bars.length >= 253 && bars.at(-1).date === date);
    const clean = eligible.filter(([symbol, bars]) => {
      const excluded = bars.length - 1 - (lastActionIndex.get(symbol) ?? -9999) < 253;
      if (excluded) actionWindowsExcluded++;
      return !excluded;
    });
    eligibleObservations += clean.length;
    const inputs = clean.map(([symbol, bars]) => ({ symbol, ...momentumInputs(bars) })).filter(row => row.ratio6m != null);
    const momentumMap = zScoreRows(inputs);
    const breadthRows = clean.filter(([, bars]) => bars.length >= 50).map(([, bars]) => bars.at(-1).close > smaAt(bars.map(bar => bar.close), 50));
    const returns20 = clean.filter(([, bars]) => bars.length >= 21).map(([, bars]) => bars.at(-1).close / bars.at(-21).close - 1);
    const breadth50 = average(breadthRows.map(Boolean)) || 0, marketReturn20 = median(returns20) || 0;
    for (const [symbol, bars] of clean) {
      const momentum = momentumMap.get(symbol); if (!momentum) continue;
      for (const config of QMP_CONFIGS) {
        const plan = buildQmpPlan(bars, { momentum, breadth50, marketReturn20 }, config);
        if (!plan) continue;
        signals.push({ symbol, barIndex: bars.length - 1, ...plan }); footprintSetupSignals++;
      }
    }
    if (sessionIndex % 100 === 0) console.log(`Replay ${date}: ${signals.length} QMP signals`);
  }

  const preHoldout = [];
  for (const config of QMP_CONFIGS) {
    const strategySignals = signals.filter(signal => signal.strategy === config.name);
    for (const exit of EXITS) {
      const development = summarizeTournamentTrades(simulatePeriod(strategySignals, histories, exit, DEVELOPMENT));
      const validation = summarizeTournamentTrades(simulatePeriod(strategySignals, histories, exit, VALIDATION));
      const sampleSufficient = development.trades >= MINIMUM_SAMPLES.development && validation.trades >= MINIMUM_SAMPLES.validation;
      const deployable = sampleSufficient && development.expectancyR > 0 && validation.expectancyR > 0 && development.profitFactor > 1 && validation.profitFactor > 1;
      preHoldout.push({ strategy: config.name, exit: exit.name, exitDefinition: exit, development, validation, sampleSufficient, deployable, selectionScore: selectionScore(development, validation) });
    }
  }
  const deployable = preHoldout.filter(row => row.deployable), sufficient = preHoldout.filter(row => row.sampleSufficient);
  const pool = deployable.length ? deployable : sufficient.length ? sufficient : preHoldout;
  const frozen = [...pool].sort((a, b) => b.selectionScore - a.selectionScore)[0];
  console.log(`Frozen before 2026: ${frozen.strategy} / ${frozen.exit}; deployable=${frozen.deployable}`);
  const frozenSignals = signals.filter(signal => signal.strategy === frozen.strategy);
  const holdoutTrades = simulatePeriod(frozenSignals, histories, frozen.exitDefinition, HOLDOUT);
  const holdoutBase = summarizeTournamentTrades(holdoutTrades);
  const holdout = { ...holdoutBase, wilsonLower95Pct: wilsonLower(holdoutBase.wins, holdoutBase.trades) };
  const result = {
    meta: { name: "Smart Money Quality Momentum Pullback", generatedAt: new Date().toISOString(), source: "Official NSE security-wise price/volume/delivery archives", downloadStart: DOWNLOAD_START, signalStart: START, requestedEnd: END, marketEnd: sessions.at(-1)[0].date, sessions: sessions.length, symbols: histories.size, eligibleObservations, footprintSetupSignals, actionWindowsExcluded },
    methodology: { pointInTime: true, nextSessionExecution: true, sameBarPolicy: "stop-first", maxHoldSessions: MAX_HOLD_SESSIONS, frictionPct: FRICTION_PCT, development: "2022-2024", validation: "2025", untouchedHoldout: "2026", minimumSamples: MINIMUM_SAMPLES, holdoutUsedInSelection: false },
    preHoldoutRankings: [...preHoldout].sort((a, b) => b.selectionScore - a.selectionScore).map(({ exitDefinition, ...row }) => row),
    deployableVariantFound: deployable.length > 0,
    frozenVariant: { ...Object.fromEntries(Object.entries(frozen).filter(([key]) => key !== "exitDefinition")), holdout },
    robust65Found: frozen.sampleSufficient && frozen.development.winRatePct >= 65 && frozen.validation.winRatePct >= 65 && holdout.winRatePct >= 65 && frozen.development.expectancyR > 0 && frozen.validation.expectancyR > 0 && holdout.expectancyR > 0
  };
  await fs.writeFile(path.join(ROOT, "data", "quality-momentum-pullback-backtest.json"), JSON.stringify(result, null, 2) + "\n");
  await fs.writeFile(path.join(ROOT, "reports", "quality-momentum-pullback-backtest-report.md"), reportMarkdown(result));
  const columns = ["symbol", "strategy", "signalDate", "momentumPercentile", "return6mPct", "return12mPct", "highProximityPct", "footprintScore", "breadth50Pct", "entryDate", "exitDate", "entryPrice", "stop", "target", "exitReason", "holdSessions", "netReturnPct", "netR"];
  const csv = [columns.join(","), ...holdoutTrades.map(trade => columns.map(column => trade[column] ?? "").join(","))].join("\n") + "\n";
  await fs.writeFile(path.join(ROOT, "reports", "quality-momentum-pullback-2026-trades.csv"), csv);
  console.log(JSON.stringify({ meta: result.meta, deployableVariantFound: result.deployableVariantFound, frozenVariant: result.frozenVariant, robust65Found: result.robust65Found }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
