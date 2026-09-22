import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";
import { renderOrderConfirmed } from "@/lib/email-templates/order-confirmed";
import { buildOrderConfirmedFromWcOrderId } from "@/lib/email-templates/order-confirmed-data";

// Resend the order-confirmation email (the app's Postmark "order-confirmed"
// template) to the real customer for a given WooCommerce order id. Used to
// recover confirmations that never fired — e.g. orders whose WC creation failed
// during a WordPress outage and were reconciled after the fact.
//
// Runs the EXACT same build -> render -> send chain the Stripe webhook uses, so
// the customer gets an identical email to a normal checkout.
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

  // Recipient: the customer email on the Supabase order row.
  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase
    .from("orders")
    .select("customer_email, wc_order_id")
    .eq("wc_order_id", wcOrderId)
    .limit(1)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: `No Supabase order found for WC order #${wcOrderId}.` }, { status: 404 });
  }
  if (!order.customer_email) {
    return NextResponse.json({ error: `Order #${wcOrderId} has no customer_email.` }, { status: 422 });
  }

  const built = await buildOrderConfirmedFromWcOrderId(wcOrderId);
  if (!built.ok) {
    return NextResponse.json({ error: built.reason }, { status: 422 });
  }

  const { subject, html, text } = renderOrderConfirmed(built.data);
  const sent = await sendTransactionalEmail({
    to: order.customer_email,
    subject,
    html,
    text,
    tag: "order-confirmed",
    metadata: { order: String(wcOrderId), resend: "1" },
  });

  if (!sent.ok) {
    return NextResponse.json({ ok: false, wcOrderId, sent_to: order.customer_email, error: sent.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, wcOrderId, sent_to: order.customer_email, messageId: sent.messageId });
}
