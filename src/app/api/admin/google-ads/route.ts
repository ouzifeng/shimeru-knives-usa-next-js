import { NextRequest, NextResponse } from "next/server";
import { GoogleAdsApi } from "google-ads-api";

// US PMax campaign ID — not launched yet (expected ~2026-05-22).
// Until set, the dashboard returns zeros so UK campaign data isn't blended in.
const CAMPAIGN_ID = "";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }

  if (!CAMPAIGN_ID) {
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
      WHERE campaign.id = ${CAMPAIGN_ID}
        AND segments.date >= '${from}'
        AND segments.date <= '${to}'
      ORDER BY segments.date DESC
    `);

    let totalSpend = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalConversions = 0;

    const daily: { date: string; spend: number; clicks: number; impressions: number; conversions: number }[] = [];

    for (const r of results) {
      const m = r.metrics;
      if (!m) continue;
      const spend = Number(m.cost_micros) / 1_000_000;
      totalSpend += spend;
      totalClicks += Number(m.clicks);
      totalImpressions += Number(m.impressions);
      totalConversions += Number(m.conversions);
      daily.push({
        date: r.segments?.date as string,
        spend: Math.round(spend * 100) / 100,
        clicks: Number(m.clicks),
        impressions: Number(m.impressions),
        conversions: Number(m.conversions),
      });
    }

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
