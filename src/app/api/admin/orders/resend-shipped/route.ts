import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";
import { renderOrderShipped } from "@/lib/email-templates/order-shipped";
import { buildOrderShippedFromWcOrderId } from "@/lib/email-templates/order-shipped-data";

// Resend the "order shipped" email to the real customer for a given
// WooCommerce order id. The sync fires this email once, on the transition into
// "completed" — so if the tracking number is added to the order AFTER that
// (a common ordering when the label is booked separately), the customer's
// email went out with no tracking link and never gets one.
//
// This route rebuilds the email from live WC data, so the resend picks up
// whatever tracking is on the order now. Same build -> render -> send chain the
// sync uses, so the customer gets an identical email to a normal shipment.
//
// Auth: admin session, OR a CRON_SECRET bearer for headless/local calls.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!bearerOk && !(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { wcOrderId?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const wcOrderId = Number(body.wcOrderId);
  if (!Number.isInteger(wcOrderId) || wcOrderId <= 0) {
    return NextResponse.json({ error: "wcOrderId (positive integer) is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase
    .from("orders")
    .select("customer_email, wc_order_id, wc_status")
    .eq("wc_order_id", wcOrderId)
    .limit(1)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: `No Supabase order found for WC order #${wcOrderId}.` }, { status: 404 });
  }
  if (!order.customer_email) {
    return NextResponse.json({ error: `Order #${wcOrderId} has no customer_email.` }, { status: 422 });
  }
  // Only ever resend for an order that has actually shipped, so a stray call
  // can't tell a customer their unpicked order is on its way.
  if (order.wc_status !== "completed") {
    return NextResponse.json(
      { error: `Order #${wcOrderId} is "${order.wc_status}", not "completed". Refusing to send a shipped email.` },
      { status: 409 }
    );
  }

  const built = await buildOrderShippedFromWcOrderId(wcOrderId);
  if (!built.ok) {
    return NextResponse.json({ error: built.reason }, { status: 422 });
  }

  const { subject, html, text } = renderOrderShipped(built.data);
  const sent = await sendTransactionalEmail({
    to: order.customer_email,
    subject,
    html,
    text,
    tag: "order-shipped",
    metadata: { order: String(wcOrderId), resend: "1" },
  });

  if (!sent.ok) {
    return NextResponse.json(
      { ok: false, wcOrderId, sent_to: order.customer_email, error: sent.error },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    wcOrderId,
    sent_to: order.customer_email,
    messageId: sent.messageId,
    trackingNumber: built.data.trackingNumber ?? null,
    trackingProvider: built.data.trackingProvider ?? null,
  });
}
