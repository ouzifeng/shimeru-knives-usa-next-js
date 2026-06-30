// Shared helper to build OrderConfirmedData from a real Supabase order +
// optional WC enrichment for shipping method. Used by the live send (webhook),
// the preview route, and the send-test route so they all render identically.

import type { OrderConfirmedData } from "./order-confirmed";
import { getSupabaseAdmin } from "@/lib/supabase";
import { wcFetch } from "@/lib/woocommerce";
import { formatPrice } from "@/lib/format";

type LineItem = { pid: number; qty: number; vid?: number; price?: number };
type Address = Record<string, string>;
type ProductImage = { src: string };
type ProductRow = { id: number; name: string; images: ProductImage[] | null };

type WCOrderForShipping = {
  shipping_lines?: Array<{ method_title: string; total: string }>;
  shipping_total?: string;
};

type OrderRow = {
  id: number;
  wc_order_id: number | null;
  customer_name: string | null;
  amount_total: number;
  line_items: LineItem[] | null;
  shipping_address: Address | null;
  billing_address: Address | null;
  created_at: string;
};

const ORDER_SELECT =
  "id, wc_order_id, customer_name, amount_total, status, line_items, shipping_address, billing_address, created_at";

/** Build the email data from the most recent real order (admin preview/test). */
export async function buildOrderConfirmedFromLatestOrder(): Promise<
  { ok: true; data: OrderConfirmedData } | { ok: false; reason: string }
> {
  const supabase = getSupabaseAdmin();

  const { data: order } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .not("wc_order_id", "is", null)
    .neq("status", "abandoned")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order) {
    return {
      ok: false,
      reason:
        "No completed order in Supabase yet to base the preview on. Place a real order first.",
    };
  }

  return buildFromOrderRow(order);
}

/** Build the email data for a specific WooCommerce order id (live send). */
export async function buildOrderConfirmedFromWcOrderId(
  wcOrderId: number
): Promise<{ ok: true; data: OrderConfirmedData } | { ok: false; reason: string }> {
  const supabase = getSupabaseAdmin();

  const { data: order } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("wc_order_id", wcOrderId)
    .limit(1)
    .maybeSingle();

  if (!order) {
    return { ok: false, reason: `No Supabase order found for WC order #${wcOrderId}.` };
  }

  return buildFromOrderRow(order);
}

async function buildFromOrderRow(
  order: OrderRow
): Promise<{ ok: true; data: OrderConfirmedData } | { ok: false; reason: string }> {
  const supabase = getSupabaseAdmin();

  const lineItems = (order.line_items as LineItem[] | null) ?? [];
  if (lineItems.length === 0) {
    return { ok: false, reason: "Order has no line items." };
  }

  const pids = Array.from(new Set(lineItems.map((li) => li.pid))).filter(Boolean);
  const { data: products } = await supabase
    .from("products")
    .select("id, name, images")
    .in("id", pids);

  const productMap = new Map<number, ProductRow>(
    (products ?? []).map((p) => [p.id as number, p as ProductRow])
  );

  const items = lineItems.map((li) => {
    const p = productMap.get(li.pid);
    const lineTotal =
      typeof li.price === "number" ? li.price * (li.qty || 1) : null;
    return {
      name: p?.name ?? `Product #${li.pid}`,
      quantity: li.qty || 1,
      total: lineTotal != null ? formatPrice(lineTotal) : "-",
      imageUrl: p?.images?.[0]?.src,
    };
  });

  const computedSubtotal = lineItems.reduce(
    (sum, li) =>
      typeof li.price === "number" ? sum + li.price * (li.qty || 1) : sum,
    0
  );

  // Pull shipping method + cost from WC (Supabase doesn't store the method)
  let shippingMethod: string | undefined;
  let shippingLabel = "Free";
  try {
    const wc = await wcFetch<WCOrderForShipping>(`/orders/${order.wc_order_id}`);
    const firstShipping = wc.shipping_lines?.[0];
    if (firstShipping?.method_title) shippingMethod = firstShipping.method_title;
    if (firstShipping?.total) {
      const t = Number(firstShipping.total);
      shippingLabel = t > 0 ? formatPrice(t) : "Free";
    } else if (wc.shipping_total) {
      const t = Number(wc.shipping_total);
      shippingLabel = t > 0 ? formatPrice(t) : "Free";
    }
  } catch {
    // WC API call failed, fall back to "Free" label and no method-specific copy
  }

  const firstName = (order.customer_name || "Friend").split(/\s+/)[0];
  const dateLabel = new Date(order.created_at).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const billing = (order.billing_address as Address | null) ?? {};
  const shipping = (order.shipping_address as Address | null) ?? billing;

  return {
    ok: true,
    data: {
      orderNumber: String(order.wc_order_id ?? order.id),
      customerFirstName: firstName,
      dateLabel,
      items,
      subtotal: formatPrice(computedSubtotal || Number(order.amount_total)),
      shipping: shippingLabel,
      total: formatPrice(Number(order.amount_total)),
      shippingAddress: {
        name:
          [shipping.first_name, shipping.last_name].filter(Boolean).join(" ") ||
          order.customer_name ||
          "",
        line1: shipping.address_1 || "",
        line2: shipping.address_2,
        city: shipping.city || "",
        postcode: shipping.postcode || "",
        country: shipping.country || "United States",
      },
      shippingMethod,
    },
  };
}
