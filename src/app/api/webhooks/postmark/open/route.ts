import { NextRequest, NextResponse } from "next/server";
import {
  extractCampaignIdFromTag,
  incrementCampaignCounter,
} from "@/lib/marketing-campaign-counters";

// Postmark open webhook — fires whenever the recipient loads images
// from the email. We increment marketing_campaigns.opened_count only on
// the FIRST open per message (Postmark's FirstOpen flag), which gives
// us standard "unique opens" semantics.
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    if (process.env.NODE_ENV !== "production") {
      console.log("[postmark open]", {
        MessageID: payload?.MessageID,
        Recipient: payload?.Recipient,
        FirstOpen: payload?.FirstOpen,
        ReceivedAt: payload?.ReceivedAt,
        Tag: payload?.Tag,
      });
    }
    if (payload?.FirstOpen === true) {
      const campaignId = extractCampaignIdFromTag(payload?.Tag);
      if (campaignId) {
        await incrementCampaignCounter(campaignId, "opened_count");
      }
    }
  } catch {
    // Ignore parse errors
  }
  return NextResponse.json({ ok: true });
}
