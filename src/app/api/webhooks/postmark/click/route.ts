import { NextRequest, NextResponse } from "next/server";
import {
  extractCampaignIdFromTag,
  incrementCampaignCounter,
} from "@/lib/marketing-campaign-counters";

// Postmark click webhook — fires for every tracked-link click. We
// increment marketing_campaigns.clicked_count on every event (total
// clicks, not unique clickers — keeps it simple, fine as an engagement
// signal at our scale).
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    if (process.env.NODE_ENV !== "production") {
      console.log("[postmark click]", {
        MessageID: payload?.MessageID,
        Recipient: payload?.Recipient,
        OriginalLink: payload?.OriginalLink,
        ReceivedAt: payload?.ReceivedAt,
        Tag: payload?.Tag,
      });
    }
    const campaignId = extractCampaignIdFromTag(payload?.Tag);
    if (campaignId) {
      await incrementCampaignCounter(campaignId, "clicked_count");
    }
  } catch {
    // Ignore parse errors
  }
  return NextResponse.json({ ok: true });
}
