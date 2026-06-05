import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";
import { renderBackInStock } from "@/lib/email-templates/back-in-stock";
import { formatPrice } from "@/lib/format";
import { storeConfig } from "../../../../../store.config";

// Notified rows older than this are deleted on each run so the table doesn't
// grow forever. The customer has already had their alert; the row is spent.
const PURGE_AFTER_DAYS = 7;

type ProductDetail = {
  id: number;
  type: string;
  stock_status: string;
  price: number | null;
  regular_price: number | null;
  sale_price: number | null;
  on_sale: boolean | null;
  images: { src: string }[] | null;
};

// Build the absolute product URL with attribution params so clicks land in
// GA as back-in-stock email traffic (Postmark click tracking handles the
// per-recipient attribution separately, via Tag + Metadata).
function buildProductUrl(slug: string): string {
  const base = `${storeConfig.url}/product/${slug}`;
  const params = new URLSearchParams({
    utm_source: "email",
    utm_medium: "transactional",
    utm_campaign: "back-in-stock",
  });
  return `${base}?${params.toString()}`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();

  const { data: subs, error: subsErr } = await sb
    .from("stock_notifications")
    .select("id, product_id, product_name, product_slug, email")
    .is("notified_at", null)
    .is("unsubscribed_at", null);

  if (subsErr) {
    return NextResponse.json({ error: subsErr.message }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, pending: 0, sent: 0 });
  }

  const productIds = [...new Set(subs.map((s) => s.product_id as number))];

  const { data: products } = await sb
    .from("products")
    .select("id, type, stock_status, price, regular_price, sale_price, on_sale, images")
    .in("id", productIds);

  const productMap = new Map<number, ProductDetail>();
  for (const p of products || []) {
    productMap.set(p.id as number, p as ProductDetail);
  }

  // For variable products, "in stock" means at least one variation is in stock.
  const variableIds = (products || [])
    .filter((p) => p.type === "variable")
    .map((p) => p.id as number);
  const variableHasStock = new Set<number>();
  if (variableIds.length) {
    const { data: vars } = await sb
      .from("product_variations")
      .select("product_id, stock_status")
      .in("product_id", variableIds);
    for (const v of vars || []) {
      if (v.stock_status === "instock") variableHasStock.add(v.product_id as number);
    }
  }

  const inStockSet = new Set<number>();
  for (const [pid, info] of productMap) {
    if (info.type === "variable") {
      if (variableHasStock.has(pid)) inStockSet.add(pid);
    } else if (info.stock_status === "instock") {
      inStockSet.add(pid);
    }
  }

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    const pid = sub.product_id as number;
    if (!inStockSet.has(pid)) continue;

    const product = productMap.get(pid);
    const productUrl = buildProductUrl(sub.product_slug as string);

    // Price + sale labels (variable products may not carry a single price).
    const price = product?.price ?? null;
    const regular = product?.regular_price ?? null;
    const onSale = Boolean(product?.on_sale && regular && price && regular > price);
    const savePercent =
      onSale && regular && price ? Math.round((1 - price / regular) * 100) : undefined;

    const { subject, html, text } = renderBackInStock({
      productName: sub.product_name as string,
      productUrl,
      imageUrl: product?.images?.[0]?.src,
      priceLabel: price != null ? formatPrice(price) : undefined,
      regularPriceLabel: onSale && regular != null ? formatPrice(regular) : undefined,
      savePercent,
    });

    const result = await sendTransactionalEmail({
      to: sub.email as string,
      subject,
      html,
      text,
      tag: "back-in-stock",
      // Per-recipient attribution: with click tracking on, Postmark ties each
      // click event to this subscription + product in its activity log.
      metadata: {
        product_id: String(pid),
        subscription_id: String(sub.id),
        email: String(sub.email),
      },
      trackOpens: true,
      trackLinks: "HtmlAndText",
    });

    if (!result.ok) {
      console.error(`[notify-back-in-stock] Postmark failed for sub ${sub.id}:`, result.error);
      failed++;
      continue;
    }

    const { error: updateErr } = await sb
      .from("stock_notifications")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", sub.id);

    if (updateErr) {
      console.error(`[notify-back-in-stock] Could not mark ${sub.id} sent:`, updateErr);
    }
    sent++;
  }

  // Housekeeping: drop rows that were notified more than PURGE_AFTER_DAYS ago.
  // Their alert is long delivered — keeping them just bloats the table.
  let purged = 0;
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: purgedRows, error: purgeErr } = await sb
    .from("stock_notifications")
    .delete()
    .lt("notified_at", cutoff)
    .select("id");
  if (purgeErr) {
    console.error("[notify-back-in-stock] purge failed:", purgeErr);
  } else {
    purged = purgedRows?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    pending: subs.length,
    sent,
    failed,
    purged,
  });
}
