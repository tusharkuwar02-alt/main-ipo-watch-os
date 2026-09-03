const MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

function normalizeHolidayDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
  if (!match) return "";
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : "";
}

export function parseNseTradingHolidays(payload) {
  const rows = payload?.CM || payload?.cm || payload?.data?.CM || [];
  return [...new Set(rows.map(row => normalizeHolidayDate(row.tradingDate || row.date)).filter(Boolean))].sort();
}

export function previousTradingDate(iso, holidays = []) {
  const closed = new Set(holidays);
  const cursor = new Date(`${iso}T00:00:00Z`);
  for (let attempts = 0; attempts < 10; attempts++) {
    const date = cursor.toISOString().slice(0, 10);
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5 && !closed.has(date)) return date;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return "";
}

