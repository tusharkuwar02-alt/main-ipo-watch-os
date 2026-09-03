const encoder = new TextEncoder();
const round2 = value => Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : value;

const xml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const columnName = index => {
  let value = index + 1, name = "";
  while (value) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
  return name;
};

export function selectExportStocks(scan, systemId = "all") {
  const valid = systemId === "all" || scan.systems.some(system => system.id === systemId);
  if (!valid) throw new Error("Unknown system");
  return scan.stocks.filter(stock => systemId === "all" || stock.matches.some(match => match.id === systemId));
}

export function buildTradingViewWatchlist(scan, systemId = "all") {
  return selectExportStocks(scan, systemId).map(stock => `NSE:${stock.symbol}`).join(",") + "\n";
}

function textCell(ref, value, style = 0) {
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function numberCell(ref, value, style = 0) {
  return Number.isFinite(value) ? `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>` : textCell(ref, "", style);
}

function sheetXml(scan, systemId, stocks) {
  const systemName = systemId === "all" ? "All 20 Systems" : scan.systems.find(system => system.id === systemId)?.name || systemId;
  const headers = ["Rank", "NSE Symbol", "Company", "Selected System", "Selected System Reason", "Signal Family", "Price (₹)", "Daily Change", "Listing Date", "Issue Price (₹)", "Confluence Score", "Evidence Groups", "Total Matches", "All Matched Systems", "All Match Reasons", "Market Data Date"];
  const rows = stocks.map((stock, index) => {
    const selected = systemId === "all" ? null : stock.matches.find(match => match.id === systemId);
    const values = [
      [index + 1, "number", 5], [stock.symbol, "text", 0], [stock.company, "text", 6], [systemName, "text", 6],
      [selected?.reason || stock.matches.map(match => `${match.name}: ${match.reason}`).join(" | "), "text", 6],
      [selected?.family || stock.signalFamilies?.join(", ") || "", "text", 6], [round2(stock.price), "number", 3], [round2(stock.changePct) / 100, "number", 4],
      [stock.listingDate, "text", 0], [stock.issuePrice, "number", 3], [stock.confluenceScore ?? stock.priority, "number", 5],
      [stock.signalFamilies?.length || 0, "number", 5], [stock.matchCount, "number", 5],
      [stock.matches.map(match => match.name).join(" | "), "text", 6], [stock.matches.map(match => `${match.name}: ${match.reason}`).join(" | "), "text", 6],
      [stock.marketDate || scan.meta.marketDate || "", "text", 0]
    ];
    const rowNumber = index + 6;
    return `<row r="${rowNumber}" ht="32" customHeight="1">${values.map(([value, type, style], column) => type === "number" ? numberCell(`${columnName(column)}${rowNumber}`, value, style) : textCell(`${columnName(column)}${rowNumber}`, value, style)).join("")}</row>`;
  }).join("");
  const headerCells = headers.map((header, index) => textCell(`${columnName(index)}5`, header, 2)).join("");
  const lastRow = Math.max(5, stocks.length + 5);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="7" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/><col min="3" max="3" width="34" customWidth="1"/><col min="4" max="4" width="30" customWidth="1"/><col min="5" max="6" width="42" customWidth="1"/><col min="7" max="13" width="16" customWidth="1"/><col min="14" max="15" width="55" customWidth="1"/><col min="16" max="16" width="18" customWidth="1"/></cols><sheetData><row r="1" ht="30" customHeight="1">${textCell("A1", "Main IPO Watch OS — System Stock Export", 1)}</row><row r="2">${textCell("A2", "Selected System", 7)}${textCell("B2", systemName, 8)}${textCell("D2", "Stocks", 7)}${numberCell("E2", stocks.length, 5)}</row><row r="3">${textCell("A3", "Market Date", 7)}${textCell("B3", scan.meta.marketDate || "", 8)}${textCell("D3", "Generated", 7)}${textCell("E3", scan.meta.asOf || "", 8)}</row><row r="5" ht="26" customHeight="1">${headerCells}</row>${rows}</sheetData><autoFilter ref="A5:P${lastRow}"/><mergeCells count="1"><mergeCell ref="A1:P1"/></mergeCells></worksheet>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="₹#,##0.00"/><numFmt numFmtId="165" formatCode="0.00%;[Red]-0.00%"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Aptos Display"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C1828"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF147D72"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="thin"><color rgb="FFCBD5E1"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return bytes; }
function u32(value) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value >>> 0, true); return bytes; }
function join(parts) { const size = parts.reduce((sum, part) => sum + part.length, 0); const output = new Uint8Array(size); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }

function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name), data = typeof content === "string" ? encoder.encode(content) : content, crc = crc32(data);
    const local = join([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data]);
    const central = join([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]);
    locals.push(local); centrals.push(central); offset += local.length;
  }
  const centralData = join(centrals);
  return join([...locals, centralData, u32(0x06054b50), u16(0), u16(0), u16(centrals.length), u16(centrals.length), u32(centralData.length), u32(offset), u16(0)]);
}

export function buildExcelWorkbook(scan, systemId = "all") {
  const stocks = selectExportStocks(scan, systemId);
  return zip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="IPO Stocks" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": stylesXml,
    "xl/worksheets/sheet1.xml": sheetXml(scan, systemId, stocks)
  });
}
