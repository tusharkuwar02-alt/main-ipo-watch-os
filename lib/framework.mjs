export const SYSTEMS = [
  ["daily-sma21", "Daily SMA 21 Proximity"],
  ["daily-sma30", "Daily SMA 30 Proximity"],
  ["weekly-sma21", "Weekly SMA 21 Proximity"],
  ["weekly-sma30", "Weekly SMA 30 Proximity"],
  ["daily-breakout", "Daily Breakout"],
  ["weekly-51", "Weekly 51-Period High Breakout"],
  ["ath", "All-Time High Test / Breakout"],
  ["listing-high", "Listing High Breakout"],
  ["high-5d", "5-Day High Breakout"],
  ["high-10d", "10-Day High Breakout"],
  ["high-20d", "20-Day High Breakout"],
  ["ipo-base", "IPO Base (≤12% Depth)"],
  ["issue-price", "Issue Price Reclaim / Hold"],
  ["volume-expansion", "Volume Expansion"],
  ["rs-nifty", "Relative Strength vs NIFTY"],
  ["rs-new-high", "Relative Strength New High"],
  ["volume-dry-up", "Volume Dry-Up Pullback"],
  ["pocket-pivot", "Pocket Pivot / High-Volume Up Day"],
  ["tight-close", "Tight Close / VCP Contraction"],
  ["gap-up-hold", "Gap-Up + Hold"]
].map(([id, name]) => ({ id, name }));

export const SYSTEM_NAME = Object.fromEntries(SYSTEMS.map(s => [s.id, s.name]));
export const SMA_TOLERANCE = 0.02;
export const IPO_BASE_MAX_DEPTH = 0.12;

const avg = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
const pct = value => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const max = values => Math.max(...values.filter(Number.isFinite));
const min = values => Math.min(...values.filter(Number.isFinite));

export function sma(values, length) {
  return values.length >= length ? avg(values.slice(-length)) : NaN;
}

function startOfWeek(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

export function toWeekly(bars) {
  const groups = new Map();
  for (const bar of bars) {
    const key = startOfWeek(bar.date);
    const row = groups.get(key);
    if (!row) groups.set(key, { ...bar, date: key });
    else {
      row.high = Math.max(row.high, bar.high);
      row.low = Math.min(row.low, bar.low);
      row.close = bar.close;
      row.volume += bar.volume;
    }
  }
  return [...groups.values()];
}

function add(matches, id, reason, extra = {}) {
  matches.push({ id, name: SYSTEM_NAME[id], reason, ...extra });
}

export function evaluateStock(stock, bars, niftyBars, asOf = new Date()) {
  if (bars.length < 31) return { matches: [], diagnostics: { error: "insufficient-history" } };
  const closes = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);
  const latest = bars.at(-1);
  const prior = bars.at(-2);
  const matches = [];
  const dailySma21 = sma(closes, 21);
  const dailySma30 = sma(closes, 30);
  const dailySma21Prev = sma(closes.slice(0, -1), 21);
  const dailySma30Prev = sma(closes.slice(0, -1), 30);
  const weekly = toWeekly(bars);
  const weeklyCloses = weekly.map(b => b.close);

  for (const [id, value, prevValue] of [
    ["daily-sma21", dailySma21, dailySma21Prev],
    ["daily-sma30", dailySma30, dailySma30Prev]
  ]) {
    const distance = latest.close / value - 1;
    if (Math.abs(distance) <= SMA_TOLERANCE) add(matches, id, `Price ${distance >= 0 ? "above" : "below"} SMA by ${Math.abs(distance * 100).toFixed(2)}%`, {
      distancePct: +(distance * 100).toFixed(2), smaDirection: value > prevValue ? "Rising" : value < prevValue ? "Falling" : "Flat"
    });
  }

  for (const [id, length] of [["weekly-sma21", 21], ["weekly-sma30", 30]]) {
    const value = sma(weeklyCloses, length);
    const previous = sma(weeklyCloses.slice(0, -1), length);
    if (Number.isFinite(value)) {
      const distance = latest.close / value - 1;
      if (Math.abs(distance) <= SMA_TOLERANCE) add(matches, id, `Price ${distance >= 0 ? "above" : "below"} weekly SMA by ${Math.abs(distance * 100).toFixed(2)}%`, {
        distancePct: +(distance * 100).toFixed(2), smaDirection: value > previous ? "Rising" : value < previous ? "Falling" : "Flat"
      });
    }
  }

  const avgVol20 = avg(volumes.slice(-21, -1));
  const previous20High = max(bars.slice(-21, -1).map(b => b.high));
  if (latest.close > previous20High && latest.volume >= avgVol20 * 1.25)
    add(matches, "daily-breakout", `Close broke 20-day high with ${(latest.volume / avgVol20).toFixed(2)}× volume`);

  if (weekly.length >= 52) {
    const currentWeek = weekly.at(-1);
    const prior51 = max(weekly.slice(-52, -1).map(b => b.high));
    const currentWeekStart = startOfWeek(asOf.toISOString().slice(0, 10));
    const inProgress = currentWeek.date === currentWeekStart && ![0, 6].includes(asOf.getUTCDay());
    if (currentWeek.close > prior51) add(matches, "weekly-51", inProgress ? "51-week breakout — week in progress" : "51-week breakout — confirmed completed week", { weeklyStatus: inProgress ? "week-in-progress" : "confirmed" });
  }

  const priorAth = max(bars.slice(0, -1).map(b => b.high));
  const athDistance = latest.close / priorAth - 1;
  if (athDistance >= -0.02) add(matches, "ath", athDistance > 0 ? `Close broke prior ATH by ${pct(athDistance)}` : `Close is ${Math.abs(athDistance * 100).toFixed(2)}% below ATH`);
  if (latest.close > bars[0].high) add(matches, "listing-high", `Close ₹${latest.close.toFixed(2)} is above listing-day high ₹${bars[0].high.toFixed(2)}`);

  for (const [id, days] of [["high-5d", 5], ["high-10d", 10], ["high-20d", 20]]) {
    const level = max(bars.slice(-(days + 1), -1).map(b => b.high));
    if (latest.close > level) add(matches, id, `Close broke prior ${days}-day high ₹${level.toFixed(2)}`);
  }

  const baseWindow = bars.slice(-41, -1);
  if (baseWindow.length >= 15) {
    const baseHigh = max(baseWindow.map(b => b.high));
    const baseLow = min(baseWindow.map(b => b.low));
    const depth = 1 - baseLow / baseHigh;
    if (depth <= IPO_BASE_MAX_DEPTH && latest.close >= baseHigh * 0.98)
      add(matches, "ipo-base", `Base depth ${(depth * 100).toFixed(2)}% (maximum 12%); price within 2% of base high`, { baseDepthPct: +(depth * 100).toFixed(2) });
  }

  if (stock.issuePrice > 0 && latest.close >= stock.issuePrice && (prior.close < stock.issuePrice || bars.slice(-3).every(b => b.close >= stock.issuePrice)))
    add(matches, "issue-price", `Issue price ₹${stock.issuePrice.toFixed(2)} reclaimed/held`);
  if (latest.close > prior.close && latest.volume >= avgVol20 * 1.5)
    add(matches, "volume-expansion", `Up day on ${(latest.volume / avgVol20).toFixed(2)}× 20-day average volume`);

  const niftyByDate = new Map(niftyBars.map(b => [b.date, b.close]));
  const aligned = bars.filter(b => niftyByDate.has(b.date));
  if (aligned.length >= 64) {
    const first = aligned.at(-64);
    const stockReturn = latest.close / first.close - 1;
    const niftyReturn = niftyByDate.get(latest.date) / niftyByDate.get(first.date) - 1;
    if (stockReturn > niftyReturn) add(matches, "rs-nifty", `63-day return ${pct(stockReturn)} vs NIFTY ${pct(niftyReturn)}`, { relativeOutperformancePct: +((stockReturn - niftyReturn) * 100).toFixed(2) });
    const ratios = aligned.slice(-63).map(b => b.close / niftyByDate.get(b.date));
    if (ratios.at(-1) >= max(ratios.slice(0, -1))) add(matches, "rs-new-high", "Stock/NIFTY relative-strength ratio at a 63-day high");
  }

  const dryDistance = latest.close / dailySma21 - 1;
  if (Math.abs(dryDistance) <= 0.02 && latest.volume <= avgVol20 * 0.6)
    add(matches, "volume-dry-up", `Volume ${(latest.volume / avgVol20).toFixed(2)}× average while price is within ±2% of SMA21`);
  const maxDownVolume10 = max(bars.slice(-11, -1).filter((b, i, a) => i === 0 || b.close < a[i - 1].close).map(b => b.volume));
  if (latest.close > prior.close && latest.volume > maxDownVolume10)
    add(matches, "pocket-pivot", "Up-day volume exceeded every down-day volume in the prior 10 sessions");

  const last5 = bars.slice(-5);
  const previous10 = bars.slice(-15, -5);
  const range5 = max(last5.map(b => b.high)) / min(last5.map(b => b.low)) - 1;
  const range10 = max(previous10.map(b => b.high)) / min(previous10.map(b => b.low)) - 1;
  if (range5 <= 0.08 && range5 < range10 && latest.close >= latest.low + (latest.high - latest.low) * 0.6)
    add(matches, "tight-close", `5-session range ${(range5 * 100).toFixed(2)}% contracted from ${(range10 * 100).toFixed(2)}%`);
  if (latest.open >= prior.close * 1.03 && latest.low >= prior.close * 1.01 && latest.close >= latest.open)
    add(matches, "gap-up-hold", `Gap ${(latest.open / prior.close * 100 - 100).toFixed(2)}% held above prior close`);

  return {
    matches,
    diagnostics: {
      dailySma21: +dailySma21.toFixed(2), dailySma30: +dailySma30.toFixed(2),
      close: latest.close, changePct: +((latest.close / prior.close - 1) * 100).toFixed(2),
      volumeRatio: +(latest.volume / avgVol20).toFixed(2)
    }
  };
}
