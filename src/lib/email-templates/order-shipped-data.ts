// Builds OrderShippedData from a real Supabase order + WC enrichment
// (shipping method + shipment tracking). Used by the live sync send, the
// admin preview, and the send-test route so they all render identically.
// (US store variant — US carrier tracking URLs.)

import type { OrderShippedData } from "./order-shipped";
import { getSupabaseAdmin } from "@/lib/supabase";
import { wcFetch } from "@/lib/woocommerce";

type LineItem = { pid: number; qty: number; vid?: number; price?: number };
type Address = Record<string, string>;
type ProductImage = { src: string };
type ProductRow = { id: number; name: string; images: ProductImage[] | null };

type WCTrackingItem = {
  tracking_provider?: string;
  custom_tracking_provider?: string | null;
  custom_tracking_link?: string | null;
  tracking_number?: string;
};

type WCOrderForShipping = {
  shipping_lines?: Array<{ method_title: string }>;
  meta_data?: Array<{ key: string; value: unknown }>;
};

const ORDER_SELECT =
  "id, wc_order_id, customer_name, line_items, shipping_address, billing_address";

// Map a WC tracking provider slug to a display label + tracking URL.
function resolveTracking(item: WCTrackingItem | undefined): {
  trackingNumber?: string;
  trackingProvider?: string;
  trackingUrl?: string;
} {
  if (!item?.tracking_number) return {};
  const number = item.tracking_number;
  const slug = (item.tracking_provider || "").toLowerCase();

  let provider: string;
  let url: string | undefined;

  if (item.custom_tracking_provider) {
    provider = item.custom_tracking_provider;
    url = item.custom_tracking_link || undefined;
  } else if (slug.includes("usps") || slug.includes("postal")) {
    provider = "USPS";
    url = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(number)}`;
  } else if (slug.includes("ups")) {
    provider = "UPS";
    url = `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`;
  } else if (slug.includes("fedex")) {
    provider = "FedEx";
    url = `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`;
  } else if (slug.includes("dhl")) {
    provider = "DHL";
    url = `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(number)}`;
  } else {
    // Unknown provider — title-case the slug, no reliable URL.
    provider = slug
      ? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "your carrier";
    url = item.custom_tracking_link || undefined;
  }

  return { trackingNumber: number, trackingProvider: provider, trackingUrl: url };
}

async function buildFromOrderRow(order: {
  id: number;
  wc_order_id: number | null;
  customer_name: string | null;
  line_items: LineItem[] | null;
  shipping_address: Address | null;
  billing_address: Address | null;
}): Promise<{ ok: true; data: OrderShippedData } | { ok: false; reason: string }> {
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
    return {
      name: p?.name ?? `Product #${li.pid}`,
      quantity: li.qty || 1,
      imageUrl: p?.images?.[0]?.src,
    };
  });

  // Pull shipping method + tracking from WC (Supabase stores neither).
  let shippingMethod: string | undefined;
  let tracking: ReturnType<typeof resolveTracking> = {};
  if (order.wc_order_id) {
    try {
      const wc = await wcFetch<WCOrderForShipping>(`/orders/${order.wc_order_id}`);
      shippingMethod = wc.shipping_lines?.[0]?.method_title;
      const trackMeta = wc.meta_data?.find((m) => m.key === "_wc_shipment_tracking_items");
      const trackItems = Array.isArray(trackMeta?.value)
        ? (trackMeta.value as WCTrackingItem[])
        : [];
      tracking = resolveTracking(trackItems[0]);
    } catch {
      // WC unreachable — send without tracking/method rather than not at all.
    }
  }

  const firstName = (order.customer_name || "Friend").split(/\s+/)[0] || "Friend";
  const billing = (order.billing_address as Address | null) ?? {};
  const shipping = (order.shipping_address as Address | null) ?? billing;

  return {
    ok: true,
    data: {
      orderNumber: String(order.wc_order_id ?? order.id),
      customerFirstName: firstName,
      items,
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
      ...tracking,
    },
  };
}

/** Live send: build for a specific WC order id. */
export async function buildOrderShippedFromWcOrderId(
  wcOrderId: number
): Promise<{ ok: true; data: OrderShippedData } | { ok: false; reason: string }> {
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

/** Admin preview/test: build from the most recent completed order. */
export async function buildOrderShippedFromLatestOrder(): Promise<
  { ok: true; data: OrderShippedData } | { ok: false; reason: string }
> {
  const supabase = getSupabaseAdmin();
  // Prefer the latest order already marked completed (so tracking exists);
  // fall back to the latest real order so the preview always shows something.
  const { data: completed } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("wc_status", "completed")
    .not("wc_order_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (completed) return buildFromOrderRow(completed);

  const { data: latest } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .not("wc_order_id", "is", null)
    .neq("status", "abandoned")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    return { ok: false, reason: "No order in Supabase yet to base the preview on." };
  }
  return buildFromOrderRow(latest);
}
