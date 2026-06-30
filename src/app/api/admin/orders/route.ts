import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Supabase clamps single queries at db-max-rows (default 1000). Page through
// in 1000-row chunks so we get everything regardless of total count.
type OrderRow = { id: number } & Record<string, unknown>;

async function fetchAllOrders(sb: ReturnType<typeof getSupabaseAdmin>) {
  const PAGE = 1000;
  let from = 0;
  const all: OrderRow[] = [];
  while (true) {
    const { data, error } = await sb
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as OrderRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Same 1000-row clamp applies to any table. Page through so we get every row.
// Critical for trustpilot_invites: with >1000 invite rows, an unpaginated read
// silently drops the rest, making already-invited orders look un-invited (they
// re-appear as "to review" and let you re-send).
async function fetchAllRows<T>(
  sb: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  columns: string
): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const all: T[] = [];
  while (true) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function GET() {
  const sb = getSupabaseAdmin();

  let ordersData: OrderRow[];
  try {
    ordersData = await fetchAllOrders(sb);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch orders";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const [costsRes, productsRes, variationsRes, funnelRes, tpData] = await Promise.all([
    sb.from("product_costs").select("*"),
    sb.from("products").select("id, sku").eq("status", "publish"),
    sb.from("product_variations").select("id, product_id, sku"),
    sb.from("funnel_events").select("session_id, event, created_at").order("created_at", { ascending: true }),
    fetchAllRows<{ order_id: number; status: string; sent_at: string | null }>(sb, "trustpilot_invites", "order_id, status, sent_at"),
  ]);
  const tpRes = { data: tpData };

  // Shape the response to mimic the prior `ordersRes` shape so the downstream code stays unchanged
  const ordersRes = { data: ordersData, error: null as null | string };

  // Build cost lookup: keyed by product_id and variation_id
  const costBySku: Record<string, { cogs: number; import: number; shipping: number }> = {};
  for (const c of costsRes.data || []) {
    costBySku[c.sku] = {
      cogs: Number(c.cogs) || 0,
      import: Number(c.import) || 0,
      shipping: Number(c.shipping) || 0,
    };
  }

  // Map product_id -> costs (for simple products)
  const costByProductId: Record<number, { cogs: number; import: number; shipping: number }> = {};
  for (const p of productsRes.data || []) {
    if (p.sku && costBySku[p.sku]) {
      costByProductId[p.id] = costBySku[p.sku];
    }
  }

  // Map variation_id -> costs (for variable products)
  const costByVariationId: Record<number, { cogs: number; import: number; shipping: number }> = {};
  for (const v of variationsRes.data || []) {
    if (v.sku && costBySku[v.sku]) {
      costByVariationId[v.id] = costBySku[v.sku];
    }
  }

  const funnelBySession: Record<string, string[]> = {};
  for (const fe of funnelRes.data || []) {
    if (!funnelBySession[fe.session_id]) funnelBySession[fe.session_id] = [];
    funnelBySession[fe.session_id].push(fe.event);
  }

  const tpByOrderId: Record<number, { status: string; sent_at: string | null }> = {};
  for (const t of tpRes.data || []) {
    tpByOrderId[t.order_id] = { status: t.status, sent_at: t.sent_at };
  }

  const ordersWithTp = (ordersRes.data || []).map((o) => ({
    ...o,
    tp_invite: tpByOrderId[o.id] || null,
  }));

  return NextResponse.json({
    orders: ordersWithTp,
    costByProductId,
    costByVariationId,
    funnelBySession,
  });
}
