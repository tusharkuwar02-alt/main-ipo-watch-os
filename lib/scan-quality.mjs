import { evaluateStock, scoreConfluence, SYSTEMS } from "./framework.mjs";

const HORIZONS = [5, 10, 20];

export function backtestStock(stock, bars, niftyBars, context = {}, lookback = 126) {
  const result = Object.fromEntries(SYSTEMS.map(system => [system.id, { samples: 0, wins5d: 0, returns5d: 0, returns10d: 0, returns20d: 0 }]));
  const firstIndex = Math.max(30, bars.length - lookback - Math.max(...HORIZONS));
  for (let index = firstIndex; index < bars.length - Math.max(...HORIZONS); index++) {
    const point = bars[index];
    const evaluation = evaluateStock(stock, bars.slice(0, index + 1), niftyBars, new Date(`${point.date}T13:30:00Z`), { ...context, marketDate: point.date });
    for (const match of evaluation.matches) {
      const row = result[match.id];
      row.samples++;
      for (const horizon of HORIZONS) {
        const forwardReturn = bars[index + horizon].close / point.close - 1;
        row[`returns${horizon}d`] += forwardReturn;
        if (horizon === 5 && forwardReturn > 0) row.wins5d++;
      }
    }
  }
  return result;
}

export function aggregateBacktests(results) {
  const totals = Object.fromEntries(SYSTEMS.map(system => [system.id, { samples: 0, wins5d: 0, returns5d: 0, returns10d: 0, returns20d: 0 }]));
  for (const result of results) for (const [id, values] of Object.entries(result)) {
    for (const key of Object.keys(totals[id])) totals[id][key] += values[key];
  }
  return SYSTEMS.map(system => {
    const row = totals[system.id];
    const samples = row.samples;
    return {
      ...system,
      family: scoreConfluence([{ id: system.id }]).signalFamilies[0],
      performance: samples ? {
        samples,
        winRate5d: +(row.wins5d / samples * 100).toFixed(1),
        avgReturn5d: +(row.returns5d / samples * 100).toFixed(2),
        avgReturn10d: +(row.returns10d / samples * 100).toFixed(2),
        avgReturn20d: +(row.returns20d / samples * 100).toFixed(2)
      } : null
    };
  });
}

export function assessScanQuality(scan, previous = null) {
  const warnings = [];
  if (scan.meta.universeCount < 50) warnings.push("Universe unexpectedly below 50 stocks");
  if (previous?.meta?.universeCount && scan.meta.universeCount < previous.meta.universeCount * 0.75) warnings.push("Universe dropped by more than 25% versus the last successful scan");
  if (scan.meta.historyFailures > Math.max(5, scan.meta.universeCount * 0.1)) warnings.push("More than 10% of price histories failed");
  if (scan.meta.validationFailures > Math.max(10, scan.meta.universeCount * 0.1)) warnings.push("Too many universe validation failures");
  if (!scan.meta.marketDate) warnings.push("Market date is missing");
  if (!scan.stocks.length) warnings.push("No qualifying stocks were produced");
  return { healthy: warnings.length === 0, warnings };
}

