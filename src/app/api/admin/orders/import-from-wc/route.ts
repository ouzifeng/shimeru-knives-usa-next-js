import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// One-off backfill of historical WC orders into Supabase. Called once per
// page by the admin UI in a client-side loop. Existing rows (those that
// went through the Shimeru checkout and were created by the Stripe webhook)
// are skipped — never overwritten.
//
// Mapping is intentionally minimal — same shape as the existing orders
// table, no new columns, no schema changes. WC status flows verbatim into
// both `wc_status` and the existing `status` column.

const PER_PAGE = 100;
const SKIP_STATUSES = new Set(["pending", "trash", "checkout-draft", "auto-draft"]);

type WCAddress = Record<string, string>;
type WCLineItem = {
  product_id: number;
  variation_id: number;
  quantity: number;
  subtotal: string;
  total: string;
};
type WCMeta = { id?: number; key: string; value: unknown };
type WCOrderFull = {
  id: number;
  status: string;
  currency: string;
  total: string;
  date_created: string;
  billing: WCAddress;
  shipping: WCAddress;
  line_items: WCLineItem[];
  coupon_lines?: Array<{ code: string }>;
  customer_ip_address?: string;
  meta_data?: WCMeta[];
};

function metaValue(meta: WCMeta[] | undefined, key: string): string | null {
  const found = meta?.find((m) => m.key === key);
  if (!found) return null;
  return typeof found.value === "string" ? found.value : String(found.value);
}

function makeOrderRow(wc: WCOrderFull) {
  const firstName = wc.billing?.first_name || "";
  const lastName = wc.billing?.last_name || "";
  const customerName = `${firstName} ${lastName}`.trim() || null;

  const stripeFeeRaw = metaValue(wc.meta_data, "_stripe_fee");
  const stripeIntent = metaValue(wc.meta_data, "_stripe_intent_id");

  const lineItems = (wc.line_items || []).map((li) => {
    const qty = li.quantity || 1;
    const subtotal = parseFloat(li.subtotal || li.total || "0");
    return {
      pid: li.product_id,
      qty,
      vid: li.variation_id || undefined,
      price: qty > 0 ? subtotal / qty : 0,
    };
  });

  return {
    stripe_session_id: null,
    stripe_payment_intent: stripeIntent,
    wc_order_id: wc.id,
    customer_email: wc.billing?.email || null,
    customer_name: customerName,
    amount_total: parseFloat(wc.total) || 0,
    currency: (wc.currency || "GBP").toUpperCase(),
    status: wc.status,
    wc_status: wc.status,
    wc_status_synced_at: new Date().toISOString(),
    line_items: lineItems,
    billing_address: wc.billing || null,
    shipping_address: wc.shipping || null,
    coupon_code: wc.coupon_lines?.[0]?.code || null,
    wc_created: true,
    attribution: null,
    customer_ip: wc.customer_ip_address || null,
    abandon_reason: null,
    stripe_fee: stripeFeeRaw ? parseFloat(stripeFeeRaw) : null,
    funnel_session_id: null,
    created_at: wc.date_created,
  };
}

export async function POST(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || "1"));

  const baseUrl = process.env.NEXT_PUBLIC_WORDPRESS_URL;
  const ck = process.env.WC_CONSUMER_KEY;
  const cs = process.env.WC_CONSUMER_SECRET;
  if (!baseUrl || !ck || !cs) {
    return NextResponse.json(
      { error: "WooCommerce env vars not configured" },
      { status: 500 }
    );
  }

  const url = new URL(`/wp-json/wc/v3/orders`, baseUrl);
  url.searchParams.set("consumer_key", ck);
  url.searchParams.set("consumer_secret", cs);
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");

  const wcRes = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });

  if (!wcRes.ok) {
    const body = await wcRes.text().catch(() => "");
    return NextResponse.json(
      { error: `WC fetch failed: ${wcRes.status}`, details: body.slice(0, 500) },
      { status: 502 }
    );
  }

  const orders = (await wcRes.json()) as WCOrderFull[];
  const totalEstimate = parseInt(wcRes.headers.get("x-wp-total") || "0", 10);
  const totalPages = parseInt(wcRes.headers.get("x-wp-totalpages") || "1", 10);

  if (orders.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: 0,
      total_on_page: 0,
      page,
      has_more: false,
      total_estimate: totalEstimate || null,
    });
  }

  const supabase = getSupabaseAdmin();
  const wcIds = orders.map((o) => o.id);

  const { data: existing } = await supabase
    .from("orders")
    .select("wc_order_id")
    .in("wc_order_id", wcIds);

  const existingSet = new Set(
    (existing || []).map((r) => r.wc_order_id as number)
  );

  const toInsert = orders
    .filter((o) => !existingSet.has(o.id))
    .filter((o) => !SKIP_STATUSES.has(o.status))
    .map(makeOrderRow);

  let inserted = 0;
  if (toInsert.length) {
    const { error: insertErr, count } = await supabase
      .from("orders")
      .insert(toInsert, { count: "exact" });
    if (insertErr) {
      return NextResponse.json(
        { error: insertErr.message, page },
        { status: 500 }
      );
    }
    inserted = count ?? toInsert.length;
  }

  return NextResponse.json({
    imported: inserted,
    skipped: orders.length - toInsert.length,
    total_on_page: orders.length,
    page,
    has_more: page < totalPages,
    total_estimate: totalEstimate || null,
  });
}
