import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { storeConfig } from "../../../../../store.config";

const REPORT_TO = "mr.davidoak@gmail.com";
const SENDER = { name: "Shimeru Reports", email: "sales@shimeruknives.co.uk" };
const BOT_IP_PREFIXES = ["66.102.", "64.233.", "35.187.", "35.190.", "35.191.", "66.249."];

function isBotIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return BOT_IP_PREFIXES.some((p) => ip.startsWith(p));
}

type FunnelEvent = {
  event: string;
  session_id: string;
  product_id: number | null;
  product_name: string | null;
  cart_value: number | null;
  created_at: string;
};

type Order = {
  id: number;
  wc_order_id: number | null;
  status: string;
  amount_total: number | null;
  customer_email: string | null;
  coupon_code: string | null;
  attribution: { utm_source?: string; utm_medium?: string; utm_campaign?: string } | null;
  line_items: { product_id?: number; name?: string; qty?: number; price?: number }[] | null;
  funnel_session_id: string | null;
  ip: string | null;
  created_at: string;
};

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function topN<T extends { count: number }>(map: Map<string, T>, n: number): Array<T & { key: string }> {
  return Array.from(map, ([key, val]) => ({ key, ...val }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  const [feRes, ordersRes] = await Promise.all([
    sb
      .from("funnel_events")
      .select("event, session_id, product_id, product_name, cart_value, created_at")
      .gte("created_at", sinceIso),
    sb
      .from("orders")
      .select("id, wc_order_id, status, amount_total, customer_email, coupon_code, attribution, line_items, funnel_session_id, ip, created_at")
      .gte("created_at", sinceIso),
  ]);

  if (feRes.error) return NextResponse.json({ error: feRes.error.message }, { status: 500 });
  if (ordersRes.error) return NextResponse.json({ error: ordersRes.error.message }, { status: 500 });

  const events = (feRes.data || []) as FunnelEvent[];
  const allOrders = (ordersRes.data || []) as Order[];
  const orders = allOrders.filter((o) => !isBotIp(o.ip));
  const botOrderCount = allOrders.length - orders.length;

  // Funnel: distinct sessions reaching each stage
  const sessionsByStage: Record<string, Set<string>> = {
    add_to_cart: new Set(),
    checkout_viewed: new Set(),
    payment_started: new Set(),
  };
  for (const e of events) {
    if (sessionsByStage[e.event]) sessionsByStage[e.event].add(e.session_id);
  }
  const completedSessions = new Set(
    orders.filter((o) => o.status === "completed" && o.funnel_session_id).map((o) => o.funnel_session_id!)
  );

  const cartSessions = sessionsByStage.add_to_cart.size;
  const checkoutSessions = sessionsByStage.checkout_viewed.size;
  const payStartSessions = sessionsByStage.payment_started.size;
  const completedCount = completedSessions.size;

  const funnel = {
    add_to_cart: cartSessions,
    checkout_viewed: checkoutSessions,
    payment_started: payStartSessions,
    payment_completed: completedCount,
    drop_off_cart_to_checkout_pct: pct(cartSessions - checkoutSessions, cartSessions),
    drop_off_checkout_to_pay_pct: pct(checkoutSessions - payStartSessions, checkoutSessions),
    drop_off_pay_to_complete_pct: pct(payStartSessions - completedCount, payStartSessions),
    overall_conversion_pct: pct(completedCount, cartSessions),
  };

  // Top products: added to cart vs purchased
  const addCount = new Map<string, { count: number; name: string }>();
  for (const e of events) {
    if (e.event !== "add_to_cart" || !e.product_id) continue;
    const key = String(e.product_id);
    const cur = addCount.get(key) || { count: 0, name: e.product_name || "" };
    cur.count += 1;
    addCount.set(key, cur);
  }

  const buyCount = new Map<string, { count: number; name: string; revenue: number }>();
  for (const o of orders) {
    if (o.status !== "completed" || !Array.isArray(o.line_items)) continue;
    for (const li of o.line_items) {
      if (!li.product_id) continue;
      const key = String(li.product_id);
      const cur = buyCount.get(key) || { count: 0, name: li.name || "", revenue: 0 };
      cur.count += li.qty || 1;
      cur.revenue += (li.price || 0) * (li.qty || 1);
      buyCount.set(key, cur);
    }
  }

  // Source / medium / campaign — completed orders only, then conversion vs all attributed sessions
  const sourceStats = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    if (o.status !== "completed") continue;
    const src = o.attribution?.utm_source || "direct";
    const med = o.attribution?.utm_medium || "(none)";
    const key = `${src} / ${med}`;
    const cur = sourceStats.get(key) || { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(o.amount_total) || 0;
    sourceStats.set(key, cur);
  }

  const campaignStats = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    if (o.status !== "completed") continue;
    const camp = o.attribution?.utm_campaign;
    if (!camp) continue;
    const cur = campaignStats.get(camp) || { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(o.amount_total) || 0;
    campaignStats.set(camp, cur);
  }

  // Abandoned cart contents — sessions that hit checkout_viewed but never completed
  const abandonedProductCounts = new Map<string, { count: number; name: string }>();
  for (const e of events) {
    if (e.event !== "add_to_cart" || !e.product_id) continue;
    if (completedSessions.has(e.session_id)) continue;
    const key = String(e.product_id);
    const cur = abandonedProductCounts.get(key) || { count: 0, name: e.product_name || "" };
    cur.count += 1;
    abandonedProductCounts.set(key, cur);
  }

  // Hour-of-day distribution (UTC) of completed orders
  const ordersByHour: Record<number, number> = {};
  const ordersByDow: Record<number, number> = {};
  for (const o of orders) {
    if (o.status !== "completed") continue;
    const d = new Date(o.created_at);
    ordersByHour[d.getUTCHours()] = (ordersByHour[d.getUTCHours()] || 0) + 1;
    ordersByDow[d.getUTCDay()] = (ordersByDow[d.getUTCDay()] || 0) + 1;
  }

  // Repeat-customer rate
  const emailCounts = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "completed" || !o.customer_email) continue;
    const e = o.customer_email.toLowerCase();
    emailCounts.set(e, (emailCounts.get(e) || 0) + 1);
  }
  const repeatCustomers = Array.from(emailCounts.values()).filter((n) => n > 1).length;
  const uniqueCustomers = emailCounts.size;

  // Coupons used
  const couponStats = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    if (o.status !== "completed" || !o.coupon_code) continue;
    const cur = couponStats.get(o.coupon_code) || { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(o.amount_total) || 0;
    couponStats.set(o.coupon_code, cur);
  }

  // Totals
  const completedOrders = orders.filter((o) => o.status === "completed");
  const totalRevenue = completedOrders.reduce((s, o) => s + (Number(o.amount_total) || 0), 0);
  const aov = completedOrders.length ? totalRevenue / completedOrders.length : 0;

  const digest = {
    store: storeConfig.name,
    currency: process.env.NEXT_PUBLIC_CURRENCY || "GBP",
    window: { since: sinceIso, until: now.toISOString(), days: 30 },
    totals: {
      completed_orders: completedOrders.length,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      average_order_value: Math.round(aov * 100) / 100,
      unique_customers: uniqueCustomers,
      repeat_customers: repeatCustomers,
      repeat_rate_pct: pct(repeatCustomers, uniqueCustomers),
      bot_orders_excluded: botOrderCount,
    },
    funnel,
    top_products_added: topN(addCount, 15),
    top_products_purchased: topN(buyCount, 15),
    top_abandoned_products: topN(abandonedProductCounts, 15),
    source_medium: topN(sourceStats, 25),
    campaigns: topN(campaignStats, 25),
    coupons: topN(couponStats, 20),
    orders_by_utc_hour: ordersByHour,
    orders_by_utc_dow: ordersByDow,
  };

  const json = JSON.stringify(digest, null, 2);
  const subject = `${storeConfig.name} — Monthly Journey Digest (last 30 days)`;
  const htmlContent = `<!DOCTYPE html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#222;max-width:800px;margin:0 auto;padding:24px">
  <h1 style="font-size:18px;margin:0 0 12px">${storeConfig.name} — last 30 days</h1>
  <p style="font-size:14px;line-height:1.5;margin:0 0 16px">
    Copy the JSON below and paste it into Claude with a question like
    <em>"What's working, what's leaking, and what should I test next month?"</em>
  </p>
  <pre style="font-family:Menlo,Consolas,monospace;font-size:12px;background:#f6f6f6;border:1px solid #e0e0e0;border-radius:6px;padding:16px;white-space:pre-wrap;word-break:break-word">${json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>
</body></html>`;

  const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: SENDER,
      replyTo: SENDER,
      to: [{ email: REPORT_TO, name: "David" }],
      subject,
      htmlContent,
    }),
  });

  if (!brevoRes.ok) {
    const errText = await brevoRes.text();
    console.error("[journey-digest] Brevo error:", errText);
    return NextResponse.json({ error: "Failed to send email", detail: errText }, { status: 502 });
  }

  return NextResponse.json({ ok: true, bytes: json.length });
}
