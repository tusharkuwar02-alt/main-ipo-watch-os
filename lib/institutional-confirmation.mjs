const round = (value, digits = 3) => Number.isFinite(value) ? +value.toFixed(digits) : null;

export const INSTITUTIONAL_VARIANTS = [
  { name: "Locked baseline", test: () => true, requiresDisclosure: false },
  { name: "Disclosure-covered baseline", test: x => x.disclosureCovered },
  { name: "Any MF+FPI accumulation", test: x => x.totalDeltaPct > 0 },
  { name: "MF+FPI accumulation >=0.25pp", test: x => x.totalDeltaPct >= .25 },
  { name: "Mutual-fund accumulation", test: x => x.mfDeltaPct > 0 },
  { name: "FPI accumulation", test: x => x.fpiDeltaPct > 0 },
  { name: "Broad accumulation (MF and FPI)", test: x => x.mfDeltaPct > 0 && x.fpiDeltaPct > 0 },
  { name: "Persistent institutional accumulation", test: x => x.totalDeltaPct > 0 && x.previousTotalDeltaPct > 0 },
  { name: "Accumulation + net large-deal buying", test: x => x.totalDeltaPct > 0 && x.largeDealNetBuyRatio >= .25 },
  { name: "Institutional score >=3", test: x => x.institutionalScore >= 3 }
];

function memberName(contextBody) {
  return [...contextBody.matchAll(/<xbrldi:explicitMember[^>]*>([^<]+)/gi)].map(match => match[1]);
}

function percentageForContext(xml, contextId) {
  const escaped = contextId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<([\\w:-]*ShareholdingAsAPercentageOfTotalNumberOfShares)[^>]*contextRef=["']${escaped}["'][^>]*>([^<]*)<\\/\\1>`, "i");
  const match = xml.match(pattern);
  const value = match ? Number(match[2]) : NaN;
  return Number.isFinite(value) ? value : null;
}

export function parseInstitutionalHoldingsXbrl(xml) {
  if (typeof xml !== "string" || xml.length < 100) return null;
  const contexts = [...xml.matchAll(/<xbrli:context[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/xbrli:context>/gi)];
  let mfPct = null, fpiPct = null, fallbackFpiPct = null, categoryFpiPct = 0, categoryFpiSeen = false;
  for (const match of contexts) {
    const members = memberName(match[2]);
    const pct = percentageForContext(xml, match[1]);
    if (pct == null) continue;
    if (members.some(member => /:MutualFundsOrUtiMember$/i.test(member))) mfPct = pct;
    if (members.some(member => /:InstitutionsForeignPortfolioInvestorMember$/i.test(member))) fpiPct = pct;
    if (members.some(member => /:InstitutionsForeignPortfolioInvestor(?:Category|Catergory)(?:One|Two)Member$/i.test(member))) { categoryFpiPct += pct; categoryFpiSeen = true; }
    if (members.some(member => /:ForeignPortfolioInvestorMember$/i.test(member))) fallbackFpiPct = pct;
  }
  if (mfPct == null && fpiPct == null && fallbackFpiPct == null && !categoryFpiSeen) return null;
  return { mfPct: mfPct ?? 0, fpiPct: categoryFpiSeen ? categoryFpiPct : fpiPct ?? fallbackFpiPct ?? 0 };
}

export function disclosureSnapshot(records, signalDate) {
  const known = records.filter(record => record.availableDate <= signalDate && Number.isFinite(record.mfPct) && Number.isFinite(record.fpiPct));
  const byQuarter = new Map();
  for (const record of known) {
    const existing = byQuarter.get(record.quarterEnd);
    if (!existing || record.availableDate > existing.availableDate) byQuarter.set(record.quarterEnd, record);
  }
  const quarters = [...byQuarter.values()].sort((a, b) => a.quarterEnd.localeCompare(b.quarterEnd));
  if (quarters.length < 2) return { disclosureCovered: false };
  const current = quarters.at(-1), previous = quarters.at(-2), prior = quarters.at(-3);
  const total = current.mfPct + current.fpiPct, previousTotal = previous.mfPct + previous.fpiPct;
  return {
    disclosureCovered: true,
    filingAvailableDate: current.availableDate,
    filingQuarterEnd: current.quarterEnd,
    mfPct: round(current.mfPct),
    fpiPct: round(current.fpiPct),
    totalInstitutionPct: round(total),
    mfDeltaPct: round(current.mfPct - previous.mfPct),
    fpiDeltaPct: round(current.fpiPct - previous.fpiPct),
    totalDeltaPct: round(total - previousTotal),
    previousTotalDeltaPct: prior ? round(previousTotal - prior.mfPct - prior.fpiPct) : null
  };
}

export function institutionalFeatures(records, signalDate, largeDealNetBuyRatio = 0) {
  const snapshot = disclosureSnapshot(records, signalDate);
  if (!snapshot.disclosureCovered) return { ...snapshot, largeDealNetBuyRatio: round(largeDealNetBuyRatio), institutionalScore: 0 };
  const score = Number(snapshot.totalDeltaPct >= .25) * 2 + Number(snapshot.mfDeltaPct > 0) +
    Number(snapshot.fpiDeltaPct > 0) + Number(snapshot.previousTotalDeltaPct > 0) +
    Number(snapshot.totalInstitutionPct >= 5) + Number(largeDealNetBuyRatio >= .25);
  return { ...snapshot, largeDealNetBuyRatio: round(largeDealNetBuyRatio), institutionalScore: score };
}

export function variantSignals(signals, variant) {
  return signals.filter(signal => variant.test(signal));
}
