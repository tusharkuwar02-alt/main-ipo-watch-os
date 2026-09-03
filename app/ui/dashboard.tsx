"use client";

import { useMemo, useState } from "react";

type Performance = { samples: number; winRate5d: number; avgReturn5d: number; avgReturn10d: number; avgReturn20d: number };
type Match = { id: string; name: string; family?: string; reason: string; smaDirection?: string; weeklyStatus?: string; distancePct?: number; baseDepthPct?: number; relativeOutperformancePct?: number };
type Stock = { symbol: string; company: string; listingDate: string; issuePrice: number; price: number; changePct: number; volumeRatio: number; dailySma21?: number; dailySma30?: number; marketDate?: string; matchCount: number; priority: number; confluenceScore?: number; signalFamilies?: string[]; matches: Match[] };
type System = { id: string; name: string; family?: string; performance?: Performance | null };
type Scan = { meta: Record<string, any>; systems: System[]; stocks: Stock[]; failures: { history: unknown[]; validation: unknown[] } };

export default function Dashboard({ initialData }: { initialData: Scan }) {
  const [query, setQuery] = useState("");
  const [system, setSystem] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const stocks = useMemo(() => initialData.stocks.filter(stock =>
    (system === "all" || stock.matches.some(match => match.id === system)) &&
    `${stock.symbol} ${stock.company}`.toLowerCase().includes(query.toLowerCase())
  ), [initialData, query, system]);
  const performance = useMemo(() => new Map(initialData.systems.map(row => [row.id, row.performance])), [initialData.systems]);
  const asOf = new Date(initialData.meta.lastSuccessfulScanAt || initialData.meta.asOf);
  const allExpanded = stocks.length > 0 && stocks.every(stock => expanded.has(stock.symbol));
  const toggle = (symbol: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
    return next;
  });
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(stocks.map(stock => stock.symbol)));
  const healthy = initialData.meta.scanQuality !== "blocked" && initialData.meta.dataFreshness !== "stale";

  return <main>
    <header className="hero">
      <div className="brand"><span className="logo">IPO</span><div><h1>Main IPO Watch OS</h1><p>NSE Mainboard · Rolling 5 Years · 20 Locked Systems</p></div></div>
      <div className={`freshness ${healthy ? "" : "stale"}`}><span className="pulse"/>Data {initialData.meta.dataFreshness || "available"} · {asOf.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST</div>
    </header>

    <section className="stats">
      <Stat label="NSE IPO Universe" value={initialData.meta.universeCount} sub={`Since ${initialData.meta.rollingWindowStart}`} />
      <Stat label="Qualifying Stocks" value={initialData.meta.qualifyingCount} sub="Even one match is included" accent />
      <Stat label="Systems Active" value={initialData.systems.length} sub="Locked framework" />
      <Stat label="Scan Quality" value={initialData.meta.scanQuality === "healthy" ? "Healthy" : initialData.meta.scanQuality || "Legacy"} sub={`${initialData.meta.historyFailures || 0} history · ${initialData.meta.validationFailures || 0} validation failures`} warning={initialData.meta.scanQuality === "blocked"} />
    </section>

    <section className="statusPanel">
      <Status label="Market data date" value={initialData.meta.marketDate || "Next scan pending"} />
      <Status label="Next automatic scan" value="Weekdays · 7:00 PM IST" />
      <Status label="Ranking" value="Independent signal families" />
      <Status label="Snapshot protection" value={initialData.meta.rules?.safeSnapshotGuard ? "Active" : "Activates next scan"} good />
      <div className="sourceHealth"><b>Sources</b>{Object.entries(initialData.meta.sourceStatus || {}).map(([name, value]) => <span key={name} className={String(value).startsWith("ok") ? "ok" : "partial"}>{pretty(name)}: {String(value)}</span>)}</div>
    </section>

    <section className="rulebar">
      <span>✓ NSE Mainboard only</span><span>✓ SME excluded</span><span>✓ One match must appear</span><span>✓ No Top‑N cap</span><span>✓ SMA ±2%</span><span>✓ IPO Base ≤12%</span><span>✓ Every reason visible</span>
    </section>

    <section className="panel">
      <div className="toolbar">
        <div><h2>Qualified IPO Stocks</h2><p>Every matched setup remains visible. Ranking rewards independent evidence, not repeated breakout variants.</p></div>
        <div className="filters">
          <input aria-label="Search stocks" placeholder="Search symbol or company" value={query} onChange={event => setQuery(event.target.value)} />
          <select aria-label="Filter by system" value={system} onChange={event => setSystem(event.target.value)}>
            <option value="all">All 20 systems</option>{initialData.systems.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <button className="allReasons" onClick={toggleAll}>{allExpanded ? "Hide all reasons" : "Show all reasons"}</button>
        </div>
      </div>
      <div className="tableWrap"><table>
        <thead><tr><th>Stock</th><th>Price</th><th>IPO Details</th><th>Score</th><th>All Matched Setups</th><th>Reasons</th></tr></thead>
        <tbody>{stocks.map(stock => <StockRow key={stock.symbol} stock={stock} open={expanded.has(stock.symbol)} toggle={() => toggle(stock.symbol)} performance={performance} />)}</tbody>
      </table></div>
      {!stocks.length && <div className="empty">No stocks match the current filters.</div>}
    </section>

    <section className="systems"><div><h2>Locked 20-System Framework + Historical Context</h2><p>Performance uses indicative 5/10/20-session forward returns from recent historical signals. It does not remove any one-system match and is not a return guarantee.</p></div><div className="systemGrid">{initialData.systems.map((row, index) => <button key={row.id} onClick={() => setSystem(row.id)}><b>{String(index + 1).padStart(2, "0")}</b><span>{row.name}<small>{row.family || "Signal"}{row.performance ? ` · ${row.performance.samples} samples · 5D win ${row.performance.winRate5d}%` : " · Backtest pending"}</small></span></button>)}</div></section>
    <footer>Educational screening tool · Historical results do not guarantee future returns · Verify prices with your broker before trading</footer>
  </main>;
}

function pretty(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase()); }
function Stat({ label, value, sub, accent, warning }: any) { return <article className={`stat ${accent ? "accent" : ""} ${warning ? "warning" : ""}`}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>; }
function Status({ label, value, good }: { label: string; value: string; good?: boolean }) { return <article className="status"><span>{label}</span><b className={good ? "up" : ""}>{value}</b></article>; }

function StockRow({ stock, open, toggle, performance }: { stock: Stock; open: boolean; toggle: () => void; performance: Map<string, Performance | null | undefined> }) {
  return <>
    <tr className="stockRow">
      <td data-label="Stock"><b>{stock.symbol}</b><span>{stock.company}</span></td>
      <td data-label="Price"><b>₹{stock.price?.toFixed(2)}</b><span className={stock.changePct >= 0 ? "up" : "down"}>{stock.changePct >= 0 ? "+" : ""}{stock.changePct?.toFixed(2)}%</span></td>
      <td data-label="IPO Details"><span>Listed {stock.listingDate}</span><small>Issue ₹{stock.issuePrice || "—"}</small></td>
      <td data-label="Score"><strong className="score">{stock.confluenceScore ?? stock.priority}</strong><small>{stock.signalFamilies?.length || "—"} evidence groups · {stock.matchCount} matches</small></td>
      <td data-label="All Matched Setups"><div className="chips">{stock.matches.map(match => <span key={match.id}>{match.name}</span>)}</div></td>
      <td data-label="Reasons"><button className="reasonButton" onClick={toggle} aria-expanded={open}>{open ? "Hide reasons" : `View all ${stock.matchCount} reasons`}</button></td>
    </tr>
    {open && <tr className="details"><td colSpan={6}>
      <div className="whyHeader"><div><h3>Why {stock.symbol} is in this list</h3><p>It matched {stock.matchCount} of 20 systems across {stock.signalFamilies?.length || "multiple"} independent evidence groups. Every trigger is shown below.</p></div><div className="diagnostics"><span>Market date <b>{stock.marketDate || "—"}</b></span><span>Volume / 20D <b>{stock.volumeRatio?.toFixed(2)}×</b></span><span>SMA21 <b>₹{stock.dailySma21?.toFixed(2) || "—"}</b></span><span>SMA30 <b>₹{stock.dailySma30?.toFixed(2) || "—"}</b></span></div></div>
      <div className="reasonGrid">{stock.matches.map(match => {
        const stats = performance.get(match.id);
        return <article key={match.id}><div className="reasonTitle"><em>{match.family || "Signal"}</em><h3>{match.name}</h3></div><p>{match.reason}</p><div className="measures">{match.smaDirection && <small>SMA direction: <b>{match.smaDirection}</b></small>}{match.weeklyStatus && <small>Weekly status: <b>{match.weeklyStatus}</b></small>}{match.distancePct !== undefined && <small>Distance: <b>{match.distancePct}%</b></small>}{match.baseDepthPct !== undefined && <small>Base depth: <b>{match.baseDepthPct}%</b></small>}{match.relativeOutperformancePct !== undefined && <small>Outperformance: <b>{match.relativeOutperformancePct}%</b></small>}</div>{stats ? <div className="backtest"><b>Historical context · {stats.samples} samples</b><span>5D win {stats.winRate5d}% · Avg 5D {signed(stats.avgReturn5d)} · 10D {signed(stats.avgReturn10d)} · 20D {signed(stats.avgReturn20d)}</span></div> : <div className="backtest pending">Historical context will appear after the upgraded scan.</div>}</article>;
      })}</div>
    </td></tr>}
  </>;
}

function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
