// Shared data builder for the order-status emails (cancelled / refunded).
// Both share the same shape: order number, customer first name, the items,
// and a formatted total. Used by the live sync send + admin preview/test.

import { getSupabaseAdmin } from "@/lib/supabase";
import { formatPrice } from "@/lib/format";

export type OrderStatusData = {
  orderNumber: string;
  customerFirstName: string;
  items: { name: string; quantity: number }[];
  totalLabel: string; // formatted order total, e.g. "$69.99"
};

type LineItem = { pid: number; qty: number; vid?: number; price?: number };
type ProductRow = { id: number; name: string };

const ORDER_SELECT =
  "id, wc_order_id, customer_name, amount_total, line_items, status, wc_status, created_at";

type OrderRow = {
  id: number;
  wc_order_id: number | null;
  customer_name: string | null;
  amount_total: number | null;
  line_items: LineItem[] | null;
};

async function buildFromOrderRow(
  order: OrderRow
): Promise<{ ok: true; data: OrderStatusData } | { ok: false; reason: string }> {
  const supabase = getSupabaseAdmin();

  const lineItems = (order.line_items as LineItem[] | null) ?? [];
  if (lineItems.length === 0) {
    return { ok: false, reason: "Order has no line items." };
  }

  const pids = Array.from(new Set(lineItems.map((li) => li.pid))).filter(Boolean);
  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .in("id", pids);

  const productMap = new Map<number, ProductRow>(
    (products ?? []).map((p) => [p.id as number, p as ProductRow])
  );

  const items = lineItems.map((li) => ({
    name: productMap.get(li.pid)?.name ?? `Product #${li.pid}`,
    quantity: li.qty || 1,
  }));

  const firstName = (order.customer_name || "Friend").split(/\s+/)[0] || "Friend";

  return {
    ok: true,
    data: {
      orderNumber: String(order.wc_order_id ?? order.id),
      customerFirstName: firstName,
      items,
      totalLabel: formatPrice(Number(order.amount_total ?? 0)),
    },
  };
}

/** Live send: build for a specific WC order id. */
export async function buildOrderStatusFromWcOrderId(
  wcOrderId: number
): Promise<{ ok: true; data: OrderStatusData } | { ok: false; reason: string }> {
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

/** Admin preview/test: prefer the latest order in the given wc_status, else the
 *  latest real order so the preview always renders something. */
export async function buildOrderStatusFromLatestOrder(
  preferStatus?: "cancelled" | "refunded"
): Promise<{ ok: true; data: OrderStatusData } | { ok: false; reason: string }> {
  const supabase = getSupabaseAdmin();

  if (preferStatus) {
    const { data: match } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("wc_status", preferStatus)
      .not("wc_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (match) return buildFromOrderRow(match);
  }

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
