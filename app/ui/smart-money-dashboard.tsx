"use client";

import { useMemo, useState } from "react";

type InstitutionalEvidence = {
  evaluated?: boolean; disclosureCovered?: boolean; institutionalScore?: number; institutionalStatus?: string;
  institutionalQualified?: boolean; institutionalDirection?: string; filingAvailableDate?: string; filingQuarterEnd?: string;
  filingAgeDays?: number | null; filingFreshness?: string; mfPct?: number; fpiPct?: number; totalInstitutionPct?: number;
  mfDeltaPct?: number; fpiDeltaPct?: number; totalDeltaPct?: number; previousTotalDeltaPct?: number | null;
  largeDealNetBuyRatio?: number; largeDealNetDirectionRatio?: number;
};
type FinalSwingPlan = {
  family: string; signalDate: string; entry: number; stopLoss: number; target1: number; target2: number;
  orderType: string; waitSessions: number; maxHoldSessions: number; riskPct: number; momentumPercentile: number;
  footprintScore: number; management: string; maxRiskPct: number; portfolioRule: string;
};

type SmartStock = {
  symbol: string; company: string; marketDate: string; price: number; changePct: number;
  direction: string; directionScore: number; accumulationScore: number; distributionScore: number;
  confidence: string; setup: string; actionable: boolean; evidence: string[];
  volumeRatio: number; deliveryRatio: number; deliveredValueCr: number; averageTurnoverCr20d: number; relativeStrength20d: number;
  sma21: number; sma30: number; sma50: number; entry: number; stopLoss: number; target1: number; target2: number;
  hedgeState: string; confirmation: string; institutional?: InstitutionalEvidence; finalSwingPlan?: FinalSwingPlan | null;
};
type SmartScan = { meta: Record<string, any>; stocks: SmartStock[] };

const directions = ["All directions", "Strong Bullish", "Bullish", "Bullish Pullback", "Sideways Accumulation", "Sideways Neutral", "Sideways Distribution", "Bearish", "Strong Bearish"];
const confirmations = ["All confirmation", "Strong confirmation", "Neutral", "Conflict", "Insufficient disclosure"];
const signed = (value?: number) => value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)} pp`;
const fixed = (value?: number, suffix = "") => value == null ? "—" : `${value.toFixed(2)}${suffix}`;

export default function SmartMoneyDashboard({ initialData }: { initialData: SmartScan }) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("All directions");
  const [confirmation, setConfirmation] = useState("All confirmation");
  const [onlyShortlist, setOnlyShortlist] = useState(true);
  const [onlyFinal, setOnlyFinal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const stocks = useMemo(() => initialData.stocks.filter(stock =>
    (!onlyShortlist || stock.actionable || Boolean(stock.finalSwingPlan)) &&
    (!onlyFinal || Boolean(stock.finalSwingPlan)) &&
    (direction === "All directions" || stock.direction === direction) &&
    (confirmation === "All confirmation" || stock.institutional?.institutionalStatus === confirmation) &&
    `${stock.symbol} ${stock.company}`.toLowerCase().includes(query.toLowerCase())
  ), [initialData.stocks, query, direction, confirmation, onlyShortlist, onlyFinal]);
  const asOf = initialData.meta.marketDate || "First automatic scan pending";
  const institutional = initialData.meta.institutional || {};

  return <main className="smartMoney">
    <nav className="osNav" aria-label="Operating systems"><a href="/">Main IPO Watch</a><a className="active smart" href="/smart-money">Smart Money Footprint</a></nav>
    <header className="hero">
      <div className="brand"><span className="logo smf">SMF</span><div><h1>Smart Money Footprint OS</h1><p>NSE Stock Selection · Institutional Confirmation · Separate Strategy Reference</p></div></div>
      <div className={`freshness ${initialData.meta.dataFreshness !== "fresh" ? "stale" : ""}`}><span className="pulse"/>Data {initialData.meta.dataFreshness} · {asOf}</div>
    </header>

    <section className="stats">
      <Stat label="NSE Stocks Scanned" value={initialData.meta.scannedCount} sub={`${initialData.meta.sessions} official EOD sessions`} />
      <Stat label="Final Swing Setup" value={initialData.meta.finalSwingCount ?? 0} sub="Exact Deep Leader Pullback trigger" accent />
      <Stat label="Strategy Shortlist" value={initialData.meta.actionableCount} sub="Price/volume setup candidates" accent />
      <Stat label="Strong Institutional" value={institutional.strongCount ?? "—"} sub="Score ≥3; ranking only" />
      <Stat label="Market Regime" value={initialData.meta.marketRegime} sub={`Breadth SMA20 ${initialData.meta.breadth20}% · SMA50 ${initialData.meta.breadth50}%`} />
    </section>

    <section className="rulebar smartRules"><span>✓ Final setup is separate from stock selection</span><span>✓ 6M/12M volatility-adjusted momentum</span><span>✓ Actual NSE MF/FPI filings</span><span>✓ Score ranks competing trades</span><span>✓ 0.5% maximum risk per trade</span><span>✓ Maximum 5 positions · 2 new/day</span></section>

    <section className={`institutionSource ${institutional.status || "pending"}`}>
      <div><b>Institutional data: {institutional.status || "refresh pending"}</b><span>{institutional.coveredCount ?? 0}/{institutional.targetCount ?? 0} shortlisted stocks have usable disclosure · {institutional.sourceGapCount ?? 0} source gaps</span></div>
      <small>MF/FPI holdings are quarterly and delayed. Derivative hedges are not visible, so this is confirmation—not proof of buying.</small>
    </section>

    <section className="panel">
      <div className="toolbar">
        <div><h2>Strategy Shortlist + Institutional Confirmation</h2><p>IPO Watch पासून पूर्णपणे वेगळे. Entry decision price/volume strategy घेते; institutional score फक्त rank करतो.</p></div>
        <div className="filters">
          <input aria-label="Search stocks" placeholder="Search stock" value={query} onChange={event => setQuery(event.target.value)} />
          <select aria-label="Direction" value={direction} onChange={event => setDirection(event.target.value)}>{directions.map(value => <option key={value}>{value}</option>)}</select>
          <select aria-label="Institutional confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)}>{confirmations.map(value => <option key={value}>{value}</option>)}</select>
          <label className="actionToggle finalToggle"><input type="checkbox" checked={onlyFinal} onChange={event => setOnlyFinal(event.target.checked)} />Final setup only</label>
          <label className="actionToggle"><input type="checkbox" checked={onlyShortlist} onChange={event => setOnlyShortlist(event.target.checked)} />Shortlist only</label>
        </div>
      </div>
      <div className="tableWrap"><table>
        <thead><tr><th>Stock</th><th>Direction</th><th>Institutional</th><th>Price / Volume</th><th>Strategy Reference</th><th>Details</th></tr></thead>
        <tbody>{stocks.map(stock => <SmartRow key={stock.symbol} stock={stock} open={expanded === stock.symbol} toggle={() => setExpanded(expanded === stock.symbol ? null : stock.symbol)} />)}</tbody>
      </table></div>
      {!stocks.length && <div className="empty">{initialData.meta.dataFreshness === "first-scan-pending" ? "The first official NSE Smart Money scan is being prepared automatically." : "No stocks match these filters."}</div>}
    </section>
    <footer>Final setup = tested rule, not guaranteed profit · Institutional score = ranking only · Verify live price before entry</footer>
  </main>;
}

function Stat({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: boolean }) {
  return <article className={`stat ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>;
}

function SmartRow({ stock, open, toggle }: { stock: SmartStock; open: boolean; toggle: () => void }) {
  const positive = stock.direction.includes("Bullish") || stock.direction === "Sideways Accumulation";
  const negative = stock.direction.includes("Bearish") || stock.direction === "Sideways Distribution";
  const institution = stock.institutional || { institutionalStatus: "Refresh pending", institutionalQualified: false };
  const plan = stock.finalSwingPlan;
  const statusClass = institution.institutionalStatus === "Strong confirmation" ? "institutionStrong" : institution.institutionalStatus === "Conflict" ? "institutionConflict" : institution.institutionalStatus === "Insufficient disclosure" ? "institutionMissing" : "institutionNeutral";
  return <>
    <tr className="stockRow">
      <td data-label="Stock"><b>{stock.symbol}</b><span>{stock.company}</span><small>₹{stock.price.toFixed(2)} · <i className={stock.changePct >= 0 ? "up" : "down"}>{stock.changePct >= 0 ? "+" : ""}{stock.changePct.toFixed(2)}%</i></small></td>
      <td data-label="Direction"><b className={positive ? "up" : negative ? "down" : ""}>{stock.direction}</b><span>Score {stock.directionScore}</span></td>
      <td data-label="Institutional"><b className={`institutionBadge ${statusClass}`}>{institution.evaluated && institution.disclosureCovered ? `${institution.institutionalScore}/7` : "—"}</b><span className={statusClass}>{institution.institutionalStatus}</span><small>{institution.institutionalDirection || "Not evaluated"}</small></td>
      <td data-label="Price / Volume"><b className="footprintScore">{stock.accumulationScore}</b><span>Distribution {stock.distributionScore}</span><small>{stock.confidence} price-volume confidence</small></td>
      <td data-label="Strategy Reference">{plan ? <><b className="finalSetupBadge">Final setup</b><span>Limit ₹{plan.entry.toFixed(2)} · SL ₹{plan.stopLoss.toFixed(2)}</span><small>T1 2R ₹{plan.target1.toFixed(2)} · T2 3R ₹{plan.target2.toFixed(2)}</small></> : stock.setup === "Avoid Long" ? <><b className="down">No long setup</b><span>Wait for price reversal</span></> : <><b>Scanner reference ₹{stock.entry.toFixed(2)}</b><span>SL ref ₹{stock.stopLoss.toFixed(2)}</span><small>Not the final entry setup</small></>}</td>
      <td data-label="Details"><button className="reasonButton" onClick={toggle} aria-expanded={open}>{open ? "Hide" : "Why?"}</button></td>
    </tr>
    {open && <tr className="details"><td colSpan={6}><div className="smartDetails institutionalDetails">
      <article><h3>Actual institutional disclosure</h3>{institution.disclosureCovered ? <div className="institutionMetrics">
        <span>MF holding <b>{fixed(institution.mfPct, "%")}</b><em>{signed(institution.mfDeltaPct)}</em></span>
        <span>FPI holding <b>{fixed(institution.fpiPct, "%")}</b><em>{signed(institution.fpiDeltaPct)}</em></span>
        <span>Total holding <b>{fixed(institution.totalInstitutionPct, "%")}</b><em>{signed(institution.totalDeltaPct)}</em></span>
        <span>Large-deal net direction <b>{fixed(institution.largeDealNetDirectionRatio, "× avg volume")}</b><em>Scored buy participation {fixed(institution.largeDealNetBuyRatio, "×")}</em></span>
        <span>Quarter <b>{institution.filingQuarterEnd}</b><em>{institution.filingFreshness}</em></span>
        <span>Usable since <b>{institution.filingAvailableDate}</b><em>{institution.filingAgeDays ?? "—"} days old</em></span>
      </div> : <p className="missingCopy">Two usable quarterly filings were not available for this shortlist date. Missing data is never treated as buying or selling.</p>}</article>
      <article><h3>Price / volume evidence</h3><ul>{stock.evidence.map(reason => <li key={reason}>{reason}</li>)}</ul></article>
      {plan && <article className="finalPlan"><h3>Final swing execution</h3><div className="metricGrid"><span>Signal date <b>{plan.signalDate}</b></span><span>Order valid <b>{plan.waitSessions} sessions</b></span><span>Maximum hold <b>{plan.maxHoldSessions} sessions</b></span><span>Momentum rank <b>{plan.momentumPercentile}%</b></span><span>Risk/position <b>≤{plan.maxRiskPct}% capital</b></span><span>Portfolio <b>5 open · 2 new/day</b></span></div><p>{plan.management}</p></article>}
      <article><h3>Measurements</h3><div className="metricGrid"><span>Volume <b>{stock.volumeRatio}×</b></span><span>Delivery value <b>{stock.deliveryRatio}×</b></span><span>Delivered ₹Cr <b>{stock.deliveredValueCr}</b></span><span>Avg turnover ₹Cr <b>{stock.averageTurnoverCr20d}</b></span><span>RS 20D <b>{stock.relativeStrength20d}%</b></span><span>SMA21 <b>₹{stock.sma21}</b></span><span>SMA30 <b>₹{stock.sma30}</b></span></div></article>
      <article className="hedgeNotice"><h3>Correct reading</h3><p>Cash ownership change आणि prior large deals दिसतात; FPI/PMS derivatives hedge सार्वजनिक stock-level data मध्ये दिसत नाही. म्हणून score हा ranking/confidence आहे—entry signal किंवा confirmed institution identity नाही.</p></article>
    </div></td></tr>}
  </>;
}
