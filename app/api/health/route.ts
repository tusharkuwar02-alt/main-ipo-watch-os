import { NextResponse } from "next/server";
import scan from "../../../data/latest-scan.json";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "main-ipo-watch-os",
    frameworkVersion: scan.meta.frameworkVersion,
    asOf: scan.meta.asOf,
    universeCount: scan.meta.universeCount,
    qualifyingCount: scan.meta.qualifyingCount
  });
}
