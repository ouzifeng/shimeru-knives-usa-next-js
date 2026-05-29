import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { wcFetch } from "@/lib/woocommerce";
import { getSupabaseAdmin } from "@/lib/supabase";

type WCRefund = {
  id: number;
  reason?: string;
  total: string;
  date_created: string;
};

type WCLineItem = {
  id: number;
  name: string;
  product_id: number;
  variation_id?: number;
  quantity: number;
  subtotal: string;
  total: string;
  sku?: string;
  meta_data?: Array<{ key: string; value: string; display_key?: string; display_value?: string }>;
};

type WCMetaItem = { id?: number; key: string; value: unknown };

type WCFullOrder = {
  id: number;
  number: string;
  status: string;
  currency: string;
  date_created: string;
  date_modified: string;
  total: string;
  subtotal?: string;
  shipping_total: string;
  total_tax: string;
  discount_total: string;
  customer_note: string;
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  billing: Record<string, string>;
  shipping: Record<string, string>;
  line_items: WCLineItem[];
  shipping_lines: Array<{ id: number; method_title: string; total: string }>;
  refunds: WCRefund[];
  meta_data: WCMetaItem[];
  coupon_lines?: Array<{ code: string; discount: string }>;
};

type ShipmentTrackingItem = {
  tracking_id?: string;
  tracking_number: string;
  tracking_provider?: string;
  custom_tracking_provider?: string;
  tracking_link?: string;
  custom_tracking_link?: string;
  date_shipped?: string | number;
};

function extractShipmentTracking(meta: WCMetaItem[]): ShipmentTrackingItem[] {
  // The Woo Shipment Tracking plugin stores entries under _wc_shipment_tracking_items.
  // Some installs also stash a single number under _tracking_number / _shipping_provider
  // which we treat as a fallback.
  const items: ShipmentTrackingItem[] = [];

  const trackingItemsEntry = meta.find((m) => m.key === "_wc_shipment_tracking_items");
  if (trackingItemsEntry && Array.isArray(trackingItemsEntry.value)) {
    for (const raw of trackingItemsEntry.value as ShipmentTrackingItem[]) {
      if (raw?.tracking_number) items.push(raw);
    }
  }

  if (items.length === 0) {
    const legacyNumber = meta.find((m) => m.key === "_tracking_number")?.value;
    if (typeof legacyNumber === "string" && legacyNumber.length > 0) {
      items.push({
        tracking_number: legacyNumber,
        tracking_provider:
          (meta.find((m) => m.key === "_shipping_provider")?.value as string | undefined) ??
          (meta.find((m) => m.key === "_tracking_provider")?.value as string | undefined),
      });
    }
  }

  return items;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ wcOrderId: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { wcOrderId } = await ctx.params;
  const id = Number(wcOrderId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const [wcRes, sbRes] = await Promise.allSettled([
    wcFetch<WCFullOrder>(`/orders/${id}`),
    supabase
      .from("orders")
      .select("*")
      .eq("wc_order_id", id)
      .maybeSingle(),
  ]);

  if (wcRes.status === "rejected") {
    const message =
      wcRes.reason instanceof Error ? wcRes.reason.message : "WooCommerce fetch failed";
    const notFound = /404/.test(message);
    return NextResponse.json({ error: message }, { status: notFound ? 404 : 502 });
  }

  const order = wcRes.value;
  const supabaseOrder =
    sbRes.status === "fulfilled" && sbRes.value.data ? sbRes.value.data : null;

  const shipmentTracking = extractShipmentTracking(order.meta_data || []);

  return NextResponse.json({
    supabase: supabaseOrder
      ? {
          id: supabaseOrder.id,
          stripe_session_id: supabaseOrder.stripe_session_id,
          stripe_payment_intent: supabaseOrder.stripe_payment_intent,
          stripe_fee: supabaseOrder.stripe_fee,
          wc_created: supabaseOrder.wc_created,
          coupon_code: supabaseOrder.coupon_code,
          attribution: supabaseOrder.attribution,
          customer_ip: supabaseOrder.customer_ip,
          abandon_reason: supabaseOrder.abandon_reason,
          funnel_session_id: supabaseOrder.funnel_session_id,
          created_at: supabaseOrder.created_at,
        }
      : null,
    id: order.id,
    number: order.number,
    status: order.status,
    currency: order.currency,
    date_created: order.date_created,
    date_modified: order.date_modified,
    total: order.total,
    subtotal: order.subtotal ?? null,
    shipping_total: order.shipping_total,
    total_tax: order.total_tax,
    discount_total: order.discount_total,
    customer_note: order.customer_note,
    payment_method_title: order.payment_method_title,
    transaction_id: order.transaction_id,
    billing: order.billing,
    shipping: order.shipping,
    line_items: (order.line_items || []).map((li) => ({
      id: li.id,
      name: li.name,
      quantity: li.quantity,
      total: li.total,
      sku: li.sku ?? null,
      variation_id: li.variation_id ?? null,
      meta:
        (li.meta_data || [])
          .filter((m) => !m.key.startsWith("_"))
          .map((m) => ({
            key: m.display_key || m.key,
            value: m.display_value || (typeof m.value === "string" ? m.value : JSON.stringify(m.value)),
          })),
    })),
    shipping_lines: (order.shipping_lines || []).map((s) => ({
      method_title: s.method_title,
      total: s.total,
    })),
    coupon_lines: order.coupon_lines || [],
    refunds: order.refunds || [],
    shipment_tracking: shipmentTracking,
  });
}
