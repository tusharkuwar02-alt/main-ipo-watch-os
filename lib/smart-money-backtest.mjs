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

export function simulateTwoTargetTrade(bars, signalIndex, plan, options = {}) {
  const waitSessions = options.waitSessions ?? 3;
  const maxHoldSessions = options.maxHoldSessions ?? 5;
  const t1R = options.t1R ?? 1.5;
  const t2R = options.t2R ?? 2;
  const requestedT1ExitPct = options.t1ExitPct ?? 0.5;
  const afterT1Stop = options.afterT1Stop ?? "initial";
  const frictionPct = options.frictionPct ?? 0.003;
  const orderType = options.orderType ?? "stop";
  const plannedRisk = plan.entry - plan.stopLoss;
  if (!(plannedRisk > 0) || !(t2R > t1R) || requestedT1ExitPct < 0 || requestedT1ExitPct > 1) return { status: "invalid" };

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
  if (entryIndex < 0) return { status: "unfilled", unavailableUntil: finalEntryIndex };

  const initialStop = plan.stopLoss;
  const actualRisk = entryPrice - initialStop;
  if (!(actualRisk > 0)) return { status: "invalid", unavailableUntil: entryIndex };
  const runnerEligible = requestedT1ExitPct < 1 && (typeof options.runnerEligible !== "function" || options.runnerEligible({ plan, bars, signalIndex, entryIndex, entryPrice }));
  const t1ExitPct = runnerEligible ? requestedT1ExitPct : 1;
  const t1 = entryPrice + actualRisk * t1R;
  const t2 = entryPrice + actualRisk * t2R;
  const runnerPct = 1 - t1ExitPct;
  const finalExitIndex = Math.min(bars.length - 1, entryIndex + maxHoldSessions - 1);
  let t1Hit = false, t2Hit = false, t1Index = -1, runnerHeldAfterT1 = false, runnerConditionPassed = null;
  let runnerStop = initialStop, highestCompletedClose = entryPrice;
  let exitIndex = finalExitIndex, runnerExitPrice = bars[finalExitIndex].close, exitReason = "Time Exit";

  const stopForSession = index => {
    if (!t1Hit || index <= t1Index) return initialStop;
    if (afterT1Stop === "breakeven") return Math.max(initialStop, entryPrice);
    if (afterT1Stop === "lock0.25R") return Math.max(initialStop, entryPrice + actualRisk * 0.25);
    if (afterT1Stop === "twoDayLow") {
      const completed = bars.slice(Math.max(entryIndex, index - 2), index).map(bar => bar.low);
      return Math.max(initialStop, completed.length ? Math.min(...completed) : initialStop);
    }
    if (afterT1Stop === "atr1" || afterT1Stop === "atr1.5") {
      const multiple = afterT1Stop === "atr1" ? 1 : 1.5;
      const atrAtEntry = actualRisk / 1.5;
      return Math.max(initialStop, highestCompletedClose - atrAtEntry * multiple);
    }
    return initialStop;
  };

  for (let index = entryIndex; index <= finalExitIndex; index++) {
    const bar = bars[index];
    runnerStop = stopForSession(index);
    if (!t1Hit) {
      if (index > entryIndex && bar.open <= initialStop) {
        exitIndex = index; runnerExitPrice = bar.open; exitReason = "Gap Initial Stop"; break;
      }
      if (index > entryIndex && bar.open >= t1) {
        t1Hit = true; t1Index = index;
        if (t1ExitPct === 1) { exitIndex = index; runnerExitPrice = bar.open; exitReason = "Gap T1"; break; }
        if (bar.open >= t2) { t2Hit = true; exitIndex = index; runnerExitPrice = bar.open; exitReason = "Gap T2"; break; }
        const stopHitAfterGapT1 = bar.low <= initialStop;
        const t2HitAfterGapT1 = bar.high >= t2;
        if (stopHitAfterGapT1) { exitIndex = index; runnerExitPrice = initialStop; exitReason = "Runner Initial Stop (T1 Gap Day)"; break; }
        if (t2HitAfterGapT1) { t2Hit = true; exitIndex = index; runnerExitPrice = t2; exitReason = "T2"; break; }
      } else {
        const stopHit = bar.low <= initialStop;
        const firstTargetHit = bar.high >= t1;
        if (stopHit && firstTargetHit) {
          exitIndex = index; runnerExitPrice = initialStop; exitReason = "Initial Stop (Same Bar)"; break;
        }
        if (stopHit) { exitIndex = index; runnerExitPrice = initialStop; exitReason = "Initial Stop"; break; }
        if (firstTargetHit) {
          t1Hit = true; t1Index = index;
          if (t1ExitPct === 1) { exitIndex = index; runnerExitPrice = t1; exitReason = "T1"; break; }
          if (bar.high >= t2) { t2Hit = true; exitIndex = index; runnerExitPrice = t2; exitReason = "T2"; break; }
        }
      }
    } else {
      if (bar.open <= runnerStop) { exitIndex = index; runnerExitPrice = bar.open; exitReason = "Gap Runner Stop"; break; }
      if (bar.open >= t2) { t2Hit = true; exitIndex = index; runnerExitPrice = bar.open; exitReason = "Gap T2"; break; }
      const stopHit = bar.low <= runnerStop;
      const secondTargetHit = bar.high >= t2;
      if (stopHit && secondTargetHit) { exitIndex = index; runnerExitPrice = runnerStop; exitReason = "Runner Stop (Same Bar)"; break; }
      if (stopHit) { exitIndex = index; runnerExitPrice = runnerStop; exitReason = "Runner Stop"; break; }
      if (secondTargetHit) { t2Hit = true; exitIndex = index; runnerExitPrice = t2; exitReason = "T2"; break; }
    }
    if (t1Hit && index === t1Index && runnerPct > 0) {
      const prior = bars.slice(Math.max(0, index - 20), index);
      const averagePriorVolume = prior.length ? prior.reduce((sum, item) => sum + (item.volume || 0), 0) / prior.length : 0;
      const context = { bar, bars, index, entryIndex, entryPrice, initialStop, actualRisk, t1, t2, plan, averagePriorVolume };
      runnerConditionPassed = typeof options.runnerCondition !== "function" || options.runnerCondition(context);
      if (!runnerConditionPassed) {
        exitIndex = index; runnerExitPrice = bar.close; exitReason = "Runner Condition Exit"; break;
      }
      runnerHeldAfterT1 = true;
    }
    highestCompletedClose = Math.max(highestCompletedClose, bar.close);
  }

  const runnerGrossR = (runnerExitPrice - entryPrice) / actualRisk;
  const grossR = t1Hit ? t1ExitPct * t1R + runnerPct * runnerGrossR : runnerGrossR;
  const netR = grossR - (entryPrice * frictionPct) / actualRisk;
  const grossReturnPct = grossR * actualRisk / entryPrice * 100;
  const netReturnPct = grossReturnPct - frictionPct * 100;
  const weightedExitPrice = entryPrice + grossR * actualRisk;
  return {
    status: "entered", entryIndex, exitIndex, unavailableUntil: exitIndex,
    entryDate: bars[entryIndex].date, exitDate: bars[exitIndex].date,
    entryPrice: round(entryPrice, 2), exitPrice: round(weightedExitPrice, 2), runnerExitPrice: round(runnerExitPrice, 2),
    stop: round(initialStop, 2), t1: round(t1, 2), t2: round(t2, 2), t1ExitPct, requestedT1ExitPct,
    afterT1Stop, exitReason, holdSessions: exitIndex - entryIndex + 1,
    grossReturnPct: round(grossReturnPct), netReturnPct: round(netReturnPct), grossR: round(grossR), netR: round(netR),
    t1Hit, t2Hit, runnerEligible, runnerConditionPassed, runnerHeldAfterT1, targetHit: t2Hit, profitable: netR > 0
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
  const averageWinR = wins.length ? wins.reduce((sum, trade) => sum + trade.netR, 0) / wins.length : 0;
  const averageLossR = losses.length ? losses.reduce((sum, trade) => sum + trade.netR, 0) / losses.length : 0;
  return {
    trades: entered.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: round(entered.length ? wins.length / entered.length * 100 : 0, 2),
    targetHitRatePct: round(entered.length ? entered.filter(t => t.targetHit).length / entered.length * 100 : 0, 2),
    t1HitRatePct: round(entered.length ? entered.filter(t => t.t1Hit).length / entered.length * 100 : 0, 2),
    t2HitRatePct: round(entered.length ? entered.filter(t => t.t2Hit).length / entered.length * 100 : 0, 2),
    runnerEligibleRatePct: round(entered.length ? entered.filter(t => t.runnerEligible).length / entered.length * 100 : 0, 2),
    runnerHeldRatePct: round(entered.length ? entered.filter(t => t.runnerHeldAfterT1).length / entered.length * 100 : 0, 2),
    stopRatePct: round(entered.length ? entered.filter(t => t.exitReason.includes("Stop")).length / entered.length * 100 : 0, 2),
    timeExitRatePct: round(entered.length ? entered.filter(t => t.exitReason === "Time Exit").length / entered.length * 100 : 0, 2),
    expectancyR: round(average("netR")),
    averageWinR: round(averageWinR),
    averageLossR: round(averageLossR),
    realizedPayoffRatio: averageLossR ? round(averageWinR / Math.abs(averageLossR)) : null,
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
