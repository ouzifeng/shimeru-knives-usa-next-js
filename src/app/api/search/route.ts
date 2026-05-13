import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { decodeEntities } from "@/lib/format";

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
const PRODUCT_FIELDS = "id, name, slug, price, sale_price, on_sale, images, stock_status";

function decodeName<T extends { name?: string | null }>(r: T): T {
  return r?.name ? { ...r, name: decodeEntities(r.name) } : r;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ results: [], categories: [] });
  }

  // Search categories
  const { data: catData } = await supabase
    .from("product_categories")
    .select("category_slug, category_name")
    .ilike("category_name", `%${q}%`);

  // Deduplicate categories
  const catMap = new Map<string, string>();
  catData?.forEach((r) => catMap.set(r.category_slug, r.category_name));
  const categories = Array.from(catMap.entries())
    .slice(0, 3)
    .map(([slug, name]) => ({ slug, name: decodeEntities(name) }));

  // Search products via FTS
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("status", "publish")
    .textSearch("fts", q, { type: "websearch" })
    .limit(6);

  if (data?.length) {
    return NextResponse.json({ results: data.map(decodeName), categories }, { headers: CACHE_HEADERS });
  }

  // Fallback to ilike if FTS returns nothing
  const { data: fallback } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("status", "publish")
    .ilike("name", `%${q}%`)
    .limit(6);

  return NextResponse.json({ results: (fallback || []).map(decodeName), categories }, { headers: CACHE_HEADERS });
}
