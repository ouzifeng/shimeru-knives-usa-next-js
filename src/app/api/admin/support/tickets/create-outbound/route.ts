// Admin-initiated ticket: shop reaches out to a customer (from the order
// detail page or the customer detail page). Creates the ticket row, inserts
// the first outbound message, and sends via Postmark with a threading
// Message-ID so the customer's reply lands in the same ticket via the
// existing inbound webhook.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

const FROM_NAME = "Shimeru Knives";
const FROM_EMAIL = "sales@us.shimeruknives.co.uk";
const THREADING_DOMAIN = "us.shimeruknives.co.uk";

type Body = {
  customer_email?: string;
  customer_name?: string;
  order_number?: string;
  subject?: string;
  message?: string;
};

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.POSTMARK_SERVER_TOKEN) {
    return NextResponse.json(
      { error: "POSTMARK_SERVER_TOKEN not configured" },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const customer_email = String(body.customer_email ?? "").trim().toLowerCase();
  const customer_name = String(body.customer_name ?? "").trim() || null;
  const order_number = String(body.order_number ?? "").trim() || null;
  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!isEmail(customer_email)) {
    return NextResponse.json({ error: "Valid customer email required" }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ error: "Subject required" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      region: "us",
      customer_email,
      customer_name,
      order_number,
      subject,
      source: "admin",
      status: "solved",
    })
    .select("id")
    .single();

  if (ticketError || !ticket) {
    return NextResponse.json(
      { error: ticketError?.message || "Failed to create ticket" },
      { status: 500 }
    );
  }

  const { data: pendingMessage, error: pendingError } = await supabase
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticket.id,
      direction: "outbound",
      from_addr: FROM_EMAIL,
      content_text: message,
    })
    .select("id")
    .single();

  if (pendingError || !pendingMessage) {
    return NextResponse.json(
      { error: pendingError?.message || "Failed to record message" },
      { status: 500 }
    );
  }

  const outboundMessageId = `ticket-${ticket.id}-${pendingMessage.id}@${THREADING_DOMAIN}`;

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      From: `${FROM_NAME} <${FROM_EMAIL}>`,
      To: customer_email,
      Subject: subject,
      TextBody: message,
      MessageStream: "outbound",
      Headers: [{ Name: "Message-ID", Value: `<${outboundMessageId}>` }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[create-outbound] postmark failed:", res.status, errText);
    await supabase.from("support_ticket_messages").delete().eq("id", pendingMessage.id);
    await supabase.from("support_tickets").delete().eq("id", ticket.id);
    return NextResponse.json(
      { error: "Failed to send email", details: errText },
      { status: 502 }
    );
  }

  const postmarkResponse = (await res.json().catch(() => null)) as {
    MessageID?: string;
  } | null;

  await supabase
    .from("support_ticket_messages")
    .update({
      postmark_message_id: postmarkResponse?.MessageID ?? outboundMessageId,
    })
    .eq("id", pendingMessage.id);

  return NextResponse.json({
    ok: true,
    ticket_id: ticket.id,
  });
}
