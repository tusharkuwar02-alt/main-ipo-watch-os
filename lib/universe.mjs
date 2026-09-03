import * as cheerio from "cheerio";

const normalize = value => value.toLowerCase().replace(/limited|ltd|technologies|technology|industries|industry|india|private|pvt|&/g, " ").replace(/[^a-z0-9]/g, "").trim();
const parseMoney = value => Number(String(value || "").replace(/[^0-9.]/g, "")) || 0;
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function parseCalendarDate(value) {
  const clean = String(value || "").trim().replace(/(\d+)(st|nd|rd|th)/gi, "$1").replace(/,/g, "").replace(/\s+/g, " ");
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const monthFirst = clean.match(/^([A-Za-z]+) (\d{1,2}) (\d{4})$/);
  const dayFirst = clean.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (monthFirst && MONTHS[monthFirst[1].toLowerCase()]) return { year: Number(monthFirst[3]), month: MONTHS[monthFirst[1].toLowerCase()], day: Number(monthFirst[2]) };
  if (dayFirst && MONTHS[dayFirst[2].toLowerCase()]) return { year: Number(dayFirst[3]), month: MONTHS[dayFirst[2].toLowerCase()], day: Number(dayFirst[1]) };
  return null;
}

export function parseNseListingCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines.shift().split(",").map(v => v.trim());
  const index = Object.fromEntries(headers.map((h, i) => [h, i]));
  return lines.map(line => {
    const cells = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const raw = cells[index["DATE OF LISTING"]];
    const match = raw?.match(/(\d{2})-([A-Z]{3})-(\d{4})/);
    const months = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
    const listingDate = match ? `${match[3]}-${months[match[2]]}-${match[1]}` : "";
    return {
      symbol: cells[index.SYMBOL], company: cells[index["NAME OF COMPANY"]],
      series: cells[index.SERIES], listingDate, isin: cells[index["ISIN NUMBER"]]
    };
  }).filter(row => row.symbol && row.listingDate);
}

export function parseIpoWatchPerformance(html) {
  const $ = cheerio.load(html);
  const records = [];
  let year = 0;
  $("h2, h3, table").each((_, element) => {
    const node = $(element);
    if (/^h[23]$/i.test(element.tagName)) {
      const match = node.text().match(/Performance Tracker\s+(20\d{2})/i);
      if (match) year = Number(match[1]);
      return;
    }
    if (!year) return;
    const headers = node.find("tr").first().find("th,td").map((__, c) => $(c).text().trim()).get();
    const nameIndex = headers.findIndex(h => /IPO Name/i.test(h));
    const priceIndex = headers.findIndex(h => /IPO Price/i.test(h));
    if (nameIndex < 0 || priceIndex < 0) return;
    node.find("tr").slice(1).each((__, row) => {
      const cells = $(row).find("td");
      const company = cells.eq(nameIndex).text().trim();
      if (company) records.push({ company, issuePrice: parseMoney(cells.eq(priceIndex).text()), year });
    });
  });
  return records;
}

export function parseIpoWatchListingPage(html) {
  const $ = cheerio.load(html);
  const records = [];
  $("table").each((_, table) => {
    const heading = $(table).prevAll("h2,h3").first().text();
    if (/SME/i.test(heading)) return;
    const headers = $(table).find("tr").first().find("th,td").map((__, c) => $(c).text().trim()).get();
    const listingDateIndex = headers.findIndex(h => /^Listing Date$/i.test(h));
    const openDateIndex = headers.findIndex(h => /Open Date|IPO Date/i.test(h));
    const nameIndex = headers.findIndex(h => /^IPO$|IPO Name|Company/i.test(h));
    const symbolIndex = headers.findIndex(h => /NSE Symbol/i.test(h));
    const priceIndex = headers.findIndex(h => /IPO Price|Price Band|Price/i.test(h));
    if (listingDateIndex < 0 || nameIndex < 0) return;
    if (listingDateIndex === openDateIndex) throw new Error("IPOWatch parser mapped Listing Date to Open Date");
    $(table).find("tr").slice(1).each((__, row) => {
      const cells = $(row).find("td");
      const company = cells.eq(nameIndex).text().trim();
      const rawDate = cells.eq(listingDateIndex).text().trim();
      const parsed = parseCalendarDate(rawDate);
      if (company && parsed) records.push({
        company, listingDate: `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`,
        symbol: symbolIndex >= 0 ? cells.eq(symbolIndex).text().trim() : "",
        issuePrice: priceIndex >= 0 ? parseMoney(cells.eq(priceIndex).text()) : 0,
        year: parsed.year
      });
    });
  });
  return records;
}

function similarity(a, b) {
  const x = normalize(a), y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.92;
  const grams = value => new Set([...Array(Math.max(0, value.length - 1))].map((_, i) => value.slice(i, i + 2)));
  const ga = grams(x), gb = grams(y);
  const overlap = [...ga].filter(g => gb.has(g)).length;
  return overlap * 2 / Math.max(1, ga.size + gb.size);
}

export function buildRollingUniverse(nseRows, performanceRows, listingRows, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  // Mainboard securities can temporarily trade in BE/BZ surveillance series; SME issues use SM/ST.
  const eligible = nseRows.filter(row => ["EQ", "BE", "BZ"].includes(row.series) && row.listingDate >= cutoffIso && row.listingDate <= today);
  const listingBySymbol = new Map(listingRows.filter(r => r.symbol).map(r => [r.symbol, r]));
  const failures = [];
  const universe = [];
  const seenNseSymbols = new Set();
  for (const row of eligible) {
    if (seenNseSymbols.has(row.symbol)) failures.push({ symbol: row.symbol, reason: "Duplicate symbol in NSE listing master" });
    seenNseSymbols.add(row.symbol);
  }
  const aliases = {
    nsdl: "NSDL", firstcry: "FIRSTCRY", ixigo: "IXIGO", ireda: "IREDA", mamaearth: "HONASA", rainbowhospital: "RAINBOW",
    licipo: "LICI", mapmyindia: "MAPMYINDIA", paytm: "PAYTM", policybazaar: "POLICYBZR",
    nykaa: "NYKAA", zomato: "ETERNAL", adaniwilmar: "AWL", easemytrip: "EASEMYTRIP", mapmy: "MAPMYINDIA",
    amiorganics: "AMIORG", krsnaadiagnostics: "KRSNAA", lodhadevelopers: "LODHA", kalyanjewellers: "KALYANKJIL"
  };
  for (const ipo of performanceRows) {
    if (ipo.listingDate && (ipo.listingDate < cutoffIso || ipo.listingDate > today)) continue;
    if (/\b(REIT|InvIT)\b|Propshare/i.test(ipo.company) || /^(Vodafone Idea|Ruchi Soya|NSDL)$/i.test(ipo.company)) continue;
    const candidates = ipo.listingDate ? eligible.filter(row => row.listingDate === ipo.listingDate) : eligible;
    const aliasSymbol = aliases[normalize(ipo.company)];
    const ranked = candidates.map(row => ({ row, score: row.symbol === aliasSymbol ? 1 : similarity(ipo.company, row.company) })).sort((a, b) => b.score - a.score);
    if (!ranked[0] || ranked[0].score < 0.54) {
      const expired = nseRows.map(row => ({ row, score: row.symbol === aliasSymbol ? 1 : similarity(ipo.company, row.company) })).sort((a, b) => b.score - a.score)[0];
      if (expired?.score >= 0.54 && expired.row.listingDate < cutoffIso) continue;
      failures.push({ company: ipo.company, year: ipo.year, reason: "NSE symbol/listing-date match not found" });
      continue;
    }
    if (!aliasSymbol && ranked[1] && ranked[0].score < 0.9 && ranked[0].score - ranked[1].score < 0.03) {
      failures.push({ company: ipo.company, year: ipo.year, reason: `Ambiguous NSE match: ${ranked[0].row.symbol} / ${ranked[1].row.symbol}` });
      continue;
    }
    const matched = ranked[0].row;
    const currentListing = listingBySymbol.get(matched.symbol);
    if (currentListing && currentListing.listingDate !== matched.listingDate) {
      failures.push({ company: ipo.company, symbol: matched.symbol, reason: `Listing date mismatch: NSE ${matched.listingDate}, IPOWatch ${currentListing.listingDate}` });
      continue;
    }
    if (!universe.some(x => x.symbol === matched.symbol)) universe.push({ ...matched, issuePrice: ipo.issuePrice, sourceName: ipo.company, matchConfidence: +ranked[0].score.toFixed(2) });
  }
  return { universe: universe.sort((a, b) => b.listingDate.localeCompare(a.listingDate)), failures, cutoff: cutoffIso };
}
