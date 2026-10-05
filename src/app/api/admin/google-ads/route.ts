import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { GoogleAdsApi } from "google-ads-api";

// US campaign IDs, pinned so the dashboard isn't blended with the UK campaign
// (same Google Ads account is shared across both stores).
// 23825319027 = USA - Shimeru Knives (PMax, paused 2026-09-28)
// 24298407770 = USA - Shopping Manual CPC
const CAMPAIGN_IDS = ["23825319027", "24298407770"];

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }

  if (CAMPAIGN_IDS.length === 0) {
    return NextResponse.json({
      totalSpend: 0,
      totalClicks: 0,
      totalImpressions: 0,
      totalConversions: 0,
      daily: [],
    });
  }

  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  });

  const customer = client.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
  });

  try {
    const results = await customer.query(`
      SELECT
        segments.date,
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions
      FROM campaign
      WHERE campaign.id IN (${CAMPAIGN_IDS.join(", ")})
        AND segments.date >= '${from}'
        AND segments.date <= '${to}'
      ORDER BY segments.date DESC
    `);

    let totalSpend = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalConversions = 0;

    // One row per campaign per day, so merge rows that share a date
    const byDate = new Map<string, { date: string; spend: number; clicks: number; impressions: number; conversions: number }>();

    for (const r of results) {
      const m = r.metrics;
      if (!m) continue;
      const spend = Number(m.cost_micros) / 1_000_000;
      totalSpend += spend;
      totalClicks += Number(m.clicks);
      totalImpressions += Number(m.impressions);
      totalConversions += Number(m.conversions);
      const date = r.segments?.date as string;
      const day = byDate.get(date) ?? { date, spend: 0, clicks: 0, impressions: 0, conversions: 0 };
      day.spend += spend;
      day.clicks += Number(m.clicks);
      day.impressions += Number(m.impressions);
      day.conversions += Number(m.conversions);
      byDate.set(date, day);
    }

    const daily = [...byDate.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => ({ ...d, spend: Math.round(d.spend * 100) / 100 }));

    return NextResponse.json({
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalClicks,
      totalImpressions,
      totalConversions,
      daily,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Ads API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
