import fs from "node:fs/promises";
import path from "node:path";
import { atr, evaluateSmartMoney, sma } from "../lib/smart-money.mjs";
import { groupSummary, looksLikeCorporateAction, simulateLongTrade, simulateTwoTargetTrade, summarizeTrades } from "../lib/smart-money-backtest.mjs";

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

const pct = value => Number.isFinite(value) ? +(value * 100).toFixed(3) : null;

function enrichSignal(evaluation, bars, breadth20, breadth50) {
  const latest = bars.at(-1); const a = atr(bars, 14);
  const return5 = latest.close / bars.at(-6).close - 1;
  const previous5 = bars.at(-6).close / bars.at(-11).close - 1;
  return {
    ...evaluation,
    signalHigh: latest.high,
    high20Raw: Math.max(...bars.slice(-21, -1).map(bar => bar.high)),
    low10Raw: Math.min(...bars.slice(-10).map(bar => bar.low)),
    atrValue: a,
    atrPct: pct(a / latest.close),
    return5Pct: pct(return5),
    return10Pct: pct(latest.close / bars.at(-11).close - 1),
    momentumAccelerationPct: pct(return5 - previous5),
    closeLocation: latest.high === latest.low ? 0.5 : +((latest.close - latest.low) / (latest.high - latest.low)).toFixed(3),
    breadth20Pct: pct(breadth20), breadth50Pct: pct(breadth50)
  };
}

function planFor(signal, config) {
  let entry = signal.entry; let stopLoss = signal.stopLoss;
  if (config.entry === "signalHigh") entry = signal.signalHigh + signal.atrValue * 0.1;
  if (config.entry === "breakout20") entry = signal.high20Raw * 1.002;
  if (config.entry === "sma21Limit") entry = signal.sma21;
  if (config.stopAtr) stopLoss = entry - signal.atrValue * config.stopAtr;
  return { ...signal, entry, stopLoss };
}

function independentOutcomes(signals, histories, config, targetR = 1.5, maxHoldSessions = 5) {
  return signals.map(signal => {
    const outcome = simulateLongTrade(histories.get(signal.symbol), signal.barIndex, planFor(signal, config), {
      waitSessions: config.waitSessions, orderType: config.orderType, maxHoldSessions, targetR, frictionPct: .003
    });
    return Object.assign(Object.create(signal), outcome, { year: outcome.exitDate?.slice(0, 4) || signal.signalDate.slice(0, 4) });
  }).sort((a, b) => a.signalDate.localeCompare(b.signalDate) || a.symbol.localeCompare(b.symbol));
}

function selectNonOverlapping(outcomes, gates = [], years = null) {
  const unavailable = new Map(); const selected = [];
  for (const row of outcomes) {
    if (years && !years.has(row.year)) continue;
    if (!gates.every(gate => gate.test(row))) continue;
    if (row.barIndex <= (unavailable.get(row.symbol) ?? -1)) continue;
    unavailable.set(row.symbol, row.unavailableUntil ?? row.barIndex);
    if (row.status === "entered") selected.push(row);
  }
  return selected;
}

function managedOutcomes(signals, histories, config, management) {
  return signals.map(signal => {
    const outcome = simulateTwoTargetTrade(histories.get(signal.symbol), signal.barIndex, planFor(signal, config), {
      waitSessions: config.waitSessions, orderType: config.orderType, frictionPct: .003,
      maxHoldSessions: management.maxHoldSessions, t1R: 1.5, t2R: 2,
      t1ExitPct: management.t1ExitPct, afterT1Stop: management.afterT1Stop
    });
    return Object.assign(Object.create(signal), outcome, { year: outcome.exitDate?.slice(0, 4) || signal.signalDate.slice(0, 4) });
  }).sort((a, b) => a.signalDate.localeCompare(b.signalDate) || a.symbol.localeCompare(b.symbol));
}

function wilsonLower(wins, total, z = 1.96) {
  if (!total) return 0; const p = wins / total; const d = 1 + z * z / total;
  return +((p + z * z / (2 * total) - z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)) / d * 100).toFixed(2);
}

function deepOptimization(signals, histories) {
  const developmentYears = new Set(["2022", "2023", "2024"]); const validationYears = new Set(["2025"]); const holdoutYears = new Set(["2026"]);
  const gates = [
    { family: "setup", name: "Breakout Triggered only", test: r => r.setup === "Breakout Triggered" },
    { family: "confidence", name: "High confidence", test: r => r.confidence === "High" },
    { family: "regime", name: "Bullish regime", test: r => r.marketRegime === "Bullish" },
    { family: "regime", name: "No bearish regime", test: r => r.marketRegime !== "Bearish" },
    ...[70, 80, 90].map(v => ({ family: "direction", name: `Direction ≥${v}`, test: r => r.directionScore >= v })),
    ...[65, 75, 85].map(v => ({ family: "accumulation", name: `Accumulation ≥${v}`, test: r => r.accumulationScore >= v })),
    ...[25, 35, 45].map(v => ({ family: "distribution", name: `Distribution ≤${v}`, test: r => r.distributionScore <= v })),
    ...[3, 6, 10].map(v => ({ family: "rs20", name: `RS20 ≥${v}%`, test: r => r.relativeStrength20d >= v })),
    ...[1.3, 1.6, 2].map(v => ({ family: "volume", name: `Volume ≥${v}×`, test: r => r.volumeRatio >= v })),
    ...[1.1, 1.3, 1.6].map(v => ({ family: "delivery", name: `Delivered value ≥${v}×`, test: r => r.deliveryRatio >= v })),
    ...[10, 25, 50].map(v => ({ family: "liquidity", name: `Turnover ≥₹${v}cr`, test: r => r.averageTurnoverCr20d >= v })),
    ...[2, 4].map(v => ({ family: "return5", name: `5D return ≥${v}%`, test: r => r.return5Pct >= v })),
    ...[4, 8].map(v => ({ family: "return10", name: `10D return ≥${v}%`, test: r => r.return10Pct >= v })),
    ...[1, 2].map(v => ({ family: "acceleration", name: `Momentum acceleration ≥${v}%`, test: r => r.momentumAccelerationPct >= v })),
    ...[.65, .75].map(v => ({ family: "closeLocation", name: `Close location ≥${v}`, test: r => r.closeLocation >= v })),
    { family: "atr", name: "ATR 1–4%", test: r => r.atrPct >= 1 && r.atrPct <= 4 },
    { family: "atr", name: "ATR 1.5–3.5%", test: r => r.atrPct >= 1.5 && r.atrPct <= 3.5 },
    { family: "breadth", name: "Breadth20 ≥55%", test: r => r.breadth20Pct >= 55 },
    { family: "breadth", name: "Breadth20 ≥60%", test: r => r.breadth20Pct >= 60 },
    { family: "price", name: "Price ≥₹50", test: r => r.price >= 50 }
  ];
  const configs = [
    { name: "OS trigger + OS structure stop", entry: "current", waitSessions: 3, orderType: "stop" },
    { name: "Signal-high + 1.5ATR stop", entry: "signalHigh", stopAtr: 1.5, waitSessions: 2, orderType: "stop" },
    { name: "20D breakout + 1.5ATR stop", entry: "breakout20", stopAtr: 1.5, waitSessions: 3, orderType: "stop" },
    { name: "SMA21 pullback + 1.5ATR stop", entry: "sma21Limit", stopAtr: 1.5, waitSessions: 3, orderType: "limit" },
    { name: "Signal-high + 2ATR stop", entry: "signalHigh", stopAtr: 2, waitSessions: 2, orderType: "stop" },
    { name: "20D breakout + 2ATR stop", entry: "breakout20", stopAtr: 2, waitSessions: 3, orderType: "stop" }
  ];
  const allCandidates = [];
  for (const config of configs) {
    console.log(`Deep study: ${config.name}`);
    const outcomes = independentOutcomes(signals, histories, config);
    const scoreCandidate = candidateGates => {
      const development = summarizeTrades(selectNonOverlapping(outcomes, candidateGates, developmentYears));
      const validation = summarizeTrades(selectNonOverlapping(outcomes, candidateGates, validationYears));
      if (development.trades < 200 || validation.trades < 60) return null;
      const stabilityPenalty = Math.abs(development.winRatePct - validation.winRatePct) * .4;
      const score = validation.winRatePct + validation.expectancyR * 80 + (validation.profitFactor || 0) * 8 - stabilityPenalty;
      return { gates: candidateGates, config: config.name, development, validation, score: +score.toFixed(3) };
    };
    const baseline = scoreCandidate([]); if (baseline) allCandidates.push(baseline);
    const singles = gates.map(gate => scoreCandidate([gate])).filter(Boolean).sort((a, b) => b.score - a.score);
    allCandidates.push(...singles);
    const seedGates = []; const seenFamilies = new Set();
    for (const candidate of singles) {
      const gate = candidate.gates[0];
      if (!seenFamilies.has(gate.family)) { seedGates.push(gate); seenFamilies.add(gate.family); }
      if (seedGates.length === 8) break;
    }
    const combinations = [];
    function combine(start, wanted, chosen) {
      if (!wanted) { combinations.push([...chosen]); return; }
      for (let index = start; index <= seedGates.length - wanted; index++) combine(index + 1, wanted - 1, [...chosen, seedGates[index]]);
    }
    for (const size of [2, 3, 4]) combine(0, size, []);
    for (const candidateGates of combinations) { const candidate = scoreCandidate(candidateGates); if (candidate) allCandidates.push(candidate); }
  }
  const finalistDefinitions = allCandidates.sort((a, b) => b.score - a.score).slice(0, 20);
  const finalists = [];
  for (const config of configs.filter(item => finalistDefinitions.some(candidate => candidate.config === item.name))) {
    const outcomes = independentOutcomes(signals, histories, config);
    for (const candidate of finalistDefinitions.filter(item => item.config === config.name)) {
      const holdout = summarizeTrades(selectNonOverlapping(outcomes, candidate.gates, holdoutYears));
      finalists.push({
        entryStop: candidate.config, filters: candidate.gates.map(g => g.name), score: candidate.score,
        development: { ...candidate.development, wilsonLower95Pct: wilsonLower(candidate.development.wins, candidate.development.trades) },
        validation: { ...candidate.validation, wilsonLower95Pct: wilsonLower(candidate.validation.wins, candidate.validation.trades) },
        holdout: { ...holdout, wilsonLower95Pct: wilsonLower(holdout.wins, holdout.trades) }
      });
    }
  }
  finalists.sort((a, b) => b.score - a.score);
  const best = finalists[0]; const selectedConfig = configs.find(config => config.name === best.entryStop);
  const selectedGates = best.filters.map(name => gates.find(g => g.name === name));
  const targets = {};
  for (const target of [{ name: "T1", r: 1.5, days: 5 }, { name: "T2", r: 2, days: 10 }, { name: "T3", r: 3, days: 15 }]) {
    const outcomes = independentOutcomes(signals, histories, selectedConfig, target.r, target.days);
    targets[target.name] = {
      riskReward: target.r, maxHoldSessions: target.days,
      development: summarizeTrades(selectNonOverlapping(outcomes, selectedGates, developmentYears)),
      validation: summarizeTrades(selectNonOverlapping(outcomes, selectedGates, validationYears)),
      holdout: summarizeTrades(selectNonOverlapping(outcomes, selectedGates, holdoutYears))
    };
  }
  const robust65 = finalists.filter(row => row.development.winRatePct >= 65 && row.validation.winRatePct >= 65 && row.holdout.winRatePct >= 65 && row.development.expectancyR > 0 && row.validation.expectancyR > 0 && row.holdout.expectancyR > 0);
  const management = twoTargetManagementStudy(signals, histories, best, configs, gates);
  return { split: { development: "2022–2024", validation: "2025", untouchedHoldout: "2026" }, minimumSamples: { development: 200, validation: 60 }, candidatesTested: allCandidates.length, finalists, robust65Found: robust65.length > 0, robust65Count: robust65.length, selectedTargetStudy: targets, twoTargetManagement: management };
}

function twoTargetManagementStudy(signals, histories, selectedRule, configs, gates) {
  const developmentYears = new Set(["2022", "2023", "2024"]);
  const validationYears = new Set(["2025"]);
  const holdoutYears = new Set(["2026"]);
  const config = configs.find(item => item.name === selectedRule.entryStop);
  const selectedGates = selectedRule.filters.map(name => gates.find(gate => gate.name === name));
  const variants = [
    { name: "100% at T1", t1ExitPct: 1, afterT1Stop: "initial", maxHoldSessions: 5 },
    { name: "100% runner to T2; initial SL", t1ExitPct: 0, afterT1Stop: "initial", maxHoldSessions: 5 },
    { name: "100% runner to T2; BE after T1", t1ExitPct: 0, afterT1Stop: "breakeven", maxHoldSessions: 5 },
    ...[.25, .5, .75].flatMap(t1ExitPct => [
      { name: `${t1ExitPct * 100}% T1 / ${(1 - t1ExitPct) * 100}% T2; initial SL`, t1ExitPct, afterT1Stop: "initial", maxHoldSessions: 5 },
      { name: `${t1ExitPct * 100}% T1 / ${(1 - t1ExitPct) * 100}% T2; BE after T1`, t1ExitPct, afterT1Stop: "breakeven", maxHoldSessions: 5 },
      { name: `${t1ExitPct * 100}% T1 / ${(1 - t1ExitPct) * 100}% T2; lock 0.25R`, t1ExitPct, afterT1Stop: "lock0.25R", maxHoldSessions: 5 },
      { name: `${t1ExitPct * 100}% T1 / ${(1 - t1ExitPct) * 100}% T2; 2-day-low trail`, t1ExitPct, afterT1Stop: "twoDayLow", maxHoldSessions: 5 },
      { name: `${t1ExitPct * 100}% T1 / ${(1 - t1ExitPct) * 100}% T2; 1ATR trail`, t1ExitPct, afterT1Stop: "atr1", maxHoldSessions: 5 },
      { name: `${t1ExitPct * 100}% T1 / ${(1 - t1ExitPct) * 100}% T2; 1.5ATR trail`, t1ExitPct, afterT1Stop: "atr1.5", maxHoldSessions: 5 }
    ])
  ];
  const developmentValidation = variants.map(variant => {
    const outcomes = managedOutcomes(signals, histories, config, variant);
    const development = summarizeTrades(selectNonOverlapping(outcomes, selectedGates, developmentYears));
    const validation = summarizeTrades(selectNonOverlapping(outcomes, selectedGates, validationYears));
    const worstExpectancy = Math.min(development.expectancyR, validation.expectancyR);
    const worstPayoff = Math.min(development.realizedPayoffRatio || 0, validation.realizedPayoffRatio || 0);
    const stabilityPenalty = Math.abs(development.expectancyR - validation.expectancyR) * 20;
    const score = worstExpectancy * 100 + worstPayoff * 5 - stabilityPenalty;
    return { ...variant, development, validation, selectionScore: +score.toFixed(3) };
  });
  const baseline = developmentValidation.find(row => row.name === "100% at T1");
  const eligible = developmentValidation.filter(row =>
    row.development.trades >= 200 && row.validation.trades >= 60 &&
    row.development.expectancyR > 0 && row.validation.expectancyR > 0 &&
    row.validation.winRatePct >= baseline.validation.winRatePct - 5
  ).sort((a, b) => b.selectionScore - a.selectionScore);
  const selected = eligible[0] || baseline;
  const holdoutOutcomes = managedOutcomes(signals, histories, config, selected);
  const holdout = summarizeTrades(selectNonOverlapping(holdoutOutcomes, selectedGates, holdoutYears));
  return {
    objective: "Raise out-of-sample expectancy and realized payoff while keeping validation win rate within 5 percentage points of full-T1 baseline",
    targets: { t1R: 1.5, t2R: 2, maxHoldSessions: 5 },
    variantsTested: variants.length,
    holdoutPolicy: "Only the management rule selected on 2022-2025 is evaluated on 2026",
    baseline, rankings: developmentValidation.sort((a, b) => b.selectionScore - a.selectionScore),
    selected: { ...selected, holdout }
  };
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

function deepReportMarkdown(study, generatedAt) {
  const best = study.finalists[0];
  const rows = study.finalists.slice(0, 10).map((row, index) =>
    `| ${index + 1} | ${row.entryStop} | ${row.filters.join("; ") || "None"} | ${row.development.trades} / ${row.development.winRatePct}% / ${row.development.expectancyR}R | ${row.validation.trades} / ${row.validation.winRatePct}% / ${row.validation.expectancyR}R | ${row.holdout.trades} / ${row.holdout.winRatePct}% / ${row.holdout.expectancyR}R |`
  ).join("\n");
  const targets = Object.entries(study.selectedTargetStudy).map(([name, value]) =>
    `| ${name} | ${value.riskReward}R | ${value.maxHoldSessions} | ${value.development.targetHitRatePct}% | ${value.validation.targetHitRatePct}% | ${value.holdout.targetHitRatePct}% |`
  ).join("\n");
  return `# Smart Money Footprint OS — Deep Entry, Stop and Target Study\n\nGenerated: ${generatedAt}\n\n` +
    `## Direct answer\n\n${study.robust65Found ? `A robust ≥65% candidate was found in development, validation, and untouched holdout data.` : `No candidate achieved a genuine ≥65% win rate with positive expectancy in development, validation, and untouched holdout data while keeping T1 at 1.5R.`}\n\n` +
    `The best candidate selected without looking at the 2026 holdout used **${best.entryStop}** with: ${best.filters.join(", ") || "no additional filters"}. Its 2026 holdout result was **${best.holdout.winRatePct}% win rate**, **${best.holdout.expectancyR}R expectancy**, and **${best.holdout.profitFactor ?? "—"} profit factor** over ${best.holdout.trades} trades. The 95% Wilson lower bound for its holdout win rate was ${best.holdout.wilsonLower95Pct}%.\n\n` +
    `## Validation design\n\n- Development: 2022–2024\n- Validation used for model selection: 2025\n- Untouched holdout: 2026\n- Minimum 200 development and 60 validation trades\n- 0.30% round-trip friction, next-session execution, stop-first same-bar rule\n- T1 never reduced below 1.5R\n- ${study.candidatesTested} rule combinations survived minimum-sample checks\n\n` +
    `## Top candidates\n\n| Rank | Entry + stop | Filters | Development trades / WR / Exp | Validation trades / WR / Exp | Holdout trades / WR / Exp |\n|---:|---|---|---:|---:|---:|\n${rows}\n\n` +
    `## T1 / T2 / T3 study for the selected setup\n\n| Target | RR | Max sessions | Development hit rate | Validation hit rate | Holdout hit rate |\n|---|---:|---:|---:|---:|---:|\n${targets}\n\n` +
    `## Interpretation\n\nA high in-sample win rate is not accepted unless it persists in both later periods with positive expectancy and a useful sample. Delivery and volume remain probabilistic clues, not proof of a named institution or its hedge. The live OS should not be changed solely to force a 65% headline.\n`;
}

function managementReportMarkdown(study, generatedAt) {
  const m = study.twoTargetManagement;
  const s = m.selected;
  const rows = m.rankings.slice(0, 12).map((row, index) =>
    `| ${index + 1} | ${row.name} | ${row.development.winRatePct}% / ${row.development.expectancyR}R / ${row.development.realizedPayoffRatio} | ${row.validation.winRatePct}% / ${row.validation.expectancyR}R / ${row.validation.realizedPayoffRatio} |`
  ).join("\n");
  return `# Smart Money Footprint OS — T1/T2 Management Study\n\nGenerated: ${generatedAt}\n\n` +
    `## Direct answer\n\nThe rule selected without using 2026 was **${s.name}**. Its untouched 2026 holdout produced **${s.holdout.winRatePct}% profitable trades**, **${s.holdout.expectancyR}R expectancy**, **${s.holdout.realizedPayoffRatio} realized payoff ratio**, and **${s.holdout.profitFactor ?? "—"} profit factor** across ${s.holdout.trades} trades.\n\n` +
    `## Frozen inputs\n\n- Entry model and filters were not re-optimized: ${study.finalists[0].entryStop}; ${study.finalists[0].filters.join("; ")}\n- Initial stop remained 1.5 ATR\n- T1 remained 1.5R and T2 remained 2R\n- Maximum hold remained 5 sessions\n- 0.30% round-trip friction and conservative stop-first same-bar handling\n- ${m.variantsTested} bounded management variants; 2022-2024 development, 2025 validation, 2026 untouched holdout\n\n` +
    `## Top development/validation variants\n\n| Rank | Management | Development WR / Exp / Payoff | Validation WR / Exp / Payoff |\n|---:|---|---:|---:|\n${rows}\n\n` +
    `## Untouched holdout\n\n| Trades | Win rate | T1 hit | T2 hit | Expectancy | Profit factor | Avg win | Avg loss | Payoff |\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n| ${s.holdout.trades} | ${s.holdout.winRatePct}% | ${s.holdout.t1HitRatePct}% | ${s.holdout.t2HitRatePct}% | ${s.holdout.expectancyR}R | ${s.holdout.profitFactor ?? "—"} | ${s.holdout.averageWinR}R | ${s.holdout.averageLossR}R | ${s.holdout.realizedPayoffRatio} |\n\n` +
    `## Interpretation\n\nPartial exits change the payoff distribution; they do not create extra market edge. The selected rule is accepted only if it improves the pre-holdout objective and remains positive on the untouched holdout. The live OS is not changed by this research report.\n`;
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
      if (evaluation?.actionable) signals.push({ ...enrichSignal(evaluation, bars, breadth20, breadth50), signalDate: date, barIndex: bars.length - 1, marketRegime });
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
  const deepStudy = deepOptimization(signals, histories);
  const generatedAt = new Date().toISOString();
  const result = {
    meta: { name: "Smart Money Footprint OS full historical backtest", generatedAt, source: "Official NSE security-wise price/volume/delivery archives", downloadStart: DOWNLOAD_START, signalStart: START, requestedEnd: END, marketEnd: sessions.at(-1)[0].date, sessions: sessions.length, symbols: histories.size, rawSignals: signals.length, corporateActionWindowsExcluded },
    methodology: { pointInTime: true, nextSessionExecution: true, sameBarPolicy: "stop-first", onePositionPerSymbol: true, survivorshipBias: "historical EQ symbols retained", ...PRIMARY },
    primary: { metrics: summarizeTrades(primaryTrades), unfilled: primaryTrades.filter(t => t.status === "unfilled").length, byYear: groupSummary(primaryTrades, "year"), byRegime: groupSummary(primaryTrades, "marketRegime"), byConfidence: groupSummary(primaryTrades, "confidence"), bySetup: groupSummary(primaryTrades, "setup") },
    sensitivity,
    deepStudy
  };
  await fs.writeFile(path.join(ROOT, "data", "smart-money-backtest.json"), JSON.stringify(result, null, 2) + "\n");
  await fs.writeFile(path.join(ROOT, "reports", "smart-money-backtest-report.md"), reportMarkdown(result));
  await fs.writeFile(path.join(ROOT, "reports", "smart-money-deep-study-report.md"), deepReportMarkdown(deepStudy, generatedAt));
  await fs.writeFile(path.join(ROOT, "reports", "smart-money-t1-t2-study-report.md"), managementReportMarkdown(deepStudy, generatedAt));
  const tradeHeader = ["symbol","signalDate","marketRegime","confidence","setup","entryDate","exitDate","entryPrice","exitPrice","exitReason","holdSessions","netReturnPct","netR"];
  const csv = [tradeHeader.join(","), ...primaryTrades.filter(t => t.status === "entered").map(t => tradeHeader.map(k => t[k]).join(","))].join("\n") + "\n";
  await fs.writeFile(path.join(ROOT, "reports", "smart-money-backtest-trades.csv"), csv);
  console.log(JSON.stringify({ ...result.meta, primary: result.primary.metrics, unfilled: result.primary.unfilled }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
