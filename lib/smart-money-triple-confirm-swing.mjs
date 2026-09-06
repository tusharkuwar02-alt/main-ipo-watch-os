import { atrAt, smaAt } from "./smart-money-strategy-tournament.mjs";
import { historicalFootprint } from "./quality-momentum-pullback.mjs";

const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
const maximum = values => values.length ? Math.max(...values) : NaN;
const minimum = values => values.length ? Math.min(...values) : NaN;
const round = (value, digits = 3) => Number.isFinite(value) ? +value.toFixed(digits) : null;

export function rsiAt(values, length = 2) {
  if (values.length < length + 1) return NaN;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  let gain = average(changes.slice(0, length).map(value => Math.max(value, 0)));
  let loss = average(changes.slice(0, length).map(value => Math.max(-value, 0)));
  for (const change of changes.slice(length)) {
    gain = (gain * (length - 1) + Math.max(change, 0)) / length;
    loss = (loss * (length - 1) + Math.max(-change, 0)) / length;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

export const SWING_CONFIGS = [
  { name: "Precision", rsiMax: 5, momentumPercentile: 85, atrMinPct: 2, atrMaxPct: 6, pullbackMin: -.10, pullbackMax: -.02, entryType: "limit" },
  { name: "Balanced", rsiMax: 10, momentumPercentile: 80, atrMinPct: 2, atrMaxPct: 7, pullbackMin: -.10, pullbackMax: -.02, entryType: "limit" },
  { name: "Reversal-confirmed", rsiMax: 10, momentumPercentile: 80, atrMinPct: 2, atrMaxPct: 7, pullbackMin: -.10, pullbackMax: -.02, entryType: "stop" },
  { name: "Deep-pullback", rsiMax: 15, momentumPercentile: 80, atrMinPct: 2.5, atrMaxPct: 8, pullbackMin: -.12, pullbackMax: -.04, entryType: "limit" }
];

export const SWING_MANAGEMENT = [
  { name: "100% at 1.5R", t1R: 1.5, t2R: 2.5, t1ExitPct: 1, afterT1Stop: "initial" },
  { name: "75% at 1.5R / 25% at 2.5R; BE", t1R: 1.5, t2R: 2.5, t1ExitPct: .75, afterT1Stop: "breakeven" },
  { name: "50% at 1.5R / 50% at 2.5R; BE", t1R: 1.5, t2R: 2.5, t1ExitPct: .5, afterT1Stop: "breakeven" },
  { name: "75% at 1.5R / 25% at 2.5R; lock 0.25R", t1R: 1.5, t2R: 2.5, t1ExitPct: .75, afterT1Stop: "lock0.25R" }
];

export function buildTripleConfirmPlan(bars, context, config) {
  if (bars.length < 253 || !context?.momentum) return null;
  const latest = bars.at(-1), closes = bars.map(bar => bar.close);
  const atr = atrAt(bars, 14), atrPct = atr / latest.close * 100;
  const rsi2 = rsiAt(closes, 2);
  const sma50 = smaAt(closes, 50), sma50Past = smaAt(closes, 50, closes.length - 20);
  const high252 = maximum(bars.slice(-252).map(bar => bar.high));
  const pullback3 = latest.close / bars.at(-4).close - 1;
  const low5 = minimum(bars.slice(-5).map(bar => bar.low));
  const avgVolume20 = average(bars.slice(-21, -1).map(bar => bar.volume));
  const volumeRatio = avgVolume20 > 0 ? latest.volume / avgVolume20 : 0;
  const footprint = historicalFootprint(bars.slice(0, -1));
  const pass = footprint?.selected && context.breadth50 >= .50 && context.marketReturn20 >= -.01 &&
    context.momentum.percentile >= config.momentumPercentile && rsi2 <= config.rsiMax &&
    atrPct >= config.atrMinPct && atrPct <= config.atrMaxPct && latest.close >= high252 * .80 &&
    latest.close > sma50 && sma50 > sma50Past && pullback3 >= config.pullbackMin && pullback3 <= config.pullbackMax &&
    volumeRatio <= 1.20 && latest.close >= 20;
  if (!pass) return null;
  const entry = config.entryType === "stop" ? latest.high * 1.001 : latest.close;
  const stopLoss = Math.min(low5 * .998, entry - atr * 1.25);
  const riskPct = (entry - stopLoss) / entry * 100;
  if (!(entry > stopLoss) || riskPct > 8) return null;
  return {
    strategy: "Smart Money Triple-Confirm Swing", variant: config.name, signalDate: latest.date,
    entry, stopLoss, orderType: config.entryType, waitSessions: 2, atrValue: atr,
    rsi2: round(rsi2, 2), atrPct: round(atrPct, 2), momentumPercentile: round(context.momentum.percentile, 1),
    return6mPct: round(context.momentum.return6m * 100, 2), return12mPct: round(context.momentum.return12m * 100, 2),
    highProximityPct: round(latest.close / high252 * 100, 2), volumeRatio: round(volumeRatio),
    footprintScore: footprint.score, breadth50Pct: round(context.breadth50 * 100, 2), marketReturn20Pct: round(context.marketReturn20 * 100, 2), riskPct: round(riskPct, 2)
  };
}
