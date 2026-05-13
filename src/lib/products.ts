import { supabase, getSupabaseAdmin } from "./supabase";
import { storeConfig } from "../../store.config";
import type { Product, ProductFilter, WCAttribute } from "./types";

export async function queryProducts(filters: ProductFilter = {}): Promise<{
  products: Product[];
  total: number;
}> {
  const page = filters.page || 1;
  const perPage = filters.per_page || 24;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase.from("products").select("*", { count: "exact" });

  // Only show published products on the storefront
  query = query.eq("status", "publish");

  // Full text search
  if (filters.search) {
    query = query.textSearch("fts", filters.search, { type: "websearch" });
  }

  // Stock status
  if (filters.stock_status) {
    query = query.eq("stock_status", filters.stock_status);
  }

  // Price range
  if (filters.min_price !== undefined) {
    query = query.gte("price", filters.min_price);
  }
  if (filters.max_price !== undefined) {
    query = query.lte("price", filters.max_price);
  }

  // On sale
  if (filters.on_sale) {
    query = query.eq("on_sale", true);
  }

  // Category filter (requires subquery via product_categories)
  if (filters.category) {
    const { data: catProducts } = await supabase
      .from("product_categories")
      .select("product_id")
      .eq("category_slug", filters.category);
    const ids = catProducts?.map((r) => r.product_id) || [];
    query = query.in("id", ids.length ? ids : [-1]);
  }

  // Attribute filters (e.g. { "Color": ["Blue", "Red"], "Size": ["M"] })
  if (filters.attributes) {
    for (const [attrName, values] of Object.entries(filters.attributes)) {
      if (attrName === "on_sale") continue;
      const { data: attrProducts } = await supabase
        .from("product_attributes")
        .select("product_id")
        .eq("attribute_name", attrName)
        .in("attribute_value", values);
      const ids = attrProducts?.map((r) => r.product_id) || [];
      query = query.in("id", ids.length ? ids : [-1]);
    }
  }

  // Tag filters (e.g. { "Blade Length": ["7"], "Steel Type": ["damascus"] })
  if (filters.tags) {
    for (const [, slugs] of Object.entries(filters.tags)) {
      const { data: tagProducts } = await supabase
        .from("product_tags")
        .select("product_id")
        .in("tag_slug", slugs);
      const ids = tagProducts?.map((r) => r.product_id) || [];
      query = query.in("id", ids.length ? ids : [-1]);
    }
  }

  // Hide out of stock products if configured
  if (storeConfig.hideOutOfStock) {
    query = query.neq("stock_status", "outofstock");
  }

  // Always prioritise in-stock items. Alphabetical ascending on
  // stock_status conveniently orders "instock" < "onbackorder" < "outofstock",
  // so sold-out items always fall to the bottom regardless of the user's
  // chosen sort below.
  query = query.order("stock_status", { ascending: true });

  // Sorting
  switch (filters.sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "name":
      query = query.order("name", { ascending: true });
      break;
    case "popularity":
      query = query.order("units_sold_90d", { ascending: false, nullsFirst: false });
      break;
    case "newest":
    default:
      query = query.order("wc_updated_at", { ascending: false });
      break;
  }

  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  return { products: (data as Product[]) || [], total: count || 0 };
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const decoded = decodeURIComponent(slug);
  let product: Product | null = null;

  // Try decoded slug first (works for ASCII-only slugs)
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", decoded)
    .single();

  if (!error && data) product = data as Product;

  // Try raw slug as-is
  if (!product && slug !== decoded) {
    const { data: data2, error: error2 } = await supabase
      .from("products")
      .select("*")
      .eq("slug", slug)
      .single();

    if (!error2 && data2) product = data2 as Product;
  }

  // WordPress stores slugs with lowercase percent-encoded Unicode.
  // Next.js auto-decodes params, so re-encode and lowercase to match DB.
  if (!product) {
    const wpSlug = encodeURIComponent(decoded)
      .replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase())
      .replace(/%e2%80%b3/g, "%e2%80%b3"); // ″ already handled
    if (wpSlug !== decoded && wpSlug !== slug) {
      const { data: data3, error: error3 } = await supabase
        .from("products")
        .select("*")
        .eq("slug", wpSlug)
        .single();

      if (!error3 && data3) product = data3 as Product;
    }
  }

  if (!product) return null;

  // Variable products don't track stock at the parent level — Woo holds
  // stock_quantity/stock_status on each variation. Roll the variations up
  // so the storefront shows accurate availability for variable products.
  if (product.type === "variable") {
    const { data: variations } = await supabase
      .from("product_variations")
      .select("stock_status,stock_quantity")
      .eq("product_id", product.id);

    if (variations?.length) {
      let totalQty: number | null = null;
      let hasInstock = false;
      let hasBackorder = false;
      for (const v of variations) {
        if (v.stock_status === "instock") hasInstock = true;
        if (v.stock_status === "onbackorder") hasBackorder = true;
        if (v.stock_quantity !== null && v.stock_quantity !== undefined) {
          totalQty = (totalQty ?? 0) + v.stock_quantity;
        }
      }
      product = {
        ...product,
        stock_quantity: totalQty,
        stock_status: hasInstock ? "instock" : hasBackorder ? "onbackorder" : "outofstock",
      };
    }
  }

  return product;
}

// Tag slugs that represent blade lengths and steel types
const LENGTH_TAG_SLUGS = new Set([
  "3-5", "5", "5-2", "5-5", "5-8", "6", "6-5", "7", "7-5", "7-9", "8", "8-3", "8-5", "9-5", "10",
]);
const STEEL_TAG_SLUGS = new Set(["damascus", "stainless-steel", "damascus-pattern"]);

export async function getFilterOptions(): Promise<{
  categories: { slug: string; name: string; count: number }[];
  attributes: Record<string, { value: string; count: number }[]>;
  tags: Record<string, { slug: string; name: string; count: number }[]>;
  priceRange: { min: number; max: number };
}> {
  // Get published product IDs first
  const { data: publishedProducts } = await supabase
    .from("products")
    .select("id")
    .eq("status", "publish");
  const publishedIds = (publishedProducts || []).map((p) => p.id);

  // Categories with counts (only published products)
  const { data: cats } = publishedIds.length
    ? await supabase
        .from("product_categories")
        .select("category_slug, category_name")
        .in("product_id", publishedIds)
    : { data: [] };

  const catCounts = new Map<string, { name: string; count: number }>();
  for (const row of cats || []) {
    const existing = catCounts.get(row.category_slug);
    if (existing) {
      existing.count++;
    } else {
      catCounts.set(row.category_slug, { name: row.category_name, count: 1 });
    }
  }
  const categories = Array.from(catCounts.entries()).map(([slug, { name, count }]) => ({
    slug,
    name,
    count,
  }));

  // Attributes with counts (only published products)
  const { data: attrs } = publishedIds.length
    ? await supabase
        .from("product_attributes")
        .select("attribute_name, attribute_value")
        .in("product_id", publishedIds)
    : { data: [] };

  const attrMap = new Map<string, Map<string, number>>();
  for (const row of attrs || []) {
    if (!attrMap.has(row.attribute_name)) {
      attrMap.set(row.attribute_name, new Map());
    }
    const valueMap = attrMap.get(row.attribute_name)!;
    valueMap.set(row.attribute_value, (valueMap.get(row.attribute_value) || 0) + 1);
  }
  const attributes: Record<string, { value: string; count: number }[]> = {};
  for (const [name, valueMap] of attrMap) {
    attributes[name] = Array.from(valueMap.entries()).map(([value, count]) => ({
      value,
      count,
    }));
  }

  // Tags with counts (only published products) — grouped into Blade Length and Steel Type
  const { data: tagRows } = publishedIds.length
    ? await supabase
        .from("product_tags")
        .select("tag_slug, tag_name")
        .in("product_id", publishedIds)
    : { data: [] };

  const lengthCounts = new Map<string, { name: string; count: number }>();
  const steelCounts = new Map<string, { name: string; count: number }>();
  for (const row of tagRows || []) {
    if (LENGTH_TAG_SLUGS.has(row.tag_slug)) {
      const existing = lengthCounts.get(row.tag_slug);
      if (existing) existing.count++;
      else lengthCounts.set(row.tag_slug, { name: row.tag_name, count: 1 });
    } else if (STEEL_TAG_SLUGS.has(row.tag_slug)) {
      const existing = steelCounts.get(row.tag_slug);
      if (existing) existing.count++;
      else steelCounts.set(row.tag_slug, { name: row.tag_name, count: 1 });
    }
  }

  // Sort lengths numerically
  const sortedLengths = Array.from(lengthCounts.entries())
    .map(([slug, { name, count }]) => ({ slug, name, count }))
    .sort((a, b) => parseFloat(a.name) - parseFloat(b.name));

  const sortedSteels = Array.from(steelCounts.entries())
    .map(([slug, { name, count }]) => ({ slug, name, count }));

  const tags: Record<string, { slug: string; name: string; count: number }[]> = {};
  if (sortedLengths.length) tags["Blade Length"] = sortedLengths;
  if (sortedSteels.length) tags["Steel Type"] = sortedSteels;

  // Price range (published only)
  const { data: priceData } = await supabase
    .from("products")
    .select("price")
    .eq("status", "publish")
    .order("price", { ascending: true })
    .limit(1);
  const { data: priceDataMax } = await supabase
    .from("products")
    .select("price")
    .eq("status", "publish")
    .order("price", { ascending: false })
    .limit(1);

  const priceRange = {
    min: priceData?.[0]?.price || 0,
    max: priceDataMax?.[0]?.price || 1000,
  };

  return { categories, attributes, tags, priceRange };
}

export async function getProductSeo(productId: number) {
  const { data } = await supabase
    .from("product_seo")
    .select("*")
    .eq("product_id", productId)
    .single();
  return data;
}

export interface ProductSpecs {
  blade_length: string;
  steel_type: string;
  handle_material: string;
  knife_type: string;
  best_for: string;
}

export async function getProductSpecs(productId: number): Promise<ProductSpecs | null> {
  const { data } = await supabase
    .from("product_specs")
    .select("blade_length, steel_type, handle_material, knife_type, best_for")
    .eq("product_id", productId)
    .single();
  return data as ProductSpecs | null;
}

export async function getInStockAlternatives(
  productId: number,
  categorySlug?: string,
  limit = 6
): Promise<Product[]> {
  if (!categorySlug) return [];

  const { data: catProducts } = await supabase
    .from("product_categories")
    .select("product_id")
    .eq("category_slug", categorySlug);

  const ids = (catProducts?.map((r) => r.product_id) || []).filter((id) => id !== productId);
  if (ids.length === 0) return [];

  // Pull a wider candidate pool than `limit` so sales-ranking can do meaningful work.
  const { data: candidates } = await supabase
    .from("products")
    .select("*")
    .in("id", ids)
    .eq("status", "publish")
    .eq("stock_status", "instock")
    .limit(Math.max(limit * 3, 12));

  const pool = (candidates as Product[]) || [];
  if (pool.length <= 1) return pool.slice(0, limit);

  const candidateIds = pool.map((p) => p.id);

  // Variation -> parent product map, so variant sales count toward the parent.
  const { data: variations } = await supabase
    .from("product_variations")
    .select("id, product_id")
    .in("product_id", candidateIds);
  const vidToPid = new Map<number, number>(
    (variations || []).map((v) => [v.id as number, v.product_id as number])
  );

  // Last 30 days of paid orders.
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: orders } = await supabase
    .from("orders")
    .select("line_items")
    .gte("created_at", cutoff)
    .in("status", ["completed", "processing"]);

  const candidateSet = new Set(candidateIds);
  const sales = new Map<number, number>();
  for (const o of orders || []) {
    const items = Array.isArray(o.line_items) ? o.line_items : [];
    for (const it of items) {
      let pid: number | undefined = typeof it?.pid === "number" ? it.pid : undefined;
      if (!pid && typeof it?.vid === "number") pid = vidToPid.get(it.vid);
      if (pid && candidateSet.has(pid)) {
        sales.set(pid, (sales.get(pid) ?? 0) + (Number(it?.qty) || 0));
      }
    }
  }

  pool.sort((a, b) => {
    const diff = (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0);
    return diff !== 0 ? diff : b.id - a.id;
  });

  return pool.slice(0, limit);
}

/**
 * Earliest restock date for a product, derived from open POs covering its SKU(s).
 *  - Shipped PO  → use `expected_arrival` from that PO
 *  - Created PO  → use today + 60 days as a placeholder
 *  - No open PO  → null (caller should hide the notify-me UI entirely)
 */
const CREATED_PO_FALLBACK_DAYS = 60;

export async function getRestockEta(productId: number): Promise<Date | null> {
  const { data: product } = await supabase
    .from("products")
    .select("type, sku")
    .eq("id", productId)
    .single();
  if (!product) return null;

  let skus: string[] = [];
  if (product.type === "variable") {
    const { data: vars } = await supabase
      .from("product_variations")
      .select("sku")
      .eq("product_id", productId);
    skus = (vars || []).map((v) => v.sku as string).filter(Boolean);
  } else if (product.sku) {
    skus = [product.sku];
  }
  if (skus.length === 0) return null;

  const { data: lines } = await getSupabaseAdmin()
    .from("purchase_order_lines")
    .select("sku, purchase_orders!inner(status, expected_arrival)")
    .in("sku", skus)
    .in("purchase_orders.status", ["created", "shipped"]);

  if (!lines || lines.length === 0) return null;

  const now = Date.now();
  let earliest: number | null = null;
  for (const line of lines as unknown as Array<{
    purchase_orders: { status: string; expected_arrival: string | null } | null;
  }>) {
    const po = line.purchase_orders;
    if (!po) continue;
    let etaMs: number;
    if (po.status === "shipped" && po.expected_arrival) {
      etaMs = new Date(po.expected_arrival).getTime();
    } else if (po.status === "created") {
      etaMs = now + CREATED_PO_FALLBACK_DAYS * 86_400_000;
    } else {
      continue;
    }
    if (earliest === null || etaMs < earliest) earliest = etaMs;
  }
  return earliest === null ? null : new Date(earliest);
}

export async function getRelatedProducts(productId: number, categorySlug?: string): Promise<Product[]> {
  let related: Product[] = [];

  // Try to find products in the same category
  if (categorySlug) {
    const { data: catProducts } = await supabase
      .from("product_categories")
      .select("product_id")
      .eq("category_slug", categorySlug);

    const ids = (catProducts?.map((r) => r.product_id) || []).filter((id) => id !== productId);

    if (ids.length > 0) {
      const { data } = await supabase
        .from("products")
        .select("*")
        .in("id", ids)
        .eq("status", "publish")
        .limit(4);

      related = (data as Product[]) || [];
    }
  }

  // Fall back to random published products if not enough results
  if (related.length < 4) {
    const excludeIds = [productId, ...related.map((p) => p.id)];
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("status", "publish")
      .not("id", "in", `(${excludeIds.join(",")})`)
      .limit(4 - related.length);

    related = [...related, ...((data as Product[]) || [])];
  }

  return related;
}

export async function getProductAttributes(productId: number): Promise<WCAttribute[]> {
  const { data } = await supabase
    .from("product_attributes")
    .select("attribute_name, attribute_value")
    .eq("product_id", productId);

  if (!data) return [];

  // Group by attribute name into WCAttribute format
  const attrMap = new Map<string, string[]>();
  for (const row of data) {
    if (!attrMap.has(row.attribute_name)) {
      attrMap.set(row.attribute_name, []);
    }
    attrMap.get(row.attribute_name)!.push(row.attribute_value);
  }

  return Array.from(attrMap.entries()).map(([name, options], i) => ({
    id: i,
    name,
    options,
  }));
}
