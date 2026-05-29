import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";
import { storeConfig } from "../../../../../store.config";

const REPORT_TO = "mr.davidoak@gmail.com";
const BOT_IP_PREFIXES = ["66.102.", "64.233.", "35.187.", "35.190.", "35.191.", "66.249."];
const BOT_UA_PATTERNS = [/googlebot/i, /bingbot/i, /bytespider/i, /ahrefsbot/i, /semrushbot/i, /facebookexternalhit/i];

function isBotIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return BOT_IP_PREFIXES.some((p) => ip.startsWith(p));
}
function isBotUa(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return BOT_UA_PATTERNS.some((rx) => rx.test(ua));
}

type EventMeta = {
  ip?: string | null;
  ua?: string | null;
  path?: string | null;
  referrer?: string | null;
  attribution?: { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_term?: string; utm_content?: string; referrer?: string; landing_page?: string } | null;
};

type FunnelEvent = {
  event: string;
  session_id: string;
  product_id: number | null;
  product_name: string | null;
  cart_value: number | null;
  metadata: EventMeta | null;
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

type Product = {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
};

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function slugFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const m = path.match(/^\/product\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
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

  const [feRes, ordersRes, productsRes] = await Promise.all([
    sb
      .from("funnel_events")
      .select("event, session_id, product_id, product_name, cart_value, metadata, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true }),
    sb
      .from("orders")
      .select("id, wc_order_id, status, amount_total, customer_email, coupon_code, attribution, line_items, funnel_session_id, ip, created_at")
      .gte("created_at", sinceIso),
    sb.from("products").select("id, name, slug, sku").eq("status", "publish"),
  ]);

  if (feRes.error) return NextResponse.json({ error: feRes.error.message }, { status: 500 });
  if (ordersRes.error) return NextResponse.json({ error: ordersRes.error.message }, { status: 500 });
  if (productsRes.error) return NextResponse.json({ error: productsRes.error.message }, { status: 500 });

  const events = (feRes.data || []) as FunnelEvent[];
  const allOrders = (ordersRes.data || []) as Order[];
  const products = (productsRes.data || []) as Product[];

  const slugToProduct = new Map<string, Product>();
  for (const p of products) {
    if (p.slug) slugToProduct.set(p.slug, p);
  }

  // Determine bot sessions: any event from a known bot IP / UA marks the whole session as bot.
  const botSessions = new Set<string>();
  for (const e of events) {
    if (isBotIp(e.metadata?.ip) || isBotUa(e.metadata?.ua)) {
      botSessions.add(e.session_id);
    }
  }
  let botOrderCount = 0;
  const cleanOrders = allOrders.filter((o) => {
    if (isBotIp(o.ip)) { botOrderCount++; return false; }
    if (o.funnel_session_id && botSessions.has(o.funnel_session_id)) { botOrderCount++; return false; }
    return true;
  });

  // Group events by session (filter out bot sessions)
  const sessionsMap = new Map<string, FunnelEvent[]>();
  for (const e of events) {
    if (botSessions.has(e.session_id)) continue;
    const list = sessionsMap.get(e.session_id) || [];
    list.push(e);
    sessionsMap.set(e.session_id, list);
  }

  // Order lookup by funnel_session_id
  const orderBySession = new Map<string, Order>();
  for (const o of cleanOrders) {
    if (o.funnel_session_id) orderBySession.set(o.funnel_session_id, o);
  }

  // Per-product counters
  const productViews = new Map<number, number>();
  const productAdds = new Map<number, number>();
  const productBuys = new Map<number, { qty: number; revenue: number }>();

  // Per-product session-id back-references (sets to dedupe)
  const productViewSessions = new Map<number, Set<string>>();
  const productAddSessions = new Map<number, Set<string>>();
  const productBuySessions = new Map<number, Set<string>>();
  function pushSession(map: Map<number, Set<string>>, pid: number, sid: string) {
    let set = map.get(pid);
    if (!set) { set = new Set(); map.set(pid, set); }
    set.add(sid);
  }

  // Build per-session journeys
  const sessions: Array<{
    session_id: string;
    first_seen: string;
    last_seen: string;
    duration_seconds: number;
    page_count: number;
    attribution: EventMeta["attribution"] | null;
    referrer: string | null;
    landing_path: string | null;
    outcome: "completed" | "abandoned_payment" | "abandoned_checkout" | "abandoned_cart" | "browsing";
    order_id: number | null;
    order_value: number | null;
    events: Array<{ ts: string; event: string; path: string | null; product_id: number | null; product_name: string | null; cart_value: number | null }>;
  }> = [];

  for (const [sid, evs] of sessionsMap) {
    evs.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const first = evs[0];
    const last = evs[evs.length - 1];

    // Attribution: first event with attribution in metadata
    const attrFromEvents = evs.find((e) => e.metadata?.attribution)?.metadata?.attribution ?? null;
    const referrer = evs.find((e) => e.metadata?.referrer)?.metadata?.referrer ?? null;
    const landingPath = first.metadata?.path ?? null;

    // Tally per-product views: page_view with path matching /product/<slug>
    let pageCount = 0;
    for (const e of evs) {
      if (e.event === "page_view") pageCount += 1;
      if (e.event === "page_view") {
        const slug = slugFromPath(e.metadata?.path);
        const prod = slug ? slugToProduct.get(slug) : null;
        if (prod) {
          productViews.set(prod.id, (productViews.get(prod.id) || 0) + 1);
          pushSession(productViewSessions, prod.id, sid);
        }
      }
      if (e.event === "add_to_cart" && e.product_id) {
        productAdds.set(e.product_id, (productAdds.get(e.product_id) || 0) + 1);
        pushSession(productAddSessions, e.product_id, sid);
      }
    }

    const order = orderBySession.get(sid) || null;
    let outcome: "completed" | "abandoned_payment" | "abandoned_checkout" | "abandoned_cart" | "browsing";
    if (order && order.status === "completed") outcome = "completed";
    else if (evs.some((e) => e.event === "payment_started")) outcome = "abandoned_payment";
    else if (evs.some((e) => e.event === "checkout_viewed")) outcome = "abandoned_checkout";
    else if (evs.some((e) => e.event === "add_to_cart")) outcome = "abandoned_cart";
    else outcome = "browsing";

    sessions.push({
      session_id: sid,
      first_seen: first.created_at,
      last_seen: last.created_at,
      duration_seconds: Math.round((new Date(last.created_at).getTime() - new Date(first.created_at).getTime()) / 1000),
      page_count: pageCount,
      attribution: attrFromEvents,
      referrer,
      landing_path: landingPath,
      outcome,
      order_id: order?.wc_order_id ?? null,
      order_value: order?.amount_total != null ? Number(order.amount_total) : null,
      events: evs.map((e) => ({
        ts: e.created_at,
        event: e.event,
        path: e.metadata?.path ?? null,
        product_id: e.product_id,
        product_name: e.product_name,
        cart_value: e.cart_value,
      })),
    });
  }

  // Per-product purchases come from completed orders' line items
  for (const o of cleanOrders) {
    if (o.status !== "completed" || !Array.isArray(o.line_items)) continue;
    for (const li of o.line_items) {
      if (!li.product_id) continue;
      const cur = productBuys.get(li.product_id) || { qty: 0, revenue: 0 };
      cur.qty += li.qty || 1;
      cur.revenue += (li.price || 0) * (li.qty || 1);
      productBuys.set(li.product_id, cur);
      if (o.funnel_session_id) {
        pushSession(productBuySessions, li.product_id, o.funnel_session_id);
      }
    }
  }

  const productTable = products.map((p) => {
    const views = productViews.get(p.id) || 0;
    const adds = productAdds.get(p.id) || 0;
    const buys = productBuys.get(p.id) || { qty: 0, revenue: 0 };
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      slug: p.slug,
      views,
      adds_to_cart: adds,
      purchases: buys.qty,
      revenue: Math.round(buys.revenue * 100) / 100,
      view_to_add_pct: pct(adds, views),
      add_to_buy_pct: pct(buys.qty, adds),
      view_to_buy_pct: pct(buys.qty, views),
      never_viewed: views === 0,
      viewed_by_sessions: Array.from(productViewSessions.get(p.id) || []),
      added_by_sessions: Array.from(productAddSessions.get(p.id) || []),
      purchased_in_sessions: Array.from(productBuySessions.get(p.id) || []),
    };
  });

  // Funnel summary
  const stageSessions = {
    viewed: new Set<string>(),
    cart: new Set<string>(),
    checkout: new Set<string>(),
    pay_start: new Set<string>(),
    completed: new Set<string>(),
  };
  for (const [sid, evs] of sessionsMap) {
    if (evs.some((e) => e.event === "page_view")) stageSessions.viewed.add(sid);
    if (evs.some((e) => e.event === "add_to_cart")) stageSessions.cart.add(sid);
    if (evs.some((e) => e.event === "checkout_viewed")) stageSessions.checkout.add(sid);
    if (evs.some((e) => e.event === "payment_started")) stageSessions.pay_start.add(sid);
    const ord = orderBySession.get(sid);
    if (ord && ord.status === "completed") stageSessions.completed.add(sid);
  }

  const completedOrders = cleanOrders.filter((o) => o.status === "completed");
  const totalRevenue = completedOrders.reduce((s, o) => s + (Number(o.amount_total) || 0), 0);
  const aov = completedOrders.length ? totalRevenue / completedOrders.length : 0;

  const emailCounts = new Map<string, number>();
  for (const o of completedOrders) {
    if (!o.customer_email) continue;
    const e = o.customer_email.toLowerCase();
    emailCounts.set(e, (emailCounts.get(e) || 0) + 1);
  }
  const uniqueCustomers = emailCounts.size;
  const repeatCustomers = Array.from(emailCounts.values()).filter((n) => n > 1).length;

  const digest = {
    store: storeConfig.name,
    currency: process.env.NEXT_PUBLIC_CURRENCY || "GBP",
    window: { since: sinceIso, until: now.toISOString(), days: 30 },
    summary: {
      sessions: sessionsMap.size,
      completed_orders: completedOrders.length,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      average_order_value: Math.round(aov * 100) / 100,
      unique_customers: uniqueCustomers,
      repeat_customers: repeatCustomers,
      repeat_rate_pct: pct(repeatCustomers, uniqueCustomers),
      bot_sessions_excluded: botSessions.size,
      bot_orders_excluded: botOrderCount,
      funnel: {
        viewed: stageSessions.viewed.size,
        add_to_cart: stageSessions.cart.size,
        checkout_viewed: stageSessions.checkout.size,
        payment_started: stageSessions.pay_start.size,
        completed: stageSessions.completed.size,
        view_to_cart_pct: pct(stageSessions.cart.size, stageSessions.viewed.size),
        cart_to_checkout_pct: pct(stageSessions.checkout.size, stageSessions.cart.size),
        checkout_to_pay_pct: pct(stageSessions.pay_start.size, stageSessions.checkout.size),
        pay_to_complete_pct: pct(stageSessions.completed.size, stageSessions.pay_start.size),
        view_to_buy_pct: pct(stageSessions.completed.size, stageSessions.viewed.size),
      },
    },
    products: productTable,
    sessions,
  };

  const json = JSON.stringify(digest, null, 2);
  const subject = `${storeConfig.name} — Monthly Journey Digest (last 30 days)`;
  const htmlContent = `<!DOCTYPE html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#222;max-width:720px;margin:0 auto;padding:24px">
  <h1 style="font-size:18px;margin:0 0 12px">${storeConfig.name} — last 30 days</h1>
  <p style="font-size:14px;line-height:1.5;margin:0 0 12px">
    Full journey data is attached as <strong>journey-digest.json</strong>. Drop the file straight into Claude with a question like
    <em>"What's converting, what's leaking, what should I test next month?"</em>
  </p>
  <ul style="font-size:14px;line-height:1.6;color:#333">
    <li>Sessions: ${sessionsMap.size}</li>
    <li>Completed orders: ${completedOrders.length}</li>
    <li>Revenue: ${process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "£"}${(Math.round(totalRevenue * 100) / 100).toFixed(2)}</li>
    <li>View → buy: ${pct(stageSessions.completed.size, stageSessions.viewed.size)}%</li>
    <li>Bot sessions excluded: ${botSessions.size}</li>
  </ul>
</body></html>`;

  const attachmentBase64 = Buffer.from(json, "utf8").toString("base64");

  const result = await sendTransactionalEmail({
    to: REPORT_TO,
    fromName: "Shimeru Reports",
    subject,
    html: htmlContent,
    tag: "journey-digest",
    attachments: [
      {
        Name: "journey-digest.json",
        Content: attachmentBase64,
        ContentType: "application/json",
      },
    ],
  });

  if (!result.ok) {
    console.error("[journey-digest] Postmark error:", result.error);
    return NextResponse.json(
      { error: "Failed to send email", detail: result.error },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    bytes: json.length,
    sessions: sessionsMap.size,
    products: productTable.length,
    completed_orders: completedOrders.length,
  });
}
