import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { ips } = await req.json();
  if (!Array.isArray(ips) || ips.length === 0) {
    return NextResponse.json({});
  }

  const batch = ips.slice(0, 100).map((ip: string) => ({ query: ip }));

  const res = await fetch("http://ip-api.com/batch?fields=query,countryCode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });

  if (!res.ok) return NextResponse.json({});

  const results: Array<{ query: string; countryCode?: string }> = await res.json();
  const map: Record<string, string> = {};
  for (const r of results) {
    if (r.countryCode) map[r.query] = r.countryCode;
  }

  return NextResponse.json(map);
}
