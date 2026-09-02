import { NextResponse } from "next/server";
import scan from "../../../data/latest-scan.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(scan, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      "X-IPO-Watch-Data-As-Of": scan.meta.asOf
    }
  });
}
