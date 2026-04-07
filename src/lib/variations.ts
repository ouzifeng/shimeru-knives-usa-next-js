import { supabaseAdmin } from "./supabase";
import { supabase } from "./supabase";
import { getProductVariations } from "./woocommerce";
import type { ProductVariation } from "./types";

const CACHE_TTL_MINUTES = 5;

// Get variations — returns cached data immediately, refreshes in background if stale
export async function getCachedVariations(productId: number): Promise<ProductVariation[]> {
  // Try cache first
  const { data: cached } = await supabase
    .from("product_variations")
    .select("*")
    .eq("product_id", productId)
    .order("id");

  const isStale = !cached?.length || isExpired(cached[0].cached_at);

  if (cached?.length && !isStale) {
    return cached as ProductVariation[];
  }

  // If stale or empty, refresh from WC
  // If we have stale data, return it and refresh in background
  if (cached?.length && isStale) {
    // Fire and forget — refresh in background
    refreshVariations(productId).catch(() => {});
    return cached as ProductVariation[];
  }

  // No cached data — must fetch synchronously
  return refreshVariations(productId);
}

async function refreshVariations(productId: number): Promise<ProductVariation[]> {
  const wcVariations = await getProductVariations(productId);

  // Delete old cached variations for this product
  await supabaseAdmin
    .from("product_variations")
    .delete()
    .eq("product_id", productId);

  const rows = wcVariations.map((v) => ({
    id: v.id,
    product_id: productId,
    sku: v.sku || null,
    price: parseFloat(v.price) || 0,
    regular_price: v.regular_price ? parseFloat(v.regular_price) : null,
    sale_price: v.sale_price ? parseFloat(v.sale_price) : null,
    on_sale: v.on_sale,
    stock_status: v.stock_status,
    stock_quantity: v.stock_quantity,
    attributes: v.attributes,
    image: v.image,
    cached_at: new Date().toISOString(),
  }));

  if (rows.length) {
    await supabaseAdmin.from("product_variations").upsert(rows, { onConflict: "id" });
  }

  return rows as ProductVariation[];
}

function isExpired(cachedAt: string): boolean {
  const cached = new Date(cachedAt).getTime();
  const now = Date.now();
  return now - cached > CACHE_TTL_MINUTES * 60 * 1000;
}
