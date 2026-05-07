import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = getSupabaseAdmin();
  const [pricesRes, settingsRes, productsRes, variationsRes] = await Promise.all([
    sb
      .from("supplier_prices")
      .select("*")
      .order("supplier", { ascending: true })
      .order("sku", { ascending: true }),
    sb.from("supplier_settings").select("usd_to_gbp").eq("id", 1).maybeSingle(),
    sb.from("products").select("id,sku,images"),
    sb.from("product_variations").select("sku,product_id,image").not("sku", "is", null),
  ]);
  if (pricesRes.error) {
    return NextResponse.json({ error: pricesRes.error.message }, { status: 500 });
  }
  if (settingsRes.error) {
    return NextResponse.json({ error: settingsRes.error.message }, { status: 500 });
  }

  type ImageObj = { src?: string };
  const imageBySku = new Map<string, string>();
  const productImageById = new Map<number, string>();
  for (const p of (productsRes.data ?? []) as { id: number; sku: string | null; images: ImageObj[] | null }[]) {
    const src = Array.isArray(p.images) ? p.images[0]?.src : undefined;
    if (!src) continue;
    if (p.sku) imageBySku.set(p.sku, src);
    productImageById.set(p.id, src);
  }
  for (const v of (variationsRes.data ?? []) as { sku: string | null; product_id: number | null; image: ImageObj | null }[]) {
    if (!v.sku) continue;
    const own = v.image?.src;
    const fallback = v.product_id != null ? productImageById.get(v.product_id) : undefined;
    const src = own || fallback;
    if (src) imageBySku.set(v.sku, src);
  }

  const rows = (pricesRes.data ?? []).map((r: { sku: string }) => ({
    ...r,
    image_url: imageBySku.get(r.sku) ?? null,
  }));

  return NextResponse.json({
    rows,
    fx: settingsRes.data?.usd_to_gbp ?? 0.79,
  });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const fx = Number(body?.usd_to_gbp);
  if (!isFinite(fx) || fx <= 0) {
    return NextResponse.json({ error: "usd_to_gbp must be a positive number" }, { status: 400 });
  }
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("supplier_settings")
    .upsert({ id: 1, usd_to_gbp: fx, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, fx });
}
