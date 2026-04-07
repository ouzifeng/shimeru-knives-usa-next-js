import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const RETURN_WINDOW_DAYS = 60;

export async function POST(req: NextRequest) {
  const { email, orderNumber } = await req.json();

  if (!email || !orderNumber) {
    return NextResponse.json(
      { error: "Email and order number are required." },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  // Look up order by WC order ID and email
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, wc_order_id, customer_email, customer_name, amount_total, currency, status, line_items, created_at")
    .eq("wc_order_id", Number(orderNumber))
    .ilike("customer_email", email.trim())
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: "We couldn't find an order matching that email and order number. Please check your details and try again." },
      { status: 404 }
    );
  }

  // Must be a completed order
  if (order.status !== "completed") {
    return NextResponse.json(
      { error: "This order is not eligible for a return." },
      { status: 400 }
    );
  }

  // Check 60-day window
  const orderDate = new Date(order.created_at);
  const daysSince = Math.floor(
    (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSince > RETURN_WINDOW_DAYS) {
    return NextResponse.json(
      { error: `This order was placed ${daysSince} days ago. Our return window is ${RETURN_WINDOW_DAYS} days. Please contact us if you believe this is an error.` },
      { status: 400 }
    );
  }

  // Check for existing return request
  const { data: existing } = await admin
    .from("return_requests")
    .select("id")
    .eq("order_id", order.id)
    .not("status", "eq", "rejected")
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "A return request has already been submitted for this order." },
      { status: 400 }
    );
  }

  // Enrich line items with product names
  type LineItem = { pid: number; qty: number; vid?: number; price?: number };
  const lineItems = (order.line_items as LineItem[]) || [];
  const pids = [...new Set(lineItems.map((i) => i.pid))];

  const { data: products } = await admin
    .from("products")
    .select("id, name")
    .in("id", pids);

  const nameMap = new Map<number, string>();
  if (products) {
    for (const p of products) nameMap.set(p.id, p.name);
  }

  // Build enriched items for the frontend
  const items = lineItems.map((item) => ({
    pid: item.pid,
    vid: item.vid,
    name: nameMap.get(item.pid) || `Product #${item.pid}`,
    qty: item.qty,
    price: item.price ?? 0,
  }));

  return NextResponse.json({
    orderId: order.id,
    wcOrderId: order.wc_order_id,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    orderDate: order.created_at,
    items,
  });
}
