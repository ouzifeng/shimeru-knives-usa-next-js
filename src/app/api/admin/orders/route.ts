import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const sb = getSupabaseAdmin();

  const [ordersRes, costsRes, productsRes, variationsRes, funnelRes] = await Promise.all([
    sb.from("orders").select("*").order("created_at", { ascending: false }),
    sb.from("product_costs").select("*"),
    sb.from("products").select("id, sku").eq("status", "publish"),
    sb.from("product_variations").select("id, product_id, sku"),
    sb.from("funnel_events").select("session_id, event, created_at").order("created_at", { ascending: true }),
  ]);

  if (ordersRes.error) {
    return NextResponse.json({ error: ordersRes.error.message }, { status: 500 });
  }

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

  return NextResponse.json({
    orders: ordersRes.data,
    costByProductId,
    costByVariationId,
    funnelBySession,
  });
}
