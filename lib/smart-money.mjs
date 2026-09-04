const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
const maximum = values => values.length ? Math.max(...values) : NaN;
const minimum = values => values.length ? Math.min(...values) : NaN;

export function sma(values, length) {
  return values.length >= length ? average(values.slice(-length)) : NaN;
}

export function atr(bars, length = 14) {
  if (bars.length < length + 1) return NaN;
  const ranges = bars.slice(-(length + 1)).slice(1).map((bar, index) => {
    const priorClose = bars.at(-(length + 1))[index]?.close ?? bar.open;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - priorClose), Math.abs(bar.low - priorClose));
  });
  return average(ranges);
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const round = (value, digits = 2) => Number.isFinite(value) ? +value.toFixed(digits) : null;

export function classifyDirection(score, accumulation, distribution, aboveSma21) {
  if (score >= 65) return "Strong Bullish";
  if (score >= 28) return aboveSma21 ? "Bullish" : "Bullish Pullback";
  if (score <= -65) return "Strong Bearish";
  if (score <= -28) return "Bearish";
  if (accumulation >= 58 && accumulation >= distribution + 10) return "Sideways Accumulation";
  if (distribution >= 58 && distribution >= accumulation + 10) return "Sideways Distribution";
  return "Sideways Neutral";
}

export function evaluateSmartMoney(symbol, company, bars, context = {}) {
  if (bars.length < 52) return null;
  const closes = bars.map(bar => bar.close);
  const volumes = bars.map(bar => bar.volume);
  const deliveryValues = bars.map(bar => bar.deliverableValue || 0);
  const latest = bars.at(-1);
  const prior = bars.at(-2);
  const sma21 = sma(closes, 21);
  const sma30 = sma(closes, 30);
  const sma50 = sma(closes, 50);
  const sma21Past = sma(closes.slice(0, -5), 21);
  const sma30Past = sma(closes.slice(0, -5), 30);
  const avgVolume20 = average(volumes.slice(-21, -1));
  const avgDelivery20 = average(deliveryValues.slice(-21, -1));
  const avgTurnover20 = average(bars.slice(-21, -1).map(bar => bar.turnoverCr || 0));
  const currentAtr = atr(bars, 14);
  const priorAtr = atr(bars.slice(0, -10), 14);
  const high20 = maximum(bars.slice(-21, -1).map(bar => bar.high));
  const low10 = minimum(bars.slice(-10).map(bar => bar.low));
  const return20 = latest.close / bars.at(-21).close - 1;
  const return63 = bars.length >= 64 ? latest.close / bars.at(-64).close - 1 : return20;
  const rs20 = return20 - (context.marketReturn20 || 0);
  const closeLocation = latest.high === latest.low ? 0.5 : (latest.close - latest.low) / (latest.high - latest.low);
  const volumeRatio = avgVolume20 > 0 ? latest.volume / avgVolume20 : 0;
  const deliveryRatio = avgDelivery20 > 0 ? latest.deliverableValue / avgDelivery20 : 0;
  const upBars = bars.slice(-20).filter((bar, index, rows) => index && bar.close > rows[index - 1].close);
  const downBars = bars.slice(-20).filter((bar, index, rows) => index && bar.close < rows[index - 1].close);
  const upDownVolume = (average(upBars.map(bar => bar.volume)) || 0) / Math.max(1, average(downBars.map(bar => bar.volume)) || 1);
  const surgeDays = bars.slice(-20).filter((bar, index, rows) => {
    if (!index) return false;
    const location = bar.high === bar.low ? 0.5 : (bar.close - bar.low) / (bar.high - bar.low);
    return bar.close > rows[index - 1].close && bar.volume >= avgVolume20 * 1.4 && location >= 0.65;
  }).length;
  const distributionDays = bars.slice(-20).filter((bar, index, rows) => {
    if (!index) return false;
    const location = bar.high === bar.low ? 0.5 : (bar.close - bar.low) / (bar.high - bar.low);
    return bar.close < rows[index - 1].close && bar.volume >= avgVolume20 * 1.4 && location <= 0.35;
  }).length;
  const range5 = maximum(bars.slice(-5).map(bar => bar.high)) / minimum(bars.slice(-5).map(bar => bar.low)) - 1;
  const range20 = maximum(bars.slice(-20).map(bar => bar.high)) / minimum(bars.slice(-20).map(bar => bar.low)) - 1;
  const contraction = Number.isFinite(priorAtr) && currentAtr < priorAtr * 0.85 && range5 < range20 * 0.55;

  let directionScore = 0;
  directionScore += latest.close > sma21 ? 18 : -18;
  directionScore += sma21 > sma30 ? 14 : -14;
  directionScore += Number.isFinite(sma50) && sma30 > sma50 ? 12 : -8;
  directionScore += sma21 > sma21Past ? 12 : -12;
  directionScore += sma30 > sma30Past ? 8 : -8;
  directionScore += rs20 > 0 ? clamp(rs20 * 250, 4, 16) : clamp(rs20 * 250, -16, -4);
  directionScore += return63 > 0 ? 8 : -8;
  directionScore += context.marketRegime === "Bullish" ? 8 : context.marketRegime === "Bearish" ? -8 : 0;
  directionScore = round(clamp(directionScore, -100, 100), 0);

  let accumulation = 35;
  accumulation += clamp((upDownVolume - 1) * 22, -12, 18);
  accumulation += surgeDays * 7;
  accumulation -= distributionDays * 7;
  accumulation += deliveryRatio >= 1.3 && closeLocation >= 0.65 ? 12 : deliveryRatio >= 1 ? 5 : 0;
  accumulation += contraction ? 8 : 0;
  accumulation += rs20 > 0 ? 8 : -5;
  accumulation = round(clamp(accumulation, 0, 100), 0);

  let distribution = 30 + distributionDays * 10 - surgeDays * 5;
  distribution += deliveryRatio >= 1.3 && closeLocation <= 0.35 ? 18 : 0;
  distribution += latest.close < sma21 && volumeRatio >= 1.3 ? 12 : 0;
  distribution += rs20 < 0 ? 8 : -4;
  distribution = round(clamp(distribution, 0, 100), 0);

  const direction = classifyDirection(directionScore, accumulation, distribution, latest.close >= sma21);
  const evidence = [];
  if (surgeDays) evidence.push(`${surgeDays} institutional-style surge day${surgeDays > 1 ? "s" : ""} in 20 sessions`);
  if (deliveryRatio >= 1.3) evidence.push(`Delivered value ${deliveryRatio.toFixed(2)}× its 20-session average`);
  if (upDownVolume >= 1.15) evidence.push(`Up-day volume is ${upDownVolume.toFixed(2)}× down-day volume`);
  if (contraction) evidence.push("Range and ATR contraction detected");
  if (rs20 > 0) evidence.push(`20-session relative outperformance ${round(rs20 * 100)}%`);
  if (distributionDays) evidence.push(`${distributionDays} distribution warning day${distributionDays > 1 ? "s" : ""}`);
  if (!evidence.length) evidence.push("No strong independent footprint evidence yet");

  const breakout = latest.close > high20 && volumeRatio >= 1.25;
  const pullback = directionScore >= 28 && Math.abs(latest.close / sma21 - 1) <= 0.025;
  const liquid = avgTurnover20 >= 5 && latest.close >= 10;
  const actionable = liquid && accumulation >= 55 && (breakout || pullback || direction === "Sideways Accumulation");
  const entry = breakout ? latest.close : high20 * 1.002;
  const rawStop = Math.max(low10, entry - currentAtr * 1.5);
  const stopLoss = Math.max(0.01, rawStop);
  const risk = Math.max(currentAtr, entry - stopLoss);
  const confidence = accumulation >= 75 && directionScore >= 55 ? "High" : accumulation >= 58 || Math.abs(directionScore) >= 55 ? "Medium" : "Low";
  const setup = breakout ? "Breakout Triggered" : pullback ? "Bullish Pullback" : direction === "Sideways Accumulation" ? "Breakout Watch" : direction.includes("Bearish") ? "Avoid Long" : "Observe";

  return {
    symbol, company, marketDate: latest.date, price: round(latest.close), changePct: round((latest.close / prior.close - 1) * 100),
    direction, directionScore, accumulationScore: accumulation, distributionScore: distribution,
    confidence, setup, actionable, evidence, volumeRatio: round(volumeRatio), deliveryRatio: round(deliveryRatio),
    deliveredValueCr: round(latest.deliverableValue / 1e7), averageTurnoverCr20d: round(avgTurnover20), relativeStrength20d: round(rs20 * 100),
    sma21: round(sma21), sma30: round(sma30), sma50: round(sma50),
    entry: round(entry), stopLoss: round(stopLoss), target1: round(entry + risk * 1.5), target2: round(entry + risk * 2.5),
    hedgeState: "Stock-level institutional hedge linkage is not public",
    confirmation: "Probable — inferred from official cash, volume and delivery data"
  };
}
