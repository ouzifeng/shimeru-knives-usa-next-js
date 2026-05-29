// Shared helper to build OrderConfirmedData from a real Supabase order +
// optional WC enrichment for shipping method. Used by both the preview
// route and the send-test route so they render identical content.

import type { OrderConfirmedData } from "./order-confirmed";
import { getSupabaseAdmin } from "@/lib/supabase";
import { wcFetch } from "@/lib/woocommerce";

type LineItem = { pid: number; qty: number; vid?: number; price?: number };
type Address = Record<string, string>;
type ProductImage = { src: string };
type ProductRow = { id: number; name: string; images: ProductImage[] | null };

type WCOrderForShipping = {
  shipping_lines?: Array<{ method_title: string; total: string }>;
  shipping_total?: string;
};

export async function buildOrderConfirmedFromLatestOrder(): Promise<
  | { ok: true; data: OrderConfirmedData }
  | { ok: false; reason: string }
> {
  const supabase = getSupabaseAdmin();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, wc_order_id, customer_name, amount_total, status, line_items, shipping_address, billing_address, created_at"
    )
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

  const lineItems = (order.line_items as LineItem[] | null) ?? [];
  if (lineItems.length === 0) {
    return { ok: false, reason: "Most recent order has no line items." };
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
      total: lineTotal != null ? `£${lineTotal.toFixed(2)}` : "—",
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
      shippingLabel = t > 0 ? `£${t.toFixed(2)}` : "Free";
    } else if (wc.shipping_total) {
      const t = Number(wc.shipping_total);
      shippingLabel = t > 0 ? `£${t.toFixed(2)}` : "Free";
    }
  } catch {
    // WC API call failed — fall back to "Free" label and no method-specific copy
  }

  const firstName = (order.customer_name || "Friend").split(/\s+/)[0];
  const dateLabel = new Date(order.created_at).toLocaleDateString("en-GB", {
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
      subtotal: `£${(computedSubtotal || Number(order.amount_total)).toFixed(2)}`,
      shipping: shippingLabel,
      total: `£${Number(order.amount_total).toFixed(2)}`,
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
