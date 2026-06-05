// Builds BackInStockData from a real Supabase product, used by the admin
// preview + send-test routes so they render exactly like the live cron send.

import type { BackInStockData } from "./back-in-stock";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatPrice } from "@/lib/format";
import { storeConfig } from "../../../store.config";

type ProductRow = {
  name: string;
  slug: string;
  price: number | null;
  regular_price: number | null;
  on_sale: boolean | null;
  images: { src: string }[] | null;
};

function buildProductUrl(slug: string): string {
  const params = new URLSearchParams({
    utm_source: "email",
    utm_medium: "transactional",
    utm_campaign: "back-in-stock",
  });
  return `${storeConfig.url}/product/${slug}?${params.toString()}`;
}

function toData(p: ProductRow): BackInStockData {
  const price = p.price ?? null;
  const regular = p.regular_price ?? null;
  const onSale = Boolean(p.on_sale && regular && price && regular > price);
  return {
    productName: p.name,
    productUrl: buildProductUrl(p.slug),
    imageUrl: p.images?.[0]?.src,
    priceLabel: price != null ? formatPrice(price) : undefined,
    regularPriceLabel: onSale && regular != null ? formatPrice(regular) : undefined,
    savePercent:
      onSale && regular && price ? Math.round((1 - price / regular) * 100) : undefined,
  };
}

/** Admin preview/test: build from a representative real product (one with an image). */
export async function buildBackInStockPreview(): Promise<
  { ok: true; data: BackInStockData } | { ok: false; reason: string }
> {
  const sb = getSupabaseAdmin();
  const { data: product } = await sb
    .from("products")
    .select("name, slug, price, regular_price, on_sale, images")
    .not("images", "is", null)
    .order("price", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!product) {
    return { ok: false, reason: "No product in Supabase to base the preview on." };
  }
  return { ok: true, data: toData(product as ProductRow) };
}
