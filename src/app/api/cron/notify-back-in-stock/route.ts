import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { storeConfig } from "../../../../../store.config";

const SENDER = { name: "Shimeru Knives", email: "sales@shimeruknives.co.uk" };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(productName: string, productUrl: string, storeName: string): string {
  const name = escapeHtml(productName);
  return `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 16px; color: #111;">
  <h1 style="font-size: 22px; margin: 0 0 16px; font-weight: 500;">${name} is back in stock</h1>
  <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px;">
    You asked us to let you know — and it&rsquo;s back. Stock is limited, so grab one while you can.
  </p>
  <p style="margin: 0 0 32px;">
    <a href="${productUrl}" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: 500; font-size: 15px;">View ${name}</a>
  </p>
  <p style="font-size: 13px; color: #666; margin: 0;">— ${escapeHtml(storeName)}</p>
</body></html>`;
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
    .select("id, type, stock_status")
    .in("id", productIds);

  const productMap = new Map<number, { type: string; stock_status: string }>();
  for (const p of products || []) {
    productMap.set(p.id as number, {
      type: p.type as string,
      stock_status: p.stock_status as string,
    });
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
    if (!inStockSet.has(sub.product_id as number)) continue;

    const productUrl = `${storeConfig.url}/product/${sub.product_slug}`;
    const html = buildEmailHtml(sub.product_name as string, productUrl, storeConfig.name);

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: SENDER,
        replyTo: SENDER,
        to: [{ email: sub.email }],
        subject: `${sub.product_name} is back in stock`,
        htmlContent: html,
      }),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      console.error(`[notify-back-in-stock] Brevo failed for sub ${sub.id}:`, errText);
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

  return NextResponse.json({
    ok: true,
    pending: subs.length,
    sent,
    failed,
  });
}
