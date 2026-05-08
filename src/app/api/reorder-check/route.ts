import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const REORDER_THRESHOLD = 50;

// ── Excluded product IDs ────────────────────────────────────────────
// Yoshii 8″ Damascus Steel Gyuto — sourced separately
const EXCLUDED_PIDS = new Set([10969]);

// Accessory keyword patterns (matched against product name, case-insensitive)
const ACCESSORY_PATTERNS = [
  /sharpener/i,
  /sharpening/i,
  /whetstone/i,
  /honing/i,
  /steel.*rod/i,
  /strop/i,
  /cutting board/i,
  /knife roll/i,
  /knife bag/i,
  /magnetic.*strip/i,
  /knife stand/i,
  /knife holder/i,
];

function isAccessory(name: string): boolean {
  return ACCESSORY_PATTERNS.some((p) => p.test(name));
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // ── 1. Get last reset timestamp ───────────────────────────────────
  const { data: tracker } = await admin
    .from("reorder_tracker")
    .select("last_reset_at")
    .eq("id", 1)
    .single();

  if (!tracker) {
    return NextResponse.json(
      { error: "reorder_tracker row missing — run the SQL migration" },
      { status: 500 }
    );
  }

  const since = tracker.last_reset_at;

  // ── 2. Fetch completed orders since last reset ────────────────────
  const { data: orders } = await admin
    .from("orders")
    .select("line_items, created_at")
    .eq("status", "completed")
    .gt("created_at", since);

  if (!orders || orders.length === 0) {
    return NextResponse.json({ units: 0, threshold: REORDER_THRESHOLD, since });
  }

  // ── 3. Collect all unique product/variation IDs from line items ────
  type LineItem = { pid: number; qty: number; vid?: number; price?: number };
  const allItems: LineItem[] = orders.flatMap(
    (o) => (o.line_items as LineItem[]) || []
  );

  const pidSet = new Set(allItems.map((i) => i.pid));
  const vidSet = new Set(allItems.filter((i) => i.vid).map((i) => i.vid!));

  // Remove already-excluded PIDs before querying
  for (const ex of EXCLUDED_PIDS) pidSet.delete(ex);

  // ── 4. Look up product + variation names, filter accessories ──────
  const [{ data: products }, { data: variations }] = await Promise.all([
    admin.from("products").select("id, name, sku").in("id", Array.from(pidSet)),
    vidSet.size > 0
      ? admin
          .from("product_variations")
          .select("id, product_id, sku, attributes")
          .in("id", Array.from(vidSet))
      : Promise.resolve({ data: [] as { id: number; product_id: number; sku: string; attributes: { option: string }[] }[] }),
  ]);

  const accessoryPids = new Set<number>();
  const productNames = new Map<number, string>();
  const productSkus = new Map<number, string>();

  if (products) {
    for (const p of products) {
      productNames.set(p.id, p.name);
      if (p.sku) productSkus.set(p.id, p.sku);
      if (isAccessory(p.name)) accessoryPids.add(p.id);
    }
  }

  // Build variation display names and SKUs: "Parent Name — Option"
  const variationNames = new Map<number, string>();
  const variationSkus = new Map<number, string>();
  if (variations) {
    for (const v of variations) {
      const parentName = productNames.get(v.product_id) || `PID ${v.product_id}`;
      const optionLabel = v.attributes?.[0]?.option || "";
      variationNames.set(v.id, optionLabel ? `${parentName} — ${optionLabel}` : parentName);
      if (v.sku) variationSkus.set(v.id, v.sku);
    }
  }

  // ── 5. Sum quantities, excluding Yoshii + accessories ─────────────
  // Key by variation ID when present, otherwise by product ID
  const breakdown = new Map<string, number>(); // "v:123" or "p:456" → total qty
  const displayNames = new Map<string, string>();
  const skuMap = new Map<string, string>();
  let totalUnits = 0;

  for (const item of allItems) {
    if (EXCLUDED_PIDS.has(item.pid)) continue;
    if (accessoryPids.has(item.pid)) continue;

    const key = item.vid ? `v:${item.vid}` : `p:${item.pid}`;
    const prev = breakdown.get(key) || 0;
    breakdown.set(key, prev + item.qty);
    totalUnits += item.qty;

    if (!displayNames.has(key)) {
      displayNames.set(
        key,
        item.vid
          ? variationNames.get(item.vid) || productNames.get(item.pid) || `VID ${item.vid}`
          : productNames.get(item.pid) || `PID ${item.pid}`
      );
      const sku = item.vid
        ? variationSkus.get(item.vid) || productSkus.get(item.pid) || ""
        : productSkus.get(item.pid) || "";
      if (sku) skuMap.set(key, sku);
    }
  }

  // Build sorted breakdown for response
  const sorted = [...breakdown.entries()]
    .map(([key, qty]) => ({ name: displayNames.get(key) || key, sku: skuMap.get(key) || "", qty }))
    .sort((a, b) => b.qty - a.qty);

  // ── 6. Not yet at threshold — just report ─────────────────────────
  if (totalUnits < REORDER_THRESHOLD) {
    return NextResponse.json({
      units: totalUnits,
      threshold: REORDER_THRESHOLD,
      remaining: REORDER_THRESHOLD - totalUnits,
      since,
      breakdown: sorted,
    });
  }

  // ── 7. Build order-form email ─────────────────────────────────────
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });


  const tableRows = sorted
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${r.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">${r.sku || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${r.qty}</td>
        </tr>`
    )
    .join("");

  const daysSinceReset = Math.round(
    (Date.now() - new Date(since).getTime()) / 86_400_000
  );

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto">
      <h2 style="margin:0 0 4px">🔪 Reorder Alert</h2>
      <p style="color:#666;margin:0 0 16px">${date}</p>
      <p style="margin:0 0 16px;font-size:14px">
        <strong>${totalUnits}</strong> knife units sold in the last
        <strong>${daysSinceReset}</strong> day${daysSinceReset === 1 ? "" : "s"}
        (since ${new Date(since).toLocaleDateString("en-US")}).
      </p>
      <h3 style="margin:0 0 8px;font-size:15px">Sales Breakdown</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Product</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">SKU</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb">Qty Sold</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr style="background:#f9fafb;font-weight:700">
            <td style="padding:8px 12px;border-top:2px solid #e5e7eb">Total</td>
            <td style="padding:8px 12px;border-top:2px solid #e5e7eb"></td>
            <td style="padding:8px 12px;border-top:2px solid #e5e7eb;text-align:right">${totalUnits}</td>
          </tr>
        </tfoot>
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#666">
        Use this breakdown to place your next batch order. Counter has been reset.
      </p>
    </div>
  `;

  // ── 8. Send via Brevo ─────────────────────────────────────────────
  const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Shimeru Knives", email: "sales@shimeruknives.co.uk" },
      to: [{ email: "mr.davidoak@gmail.com", name: "David" }],
      subject: `Reorder Alert — ${totalUnits} units sold`,
      htmlContent: html,
    }),
  });

  if (!brevoRes.ok) {
    const err = await brevoRes.text();
    console.error("[reorder-check] Brevo error:", err);
    return NextResponse.json(
      { error: "Failed to send email", detail: err },
      { status: 500 }
    );
  }

  // ── 9. Reset the counter ──────────────────────────────────────────
  await admin
    .from("reorder_tracker")
    .update({ last_reset_at: new Date().toISOString(), last_notified_at: new Date().toISOString() })
    .eq("id", 1);

  return NextResponse.json({
    ok: true,
    units: totalUnits,
    products: sorted.length,
    reset: true,
  });
}
