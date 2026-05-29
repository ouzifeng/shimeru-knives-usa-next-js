import { NextRequest, NextResponse } from "next/server";
import {
  extractCampaignIdFromTag,
  incrementCampaignCounter,
} from "@/lib/marketing-campaign-counters";

// Postmark delivery webhook — fires when an email is accepted by the
// recipient's mail server. We use this to maintain
// marketing_campaigns.delivered_count when the email's Tag matches a
// campaign send.
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    if (process.env.NODE_ENV !== "production") {
      console.log("[postmark delivery]", {
        MessageID: payload?.MessageID,
        Recipient: payload?.Recipient,
        Tag: payload?.Tag,
        DeliveredAt: payload?.DeliveredAt,
      });
    }
    const campaignId = extractCampaignIdFromTag(payload?.Tag);
    if (campaignId) {
      await incrementCampaignCounter(campaignId, "delivered_count");
    }
  } catch {
    // Malformed payloads still get 200 — nothing actionable to do.
  }
  return NextResponse.json({ ok: true });
}
