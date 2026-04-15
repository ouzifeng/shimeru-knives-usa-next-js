import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const sb = getSupabaseAdmin();

  // Get all published products
  const { data: products, error: pErr } = await sb
    .from("products")
    .select("id, name, sku, type, images, status, price")
    .eq("status", "publish")
    .order("name");

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  // Get all variations for variable products
  const variableIds = products
    .filter((p) => p.type === "variable")
    .map((p) => p.id);

  let variations: Record<number, Array<{ id: number; sku: string; image: { src?: string } | null; attributes: unknown[]; price: number | null }>> = {};
  if (variableIds.length > 0) {
    const { data: vars, error: vErr } = await sb
      .from("product_variations")
      .select("id, product_id, sku, image, attributes, price")
      .in("product_id", variableIds);

    if (vErr) {
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }

    for (const v of vars || []) {
      if (!variations[v.product_id]) variations[v.product_id] = [];
      variations[v.product_id].push(v);
    }
  }

  // Get all cost data
  const { data: costs } = await sb.from("product_costs").select("*");
  const costMap: Record<string, { cogs: number | null; import: number | null; shipping: number | null }> = {};
  for (const c of costs || []) {
    costMap[c.sku] = { cogs: c.cogs, import: c.import, shipping: c.shipping };
  }

  // Build flat row list
  const rows: Array<{
    product_id: number;
    variation_id: number | null;
    name: string;
    sku: string;
    image: string | null;
    price: number | null;
    cogs: number | null;
    import: number | null;
    shipping: number | null;
  }> = [];

  for (const p of products) {
    if (p.type === "variable") {
      const vars = variations[p.id] || [];
      for (const v of vars) {
        const varImage =
          v.image?.src || p.images?.[0]?.src || null;
        const cost = costMap[v.sku] || {};
        rows.push({
          product_id: p.id,
          variation_id: v.id,
          name: p.name,
          sku: v.sku || "",
          image: varImage,
          price: v.price ?? p.price ?? null,
          cogs: cost.cogs ?? null,
          import: cost.import ?? null,
          shipping: cost.shipping ?? null,
        });
      }
    } else {
      const image = p.images?.[0]?.src || null;
      const cost = costMap[p.sku] || {};
      rows.push({
        product_id: p.id,
        variation_id: null,
        name: p.name,
        sku: p.sku || "",
        image: image,
        price: p.price ?? null,
        cogs: cost.cogs ?? null,
        import: cost.import ?? null,
        shipping: cost.shipping ?? null,
      });
    }
  }

  return NextResponse.json(rows);
}

// Update cost data for a SKU
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { sku, cogs, import: importCost, shipping } = body;

  if (!sku) {
    return NextResponse.json({ error: "SKU required" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("product_costs").upsert(
    {
      sku,
      cogs: cogs ?? null,
      import: importCost ?? null,
      shipping: shipping ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "sku" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
