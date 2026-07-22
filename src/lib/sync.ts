import { supabaseAdmin, getSupabaseAdmin } from "./supabase";
import { getProducts, getProductsPage, getProductVariations } from "./woocommerce";
import { ensureImageBucket, syncProductImages } from "./image-sync";
import type { WCProduct } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function syncProducts(): Promise<{ synced: number; healed: number; errors: string | null }> {
  const admin = getSupabaseAdmin();

  // Check if already syncing
  const { data: state } = await admin
    .from("sync_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (state?.status === "syncing") {
    // Auto-reset stale lock if stuck for more than 10 minutes
    const startedAt = state.started_at ? new Date(state.started_at).getTime() : 0;
    const staleAfterMs = 10 * 60 * 1000;
    if (Date.now() - startedAt > staleAfterMs) {
      await admin
        .from("sync_state")
        .update({ status: "idle", sync_phase: null, errors: "Auto-reset: stale lock" })
        .eq("id", 1);
    } else {
      return { synced: 0, healed: 0, errors: "Sync already in progress" };
    }
  }

  // Ensure image bucket exists
  await ensureImageBucket(admin);

  // Mark as syncing
  const syncStartedAt = new Date().toISOString();
  await admin
    .from("sync_state")
    .update({
      status: "syncing",
      sync_phase: "fetching",
      products_synced: 0,
      products_total: 0,
      started_at: syncStartedAt,
      errors: null,
    })
    .eq("id", 1);

  let totalSynced = 0;
  let totalHealed = 0;
  let syncError: string | null = null;

  try {
    const lastSyncedAt = state?.last_synced_at || null;
    let page = 1;

    // First page — get total count from headers
    const firstParams: Record<string, string | number> = { per_page: 100, page: 1 };
    if (lastSyncedAt) firstParams.modified_after = lastSyncedAt;

    const firstResult = await getProductsPage(firstParams);
    if (firstResult.products.length) {
      // Update total so frontend can show X of Y
      await admin
        .from("sync_state")
        .update({ products_total: firstResult.total, products_synced: 0 })
        .eq("id", 1);

      await upsertProducts(firstResult.products);
      totalSynced += firstResult.products.length;
      await admin
        .from("sync_state")
        .update({ products_synced: totalSynced })
        .eq("id", 1);

      page = 2;
      while (page <= firstResult.totalPages) {
        const params: Record<string, string | number> = { per_page: 100, page };
        if (lastSyncedAt) params.modified_after = lastSyncedAt;

        const products = await getProducts(params as any);
        if (!products.length) break;

        await upsertProducts(products);
        totalSynced += products.length;

        await admin
          .from("sync_state")
          .update({ products_synced: totalSynced })
          .eq("id", 1);

        page++;
      }
    }

    // After the main sync loop, on full syncs (no modified_after), clean up deleted products
    if (!lastSyncedAt) {
      const allWcIds = new Set<number>();
      let cleanPage = 1;
      while (true) {
        const batch = await getProducts({ per_page: 100, page: cleanPage });
        if (!batch.length) break;
        batch.forEach((p) => allWcIds.add(p.id));
        cleanPage++;
      }

      const { data: sbProducts } = await admin.from("products").select("id");
      const toDelete = (sbProducts || [])
        .filter((p) => !allWcIds.has(p.id))
        .map((p) => p.id);

      if (toDelete.length) {
        // Delete images from storage for removed products
        for (const id of toDelete) {
          const { data: files } = await admin.storage.from("product-images").list(String(id));
          if (files?.length) {
            await admin.storage
              .from("product-images")
              .remove(files.map((f) => `${id}/${f.name}`));
          }
        }
        await admin.from("products").delete().in("id", toDelete);
      }
    }

    // Self-heal category relations. The sync above is incremental: it only
    // rewrites relation rows for products WooCommerce reports as modified, so
    // if product_categories ever loses rows for an unmodified product (a past
    // failed write, a manual truncate) nothing would ever restore them. Rebuild
    // any missing rows from products.categories, the JSONB copy written on every
    // upsert and thus the source of truth. Runs each tick even when nothing
    // changed, so drift is corrected within one cron cycle.
    totalHealed = await reconcileCategories(admin);
  } catch (err) {
    syncError = err instanceof Error ? err.message : "Unknown sync error";
  }

  await admin
    .from("sync_state")
    .update({
      status: syncError ? "error" : "idle",
      sync_phase: null,
      last_synced_at: syncStartedAt,
      products_synced: totalSynced,
      errors: syncError,
      completed_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return { synced: totalSynced, healed: totalHealed, errors: syncError };
}

/**
 * Rebuild missing product_categories rows from the products.categories JSONB.
 * Only inserts rows for products that currently have none, so it never fights
 * the incremental sync (which owns content changes) and never deletes. Returns
 * the number of rows inserted. Throws on write failure so drift surfaces as a
 * real sync error instead of silently persisting.
 */
async function reconcileCategories(
  admin: ReturnType<typeof getSupabaseAdmin>
): Promise<number> {
  const [productsRes, existingRes] = await Promise.all([
    admin.from("products").select("id, categories"),
    admin.from("product_categories").select("product_id"),
  ]);
  if (productsRes.error) throw new Error(`reconcile read products failed: ${productsRes.error.message}`);
  if (existingRes.error) throw new Error(`reconcile read categories failed: ${existingRes.error.message}`);

  const haveRows = new Set((existingRes.data || []).map((r) => r.product_id));
  const missing: {
    product_id: number;
    category_id: number | null;
    category_name: string;
    category_slug: string;
  }[] = [];
  for (const p of productsRes.data || []) {
    if (haveRows.has(p.id)) continue;
    const cats = Array.isArray(p.categories) ? p.categories : [];
    for (const c of cats) {
      if (c && c.slug) {
        missing.push({
          product_id: p.id,
          category_id: c.id ?? null,
          category_name: c.name ?? c.slug,
          category_slug: c.slug,
        });
      }
    }
  }

  if (!missing.length) return 0;
  const { error } = await admin.from("product_categories").insert(missing);
  if (error) throw new Error(`reconcile insert categories failed: ${error.message}`);
  return missing.length;
}

async function upsertProducts(products: WCProduct[]) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Sync images to Supabase Storage
  const imageMap = await syncProductImages(admin, SUPABASE_URL, products);

  // For variable products, fetch variations to:
  // 1. Get regular price for on-sale products
  // 2. Filter attribute options to only those with actual variations
  const variablePrices = new Map<number, { regular_price: number; sale_price: number }>();
  const variationOptionsByProduct = new Map<number, Set<string>>();
  const allVariationRows: Array<{
    id: number; product_id: number; sku: string | null; price: number;
    regular_price: number | null; sale_price: number | null; on_sale: boolean;
    stock_status: string; stock_quantity: number | null;
    attributes: unknown[]; image: unknown; cached_at: string;
  }> = [];
  const variableProducts = products.filter((p) => p.type === "variable");
  for (const p of variableProducts) {
    try {
      const variations = await getProductVariations(p.id);
      if (variations.length) {
        // Collect all attribute options that have a real variation
        const opts = new Set<string>();
        for (const v of variations) {
          for (const attr of v.attributes) {
            opts.add(`${attr.name}::${attr.option}`);
          }
        }
        variationOptionsByProduct.set(p.id, opts);

        // Store variation rows for bulk upsert
        for (const v of variations) {
          allVariationRows.push({
            id: v.id,
            product_id: p.id,
            sku: v.sku || null,
            price: parseFloat(v.price) || 0,
            regular_price: v.regular_price ? parseFloat(v.regular_price) : null,
            sale_price: v.sale_price ? parseFloat(v.sale_price) : null,
            on_sale: v.on_sale,
            stock_status: v.stock_status,
            stock_quantity: v.stock_quantity ?? null,
            attributes: v.attributes,
            image: v.image,
            cached_at: now,
          });
        }

        // Get regular price for on-sale products
        if (p.on_sale) {
          const onSaleVariations = variations.filter((v) => v.on_sale && v.regular_price);
          if (onSaleVariations.length) {
            const cheapest = onSaleVariations.reduce((min, v) =>
              parseFloat(v.price) < parseFloat(min.price) ? v : min
            );
            variablePrices.set(p.id, {
              regular_price: parseFloat(cheapest.regular_price),
              sale_price: parseFloat(cheapest.price),
            });
          }
        }
      }
    } catch {
      // Skip if variations fetch fails — we still have the base price
    }
  }

  const rows = products.map((p) => {
    const varPrices = variablePrices.get(p.id);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku || null,
      status: p.status || "publish",
      type: p.type || "simple",
      description: p.description,
      short_description: p.short_description,
      price: parseFloat(p.price) || 0,
      regular_price: p.regular_price ? parseFloat(p.regular_price) : varPrices?.regular_price ?? null,
      sale_price: p.sale_price ? parseFloat(p.sale_price) : varPrices?.sale_price ?? null,
      on_sale: p.on_sale,
      stock_status: p.stock_status,
      stock_quantity: p.stock_quantity ?? null,
      images: imageMap.get(p.id) || p.images,
      categories: p.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      average_rating: parseFloat(p.average_rating) || 0,
      rating_count: p.rating_count || 0,
      wc_updated_at: p.date_modified,
      synced_at: now,
    };
  });

  const productIds = products.map((p) => p.id);

  // Upsert products, variations, and delete old relations in parallel
  const variableIds = variableProducts.map((p) => p.id);
  const writeResults = await Promise.all([
    admin.from("products").upsert(rows, { onConflict: "id" }),
    admin.from("product_attributes").delete().in("product_id", productIds),
    admin.from("product_categories").delete().in("product_id", productIds),
    admin.from("product_tags").delete().in("product_id", productIds),
    ...(variableIds.length
      ? [admin.from("product_variations").delete().in("product_id", variableIds)]
      : []),
  ]);
  // Surface any write failure. supabase-js resolves (does not throw) on a DB
  // error, so an unchecked result here is how the relation tables silently lost
  // their rows before: the delete above committed, a later insert failed quietly,
  // and no one knew until a filter returned nothing.
  for (const r of writeResults) {
    if (r?.error) throw new Error(`product write failed: ${r.error.message}`);
  }

  // Upsert variations after clearing old ones
  if (allVariationRows.length) {
    const { error } = await admin.from("product_variations").upsert(allVariationRows, { onConflict: "id" });
    if (error) throw new Error(`variation upsert failed: ${error.message}`);
  }

  // Insert fresh attributes and categories in parallel
  // For variable products, only sync attribute options that have a real variation
  const attrRows = products.flatMap((p) =>
    p.attributes.flatMap((attr) => {
      const validOpts = variationOptionsByProduct.get(p.id);
      const options = validOpts
        ? attr.options.filter((value) => validOpts.has(`${attr.name}::${value}`))
        : attr.options;
      return options.map((value) => ({
        product_id: p.id,
        attribute_name: attr.name,
        attribute_value: value,
      }));
    })
  );
  const catRows = products.flatMap((p) =>
    p.categories.map((cat) => ({
      product_id: p.id,
      category_id: cat.id,
      category_name: cat.name,
      category_slug: cat.slug,
    }))
  );

  const tagRows = products.flatMap((p) =>
    (p.tags || []).map((tag) => ({
      product_id: p.id,
      tag_id: tag.id,
      tag_name: tag.name,
      tag_slug: tag.slug,
    }))
  );

  const inserts = [];
  if (attrRows.length) inserts.push(admin.from("product_attributes").insert(attrRows));
  if (catRows.length) inserts.push(admin.from("product_categories").insert(catRows));
  if (tagRows.length) inserts.push(admin.from("product_tags").insert(tagRows));
  if (inserts.length) {
    const insertResults = await Promise.all(inserts);
    for (const r of insertResults) {
      if (r?.error) throw new Error(`relation insert failed: ${r.error.message}`);
    }
  }
}
