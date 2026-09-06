import { atrAt, smaAt } from "./smart-money-strategy-tournament.mjs";

const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
const maximum = values => values.length ? Math.max(...values) : NaN;
const minimum = values => values.length ? Math.min(...values) : NaN;
const round = (value, digits = 3) => Number.isFinite(value) ? +value.toFixed(digits) : null;

function standardDeviation(values) {
  if (values.length < 2) return NaN;
  const mean = average(values);
  return Math.sqrt(average(values.map(value => (value - mean) ** 2)));
}

function dailyReturns(bars, length) {
  const window = bars.slice(-(length + 1));
  return window.slice(1).map((bar, index) => bar.close / window[index].close - 1);
}

export function momentumInputs(bars) {
  if (bars.length < 253) return null;
  const latest = bars.at(-1);
  const return6m = latest.close / bars.at(-127).close - 1;
  const return12m = latest.close / bars.at(-253).close - 1;
  const volatility6m = standardDeviation(dailyReturns(bars, 126));
  const volatility12m = standardDeviation(dailyReturns(bars, 252));
  if (!(volatility6m > 0) || !(volatility12m > 0)) return null;
  return { return6m, return12m, ratio6m: return6m / volatility6m, ratio12m: return12m / volatility12m };
}

export function zScoreRows(rows) {
  if (rows.length < 2) return new Map();
  const mean6 = average(rows.map(row => row.ratio6m));
  const mean12 = average(rows.map(row => row.ratio12m));
  const sd6 = standardDeviation(rows.map(row => row.ratio6m));
  const sd12 = standardDeviation(rows.map(row => row.ratio12m));
  if (!(sd6 > 0) || !(sd12 > 0)) return new Map();
  const scored = rows.map(row => ({ ...row, normalizedMomentum: ((row.ratio6m - mean6) / sd6 + (row.ratio12m - mean12) / sd12) / 2 })).sort((a, b) => a.normalizedMomentum - b.normalizedMomentum);
  const divisor = Math.max(1, scored.length - 1);
  return new Map(scored.map((row, index) => [row.symbol, { ...row, percentile: index / divisor * 100 }]));
}

export function historicalFootprint(bars) {
  if (bars.length < 64) return null;
  const latest = bars.at(-1);
  const prior = bars.slice(-20);
  const baseline = prior.slice(0, 15);
  const avgVolume = average(baseline.map(bar => bar.volume));
  const avgDelivery = average(baseline.map(bar => bar.deliverableValue || 0));
  const avgTurnover = average(prior.map(bar => bar.turnoverCr || 0));
  const recentDelivery = average(prior.slice(-5).map(bar => bar.deliverableValue || 0));
  const deliveredTrend = avgDelivery > 0 ? recentDelivery / avgDelivery : 0;
  const upBars = prior.filter((bar, index) => index && bar.close > prior[index - 1].close);
  const downBars = prior.filter((bar, index) => index && bar.close < prior[index - 1].close);
  const upDownVolume = (average(upBars.map(bar => bar.volume)) || 0) / Math.max(1, average(downBars.map(bar => bar.volume)) || 1);
  const surgeDays = prior.filter((bar, index) => {
    if (!index) return false;
    const location = bar.high === bar.low ? .5 : (bar.close - bar.low) / (bar.high - bar.low);
    return bar.close > prior[index - 1].close && bar.volume >= avgVolume * 1.3 && location >= .65;
  }).length;
  const distributionDays = prior.filter((bar, index) => {
    if (!index) return false;
    const location = bar.high === bar.low ? .5 : (bar.close - bar.low) / (bar.high - bar.low);
    return bar.close < prior[index - 1].close && bar.volume >= avgVolume * 1.3 && location <= .35;
  }).length;
  let score = 0;
  score += upDownVolume >= 1.3 ? 30 : upDownVolume >= 1.1 ? 22 : upDownVolume >= 1 ? 10 : 0;
  score += surgeDays >= 2 ? 30 : surgeDays === 1 ? 20 : 0;
  score += deliveredTrend >= 1.3 ? 25 : deliveredTrend >= 1.1 ? 18 : deliveredTrend >= 1 ? 8 : 0;
  score -= distributionDays * 8;
  score = Math.max(0, Math.min(100, score));
  const selected = latest.close >= 20 && avgTurnover >= 10 && score >= 45 && distributionDays <= 3 && (surgeDays >= 1 || deliveredTrend >= 1.1);
  return { selected, score: round(score, 1), avgTurnover: round(avgTurnover), upDownVolume: round(upDownVolume), deliveredTrend: round(deliveredTrend), surgeDays, distributionDays };
}

function ema(values, length) {
  if (values.length < length) return NaN;
  const alpha = 2 / (length + 1);
  let value = average(values.slice(0, length));
  for (const next of values.slice(length)) value = alpha * next + (1 - alpha) * value;
  return value;
}

export const QMP_CONFIGS = [
  { name: "Balanced QMP", momentumPercentile: 80, highProximity: .90, volumeCap: 1, stabilization: false, gradual: false, entry: "twoDayHigh", stop: "structure" },
  { name: "Selective QMP", momentumPercentile: 90, highProximity: .95, volumeCap: .9, stabilization: true, gradual: false, entry: "signalHigh", stop: "structure" },
  { name: "Gradual-leader QMP", momentumPercentile: 80, highProximity: .90, volumeCap: 1, stabilization: false, gradual: true, entry: "twoDayHigh", stop: "structure" },
  { name: "ATR-stop QMP", momentumPercentile: 80, highProximity: .90, volumeCap: 1, stabilization: true, gradual: false, entry: "signalHigh", stop: "atr1.5" }
];

export function buildQmpPlan(bars, context, config) {
  if (bars.length < 253 || !context?.momentum) return null;
  const latest = bars.at(-1); const previous = bars.at(-2); const closes = bars.map(bar => bar.close);
  const a = atrAt(bars, 14); const sma50 = smaAt(closes, 50); const sma50Past = smaAt(closes, 50, closes.length - 20);
  const ema10 = ema(closes, 10); const ema20 = ema(closes, 20);
  const high252 = maximum(bars.slice(-252).map(bar => bar.high));
  const recentHigh10 = maximum(bars.slice(-10).map(bar => bar.high));
  const pullbackLow = minimum(bars.slice(-5).map(bar => bar.low));
  const pullback4 = latest.close / bars.at(-5).close - 1;
  const drawdown10 = latest.close / recentHigh10 - 1;
  const recent5 = bars.slice(-5);
  const downCloses = recent5.slice(1).filter((bar, index) => bar.close < recent5[index].close).length;
  const avgVolume20 = average(bars.slice(-21, -1).map(bar => bar.volume));
  const volumeRatio = avgVolume20 > 0 ? latest.volume / avgVolume20 : 0;
  const positiveDays126 = dailyReturns(bars, 126).filter(value => value > 0).length / 126;
  const nearSupport = Math.min(Math.abs(latest.close / ema10 - 1), Math.abs(latest.close / ema20 - 1)) <= .025;
  const regimePass = context.breadth50 >= .52 && context.marketReturn20 >= 0;
  const footprint = historicalFootprint(bars.slice(0, -1));
  const setupPass = footprint?.selected && regimePass && context.momentum.percentile >= config.momentumPercentile && latest.close / high252 >= config.highProximity && latest.close > sma50 && sma50 > sma50Past && pullback4 >= -.08 && pullback4 <= .01 && drawdown10 <= -.015 && drawdown10 >= -.10 && downCloses >= 2 && nearSupport && volumeRatio <= config.volumeCap && (!config.stabilization || latest.close > previous.close) && (!config.gradual || positiveDays126 >= .52);
  if (!setupPass) return null;
  const entry = (config.entry === "signalHigh" ? latest.high : maximum(bars.slice(-2).map(bar => bar.high))) * 1.001;
  const structuralStop = pullbackLow * .998;
  const stopLoss = config.stop === "atr1.5" ? entry - a * 1.5 : Math.min(structuralStop, entry - a);
  if (!(entry > stopLoss) || (entry - stopLoss) / entry > .08) return null;
  return {
    strategy: config.name, signalDate: latest.date, entry, stopLoss, orderType: "stop", waitSessions: 2, atrValue: a,
    momentumPercentile: round(context.momentum.percentile, 1), normalizedMomentum: round(context.momentum.normalizedMomentum),
    return6mPct: round(context.momentum.return6m * 100, 2), return12mPct: round(context.momentum.return12m * 100, 2),
    highProximityPct: round(latest.close / high252 * 100, 2), volumeRatio: round(volumeRatio), positiveDays126Pct: round(positiveDays126 * 100, 2),
    footprintScore: footprint.score, breadth50Pct: round(context.breadth50 * 100, 2), marketReturn20Pct: round(context.marketReturn20 * 100, 2)
  };
}
