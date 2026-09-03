import { NextResponse } from "next/server";
import scan from "../../../data/latest-scan.json";

export async function GET() {
  const meta: Record<string, any> = scan.meta;
  return NextResponse.json({
    ok: true,
    service: "main-ipo-watch-os",
    frameworkVersion: meta.frameworkVersion,
    asOf: meta.asOf,
    marketDate: meta.marketDate,
    dataFreshness: meta.dataFreshness,
    scanQuality: meta.scanQuality,
    sourceStatus: meta.sourceStatus,
    universeCount: meta.universeCount,
    qualifyingCount: meta.qualifyingCount,
    historyFailures: meta.historyFailures,
    validationFailures: meta.validationFailures
  });
}
