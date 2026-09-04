import scan from "../../../data/smart-money-latest.json";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(scan, { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" } });
}

