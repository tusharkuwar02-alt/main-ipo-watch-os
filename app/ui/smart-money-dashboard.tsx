"use client";

import { useMemo, useState } from "react";

type SmartStock = {
  symbol: string; company: string; marketDate: string; price: number; changePct: number;
  direction: string; directionScore: number; accumulationScore: number; distributionScore: number;
  confidence: string; setup: string; actionable: boolean; evidence: string[];
  volumeRatio: number; deliveryRatio: number; deliveredValueCr: number; averageTurnoverCr20d: number; relativeStrength20d: number;
  sma21: number; sma30: number; sma50: number; entry: number; stopLoss: number; target1: number; target2: number;
  hedgeState: string; confirmation: string;
};
type SmartScan = { meta: Record<string, any>; stocks: SmartStock[] };

const directions = ["All directions", "Strong Bullish", "Bullish", "Bullish Pullback", "Sideways Accumulation", "Sideways Neutral", "Sideways Distribution", "Bearish", "Strong Bearish"];

export default function SmartMoneyDashboard({ initialData }: { initialData: SmartScan }) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("All directions");
  const [onlyActionable, setOnlyActionable] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const stocks = useMemo(() => initialData.stocks.filter(stock =>
    (!onlyActionable || stock.actionable) &&
    (direction === "All directions" || stock.direction === direction) &&
    `${stock.symbol} ${stock.company}`.toLowerCase().includes(query.toLowerCase())
  ), [initialData.stocks, query, direction, onlyActionable]);
  const asOf = initialData.meta.marketDate || "First automatic scan pending";

  return <main className="smartMoney">
    <nav className="osNav" aria-label="Operating systems"><a href="/">Main IPO Watch</a><a className="active smart" href="/smart-money">Smart Money Footprint</a></nav>
    <header className="hero">
      <div className="brand"><span className="logo smf">SMF</span><div><h1>Smart Money Footprint OS</h1><p>NSE Cash Market · Direction · Accumulation · Trade Levels</p></div></div>
      <div className={`freshness ${initialData.meta.dataFreshness !== "fresh" ? "stale" : ""}`}><span className="pulse"/>Data {initialData.meta.dataFreshness} · {asOf}</div>
    </header>

    <section className="stats">
      <Stat label="NSE Stocks Scanned" value={initialData.meta.scannedCount} sub={`${initialData.meta.sessions} official EOD sessions`} />
      <Stat label="Actionable Now" value={initialData.meta.actionableCount} sub="Setup, watch or avoid signal" accent />
      <Stat label="Market Regime" value={initialData.meta.marketRegime} sub="Breadth-adjusted direction" />
      <Stat label="Breadth Above SMA20" value={`${initialData.meta.breadth20}%`} sub={`Above SMA50 · ${initialData.meta.breadth50}%`} />
    </section>

    <section className="rulebar smartRules"><span>✓ Official NSE EOD data</span><span>✓ Delivered value, not delivery % alone</span><span>✓ Direction and footprint separated</span><span>✓ Hedge uncertainty shown</span><span>✓ No false institutional identity claim</span></section>

    <section className="panel">
      <div className="toolbar">
        <div><h2>Stock Direction & Footprint</h2><p>Results are independent from the locked Main IPO Watch framework.</p></div>
        <div className="filters">
          <input aria-label="Search stocks" placeholder="Search stock" value={query} onChange={event => setQuery(event.target.value)} />
          <select aria-label="Direction" value={direction} onChange={event => setDirection(event.target.value)}>{directions.map(value => <option key={value}>{value}</option>)}</select>
          <label className="actionToggle"><input type="checkbox" checked={onlyActionable} onChange={event => setOnlyActionable(event.target.checked)} />Actionable only</label>
        </div>
      </div>
      <div className="tableWrap"><table>
        <thead><tr><th>Stock</th><th>Direction</th><th>Footprint</th><th>Setup</th><th>Trade Plan</th><th>Details</th></tr></thead>
        <tbody>{stocks.map(stock => <SmartRow key={stock.symbol} stock={stock} open={expanded === stock.symbol} toggle={() => setExpanded(expanded === stock.symbol ? null : stock.symbol)} />)}</tbody>
      </table></div>
      {!stocks.length && <div className="empty">{initialData.meta.dataFreshness === "first-scan-pending" ? "The first official NSE Smart Money scan is being prepared automatically." : "No stocks match these filters."}</div>}
    </section>
    <footer>Probabilistic screening—not proof of a named institution’s trade · Verify live prices before trading</footer>
  </main>;
}

function Stat({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: boolean }) {
  return <article className={`stat ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>;
}

function SmartRow({ stock, open, toggle }: { stock: SmartStock; open: boolean; toggle: () => void }) {
  const positive = stock.direction.includes("Bullish") || stock.direction === "Sideways Accumulation";
  const negative = stock.direction.includes("Bearish") || stock.direction === "Sideways Distribution";
  return <>
    <tr className="stockRow">
      <td data-label="Stock"><b>{stock.symbol}</b><span>{stock.company}</span><small>₹{stock.price.toFixed(2)} · <i className={stock.changePct >= 0 ? "up" : "down"}>{stock.changePct >= 0 ? "+" : ""}{stock.changePct.toFixed(2)}%</i></small></td>
      <td data-label="Direction"><b className={positive ? "up" : negative ? "down" : ""}>{stock.direction}</b><span>Score {stock.directionScore}</span></td>
      <td data-label="Footprint"><b className="footprintScore">{stock.accumulationScore}</b><span>Distribution {stock.distributionScore}</span><small>{stock.confidence} confidence</small></td>
      <td data-label="Setup"><b>{stock.setup}</b><span>{stock.confirmation}</span></td>
      <td data-label="Trade Plan">{stock.setup === "Avoid Long" ? <><b className="down">No long trade</b><span>Wait for trend reversal</span></> : <><b>Entry ₹{stock.entry.toFixed(2)}</b><span>SL ₹{stock.stopLoss.toFixed(2)}</span><small>T1 ₹{stock.target1.toFixed(2)} · T2 ₹{stock.target2.toFixed(2)}</small></>}</td>
      <td data-label="Details"><button className="reasonButton" onClick={toggle} aria-expanded={open}>{open ? "Hide" : "Why?"}</button></td>
    </tr>
    {open && <tr className="details"><td colSpan={6}><div className="smartDetails">
      <article><h3>Evidence</h3><ul>{stock.evidence.map(reason => <li key={reason}>{reason}</li>)}</ul></article>
      <article><h3>Measurements</h3><div className="metricGrid"><span>Volume <b>{stock.volumeRatio}×</b></span><span>Delivery value <b>{stock.deliveryRatio}×</b></span><span>Delivered ₹Cr <b>{stock.deliveredValueCr}</b></span><span>Avg turnover ₹Cr <b>{stock.averageTurnoverCr20d}</b></span><span>RS 20D <b>{stock.relativeStrength20d}%</b></span><span>SMA21 <b>₹{stock.sma21}</b></span><span>SMA30 <b>₹{stock.sma30}</b></span></div></article>
      <article className="hedgeNotice"><h3>Hedge reading</h3><p>{stock.hedgeState}. Therefore this result is labelled probable, never confirmed institutional identity.</p></article>
    </div></td></tr>}
  </>;
}
