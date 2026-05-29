import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

type PostmarkSpamPayload = {
  Type?: string;
  MessageID?: string;
  Email?: string;
  Description?: string;
  Details?: string;
};

export async function POST(req: NextRequest) {
  let payload: PostmarkSpamPayload;
  try {
    payload = (await req.json()) as PostmarkSpamPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const postmarkMessageId = payload.MessageID;
  if (!postmarkMessageId) {
    return NextResponse.json({ ok: true, ignored: "no MessageID" });
  }

  const supabase = getSupabaseAdmin();

  const { data: messageRow } = await supabase
    .from("support_ticket_messages")
    .select("ticket_id")
    .eq("postmark_message_id", postmarkMessageId)
    .maybeSingle();

  if (!messageRow) {
    console.log(
      "[postmark spam] no matching ticket message for MessageID",
      postmarkMessageId
    );
    return NextResponse.json({ ok: true, matched: false });
  }

  await supabase
    .from("support_tickets")
    .update({
      delivery_status: "spam_complaint",
      last_updated: new Date().toISOString(),
    })
    .eq("id", messageRow.ticket_id);

  const note = [
    "Recipient marked the reply as spam",
    payload.Email ? `Recipient: ${payload.Email}` : null,
    payload.Description ? `Description: ${payload.Description}` : null,
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
