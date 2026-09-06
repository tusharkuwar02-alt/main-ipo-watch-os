import { atrAt, smaAt } from "./smart-money-strategy-tournament.mjs";
import { historicalFootprint } from "./quality-momentum-pullback.mjs";
import { rsiAt } from "./smart-money-triple-confirm-swing.mjs";

const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
const maximum = values => values.length ? Math.max(...values) : NaN;
const minimum = values => values.length ? Math.min(...values) : NaN;
const round = (value, digits = 3) => Number.isFinite(value) ? +value.toFixed(digits) : null;

// Frozen before the 2026 holdout is inspected. These are different setup families,
// not small threshold variations of one setup.
export const RR2_FAMILIES = [
  "Deep leader pullback",
  "VCP momentum ignition",
  "Volume-confirmed breakout",
  "Gap continuation",
  "Trend resumption"
];

// Every management variant has a first profit objective of at least 2R.
export const RR2_MANAGEMENT = [
  { name: "100% at 2R", t1R: 2, t2R: 3, t1ExitPct: 1, afterT1Stop: "initial" },
  { name: "75% at 2R / 25% at 3R; BE", t1R: 2, t2R: 3, t1ExitPct: .75, afterT1Stop: "breakeven" },
  { name: "50% at 2R / 50% at 3R; BE", t1R: 2, t2R: 3, t1ExitPct: .5, afterT1Stop: "breakeven" },
  { name: "75% at 2R / 25% at 3R; lock 0.25R", t1R: 2, t2R: 3, t1ExitPct: .75, afterT1Stop: "lock0.25R" },
  { name: "50% at 2R / 50% at 3R; two-day low", t1R: 2, t2R: 3, t1ExitPct: .5, afterT1Stop: "twoDayLow" }
];

export function buildRr2Plans(bars, context) {
  if (bars.length < 253 || !context?.momentum) return [];
  const latest = bars.at(-1), previous = bars.at(-2), closes = bars.map(bar => bar.close);
  const atr = atrAt(bars, 14), atrPast = atrAt(bars, 14, bars.length - 10), atrPct = atr / latest.close * 100;
  const sma21 = smaAt(closes, 21), sma21Past = smaAt(closes, 21, closes.length - 5);
  const sma50 = smaAt(closes, 50), sma50Past = smaAt(closes, 50, closes.length - 20);
  const high252 = maximum(bars.slice(-252).map(bar => bar.high));
  const priorHigh20 = maximum(bars.slice(-21, -1).map(bar => bar.high));
  const priorHigh10 = maximum(bars.slice(-11, -1).map(bar => bar.high));
  const high5 = maximum(bars.slice(-5).map(bar => bar.high));
  const low5 = minimum(bars.slice(-5).map(bar => bar.low));
  const high20 = maximum(bars.slice(-20).map(bar => bar.high));
  const low20 = minimum(bars.slice(-20).map(bar => bar.low));
  const range5 = high5 / low5 - 1, range20 = high20 / low20 - 1;
  const avgVolume20 = average(bars.slice(-21, -1).map(bar => bar.volume));
  const volumeRatio = avgVolume20 > 0 ? latest.volume / avgVolume20 : 0;
  const closeLocation = latest.high === latest.low ? .5 : (latest.close - latest.low) / (latest.high - latest.low);
  const gap = latest.open / previous.close - 1;
  const return10 = latest.close / bars.at(-11).close - 1;
  const return63 = latest.close / bars.at(-64).close - 1;
  const pullback3 = latest.close / bars.at(-4).close - 1;
  const rsi2 = rsiAt(closes, 2);
  const footprint = historicalFootprint(bars.slice(0, -1));
  const common = footprint?.selected && latest.close >= 20 && atrPct >= 2.5 && atrPct <= 8 &&
    latest.close > sma50 && sma50 > sma50Past && latest.close >= high252 * .80 &&
    context.breadth50 >= .50 && context.marketReturn20 >= -.01;
  if (!common) return [];

  const plans = [];
  const add = (family, entry, stopLoss, orderType, waitSessions, details = {}) => {
    const riskPct = (entry - stopLoss) / entry * 100;
    if (!(entry > stopLoss) || riskPct < 1.25 || riskPct > 8) return;
    plans.push({ strategy: "Institutional Fast-Mover RR2", family, signalDate: latest.date, entry, stopLoss,
      orderType, waitSessions, atrValue: atr, riskPct: round(riskPct, 2), atrPct: round(atrPct, 2),
      momentumPercentile: round(context.momentum.percentile, 1), return6mPct: round(context.momentum.return6m * 100, 2),
      return12mPct: round(context.momentum.return12m * 100, 2), footprintScore: footprint.score,
      volumeRatio: round(volumeRatio), breadth50Pct: round(context.breadth50 * 100, 2),
      marketReturn20Pct: round(context.marketReturn20 * 100, 2), ...details });
  };

  if (context.momentum.percentile >= 80 && rsi2 <= 15 && pullback3 >= -.12 && pullback3 <= -.04 && volumeRatio <= 1.2) {
    const entry = latest.close;
    add("Deep leader pullback", entry, Math.min(low5 * .998, entry - atr * 1.25), "limit", 2,
      { rsi2: round(rsi2, 2), trigger: "3-session deep pullback" });
  }

  const contraction = atr < atrPast * .85 && range5 < range20 * .55;
  if (context.momentum.percentile >= 80 && contraction && sma21 > sma50 && sma21 > sma21Past && latest.close <= priorHigh20 * 1.02) {
    const entry = high5 * 1.001;
    add("VCP momentum ignition", entry, Math.max(low5 * .998, entry - atr * 1.6), "stop", 3,
      { trigger: "5/20-day contraction breakout" });
  }

  if (context.momentum.percentile >= 80 && latest.close > priorHigh20 && volumeRatio >= 1.5 && closeLocation >= .65 && sma21 > sma50) {
    const entry = latest.high * 1.001;
    add("Volume-confirmed breakout", entry, Math.max(latest.low * .998, entry - atr * 1.5), "stop", 2,
      { trigger: "20-day high on >=1.5x volume" });
  }

  if (context.momentum.percentile >= 70 && gap >= .02 && gap <= .08 && latest.close > latest.open && closeLocation >= .70 && volumeRatio >= 1.3 && sma21 > sma50) {
    const entry = latest.high * 1.001;
    add("Gap continuation", entry, Math.max(latest.low * .998, entry - atr * 1.6), "stop", 1,
      { gapPct: round(gap * 100, 2), trigger: "2-8% gap with strong close" });
  }

  if (context.momentum.percentile >= 80 && latest.close > priorHigh10 && previous.close <= priorHigh10 &&
      sma21 > sma50 && sma21 > sma21Past && return63 > .08 && return10 > .02 && volumeRatio >= 1.05) {
    const entry = latest.high * 1.001;
    add("Trend resumption", entry, Math.max(low5 * .998, entry - atr * 1.6), "stop", 2,
      { trigger: "10-day trend resumption" });
  }
  return plans;
}
