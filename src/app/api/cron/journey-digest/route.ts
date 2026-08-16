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
  // Persistent-visitor + device/locale context (added to every event client-side)
  visitor_id?: string | null;
  is_returning?: boolean | null;
  ctx?: {
    device?: string | null;
    viewport?: { w?: number; h?: number } | null;
    screen?: { w?: number; h?: number } | null;
    dpr?: number | null;
    lang?: string | null;
    tz?: string | null;
    referrer_host?: string | null;
  } | null;
  // search
  query?: string | null;
  results_count?: number | null;
  categories_count?: number | null;
  zero_results?: boolean | null;
  source?: string | null;
  // filters
  filter_key?: string | null;
  filter_value?: string | null;
  // coupon / payment errors
  code?: string | null;
  reason?: string | null;
  message?: string | null;
  discount_type?: string | null;
  amount?: number | null;
  stage?: string | null;
  // product_viewed / cart
  price?: number | null;
  category?: string | null;
  stock_status?: string | null;
  on_sale?: boolean | null;
  slug?: string | null;
  quantity?: number | null;
  removed_quantity?: number | null;
  items_left?: number | null;
  item_count?: number | null;
  items?: Array<{ product_id: number; name: string; qty: number; unit_price: number; category: string | null }> | null;
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

// A partially refunded order is still a conversion; revenue nets the refund out.
const isConvertedStatus = (s: string) => s === "completed" || s === "partially_refunded";
const orderNetRevenue = (o: { amount_total: number | null; refunded_amount?: number | null }) =>
  (Number(o.amount_total) || 0) - (Number(o.refunded_amount) || 0);

type Order = {
  id: number;
  wc_order_id: number | null;
  status: string;
  amount_total: number | null;
  refunded_amount: number | null;
  customer_email: string | null;
  coupon_code: string | null;
  attribution: { utm_source?: string; utm_medium?: string; utm_campaign?: string } | null;
  line_items: { product_id?: number; name?: string; qty?: number; price?: number }[] | null;
  funnel_session_id: string | null;
  customer_ip: string | null;
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

// Normalise a path for grouping: strip query/hash, percent-decode, lowercase,
// drop a trailing slash. Without this, /product/misuzu-%E7%BE%8E... and the
// %e7 (lowercase-encoded) variant split into two rows.
function normalizePath(path: string | null | undefined): string | null {
  if (!path) return null;
  let p = path.split(/[?#]/)[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    /* leave as-is if it can't decode */
  }
  p = p.toLowerCase();
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function slugFromPath(path: string | null | undefined): string | null {
  const norm = normalizePath(path);
  if (!norm) return null;
  const m = norm.match(/^\/product\/([^/]+)/);
  return m ? m[1] : null;
}

// System / non-entry paths that should never count as a "landing page"
// (post-purchase, cart, account pages). They pollute landing + bounce stats.
const SYSTEM_PATHS = ["/order-confirmation", "/checkout", "/cart", "/account", "/wishlist"];
function isSystemPath(path: string | null): boolean {
  if (!path) return false;
  return SYSTEM_PATHS.some((s) => path === s || path.startsWith(`${s}/`) || path.startsWith(`${s}?`));
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
      .select("id, wc_order_id, status, amount_total, refunded_amount, customer_email, coupon_code, attribution, line_items, funnel_session_id, customer_ip, created_at")
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
    if (p.slug) slugToProduct.set(p.slug.toLowerCase(), p);
  }

  // Determine bot sessions: any event from a known bot IP / UA marks the whole session as bot.
  const botSessions = new Set<string>();
  for (const e of events) {
    if (isBotIp(e.metadata?.ip) || isBotUa(e.metadata?.ua)) {
      botSessions.add(e.session_id);
    }
  }
  // A completed order means a real Stripe payment succeeded, so it is never a
  // bot regardless of the IP on it (imported WC orders often carry the WP
  // backend's proxy IP, which previously got wrongly flagged). Only filter
  // NON-completed rows on bot signals.
  let botOrderCount = 0;
  let botOrdersCompletedSpared = 0;
  const excludedIpSet = new Set<string>();
  const cleanOrders = allOrders.filter((o) => {
    const isPaid = isConvertedStatus(o.status);
    const botByIp = isBotIp(o.customer_ip);
    const botBySession = !!o.funnel_session_id && botSessions.has(o.funnel_session_id);
    if (botByIp || botBySession) {
      if (isPaid) { botOrdersCompletedSpared++; return true; } // keep real money
      botOrderCount++;
      if (o.customer_ip) excludedIpSet.add(o.customer_ip);
      return false;
    }
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
    if (o.funnel_session_id && sessionsMap.has(o.funnel_session_id)) {
      orderBySession.set(o.funnel_session_id, o);
    }
  }
  const directlyLinkedOrders = orderBySession.size;

  // ---------------------------------------------------------------------------
  // FALLBACK ATTRIBUTION — orders imported from the WooCommerce backend carry
  // funnel_session_id = null, so ~75% of orders were invisible to the journey
  // analysis. Recover them by matching customer_ip to a browsing session that
  // was active shortly before the order, with a proxy/shared-IP guard.
  // ---------------------------------------------------------------------------
  const sessionInfo = new Map<string, { ip: string | null; first: number; last: number }>();
  const ipToSessions = new Map<string, string[]>();
  for (const [sid, evs] of sessionsMap) {
    const ip = evs.find((e) => e.metadata?.ip)?.metadata?.ip ?? null;
    const times = evs.map((e) => new Date(e.created_at).getTime());
    const first = Math.min(...times);
    const last = Math.max(...times);
    sessionInfo.set(sid, { ip, first, last });
    if (ip) {
      const arr = ipToSessions.get(ip) || [];
      arr.push(sid);
      ipToSessions.set(ip, arr);
    }
  }

  const PROXY_SESSION_THRESHOLD = 8; // an IP shared by >8 sessions is treated as proxy/shared, skip
  const WINDOW_BEFORE_MS = 3 * 60 * 60 * 1000; // session may have started up to 3h before the order
  const WINDOW_AFTER_MS = 30 * 60 * 1000; // ...and up to 30m after (clock skew / async webhook)
  const takenSids = new Set<string>(orderBySession.keys());
  let ipMatchedOrders = 0;
  // Diagnostics: explain WHY fallback matches or not.
  const fbDiag = { unlinked: 0, no_ip: 0, bot_ip: 0, ip_not_in_funnel: 0, proxy_ip: 0, no_session_in_window: 0, matched: 0 };

  for (const o of cleanOrders) {
    if (o.funnel_session_id && sessionsMap.has(o.funnel_session_id)) continue; // already linked
    if (!isConvertedStatus(o.status)) continue;
    fbDiag.unlinked++;
    if (!o.customer_ip) { fbDiag.no_ip++; continue; }
    if (isBotIp(o.customer_ip)) { fbDiag.bot_ip++; continue; }
    const cands = ipToSessions.get(o.customer_ip);
    if (!cands || cands.length === 0) { fbDiag.ip_not_in_funnel++; continue; }
    if (cands.length > PROXY_SESSION_THRESHOLD) { fbDiag.proxy_ip++; continue; }
    const orderTime = new Date(o.created_at).getTime();
    let best: { sid: string; dist: number } | null = null;
    for (const sid of cands) {
      if (takenSids.has(sid)) continue;
      const info = sessionInfo.get(sid)!;
      if (info.last >= orderTime - WINDOW_BEFORE_MS && info.first <= orderTime + WINDOW_AFTER_MS) {
        const dist = Math.abs(orderTime - info.last);
        if (!best || dist < best.dist) best = { sid, dist };
      }
    }
    if (!best) { fbDiag.no_session_in_window++; continue; }
    {
      fbDiag.matched++;
      orderBySession.set(best.sid, o);
      takenSids.add(best.sid);
      ipMatchedOrders++;
    }
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
    if (order && isConvertedStatus(order.status)) outcome = "completed";
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
      order_value: order?.amount_total != null ? orderNetRevenue(order) : null,
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
    if (!isConvertedStatus(o.status) || !Array.isArray(o.line_items)) continue;
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
    if (ord && isConvertedStatus(ord.status)) stageSessions.completed.add(sid);
  }

  const completedOrders = cleanOrders.filter((o) => isConvertedStatus(o.status));
  const totalRevenue = completedOrders.reduce((s, o) => s + orderNetRevenue(o), 0);
  const aov = completedOrders.length ? totalRevenue / completedOrders.length : 0;

  const emailCounts = new Map<string, number>();
  for (const o of completedOrders) {
    if (!o.customer_email) continue;
    const e = o.customer_email.toLowerCase();
    emailCounts.set(e, (emailCounts.get(e) || 0) + 1);
  }
  const uniqueCustomers = emailCounts.size;
  const repeatCustomers = Array.from(emailCounts.values()).filter((n) => n > 1).length;

  // ---------------------------------------------------------------------------
  // ANALYSIS — pre-chewed rollups so the LLM (and a human skimming) can answer
  // the core questions: what's working, where people land, why they don't buy
  // on a product page, whether they shop around or land-from-Google-and-buy,
  // what they search/filter for, and where checkout leaks.
  // ---------------------------------------------------------------------------

  function deriveChannel(source: string | null, medium: string | null, refHost: string | null): string {
    if (source) {
      const s = source.toLowerCase();
      const m = (medium || "").toLowerCase();
      if (s.includes("google")) {
        if (/shop/.test(m)) return "google_shopping";
        if (m === "cpc" || m === "ppc" || m === "paid") return "google_ads";
        if (m === "organic" || !m) return "google_organic";
        return `google_${m}`;
      }
      if (/(facebook|instagram|meta|fb)/.test(s)) return "meta_ads";
      if (/tiktok/.test(s)) return "tiktok";
      if (/email|klaviyo|postmark|newsletter/.test(s)) return "email";
      return s;
    }
    if (refHost) {
      if (/google\./.test(refHost)) return "google_organic";
      if (/bing\.|duckduckgo|yahoo/.test(refHost)) return "search_organic";
      if (/facebook|instagram|t\.co|twitter|x\.com|tiktok|pinterest|reddit/.test(refHost)) return "social_organic";
      return `referral:${refHost}`;
    }
    return "direct";
  }

  function productIdForView(e: FunnelEvent): number | null {
    if (e.event === "product_viewed" && e.product_id) return e.product_id;
    if (e.event === "page_view") {
      const slug = slugFromPath(e.metadata?.path);
      const prod = slug ? slugToProduct.get(slug) : null;
      if (prod) return prod.id;
    }
    return null;
  }

  type Sess = {
    sid: string;
    evs: FunnelEvent[];
    order: Order | null;
    converted: boolean;
    revenue: number;
    device: string;
    visitorId: string | null;
    isReturning: boolean | null;
    source: string | null;
    medium: string | null;
    campaign: string | null;
    refHost: string | null;
    channel: string;
    landingPath: string | null;
    landedOnProduct: boolean;
    productsViewed: Set<number>;
    addedToCart: boolean;
    searched: boolean;
    hour: number;
    dow: number;
  };

  const sess: Sess[] = [];
  for (const [sid, evs] of sessionsMap) {
    const order = orderBySession.get(sid) || null;
    const attr = evs.find((e) => e.metadata?.attribution)?.metadata?.attribution ?? null;
    const ctx = evs.find((e) => e.metadata?.ctx)?.metadata?.ctx ?? null;
    const refHost = evs.find((e) => e.metadata?.ctx?.referrer_host)?.metadata?.ctx?.referrer_host ?? null;
    const visitorId = evs.find((e) => e.metadata?.visitor_id)?.metadata?.visitor_id ?? null;
    const isReturning = evs.find((e) => typeof e.metadata?.is_returning === "boolean")?.metadata?.is_returning ?? null;
    const source = attr?.utm_source ?? null;
    const medium = attr?.utm_medium ?? null;
    const campaign = attr?.utm_campaign ?? null;
    const landingPath = normalizePath(evs[0]?.metadata?.path ?? null);
    const productsViewed = new Set<number>();
    let addedToCart = false;
    let searched = false;
    for (const e of evs) {
      const pid = productIdForView(e);
      if (pid) productsViewed.add(pid);
      if (e.event === "add_to_cart") addedToCart = true;
      if (e.event === "search") searched = true;
    }
    const firstTs = new Date(evs[0]?.created_at ?? now);
    sess.push({
      sid,
      evs,
      order,
      converted: !!order && isConvertedStatus(order.status),
      revenue: order && isConvertedStatus(order.status) ? orderNetRevenue(order) : 0,
      device: ctx?.device || "unknown",
      visitorId,
      isReturning,
      source,
      medium,
      campaign,
      refHost,
      channel: deriveChannel(source, medium, refHost),
      landingPath,
      landedOnProduct: !!(landingPath && /^\/product\/[^/]+/.test(landingPath)),
      productsViewed,
      addedToCart,
      searched,
      hour: firstTs.getUTCHours(),
      dow: firstTs.getUTCDay(),
    });
  }

  // Generic group-by-with-conversion helper
  function rollup<K extends string | number>(keyFn: (s: Sess) => K | null) {
    const m = new Map<K, { sessions: number; orders: number; revenue: number }>();
    for (const s of sess) {
      const k = keyFn(s);
      if (k === null) continue;
      const cur = m.get(k) || { sessions: 0, orders: 0, revenue: 0 };
      cur.sessions += 1;
      if (s.converted) { cur.orders += 1; cur.revenue += s.revenue; }
      m.set(k, cur);
    }
    return Array.from(m.entries())
      .map(([key, v]) => ({
        key,
        sessions: v.sessions,
        orders: v.orders,
        revenue: Math.round(v.revenue * 100) / 100,
        conversion_pct: pct(v.orders, v.sessions),
        aov: v.orders ? Math.round((v.revenue / v.orders) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }

  const acquisition_by_channel = rollup((s) => s.channel);
  const acquisition_by_source_medium = rollup((s) =>
    s.source ? `${s.source} / ${s.medium || "(none)"}${s.campaign ? ` / ${s.campaign}` : ""}` : null
  );
  const referrers = rollup((s) => s.refHost);
  const devices = rollup((s) => s.device);

  // New vs returning
  const visitorSplit = {
    new: rollup((s) => (s.isReturning === false ? "new" : null)).find((r) => r.key === "new") || { sessions: 0, orders: 0, revenue: 0, conversion_pct: 0, aov: 0 },
    returning: rollup((s) => (s.isReturning === true ? "returning" : null)).find((r) => r.key === "returning") || { sessions: 0, orders: 0, revenue: 0, conversion_pct: 0, aov: 0 },
    unique_visitors: new Set(sess.map((s) => s.visitorId).filter(Boolean)).size,
  };

  // Landing pages — where people enter, and whether those entries convert / bounce
  const landingMap = new Map<string, { sessions: number; orders: number; bounces: number }>();
  for (const s of sess) {
    if (!s.landingPath || isSystemPath(s.landingPath)) continue;
    const cur = landingMap.get(s.landingPath) || { sessions: 0, orders: 0, bounces: 0 };
    cur.sessions += 1;
    if (s.converted) cur.orders += 1;
    const pageViews = s.evs.filter((e) => e.event === "page_view").length;
    if (pageViews <= 1 && !s.addedToCart && !s.converted) cur.bounces += 1;
    landingMap.set(s.landingPath, cur);
  }
  const landing_pages = Array.from(landingMap.entries())
    .map(([path, v]) => ({
      path,
      sessions: v.sessions,
      orders: v.orders,
      conversion_pct: pct(v.orders, v.sessions),
      bounce_pct: pct(v.bounces, v.sessions),
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 40);

  // PRODUCT-PAGE PERFORMANCE — the priority: who viewed a PDP, did they add /
  // buy, and if they viewed-but-didn't-add, what did they do instead.
  const idToProduct = new Map<number, Product>();
  for (const p of products) idToProduct.set(p.id, p);
  type PP = {
    pdp_sessions: Set<string>;
    added: Set<string>;
    purchased: Set<string>;
    viewed_not_added: number;
    next_browsed_other: number;
    next_searched: number;
    next_exited: number;
    landed_directly: number;
    landed_directly_bought: number;
  };
  const ppMap = new Map<number, PP>();
  function pp(pid: number): PP {
    let v = ppMap.get(pid);
    if (!v) {
      v = { pdp_sessions: new Set(), added: new Set(), purchased: new Set(), viewed_not_added: 0, next_browsed_other: 0, next_searched: 0, next_exited: 0, landed_directly: 0, landed_directly_bought: 0 };
      ppMap.set(pid, v);
    }
    return v;
  }
  for (const s of sess) {
    for (const pid of s.productsViewed) {
      const v = pp(pid);
      v.pdp_sessions.add(s.sid);
      // did they add THIS product?
      const addedThis = s.evs.some((e) => e.event === "add_to_cart" && e.product_id === pid);
      if (addedThis) v.added.add(s.sid);
      // did they buy THIS product?
      const boughtThis = !!s.order && isConvertedStatus(s.order.status) && Array.isArray(s.order.line_items) && s.order.line_items.some((li) => li.product_id === pid);
      if (boughtThis) v.purchased.add(s.sid);
      if (!addedThis) {
        v.viewed_not_added += 1;
        if (s.productsViewed.size > 1) v.next_browsed_other += 1;
        else if (s.searched) v.next_searched += 1;
        else v.next_exited += 1;
      }
      // landed directly on this PDP (Google-Shopping style entry)?
      const slug = idToProduct.get(pid)?.slug;
      if (slug && s.landingPath === `/product/${slug}`) {
        v.landed_directly += 1;
        if (boughtThis) v.landed_directly_bought += 1;
      }
    }
  }
  const product_pages = Array.from(ppMap.entries())
    .map(([pid, v]) => {
      const prod = idToProduct.get(pid);
      const viewers = v.pdp_sessions.size;
      return {
        product_id: pid,
        name: prod?.name ?? `#${pid}`,
        pdp_view_sessions: viewers,
        added_to_cart_sessions: v.added.size,
        purchased_sessions: v.purchased.size,
        view_to_add_pct: pct(v.added.size, viewers),
        view_to_buy_pct: pct(v.purchased.size, viewers),
        viewed_but_did_not_add: v.viewed_not_added,
        of_those_browsed_other_products: v.next_browsed_other,
        of_those_then_searched: v.next_searched,
        of_those_left_site: v.next_exited,
        landed_directly_on_pdp: v.landed_directly,
        landed_directly_and_bought: v.landed_directly_bought,
        landed_directly_conversion_pct: pct(v.landed_directly_bought, v.landed_directly),
      };
    })
    .sort((a, b) => b.pdp_view_sessions - a.pdp_view_sessions);

  // SHOPPING AROUND vs LAND-AND-BUY
  function depthBucket(n: number): "0" | "1" | "2-3" | "4+" {
    if (n === 0) return "0";
    if (n === 1) return "1";
    if (n <= 3) return "2-3";
    return "4+";
  }
  const browse_depth = rollup((s) => depthBucket(s.productsViewed.size));
  const buyerDepths = sess.filter((s) => s.converted).map((s) => s.productsViewed.size).sort((a, b) => a - b);
  const medianBuyerDepth = buyerDepths.length ? buyerDepths[Math.floor(buyerDepths.length / 2)] : 0;
  const landAndBuySessions = sess.filter((s) => s.converted && s.landedOnProduct && s.productsViewed.size <= 1).length;
  const shopping_around = {
    browse_depth_distribution: browse_depth,
    median_products_viewed_by_buyers: medianBuyerDepth,
    land_on_product_and_buy_without_browsing: {
      sessions: landAndBuySessions,
      share_of_orders_pct: pct(landAndBuySessions, completedOrders.length),
    },
    landed_on_a_product_page: {
      sessions: sess.filter((s) => s.landedOnProduct).length,
      orders: sess.filter((s) => s.landedOnProduct && s.converted).length,
      conversion_pct: pct(sess.filter((s) => s.landedOnProduct && s.converted).length, sess.filter((s) => s.landedOnProduct).length),
    },
  };

  // SEARCH
  const searchEvents = events.filter((e) => e.event === "search" && !botSessions.has(e.session_id));
  const queryCounts = new Map<string, number>();
  const zeroResultCounts = new Map<string, number>();
  for (const e of searchEvents) {
    const q = (e.metadata?.query || "").trim().toLowerCase();
    if (!q) continue;
    queryCounts.set(q, (queryCounts.get(q) || 0) + 1);
    if (e.metadata?.zero_results || e.metadata?.results_count === 0) {
      zeroResultCounts.set(q, (zeroResultCounts.get(q) || 0) + 1);
    }
  }
  const searchSessions = new Set(searchEvents.map((e) => e.session_id));
  const searchToPurchase = sess.filter((s) => s.searched && s.converted).length;
  const search = {
    total_searches: searchEvents.length,
    sessions_that_searched: searchSessions.size,
    searches_to_purchase_sessions: searchToPurchase,
    top_queries: Array.from(queryCounts.entries()).map(([q, c]) => ({ query: q, count: c })).sort((a, b) => b.count - a.count).slice(0, 30),
    zero_result_queries: Array.from(zeroResultCounts.entries()).map(([q, c]) => ({ query: q, count: c })).sort((a, b) => b.count - a.count).slice(0, 30),
  };

  // FILTERS
  const filterCounts = new Map<string, number>();
  for (const e of events) {
    if (e.event !== "filter_applied" || botSessions.has(e.session_id)) continue;
    const k = `${e.metadata?.filter_key || "?"}=${e.metadata?.filter_value || "?"}`;
    filterCounts.set(k, (filterCounts.get(k) || 0) + 1);
  }
  const filters_used = Array.from(filterCounts.entries()).map(([k, c]) => ({ filter: k, count: c })).sort((a, b) => b.count - a.count).slice(0, 40);

  // CHECKOUT FRICTION
  function countEvent(ev: string): number {
    return events.filter((e) => e.event === ev && !botSessions.has(e.session_id)).length;
  }
  const couponFailCounts = new Map<string, number>();
  for (const e of events) {
    if (e.event !== "coupon_failed" || botSessions.has(e.session_id)) continue;
    const code = (e.metadata?.code || "(blank)").toLowerCase();
    couponFailCounts.set(code, (couponFailCounts.get(code) || 0) + 1);
  }
  const payErrorCounts = new Map<string, number>();
  for (const e of events) {
    if (e.event !== "payment_error" || botSessions.has(e.session_id)) continue;
    const msg = e.metadata?.message || "unknown";
    payErrorCounts.set(msg, (payErrorCounts.get(msg) || 0) + 1);
  }
  const checkout_friction = {
    checkout_viewed: stageSessions.checkout.size,
    payment_started: stageSessions.pay_start.size,
    completed: stageSessions.completed.size,
    payment_started_to_complete_pct: pct(stageSessions.completed.size, stageSessions.pay_start.size),
    coupon_applied: countEvent("coupon_applied"),
    coupon_failed: countEvent("coupon_failed"),
    coupon_failures_by_code: Array.from(couponFailCounts.entries()).map(([code, c]) => ({ code, count: c })).sort((a, b) => b.count - a.count).slice(0, 20),
    payment_errors: Array.from(payErrorCounts.entries()).map(([message, c]) => ({ message, count: c })).sort((a, b) => b.count - a.count).slice(0, 20),
  };

  // CART REMOVALS — hesitation signal
  const removalCounts = new Map<number, { name: string; count: number }>();
  for (const e of events) {
    if (e.event !== "remove_from_cart" || botSessions.has(e.session_id) || !e.product_id) continue;
    const cur = removalCounts.get(e.product_id) || { name: e.product_name || `#${e.product_id}`, count: 0 };
    cur.count += 1;
    removalCounts.set(e.product_id, cur);
  }
  const cart_removals = Array.from(removalCounts.entries()).map(([pid, v]) => ({ product_id: pid, name: v.name, removed: v.count })).sort((a, b) => b.removed - a.removed).slice(0, 20);

  // TIMING — when sessions happen and when orders land (UTC)
  const sessionsByHour = new Array(24).fill(0);
  const sessionsByDow = new Array(7).fill(0);
  const ordersByHour = new Array(24).fill(0);
  const ordersByDow = new Array(7).fill(0);
  for (const s of sess) {
    sessionsByHour[s.hour] += 1;
    sessionsByDow[s.dow] += 1;
    if (s.converted) { ordersByHour[s.hour] += 1; ordersByDow[s.dow] += 1; }
  }
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const timing = {
    note: "UTC. Index = hour 0-23 / day Sun-Sat.",
    sessions_by_hour: sessionsByHour,
    orders_by_hour: ordersByHour,
    sessions_by_day: DOW.map((d, i) => ({ day: d, sessions: sessionsByDow[i], orders: ordersByDow[i] })),
  };

  const analysis = {
    acquisition_by_channel,
    acquisition_by_source_medium,
    referrers,
    devices,
    visitors: visitorSplit,
    landing_pages,
    product_pages,
    shopping_around,
    search,
    filters_used,
    checkout_friction,
    cart_removals,
    timing,
  };

  const digest = {
    store: storeConfig.name,
    currency: process.env.NEXT_PUBLIC_CURRENCY || "USD",
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
      // How much of the order base is actually attributable to a browsing
      // session. Conversion/channel/product cuts only cover linked orders.
      order_attribution: {
        completed_orders: completedOrders.length,
        linked_directly: directlyLinkedOrders,
        linked_via_ip_fallback: ipMatchedOrders,
        linked_total: orderBySession.size,
        attribution_coverage_pct: pct(orderBySession.size, completedOrders.length),
        note: "linked_directly = native Stripe checkout (carries funnel_session_id). linked_via_ip_fallback = imported WC orders matched by customer_ip + time window. Unlinked orders are mostly bulk-imported and have no browsing session.",
      },
      diagnostics: {
        bot_orders_completed_kept: botOrdersCompletedSpared,
        bot_excluded_distinct_ips: excludedIpSet.size,
        bot_excluded_note: excludedIpSet.size > 0 && botOrderCount / Math.max(1, excludedIpSet.size) > 10
          ? "Excluded bot orders are concentrated on very few IPs — likely a shared/proxy IP (e.g. the WP backend), not real bots."
          : "Excluded bot orders are spread across many IPs.",
      },
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
    analysis,
    products: productTable,
    sessions,
  };

  const json = JSON.stringify(digest, null, 2);
  const subject = `${storeConfig.name} — Monthly Journey Digest (last 30 days)`;
  const htmlContent = `<!DOCTYPE html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#222;max-width:720px;margin:0 auto;padding:24px">
  <h1 style="font-size:18px;margin:0 0 12px">${storeConfig.name} — last 30 days</h1>
  <p style="font-size:14px;line-height:1.5;margin:0 0 12px">
    Full journey data is attached as <strong>journey-digest.json</strong>. It now includes a pre-built <strong>analysis</strong>
    section (channels, devices, new vs returning, landing pages, per-product-page drop-off, shopping-around vs land-and-buy,
    search terms incl. zero-result, filters, checkout friction). Drop the file into Claude with a question like
    <em>"What's converting, what's leaking, why aren't people buying on product pages, what should I test next month?"</em>
  </p>
  <ul style="font-size:14px;line-height:1.6;color:#333">
    <li>Sessions: ${sessionsMap.size} (${visitorSplit.unique_visitors} unique visitors)</li>
    <li>Completed orders: ${completedOrders.length}</li>
    <li>Revenue: ${process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "$"}${(Math.round(totalRevenue * 100) / 100).toFixed(2)}</li>
    <li>View → buy: ${pct(stageSessions.completed.size, stageSessions.viewed.size)}%</li>
    <li>Order attribution coverage: ${pct(orderBySession.size, completedOrders.length)}% (${orderBySession.size}/${completedOrders.length} orders linked to a session, ${ipMatchedOrders} via IP fallback)</li>
    <li>Top channel: ${acquisition_by_channel[0] ? `${acquisition_by_channel[0].key} (${acquisition_by_channel[0].sessions} sessions, ${acquisition_by_channel[0].conversion_pct}% conv)` : "n/a"}</li>
    <li>Land-on-product-and-buy: ${shopping_around.land_on_product_and_buy_without_browsing.sessions} orders (${shopping_around.land_on_product_and_buy_without_browsing.share_of_orders_pct}% of orders)</li>
    <li>Zero-result searches: ${search.zero_result_queries.reduce((s, q) => s + q.count, 0)}</li>
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
    unique_visitors: visitorSplit.unique_visitors,
    products: productTable.length,
    completed_orders: completedOrders.length,
    orders_linked: orderBySession.size,
    orders_linked_via_ip_fallback: ipMatchedOrders,
    attribution_coverage_pct: pct(orderBySession.size, completedOrders.length),
    bot_orders_excluded: botOrderCount,
    fallback_diagnostics: fbDiag,
    analysis_sections: Object.keys(analysis),
  });
}
