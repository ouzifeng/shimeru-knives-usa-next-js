import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendSupportAdminNotification } from "@/lib/support-notifications";

const REGION = "uk";

type Body = {
  name?: string;
  email?: string;
  phone?: string;
  order_number?: string;
  message?: string;
  idempotency_key?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const message = body.message?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const orderNumber = body.order_number?.trim() ?? "";
  const idempotencyKey = body.idempotency_key?.trim() ?? "";

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "Name, email and message are required" },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, ticket_id: existing.id, deduped: true });
    }
  }

  const subject = orderNumber
    ? `Contact Form: ${name} (Order ${orderNumber})`
    : `Contact Form: ${name}`;

  let contentText = message;
  if (phone || orderNumber) {
    contentText += "\n\n---\n";
    if (phone) contentText += `Phone: ${phone}\n`;
    if (orderNumber) contentText += `Order Number: ${orderNumber}\n`;
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      region: REGION,
      customer_email: email,
      customer_name: name,
      customer_phone: phone || null,
      order_number: orderNumber || null,
      subject,
      status: "pending",
      source: "contact_form",
      idempotency_key: idempotencyKey || null,
    })
    .select("id")
    .single();

  if (ticketError) {
    if (ticketError.code === "23505" && idempotencyKey) {
      const { data: raced } = await supabase
        .from("support_tickets")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) {
        return NextResponse.json({ ok: true, ticket_id: raced.id, deduped: true });
      }
    }
    console.error("[contact-form] ticket insert failed:", ticketError);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }

  const { error: messageError } = await supabase
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticket.id,
      direction: "inbound",
      from_addr: email,
      content_text: contentText,
    });

  if (messageError) {
    console.error("[contact-form] message insert failed:", messageError);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }

  await sendSupportAdminNotification({
    kind: "new_ticket",
    ticketId: ticket.id,
    subject,
    customerName: name,
    customerEmail: email,
    customerPhone: phone || null,
    orderNumber: orderNumber || null,
    source: "contact_form",
    messageContent: contentText,
  });

  return NextResponse.json({ ok: true, ticket_id: ticket.id });
}
