"use client";

import { useMemo, useState } from "react";

type Match = { id: string; name: string; reason: string; smaDirection?: string; weeklyStatus?: string };
type Stock = { symbol: string; company: string; listingDate: string; issuePrice: number; price: number; changePct: number; volumeRatio: number; matchCount: number; priority: number; matches: Match[] };
type Scan = { meta: Record<string, any>; systems: { id: string; name: string }[]; stocks: Stock[]; failures: { history: unknown[]; validation: unknown[] } };

export default function Dashboard({ initialData }: { initialData: Scan }) {
  const [query, setQuery] = useState("");
  const [system, setSystem] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const stocks = useMemo(() => initialData.stocks.filter(stock =>
    (system === "all" || stock.matches.some(match => match.id === system)) &&
    `${stock.symbol} ${stock.company}`.toLowerCase().includes(query.toLowerCase())
  ), [initialData, query, system]);
  const asOf = new Date(initialData.meta.asOf);

  return <main>
    <header className="hero">
      <div className="brand"><span className="logo">IPO</span><div><h1>Main IPO Watch OS</h1><p>NSE Mainboard · Rolling 5 Years · 20 Locked Systems</p></div></div>
      <div className="freshness"><span className="pulse"/>Data as of {asOf.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST</div>
    </header>

    <section className="stats">
      <Stat label="NSE IPO Universe" value={initialData.meta.universeCount} sub={`Since ${initialData.meta.rollingWindowStart}`} />
      <Stat label="Qualifying Stocks" value={initialData.meta.qualifyingCount} sub="At least one match" accent />
      <Stat label="Systems Active" value={initialData.systems.length} sub="Locked framework" />
      <Stat label="History Failures" value={initialData.meta.historyFailures} sub={initialData.meta.historyFailures ? "Review diagnostics" : "All histories loaded"} warning={initialData.meta.historyFailures > 0} />
    </section>

    <section className="rulebar">
      <span>✓ NSE Mainboard only</span><span>✓ SME excluded</span><span>✓ One match must appear</span><span>✓ No Top‑N cap</span><span>✓ SMA ±2%</span><span>✓ IPO Base ≤12%</span>
    </section>

    <section className="panel">
      <div className="toolbar">
        <div><h2>Today&apos;s Qualified IPO Stocks</h2><p>All matches and reasons are shown. Higher confluence appears first.</p></div>
        <div className="filters">
          <input aria-label="Search stocks" placeholder="Search symbol or company" value={query} onChange={e => setQuery(e.target.value)} />
          <select aria-label="Filter by system" value={system} onChange={e => setSystem(e.target.value)}>
            <option value="all">All 20 systems</option>{initialData.systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="tableWrap"><table>
        <thead><tr><th>Stock</th><th>Price</th><th>IPO Details</th><th>Matches</th><th>Top Setups</th><th></th></tr></thead>
        <tbody>{stocks.map(stock => <StockRow key={stock.symbol} stock={stock} open={expanded === stock.symbol} toggle={() => setExpanded(expanded === stock.symbol ? null : stock.symbol)} />)}</tbody>
      </table></div>
      {!stocks.length && <div className="empty">No stocks match the current filters.</div>}
    </section>

    <section className="systems"><div><h2>Locked 20-System Framework</h2><p>Monthly 51 and 50-Day SMA proximity are permanently excluded.</p></div><div className="systemGrid">{initialData.systems.map((s, i) => <button key={s.id} onClick={() => setSystem(s.id)}><b>{String(i + 1).padStart(2, "0")}</b><span>{s.name}</span></button>)}</div></section>
    <footer>Educational screening tool · Verify prices with your broker before trading · Not investment advice</footer>
  </main>;
}

function Stat({ label, value, sub, accent, warning }: any) { return <article className={`stat ${accent ? "accent" : ""} ${warning ? "warning" : ""}`}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article> }

function StockRow({ stock, open, toggle }: { stock: Stock; open: boolean; toggle: () => void }) {
  return <>
    <tr className="stockRow"><td data-label="Stock"><b>{stock.symbol}</b><span>{stock.company}</span></td><td data-label="Price"><b>₹{stock.price?.toFixed(2)}</b><span className={stock.changePct >= 0 ? "up" : "down"}>{stock.changePct >= 0 ? "+" : ""}{stock.changePct?.toFixed(2)}%</span></td><td data-label="IPO Details"><span>{stock.listingDate}</span><small>Issue ₹{stock.issuePrice || "—"}</small></td><td data-label="Matches"><strong className="matchCount">{stock.matchCount}</strong></td><td data-label="Top Setups"><div className="chips">{stock.matches.slice(0, 3).map(m => <span key={m.id}>{m.name}</span>)}{stock.matchCount > 3 && <i>+{stock.matchCount - 3}</i>}</div></td><td><button className="expand" onClick={toggle} aria-expanded={open}>{open ? "−" : "+"}</button></td></tr>
    {open && <tr className="details"><td colSpan={6}><div className="reasonGrid">{stock.matches.map(m => <article key={m.id}><h3>{m.name}</h3><p>{m.reason}</p>{m.smaDirection && <small>SMA Direction: {m.smaDirection}</small>}{m.weeklyStatus && <small>Weekly Status: {m.weeklyStatus}</small>}</article>)}</div></td></tr>}
  </>;
}
