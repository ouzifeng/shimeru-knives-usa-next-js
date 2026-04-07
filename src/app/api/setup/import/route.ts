import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { WCProduct } from "@/lib/types";
import { ensureImageBucket, syncProductImages } from "@/lib/image-sync";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      supabaseUrl,
      supabaseServiceRoleKey,
      wordpressUrl,
      wcConsumerKey,
      wcConsumerSecret,
    } = body;

    if (!supabaseUrl || !supabaseServiceRoleKey || !wordpressUrl || !wcConsumerKey || !wcConsumerSecret) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Ensure storage bucket exists
    await ensureImageBucket(supabase);

    // Mark sync as started
    await supabase
      .from("sync_state")
      .update({
        status: "syncing",
        sync_phase: "fetching",
        products_synced: 0,
        products_total: 0,
        started_at: new Date().toISOString(),
        errors: null,
      })
      .eq("id", 1);

    let totalSynced = 0;
    let syncError: string | null = null;

    try {
      // Fetch all pages from WooCommerce concurrently
      const firstUrl = new URL("/wp-json/wc/v3/products", wordpressUrl);
      firstUrl.searchParams.set("consumer_key", wcConsumerKey);
      firstUrl.searchParams.set("consumer_secret", wcConsumerSecret);
      firstUrl.searchParams.set("per_page", "100");
      firstUrl.searchParams.set("page", "1");

      const firstRes = await fetch(firstUrl.toString());
      if (!firstRes.ok) {
        throw new Error(`WooCommerce API error: ${firstRes.status}`);
      }

      const totalPages = parseInt(firstRes.headers.get("x-wp-totalpages") || "1", 10);
      const totalItems = parseInt(firstRes.headers.get("x-wp-total") || "0", 10);
      const firstProducts: WCProduct[] = await firstRes.json();
      const allProducts: WCProduct[] = [...firstProducts];

      // Update total count
      await supabase
        .from("sync_state")
        .update({ products_total: totalItems || firstProducts.length, products_synced: firstProducts.length })
        .eq("id", 1);

      if (totalPages > 1) {
        const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
        const CONCURRENCY = 5;
        for (let i = 0; i < remainingPages.length; i += CONCURRENCY) {
          const batch = remainingPages.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            batch.map(async (page) => {
              const url = new URL("/wp-json/wc/v3/products", wordpressUrl);
              url.searchParams.set("consumer_key", wcConsumerKey);
              url.searchParams.set("consumer_secret", wcConsumerSecret);
              url.searchParams.set("per_page", "100");
              url.searchParams.set("page", String(page));
              const res = await fetch(url.toString());
              if (!res.ok) throw new Error(`WooCommerce API error: ${res.status}`);
              return res.json() as Promise<WCProduct[]>;
            })
          );
          results.forEach((products) => allProducts.push(...products));
          // Update progress after each batch
          await supabase
            .from("sync_state")
            .update({ products_synced: allProducts.length })
            .eq("id", 1);
        }
      }

      // Phase: downloading images
      await supabase
        .from("sync_state")
        .update({ sync_phase: "images", products_synced: allProducts.length, products_total: allProducts.length })
        .eq("id", 1);

      // Download and upload all product images to Supabase Storage
      const imageMap = await syncProductImages(supabase, supabaseUrl, allProducts);

      // Phase: writing to database
      await supabase
        .from("sync_state")
        .update({ sync_phase: "writing" })
        .eq("id", 1);

      // Build all rows with Supabase image URLs
      const now = new Date().toISOString();
      const productRows = allProducts.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku || null,
        status: p.status || "publish",
        type: p.type || "simple",
        description: p.description,
        short_description: p.short_description,
        price: parseFloat(p.price) || 0,
        regular_price: p.regular_price ? parseFloat(p.regular_price) : null,
        sale_price: p.sale_price ? parseFloat(p.sale_price) : null,
        on_sale: p.on_sale,
        stock_status: p.stock_status,
        images: imageMap.get(p.id) || p.images,
        categories: p.categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        })),
        wc_updated_at: p.date_modified,
        synced_at: now,
      }));

      const attrRows = allProducts.flatMap((p) =>
        p.attributes.flatMap((attr) =>
          attr.options.map((value) => ({
            product_id: p.id,
            attribute_name: attr.name,
            attribute_value: value,
          }))
        )
      );

      const catRows = allProducts.flatMap((p) =>
        p.categories.map((cat) => ({
          product_id: p.id,
          category_id: cat.id,
          category_name: cat.name,
          category_slug: cat.slug,
        }))
      );

      // Write to Supabase in parallel batches
      const CHUNK = 500;
      const upsertChunks = [];
      for (let i = 0; i < productRows.length; i += CHUNK) {
        upsertChunks.push(
          supabase.from("products").upsert(productRows.slice(i, i + CHUNK), { onConflict: "id" })
        );
      }
      await Promise.all(upsertChunks);

      // Clear old attributes/categories, then insert new ones in parallel
      const allIds = allProducts.map((p) => p.id);
      const idChunks = [];
      for (let i = 0; i < allIds.length; i += CHUNK) {
        idChunks.push(allIds.slice(i, i + CHUNK));
      }
      await Promise.all(
        idChunks.flatMap((ids) => [
          supabase.from("product_attributes").delete().in("product_id", ids),
          supabase.from("product_categories").delete().in("product_id", ids),
        ])
      );

      const insertOps = [];
      for (let i = 0; i < attrRows.length; i += CHUNK) {
        insertOps.push(supabase.from("product_attributes").insert(attrRows.slice(i, i + CHUNK)));
      }
      for (let i = 0; i < catRows.length; i += CHUNK) {
        insertOps.push(supabase.from("product_categories").insert(catRows.slice(i, i + CHUNK)));
      }
      if (insertOps.length) await Promise.all(insertOps);

      totalSynced = allProducts.length;
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Unknown sync error";
    }

    // Update sync state
    await supabase
      .from("sync_state")
      .update({
        status: syncError ? "error" : "idle",
        sync_phase: null,
        last_synced_at: new Date().toISOString(),
        products_synced: totalSynced,
        errors: syncError,
        completed_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (syncError) {
      return NextResponse.json({ ok: false, error: syncError, synced: totalSynced });
    }

    return NextResponse.json({ ok: true, synced: totalSynced });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
