const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
const maximum = values => values.length ? Math.max(...values) : NaN;
const minimum = values => values.length ? Math.min(...values) : NaN;
const round = (value, digits = 3) => Number.isFinite(value) ? +value.toFixed(digits) : null;

export function smaAt(values, length, end = values.length) {
  return end >= length ? average(values.slice(end - length, end)) : NaN;
}

export function atrAt(bars, length = 14, end = bars.length) {
  if (end < length + 1) return NaN;
  const start = end - length;
  const ranges = [];
  for (let index = start; index < end; index++) {
    const bar = bars[index];
    const previousClose = bars[index - 1]?.close ?? bar.open;
    ranges.push(Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose)));
  }
  return average(ranges);
}

export function footprintMetrics(bars) {
  if (bars.length < 64) return null;
  const latest = bars.at(-1);
  const prior20 = bars.slice(-21, -1);
  const recent20 = bars.slice(-20);
  const avgVolume20 = average(prior20.map(bar => bar.volume));
  const avgDelivery20 = average(prior20.map(bar => bar.deliverableValue || 0));
  const avgTurnover20 = average(prior20.map(bar => bar.turnoverCr || 0));
  const deliveryRatio = avgDelivery20 > 0 ? (latest.deliverableValue || 0) / avgDelivery20 : 0;
  const volumeRatio = avgVolume20 > 0 ? latest.volume / avgVolume20 : 0;
  const closeLocation = latest.high === latest.low ? .5 : (latest.close - latest.low) / (latest.high - latest.low);
  const upBars = recent20.filter((bar, index) => index && bar.close > recent20[index - 1].close);
  const downBars = recent20.filter((bar, index) => index && bar.close < recent20[index - 1].close);
  const upVolume = average(upBars.map(bar => bar.volume)) || 0;
  const downVolume = average(downBars.map(bar => bar.volume)) || 1;
  const upDownVolume = upVolume / Math.max(1, downVolume);
  const surgeDays = recent20.filter((bar, index) => {
    if (!index) return false;
    const location = bar.high === bar.low ? .5 : (bar.close - bar.low) / (bar.high - bar.low);
    return bar.close > recent20[index - 1].close && bar.volume >= avgVolume20 * 1.4 && location >= .65;
  }).length;
  const distributionDays = recent20.filter((bar, index) => {
    if (!index) return false;
    const location = bar.high === bar.low ? .5 : (bar.close - bar.low) / (bar.high - bar.low);
    return bar.close < recent20[index - 1].close && bar.volume >= avgVolume20 * 1.4 && location <= .35;
  }).length;
  const deliveredRecent5 = average(bars.slice(-5).map(bar => bar.deliverableValue || 0));
  const deliveredPrior15 = average(bars.slice(-20, -5).map(bar => bar.deliverableValue || 0));
  const deliveredTrend = deliveredPrior15 > 0 ? deliveredRecent5 / deliveredPrior15 : 0;

  let score = 0;
  score += upDownVolume >= 1.3 ? 30 : upDownVolume >= 1.1 ? 22 : upDownVolume >= 1 ? 10 : 0;
  score += surgeDays >= 2 ? 28 : surgeDays === 1 ? 18 : 0;
  score += deliveryRatio >= 1.4 ? 25 : deliveryRatio >= 1.15 ? 18 : deliveryRatio >= 1 ? 8 : 0;
  score += deliveredTrend >= 1.2 ? 12 : deliveredTrend >= 1.05 ? 6 : 0;
  score += closeLocation >= .6 ? 5 : 0;
  score -= distributionDays * 8;
  score = Math.max(0, Math.min(100, score));
  const selected = avgTurnover20 >= 10 && latest.close >= 20 && score >= 50 && distributionDays <= 3 && (surgeDays >= 1 || deliveryRatio >= 1.15);
  return { selected, score: round(score, 1), avgTurnover20: round(avgTurnover20), deliveryRatio: round(deliveryRatio), volumeRatio: round(volumeRatio), upDownVolume: round(upDownVolume), surgeDays, distributionDays, deliveredTrend: round(deliveredTrend), closeLocation: round(closeLocation) };
}

export function buildStrategyPlans(bars, context = {}) {
  if (bars.length < 64) return [];
  const latest = bars.at(-1);
  const previous = bars.at(-2);
  const closes = bars.map(bar => bar.close);
  const a = atrAt(bars, 14);
  const priorAtr = atrAt(bars, 14, bars.length - 10);
  const sma20 = smaAt(closes, 20);
  const priorSma20 = smaAt(closes, 20, closes.length - 1);
  const sma21 = smaAt(closes, 21);
  const sma21Past = smaAt(closes, 21, closes.length - 5);
  const sma50 = smaAt(closes, 50);
  const sma50Past = smaAt(closes, 50, closes.length - 5);
  const priorHigh20 = maximum(bars.slice(-21, -1).map(bar => bar.high));
  const priorHigh10 = maximum(bars.slice(-11, -1).map(bar => bar.high));
  const recentHigh5 = maximum(bars.slice(-5).map(bar => bar.high));
  const recentLow5 = minimum(bars.slice(-5).map(bar => bar.low));
  const range5 = recentHigh5 / recentLow5 - 1;
  const range20 = maximum(bars.slice(-20).map(bar => bar.high)) / minimum(bars.slice(-20).map(bar => bar.low)) - 1;
  const volumeAverage20 = average(bars.slice(-21, -1).map(bar => bar.volume));
  const volumeRatio = volumeAverage20 > 0 ? latest.volume / volumeAverage20 : 0;
  const closeLocation = latest.high === latest.low ? .5 : (latest.close - latest.low) / (latest.high - latest.low);
  const return10 = latest.close / bars.at(-11).close - 1;
  const return63 = latest.close / bars.at(-64).close - 1;
  const gap = latest.open / previous.close - 1;
  const rsRankPct = context.rsRankPct ?? 0;
  const plans = [];
  const add = (strategy, entry, stopLoss, orderType = "stop", waitSessions = 2, details = {}) => {
    if (![entry, stopLoss, a].every(Number.isFinite) || entry <= stopLoss || (entry - stopLoss) / entry > .10) return;
    plans.push({ strategy, entry, stopLoss, orderType, waitSessions, atrValue: a, signalDate: latest.date, ...details });
  };

  const contraction = a < priorAtr * .85 && range5 < range20 * .55;
  if (contraction && latest.close > sma50 && sma21 > sma50 && sma21 > sma21Past && latest.close <= priorHigh20 * 1.02) {
    const entry = recentHigh5 * 1.002;
    add("VCP / Contraction breakout", entry, Math.max(recentLow5 * .998, entry - a * 1.75), "stop", 3, { trigger: "5-day contraction high" });
  }

  if (rsRankPct >= 85 && latest.close > priorHigh20 && sma21 > sma50 && sma21 > sma21Past) {
    const entry = latest.high * 1.002;
    add("Relative-strength leader breakout", entry, Math.max(minimum(bars.slice(-5).map(bar => bar.low)) * .998, entry - a * 1.75), "stop", 2, { trigger: `RS percentile ${round(rsRankPct, 1)}` });
  }

  if (latest.close > priorHigh20 && volumeRatio >= 1.5 && closeLocation >= .65 && latest.close > sma21) {
    const entry = latest.high * 1.002;
    add("Breakout + volume confirmation", entry, Math.max(latest.low * .998, entry - a * 1.75), "stop", 2, { trigger: `Volume ${round(volumeRatio, 2)}x` });
  }

  const pullbackFromHigh = latest.close / maximum(bars.slice(-6, -1).map(bar => bar.high)) - 1;
  const nearSma21 = latest.low <= sma21 * 1.015 && latest.close >= sma21 * .99 && latest.close <= sma21 * 1.035;
  if (return10 >= .08 && pullbackFromHigh <= -.015 && pullbackFromHigh >= -.10 && nearSma21 && sma21 > sma50 && sma21 > sma21Past && latest.close >= latest.open) {
    const entry = latest.high * 1.002;
    add("Momentum pullback", entry, Math.min(latest.low * .998, entry - a * 1.35), "stop", 2, { trigger: `10-day return ${round(return10 * 100, 1)}%` });
  }

  if (gap >= .02 && gap <= .08 && latest.close > latest.open && closeLocation >= .70 && volumeRatio >= 1.3 && latest.close > sma21) {
    const entry = latest.high * 1.002;
    add("Gap-up continuation", entry, Math.max(latest.low * .998, entry - a * 2), "stop", 1, { trigger: `Gap ${round(gap * 100, 1)}%` });
  }

  const trendResume = latest.close > priorHigh10 && sma21 > sma50 && sma21 > sma21Past && sma50 > sma50Past && return63 > .08 && rsRankPct >= 60;
  if (trendResume && previous.close <= priorHigh10) {
    const referenceEntry = latest.close;
    add("Trend-following ATR trail", referenceEntry, Math.max(minimum(bars.slice(-10).map(bar => bar.low)) * .998, referenceEntry - a * 2), "market", 1, { trigger: "10-day trend resumption" });
  }
  return plans;
}

export function simulateTournamentTrade(bars, signalIndex, plan, exit, options = {}) {
  const frictionPct = options.frictionPct ?? .003;
  const maxHoldSessions = options.maxHoldSessions ?? 5;
  const finalEntryIndex = Math.min(bars.length - 1, signalIndex + plan.waitSessions);
  let entryIndex = -1;
  let entryPrice = 0;
  for (let index = signalIndex + 1; index <= finalEntryIndex; index++) {
    const bar = bars[index];
    const filled = plan.orderType === "market" || (plan.orderType === "limit" ? bar.low <= plan.entry : bar.high >= plan.entry);
    if (!filled) continue;
    entryIndex = index;
    entryPrice = plan.orderType === "market" ? bar.open : plan.orderType === "limit" ? (bar.open <= plan.entry ? bar.open : plan.entry) : (bar.open >= plan.entry ? bar.open : plan.entry);
    break;
  }
  if (entryIndex < 0) return { status: "unfilled", unavailableUntil: finalEntryIndex };
  const initialStop = plan.stopLoss;
  const risk = entryPrice - initialStop;
  if (!(risk > 0)) return { status: "invalid", unavailableUntil: entryIndex };

  const isTrail = exit.type === "trail";
  const targetR = isTrail ? 1.5 : exit.targetR;
  const target = entryPrice + risk * targetR;
  const finalExitIndex = Math.min(bars.length - 1, entryIndex + maxHoldSessions - 1);
  let exitIndex = finalExitIndex;
  let exitPrice = bars[finalExitIndex].close;
  let exitReason = "Time Exit";
  let activationHit = false;
  let trailArmed = false;
  let highestCompletedClose = entryPrice;

  for (let index = entryIndex; index <= finalExitIndex; index++) {
    const bar = bars[index];
    const activeStop = trailArmed ? Math.max(initialStop, entryPrice, highestCompletedClose - plan.atrValue * (exit.trailAtr ?? 1.5)) : initialStop;
    if (index > entryIndex && bar.open <= activeStop) { exitIndex = index; exitPrice = bar.open; exitReason = trailArmed ? "Gap ATR Trail" : "Gap Stop"; break; }
    if (!isTrail && index > entryIndex && bar.open >= target) { exitIndex = index; exitPrice = bar.open; exitReason = "Gap Target"; activationHit = true; break; }
    const stopHit = bar.low <= activeStop;
    const thresholdHit = bar.high >= target;
    const newlyActivatesTrail = isTrail && !activationHit && thresholdHit;
    if (stopHit && (!isTrail ? thresholdHit : newlyActivatesTrail)) { exitIndex = index; exitPrice = activeStop; exitReason = trailArmed ? "ATR Trail (Same Bar)" : "Stop (Same Bar)"; break; }
    if (stopHit) { exitIndex = index; exitPrice = activeStop; exitReason = trailArmed ? "ATR Trail" : "Stop"; break; }
    if (!isTrail && thresholdHit) { exitIndex = index; exitPrice = target; exitReason = "Target"; activationHit = true; break; }
    if (isTrail && thresholdHit) activationHit = true;
    highestCompletedClose = Math.max(highestCompletedClose, bar.close);
    if (isTrail && activationHit) trailArmed = true;
  }

  const grossR = (exitPrice - entryPrice) / risk;
  const netR = grossR - entryPrice * frictionPct / risk;
  const grossReturnPct = (exitPrice / entryPrice - 1) * 100;
  const netReturnPct = grossReturnPct - frictionPct * 100;
  return {
    status: "entered", entryIndex, exitIndex, unavailableUntil: exitIndex,
    entryDate: bars[entryIndex].date, exitDate: bars[exitIndex].date,
    entryPrice: round(entryPrice, 2), exitPrice: round(exitPrice, 2), stop: round(initialStop, 2), target: round(target, 2),
    exitReason, holdSessions: exitIndex - entryIndex + 1, grossR: round(grossR), netR: round(netR),
    grossReturnPct: round(grossReturnPct), netReturnPct: round(netReturnPct), targetHit: activationHit,
    profitable: netR > 0, exitName: exit.name
  };
}

export function summarizeTournamentTrades(trades) {
  const entered = trades.filter(trade => trade.status === "entered");
  const wins = entered.filter(trade => trade.netR > 0);
  const losses = entered.filter(trade => trade.netR <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netR, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netR, 0));
  const ordered = [...entered].sort((a, b) => a.exitDate.localeCompare(b.exitDate) || a.symbol.localeCompare(b.symbol));
  let equity = 0, peak = 0, maxDrawdown = 0, losingStreak = 0, maxLosingStreak = 0;
  for (const trade of ordered) {
    equity += trade.netR; peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak - equity);
    losingStreak = trade.netR <= 0 ? losingStreak + 1 : 0; maxLosingStreak = Math.max(maxLosingStreak, losingStreak);
  }
  const mean = key => entered.length ? average(entered.map(trade => trade[key])) : 0;
  const averageWinR = wins.length ? average(wins.map(trade => trade.netR)) : 0;
  const averageLossR = losses.length ? average(losses.map(trade => trade.netR)) : 0;
  return {
    trades: entered.length, wins: wins.length, losses: losses.length,
    winRatePct: round(entered.length ? wins.length / entered.length * 100 : 0, 2),
    targetHitRatePct: round(entered.length ? entered.filter(trade => trade.targetHit).length / entered.length * 100 : 0, 2),
    expectancyR: round(mean("netR")), profitFactor: grossLoss ? round(grossProfit / grossLoss) : null,
    averageWinR: round(averageWinR), averageLossR: round(averageLossR), realizedPayoffRatio: averageLossR ? round(averageWinR / Math.abs(averageLossR)) : null,
    averageNetReturnPct: round(mean("netReturnPct")), averageHoldSessions: round(mean("holdSessions"), 2),
    maxDrawdownRTradeSequence: round(maxDrawdown), maxConsecutiveLosses: maxLosingStreak
  };
}

export function wilsonLower(wins, total, z = 1.96) {
  if (!total) return 0;
  const p = wins / total; const denominator = 1 + z * z / total;
  return round((p + z * z / (2 * total) - z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)) / denominator * 100, 2);
}
