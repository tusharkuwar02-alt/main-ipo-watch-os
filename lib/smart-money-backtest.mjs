const round = (value, digits = 3) => Number.isFinite(value) ? +value.toFixed(digits) : null;

export function looksLikeCorporateAction(previous, current) {
  if (!previous || !current || previous.close <= 0) return false;
  const ratio = current.open / previous.close;
  const extremeGap = ratio >= 1.45 || ratio <= 0.69;
  const ordinarySessionRange = current.low > 0 && current.high / current.low - 1 < 0.18;
  return extremeGap && ordinarySessionRange;
}

export function simulateLongTrade(bars, signalIndex, plan, options = {}) {
  const waitSessions = options.waitSessions ?? 3;
  const maxHoldSessions = options.maxHoldSessions ?? 5;
  const targetR = options.targetR ?? 1.5;
  const frictionPct = options.frictionPct ?? 0.003;
  const orderType = options.orderType ?? "stop";
  const plannedRisk = plan.entry - plan.stopLoss;
  if (!(plannedRisk > 0)) return { status: "invalid" };

  let entryIndex = -1;
  let entryPrice = 0;
  const finalEntryIndex = Math.min(bars.length - 1, signalIndex + waitSessions);
  for (let index = signalIndex + 1; index <= finalEntryIndex; index++) {
    const bar = bars[index];
    const filled = orderType === "limit" ? bar.low <= plan.entry : bar.high >= plan.entry;
    if (filled) {
      entryIndex = index;
      entryPrice = orderType === "limit"
        ? (bar.open <= plan.entry ? bar.open : plan.entry)
        : (bar.open >= plan.entry ? bar.open : plan.entry);
      break;
    }
  }
  if (entryIndex < 0) {
    return { status: "unfilled", unavailableUntil: finalEntryIndex };
  }

  const stop = plan.stopLoss;
  const actualRisk = entryPrice - stop;
  if (!(actualRisk > 0)) return { status: "invalid", unavailableUntil: entryIndex };
  const target = entryPrice + actualRisk * targetR;
  const finalExitIndex = Math.min(bars.length - 1, entryIndex + maxHoldSessions - 1);
  let exitIndex = finalExitIndex;
  let exitPrice = bars[finalExitIndex].close;
  let exitReason = "Time Exit";

  for (let index = entryIndex; index <= finalExitIndex; index++) {
    const bar = bars[index];
    if (index > entryIndex && bar.open <= stop) {
      exitIndex = index; exitPrice = bar.open; exitReason = "Gap Stop"; break;
    }
    if (index > entryIndex && bar.open >= target) {
      exitIndex = index; exitPrice = bar.open; exitReason = "Gap Target"; break;
    }
    const stopHit = bar.low <= stop;
    const targetHit = bar.high >= target;
    if (stopHit && targetHit) {
      exitIndex = index; exitPrice = stop; exitReason = "Stop (Same Bar)"; break;
    }
    if (stopHit) {
      exitIndex = index; exitPrice = stop; exitReason = "Stop"; break;
    }
    if (targetHit) {
      exitIndex = index; exitPrice = target; exitReason = "Target"; break;
    }
  }

  const grossReturnPct = (exitPrice / entryPrice - 1) * 100;
  const netReturnPct = grossReturnPct - frictionPct * 100;
  const grossR = (exitPrice - entryPrice) / actualRisk;
  const netR = grossR - (entryPrice * frictionPct) / actualRisk;
  return {
    status: "entered", entryIndex, exitIndex, unavailableUntil: exitIndex,
    entryDate: bars[entryIndex].date, exitDate: bars[exitIndex].date,
    entryPrice: round(entryPrice, 2), exitPrice: round(exitPrice, 2), stop: round(stop, 2), target: round(target, 2),
    exitReason, holdSessions: exitIndex - entryIndex + 1,
    grossReturnPct: round(grossReturnPct), netReturnPct: round(netReturnPct), grossR: round(grossR), netR: round(netR),
    targetHit: exitReason.includes("Target"), profitable: netR > 0
  };
}

export function summarizeTrades(trades) {
  const entered = trades.filter(trade => trade.status === "entered");
  const wins = entered.filter(trade => trade.netR > 0);
  const losses = entered.filter(trade => trade.netR <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netR, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netR, 0));
  const ordered = [...entered].sort((a, b) => a.exitDate.localeCompare(b.exitDate) || a.symbol.localeCompare(b.symbol));
  let equity = 0, peak = 0, maxDrawdown = 0, losingStreak = 0, maxLosingStreak = 0;
  for (const trade of ordered) {
    equity += trade.netR;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    losingStreak = trade.netR <= 0 ? losingStreak + 1 : 0;
    maxLosingStreak = Math.max(maxLosingStreak, losingStreak);
  }
  const average = key => entered.length ? entered.reduce((sum, trade) => sum + trade[key], 0) / entered.length : 0;
  return {
    trades: entered.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: round(entered.length ? wins.length / entered.length * 100 : 0, 2),
    targetHitRatePct: round(entered.length ? entered.filter(t => t.targetHit).length / entered.length * 100 : 0, 2),
    stopRatePct: round(entered.length ? entered.filter(t => t.exitReason.includes("Stop")).length / entered.length * 100 : 0, 2),
    timeExitRatePct: round(entered.length ? entered.filter(t => t.exitReason === "Time Exit").length / entered.length * 100 : 0, 2),
    expectancyR: round(average("netR")),
    averageNetReturnPct: round(average("netReturnPct")),
    profitFactor: grossLoss ? round(grossProfit / grossLoss) : null,
    averageHoldSessions: round(average("holdSessions"), 2),
    maxDrawdownRTradeSequence: round(maxDrawdown),
    maxConsecutiveLosses: maxLosingStreak
  };
}

export function groupSummary(trades, key) {
  const groups = new Map();
  for (const trade of trades.filter(row => row.status === "entered")) {
    const value = typeof key === "function" ? key(trade) : trade[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(trade);
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([name, rows]) => [name, summarizeTrades(rows)]));
}
