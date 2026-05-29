import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  extractCampaignIdFromTag,
  incrementCampaignCounter,
} from "@/lib/marketing-campaign-counters";

type PostmarkBouncePayload = {
  Type?: string;
  MessageID?: string;
  Email?: string;
  Description?: string;
  Details?: string;
  BouncedAt?: string;
  Tag?: string;
};

export async function POST(req: NextRequest) {
  let payload: PostmarkBouncePayload;
  try {
    payload = (await req.json()) as PostmarkBouncePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Bounce on a marketing send — increment the campaign's bounced_count
  // alongside (independent of the support-ticket logic below).
  const campaignId = extractCampaignIdFromTag(payload.Tag);
  if (campaignId) {
    await incrementCampaignCounter(campaignId, "bounced_count");
  }

  const postmarkMessageId = payload.MessageID;
  if (!postmarkMessageId) {
    return NextResponse.json({ ok: true, ignored: "no MessageID" });
  }

  const supabase = getSupabaseAdmin();

  // Find the outbound ticket message that produced this Postmark MessageID
  const { data: messageRow } = await supabase
    .from("support_ticket_messages")
    .select("ticket_id")
    .eq("postmark_message_id", postmarkMessageId)
    .maybeSingle();

  if (!messageRow) {
    // Not a support ticket reply — could be any other transactional email.
    // Still ack with 200 so Postmark stops retrying.
    console.log(
      "[postmark bounce] no matching ticket message for MessageID",
      postmarkMessageId
    );
    return NextResponse.json({ ok: true, matched: false });
  }

  await supabase
    .from("support_tickets")
    .update({
      delivery_status: "bounced",
      last_updated: new Date().toISOString(),
    })
    .eq("id", messageRow.ticket_id);

  // Append a note to the ticket thread so the admin sees the reason
  const note = [
    `Email bounced (${payload.Type || "unknown"})`,
    payload.Email ? `Recipient: ${payload.Email}` : null,
    payload.Description ? `Description: ${payload.Description}` : null,
    payload.Details ? `Details: ${payload.Details}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await supabase.from("support_ticket_messages").insert({
    ticket_id: messageRow.ticket_id,
    direction: "note",
    from_addr: "system",
    content_text: note,
  });

  return NextResponse.json({ ok: true, matched: true });
}
