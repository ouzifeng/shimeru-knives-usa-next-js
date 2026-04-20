import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const RETURN_WINDOW_DAYS = 60;

const RETURN_ADDRESS = `Kays Logistics C/O Shimeru Knives
1 Windward Drive
Estuary Commerce Park
Speke
Liverpool
L24 8QR`;

export async function POST(req: NextRequest) {
  const { orderId, email, items, reason } = await req.json();

  if (!orderId || !email || !items?.length) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  // Re-validate the order
  const { data: order } = await admin
    .from("orders")
    .select("id, wc_order_id, customer_email, customer_name, status, line_items, created_at")
    .eq("id", orderId)
    .ilike("customer_email", email.trim())
    .single();

  if (!order || order.status !== "completed") {
    return NextResponse.json(
      { error: "Order not found or not eligible." },
      { status: 400 }
    );
  }

  // Check 60-day window
  const daysSince = Math.floor(
    (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSince > RETURN_WINDOW_DAYS) {
    return NextResponse.json(
      { error: "This order is outside the return window." },
      { status: 400 }
    );
  }

  // Check for existing return
  const { data: existing } = await admin
    .from("return_requests")
    .select("id")
    .eq("order_id", order.id)
    .not("status", "eq", "rejected")
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "A return request already exists for this order." },
      { status: 400 }
    );
  }

  // Enrich items with product names
  type ReturnItem = { pid: number; vid?: number; qty: number };
  const returnItems = items as ReturnItem[];
  const pids = [...new Set(returnItems.map((i: ReturnItem) => i.pid))];

  const { data: products } = await admin
    .from("products")
    .select("id, name")
    .in("id", pids);

  const nameMap = new Map<number, string>();
  if (products) {
    for (const p of products) nameMap.set(p.id, p.name);
  }

  // Get prices from original order line items
  type OrderLineItem = { pid: number; qty: number; vid?: number; price?: number };
  const orderItems = (order.line_items as OrderLineItem[]) || [];
  const priceMap = new Map<string, number>();
  for (const oi of orderItems) {
    const key = oi.vid ? `${oi.pid}-${oi.vid}` : `${oi.pid}`;
    priceMap.set(key, oi.price ?? 0);
  }

  const enrichedItems = returnItems.map((item: ReturnItem) => {
    const key = item.vid ? `${item.pid}-${item.vid}` : `${item.pid}`;
    return {
      pid: item.pid,
      vid: item.vid,
      name: nameMap.get(item.pid) || `Product #${item.pid}`,
      qty: item.qty,
      price: priceMap.get(key) ?? 0,
    };
  });

  // Insert return request
  const { error: insertErr } = await admin.from("return_requests").insert({
    order_id: order.id,
    wc_order_id: order.wc_order_id,
    customer_email: order.customer_email,
    customer_name: order.customer_name,
    items: enrichedItems,
    reason: reason || null,
    status: "pending",
  });

  if (insertErr) {
    console.error("[returns/submit] Insert error:", insertErr);
    return NextResponse.json(
      { error: "Failed to create return request." },
      { status: 500 }
    );
  }

  // Build confirmation email HTML
  const itemRows = enrichedItems
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.qty}</td>
        </tr>`
    )
    .join("");

  const customerHtml = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
      <h2 style="margin:0 0 16px;font-size:20px">Your Return Request</h2>
      <p style="margin:0 0 8px;font-size:14px">
        Hi ${order.customer_name || "there"},
      </p>
      <p style="margin:0 0 16px;font-size:14px">
        We've received your return request for <strong>Order #${order.wc_order_id}</strong>. Here's what to do next:
      </p>

      <h3 style="margin:0 0 8px;font-size:15px">Items to Return</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Product</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Qty</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <h3 style="margin:0 0 8px;font-size:15px">Return Address</h3>
      <p style="margin:0 0 16px;font-size:14px;white-space:pre-line;background:#f9fafb;padding:12px 16px;border-radius:6px">${RETURN_ADDRESS}</p>

      <h3 style="margin:0 0 8px;font-size:15px">Important</h3>
      <p style="margin:0 0 16px;font-size:14px">
        To help ensure a smooth return and prompt refund, please kindly ensure the knife is in its original, unused condition, and that both the original packaging and your order number are included with your return. Once your returned item is received at our warehouse, your refund will be processed promptly.
      </p>

      <p style="margin:0;font-size:13px;color:#666">
        The cost of return delivery is the responsibility of the customer unless otherwise agreed. If you have any questions, please reply to this email or visit our contact page.
      </p>
    </div>
  `;

  // Send customer confirmation email
  const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Shimeru Knives", email: "shop@shimeruknives.us" },
      to: [{ email: order.customer_email, name: order.customer_name || "" }],
      subject: `Your Return Request — Order #${order.wc_order_id}`,
      htmlContent: customerHtml,
    }),
  });

  if (!brevoRes.ok) {
    console.error("[returns/submit] Brevo customer email error:", await brevoRes.text());
  }

  // Send admin notification email
  const adminHtml = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
      <h2 style="margin:0 0 16px;font-size:20px">New Return Request</h2>
      <p style="margin:0 0 8px;font-size:14px">
        <strong>${order.customer_name || order.customer_email}</strong> has submitted a return request for <strong>Order #${order.wc_order_id}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Product</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Qty</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      ${reason ? `<p style="margin:0 0 8px;font-size:14px"><strong>Reason:</strong> ${reason}</p>` : ""}
      <p style="margin:16px 0 0;font-size:13px;color:#666">
        Review this return in the admin panel.
      </p>
    </div>
  `;

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Shimeru Knives", email: "shop@shimeruknives.us" },
      to: [{ email: "mr.davidoak@gmail.com", name: "David" }],
      subject: `New Return Request — Order #${order.wc_order_id}`,
      htmlContent: adminHtml,
    }),
  });

  return NextResponse.json({ ok: true });
}
