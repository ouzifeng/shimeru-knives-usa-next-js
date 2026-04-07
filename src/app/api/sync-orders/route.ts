import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { wcFetch } from "@/lib/woocommerce";

/**
 * Syncs order statuses from WooCommerce → Supabase.
 * Checks all orders with a wc_order_id that are still marked "completed"
 * and updates any that have changed (e.g. refunded, cancelled).
 *
 * Run daily via Vercel Cron or manually from admin.
 * GET /api/sync-orders  (for Vercel Cron)
 * POST /api/sync-orders
 */

async function handleSync(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();

  // Get all Supabase orders that have a WC order ID and are still "completed"
  const { data: orders, error } = await sb
    .from("orders")
    .select("id, wc_order_id, status")
    .not("wc_order_id", "is", null)
    .eq("status", "completed");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!orders?.length) {
    return NextResponse.json({ checked: 0, updated: 0 });
  }

  let updated = 0;
  const changes: { wc_order_id: number; old_status: string; new_status: string }[] = [];

  // Check in batches of 20 to avoid hammering the WC API
  const batchSize = 20;
  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize);
    const ids = batch.map((o) => o.wc_order_id).join(",");

    try {
      const wcOrders = await wcFetch<{ id: number; status: string }[]>(
        `/orders?include=${ids}&per_page=${batchSize}`
      );

      const wcStatusMap = new Map(wcOrders.map((o) => [o.id, o.status]));

      for (const order of batch) {
        const wcStatus = wcStatusMap.get(order.wc_order_id!);
        if (!wcStatus) continue;

        // Map WC statuses to our statuses
        let newStatus: string | null = null;
        if (wcStatus === "refunded") newStatus = "refunded";
        else if (wcStatus === "cancelled") newStatus = "cancelled";
        else if (wcStatus === "failed") newStatus = "failed";

        if (newStatus && newStatus !== order.status) {
          const { error: updateError } = await sb
            .from("orders")
            .update({ status: newStatus })
            .eq("id", order.id);

          if (!updateError) {
            updated++;
            changes.push({
              wc_order_id: order.wc_order_id!,
              old_status: order.status,
              new_status: newStatus,
            });
          }
        }
      }
    } catch (err) {
      console.error(`Failed to fetch WC orders batch starting at ${i}:`, err);
    }
  }

  return NextResponse.json({
    checked: orders.length,
    updated,
    changes,
  });
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
