import fs from "node:fs/promises";
import path from "node:path";
import { looksLikeCorporateAction } from "../lib/smart-money-backtest.mjs";
import { buildStrategyPlans, footprintMetrics, simulateTournamentTrade, summarizeTournamentTrades, wilsonLower } from "../lib/smart-money-strategy-tournament.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CACHE = path.join(ROOT, ".cache", "smart-money-bhavcopy");
const START = process.env.BACKTEST_START || "2022-01-01";
const DOWNLOAD_START = process.env.BACKTEST_DOWNLOAD_START || "2021-09-01";
const END = process.env.BACKTEST_END || new Date().toISOString().slice(0, 10);
const FRICTION_PCT = .003;
const MAX_HOLD_SESSIONS = 5;
const DEVELOPMENT = new Set(["2022", "2023", "2024"]);
const VALIDATION = new Set(["2025"]);
const HOLDOUT = new Set(["2026"]);
const MINIMUM_SAMPLES = { development: 200, validation: 60 };
const STRATEGIES = [
  "VCP / Contraction breakout",
  "Relative-strength leader breakout",
  "Breakout + volume confirmation",
  "Momentum pullback",
  "Gap-up continuation",
  "Trend-following ATR trail"
];
const EXITS = [
  { name: "1.5R fixed target", type: "fixed", targetR: 1.5 },
  { name: "2R fixed target", type: "fixed", targetR: 2 },
  { name: "2.5R fixed target", type: "fixed", targetR: 2.5 },
  { name: "1.5R activation + 1.5ATR trail", type: "trail", trailAtr: 1.5 }
];
const headers = { "User-Agent": "Mozilla/5.0 (compatible; TusharSmartMoneyOSStrategyTournament/1.0)", Accept: "text/csv,*/*" };

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

function percentileRanks(rows) {
  const ordered = [...rows].sort((a, b) => a.return63 - b.return63);
  const divisor = Math.max(1, ordered.length - 1);
  return new Map(ordered.map((row, index) => [row.symbol, index / divisor * 100]));
}

function simulatePeriod(strategySignals, histories, exit, years) {
  const unavailable = new Map(); const trades = [];
  const rows = strategySignals.filter(signal => years.has(signal.signalDate.slice(0, 4))).sort((a, b) => a.signalDate.localeCompare(b.signalDate) || a.symbol.localeCompare(b.symbol));
  for (const signal of rows) {
    if (signal.barIndex <= (unavailable.get(signal.symbol) ?? -1)) continue;
    const outcome = simulateTournamentTrade(histories.get(signal.symbol), signal.barIndex, signal, exit, { frictionPct: FRICTION_PCT, maxHoldSessions: MAX_HOLD_SESSIONS });
    unavailable.set(signal.symbol, outcome.unavailableUntil ?? signal.barIndex);
    if (outcome.status === "entered") trades.push({ ...signal, ...outcome, signalYear: signal.signalDate.slice(0, 4) });
  }
  return trades;
}

function selectionScore(development, validation) {
  const minExpectancy = Math.min(development.expectancyR, validation.expectancyR);
  const minProfitFactor = Math.min(development.profitFactor || 0, validation.profitFactor || 0);
  const minWinRate = Math.min(development.winRatePct, validation.winRatePct);
  const stabilityPenalty = Math.abs(development.expectancyR - validation.expectancyR) * 25 + Math.abs(development.winRatePct - validation.winRatePct) * .15;
  return +(minExpectancy * 100 + minProfitFactor * 7 + minWinRate * .12 + Math.min(development.realizedPayoffRatio || 0, validation.realizedPayoffRatio || 0) * 3 - stabilityPenalty).toFixed(3);
}

function chooseFrozenVariant(rows) {
  const sufficient = rows.filter(row => row.sampleSufficient);
  const deployable = sufficient.filter(row => row.development.expectancyR > 0 && row.validation.expectancyR > 0 && row.development.profitFactor > 1 && row.validation.profitFactor > 1);
  return [...(deployable.length ? deployable : sufficient.length ? sufficient : rows)].sort((a, b) => b.selectionScore - a.selectionScore)[0];
}

function metricCell(metrics) {
  return `${metrics.trades} / ${metrics.winRatePct}% / ${metrics.expectancyR}R / ${metrics.profitFactor ?? "—"}`;
}

function reportMarkdown(result) {
  const winner = result.frozenChampion;
  const allRows = result.preHoldoutRankings.map((row, index) => `| ${index + 1} | ${row.strategy} | ${row.exit} | ${metricCell(row.development)} | ${metricCell(row.validation)} | ${row.sampleSufficient ? "Yes" : "No"} | ${row.deployable ? "Yes" : "No"} |`).join("\n");
  const finalistRows = result.familyFinalists.map(row => `| ${row.strategy} | ${row.exit} | ${metricCell(row.development)} | ${metricCell(row.validation)} | ${metricCell(row.holdout)} | ${row.holdout.wilsonLower95Pct}% |`).join("\n");
  const strategyDefinitions = [
    ["VCP / Contraction breakout", "ATR and 5-day range contract; rising 21/50-day trend; buy above contraction high", "Higher of contraction low or 1.75ATR"],
    ["Relative-strength leader breakout", "Top 15% 63-day RS; 20-day breakout; rising trend", "Higher of 5-day low or 1.75ATR"],
    ["Breakout + volume confirmation", "20-day closing breakout; volume >=1.5x; close-location >=0.65", "Higher of signal low or 1.75ATR"],
    ["Momentum pullback", "10-day return >=8%; controlled pullback near rising SMA21", "Below signal low and at least 1.35ATR"],
    ["Gap-up continuation", "2–8% gap; strong close; volume >=1.3x", "Higher of signal low or 2ATR"],
    ["Trend-following ATR trail", "10-day trend resumption; rising SMA21/SMA50; RS percentile >=60", "Higher of 10-day low or 2ATR"]
  ].map(row => `| ${row.join(" | ")} |`).join("\n");
  return `# Smart Money Footprint — Independent Strategy Tournament\n\nGenerated: ${result.meta.generatedAt}\n\n` +
    `## Direct answer\n\nThe champion was frozen using only 2022–2025 data: **${winner.strategy} with ${winner.exit}**. Its untouched 2026 test produced **${winner.holdout.winRatePct}% win rate**, **${winner.holdout.expectancyR}R expectancy**, **${winner.holdout.profitFactor ?? "—"} profit factor**, and **${winner.holdout.realizedPayoffRatio ?? "—"} realized payoff** over ${winner.holdout.trades} trades. ${result.robust65Found ? "It maintained at least 65% win rate with positive expectancy in development, validation, and holdout." : "No frozen strategy maintained a genuine 65% win rate with positive expectancy across development, validation, and untouched holdout."}\n\n` +
    `Smart Money was used only as a setup-independent stock-selection layer. It did not decide the entry or exit; each strategy supplied its own setup, entry, and initial stop.\n\n` +
    `## Locked test design\n\n- NSE historical EQ universe; official NSE daily price, volume, turnover, and delivery archives\n- Development: 2022–2024; validation: 2025; untouched test: 2026 through ${result.meta.marketEnd}\n- 0.30% round-trip charges/slippage; next-session entry; conservative stop-first handling when stop and target share a daily bar\n- Maximum five sessions; stop or target may exit earlier\n- Exit choices: 1.5R, 2R, 2.5R, or trail activated only after 1.5R and then managed with a 1.5ATR stop\n- Minimum sample gate: ${MINIMUM_SAMPLES.development} development and ${MINIMUM_SAMPLES.validation} validation trades\n- A deployable variant required positive expectancy and profit factor above 1 in both development and validation\n- One exit was frozen per strategy and the overall champion was frozen before any 2026 result was summarized\n\n` +
    `## Setup-independent Smart Money selector\n\nThe selector required price >= Rs20, average 20-day turnover >= Rs10 crore, footprint score >=50, no more than three distribution days, and either an institutional-style surge day or delivered-value ratio >=1.15. The score used delivery expansion, up-day versus down-day volume, surge/distribution days, and delivered-value trend. It did not require a breakout, VCP, pullback, gap, or moving-average entry.\n\n` +
    `## Strategy rules\n\n| Strategy | Setup and entry | Initial stop |\n|---|---|---|\n${strategyDefinitions}\n\n` +
    `## All 24 variants — selection used only these columns\n\n| Rank | Strategy | Exit | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | Deployable |\n|---:|---|---|---:|---:|---:|---:|\n${allRows}\n\n` +
    `## Frozen family finalists and untouched 2026\n\n| Strategy | Frozen exit | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | 2026 trades / WR / Exp / PF | 2026 WR lower 95% |\n|---|---|---:|---:|---:|---:|\n${finalistRows}\n\n` +
    `## Decision\n\nThe overall champion remains the pre-holdout winner even if another family happened to score better in 2026. That prevents selecting a rule after seeing the test set. A 65% headline is rejected when it comes from a small sample or does not persist across all three periods. This report is research, not a guarantee of future returns.\n`;
}

async function main() {
  await fs.mkdir(CACHE, { recursive: true }); await fs.mkdir(path.join(ROOT, "reports"), { recursive: true }); await fs.mkdir(path.join(ROOT, "data"), { recursive: true });
  const dates = datesBetween(DOWNLOAD_START, END);
  console.log(`Downloading/loading ${dates.length} weekday archives...`);
  const files = await mapLimit(dates, 12, loadDate);
  const sessions = files.filter(rows => rows.length >= 500).sort((a, b) => a[0].date.localeCompare(b[0].date));
  if (sessions.length < 700) throw new Error(`Insufficient history: ${sessions.length} sessions`);

  const histories = new Map(); const signals = []; const signalsByStrategy = Object.fromEntries(STRATEGIES.map(name => [name, 0]));
  let footprintCandidates = 0, corporateActionWindowsExcluded = 0;
  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
    const rows = sessions[sessionIndex]; const date = rows[0].date;
    for (const row of rows) { if (!histories.has(row.symbol)) histories.set(row.symbol, []); histories.get(row.symbol).push(row); }
    if (date < START) continue;
    const eligible = [...histories.entries()].filter(([, bars]) => bars.length >= 64 && bars.at(-1).date === date);
    const rankRows = eligible.map(([symbol, bars]) => ({ symbol, return63: bars.at(-1).close / bars.at(-64).close - 1 }));
    const ranks = percentileRanks(rankRows);
    for (const [symbol, bars] of eligible) {
      const recent = bars.slice(-64); let actionLike = false;
      for (let index = 1; index < recent.length; index++) if (looksLikeCorporateAction(recent[index - 1], recent[index])) { actionLike = true; break; }
      if (actionLike) { corporateActionWindowsExcluded++; continue; }
      const footprint = footprintMetrics(bars);
      if (!footprint?.selected) continue;
      footprintCandidates++;
      for (const plan of buildStrategyPlans(bars, { rsRankPct: ranks.get(symbol) })) {
        signals.push({ symbol, barIndex: bars.length - 1, signalDate: date, footprintScore: footprint.score, deliveryRatio: footprint.deliveryRatio, volumeRatio: footprint.volumeRatio, ...plan });
        signalsByStrategy[plan.strategy]++;
      }
    }
    if (sessionIndex % 100 === 0) console.log(`Replay ${date}: ${footprintCandidates} candidates, ${signals.length} strategy signals`);
  }

  const byStrategy = new Map(STRATEGIES.map(strategy => [strategy, signals.filter(signal => signal.strategy === strategy)]));
  const preHoldoutRows = [];
  for (const strategy of STRATEGIES) {
    console.log(`Selection study: ${strategy}`);
    for (const exit of EXITS) {
      const development = summarizeTournamentTrades(simulatePeriod(byStrategy.get(strategy), histories, exit, DEVELOPMENT));
      const validation = summarizeTournamentTrades(simulatePeriod(byStrategy.get(strategy), histories, exit, VALIDATION));
      const sampleSufficient = development.trades >= MINIMUM_SAMPLES.development && validation.trades >= MINIMUM_SAMPLES.validation;
      const deployable = sampleSufficient && development.expectancyR > 0 && validation.expectancyR > 0 && development.profitFactor > 1 && validation.profitFactor > 1;
      preHoldoutRows.push({ strategy, exit: exit.name, exitDefinition: exit, development, validation, sampleSufficient, deployable, selectionScore: selectionScore(development, validation) });
    }
  }
  const familySelections = STRATEGIES.map(strategy => chooseFrozenVariant(preHoldoutRows.filter(row => row.strategy === strategy)));
  const deployableFamilies = familySelections.filter(row => row.deployable);
  const championPreHoldout = [...(deployableFamilies.length ? deployableFamilies : familySelections)].sort((a, b) => b.selectionScore - a.selectionScore)[0];
  console.log(`Frozen champion before holdout: ${championPreHoldout.strategy} / ${championPreHoldout.exit}`);

  const familyFinalists = familySelections.map(row => {
    const holdoutTrades = simulatePeriod(byStrategy.get(row.strategy), histories, row.exitDefinition, HOLDOUT);
    const holdout = summarizeTournamentTrades(holdoutTrades);
    return { ...row, holdout: { ...holdout, wilsonLower95Pct: wilsonLower(holdout.wins, holdout.trades) }, holdoutTrades };
  });
  const frozenChampion = familyFinalists.find(row => row.strategy === championPreHoldout.strategy && row.exit === championPreHoldout.exit);
  const robust65Found = familyFinalists.some(row => row.sampleSufficient && row.development.winRatePct >= 65 && row.validation.winRatePct >= 65 && row.holdout.winRatePct >= 65 && row.development.expectancyR > 0 && row.validation.expectancyR > 0 && row.holdout.expectancyR > 0);
  const generatedAt = new Date().toISOString();
  const result = {
    meta: { name: "Smart Money independent strategy tournament", generatedAt, source: "Official NSE security-wise price/volume/delivery archives", downloadStart: DOWNLOAD_START, signalStart: START, requestedEnd: END, marketEnd: sessions.at(-1)[0].date, sessions: sessions.length, symbols: histories.size, footprintCandidates, strategySignals: signals.length, signalsByStrategy, corporateActionWindowsExcluded },
    methodology: { stockSelectionSeparateFromStrategy: true, pointInTime: true, nextSessionExecution: true, sameBarPolicy: "stop-first", onePositionPerSymbolPerStrategy: true, maxHoldSessions: MAX_HOLD_SESSIONS, frictionPct: FRICTION_PCT, development: "2022-2024", validation: "2025", untouchedHoldout: "2026", minimumSamples: MINIMUM_SAMPLES },
    preHoldoutRankings: [...preHoldoutRows].sort((a, b) => b.selectionScore - a.selectionScore).map(({ exitDefinition, ...row }) => row),
    familyFinalists: familyFinalists.map(({ exitDefinition, holdoutTrades, ...row }) => row),
    frozenChampion: (() => { const { exitDefinition, holdoutTrades, ...row } = frozenChampion; return row; })(),
    robust65Found
  };
  await fs.writeFile(path.join(ROOT, "data", "smart-money-strategy-tournament.json"), JSON.stringify(result, null, 2) + "\n");
  await fs.writeFile(path.join(ROOT, "reports", "smart-money-strategy-tournament-report.md"), reportMarkdown(result));
  const columns = ["symbol", "strategy", "signalDate", "footprintScore", "deliveryRatio", "volumeRatio", "entryDate", "exitDate", "entryPrice", "stop", "target", "exitName", "exitReason", "holdSessions", "netReturnPct", "netR"];
  const csv = [columns.join(","), ...frozenChampion.holdoutTrades.map(trade => columns.map(column => trade[column] ?? "").join(","))].join("\n") + "\n";
  await fs.writeFile(path.join(ROOT, "reports", "smart-money-strategy-tournament-champion-2026-trades.csv"), csv);
  console.log(JSON.stringify({ meta: result.meta, frozenChampion: result.frozenChampion, robust65Found }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
