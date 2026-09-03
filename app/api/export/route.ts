import { NextRequest } from "next/server";
import scan from "../../../data/latest-scan.json";
import { buildExcelWorkbook, buildTradingViewWatchlist, selectExportStocks } from "../../../lib/export.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const system = request.nextUrl.searchParams.get("system") || "all";
  const format = request.nextUrl.searchParams.get("format") || "xlsx";
  try {
    const count = selectExportStocks(scan, system).length;
    const date = scan.meta.marketDate || scan.meta.asOf.slice(0, 10);
    const base = `main-ipo-watch-${system}-${date}`;
    if (format === "tradingview") {
      return new Response(buildTradingViewWatchlist(scan, system), { headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}-tradingview.txt"`,
        "X-Export-Stock-Count": String(count)
      }});
    }
    if (format !== "xlsx") return Response.json({ error: "Unsupported format" }, { status: 400 });
    return new Response(buildExcelWorkbook(scan, system), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "X-Export-Stock-Count": String(count),
      "Cache-Control": "public, s-maxage=300"
    }});
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 400 });
  }
}

