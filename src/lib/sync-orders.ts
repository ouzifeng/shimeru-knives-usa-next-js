// Order status sync. Mirrors `syncProducts()` in patterns:
//   - one lock row in order_sync_state (id=1)
//   - auto-reset if the lock has been held > 10 min
//   - buffer pattern: store START time of each run, use it as
//     modified_after next tick so updates landing mid-sync are caught
//   - sends the "shipped" email on a genuine transition INTO "completed"
//     (Shimeru marks an order completed once it's picked + tracked = shipped)

import { getSupabaseAdmin } from "./supabase";
import { wcFetch } from "./woocommerce";
import { renderOrderShipped } from "./email-templates/order-shipped";
import { buildOrderShippedFromWcOrderId } from "./email-templates/order-shipped-data";
import { sendTransactionalEmail } from "./postmark";

// Fire the shipped email when an order transitions into "completed".
// MUST be awaited (Vercel kills the container on response). Non-fatal —
// a Postmark failure must never break the status sync.
async function sendShippedEmail(wcOrderId: number, to: string): Promise<void> {
  try {
    const built = await buildOrderShippedFromWcOrderId(wcOrderId);
    if (!built.ok) {
      console.error("Could not build shipped email:", wcOrderId, built.reason);
      return;
    }
    const { subject, html, text } = renderOrderShipped(built.data);
    const sent = await sendTransactionalEmail({
      to,
      subject,
      html,
      text,
      tag: "order-shipped",
      metadata: { order: String(wcOrderId) },
    });
    if (!sent.ok) console.error("Shipped email failed:", wcOrderId, sent.error);
  } catch (err) {
    console.error("Shipped email threw:", wcOrderId, err);
  }
}

const STALE_LOCK_MS = 10 * 60 * 1000;
const PER_PAGE = 100;

type WCOrderForSync = {
  id: number;
  status: string;
  date_modified: string;
};

export async function syncOrders(): Promise<{
  synced: number;
  changed: number;
  errors: string | null;
}> {
  const admin = getSupabaseAdmin();

  const { data: state } = await admin
    .from("order_sync_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (state?.status === "syncing") {
    const startedAt = state.started_at ? new Date(state.started_at).getTime() : 0;
    if (Date.now() - startedAt > STALE_LOCK_MS) {
      await admin
        .from("order_sync_state")
        .update({
          status: "idle",
          sync_phase: null,
          errors: "Auto-reset: stale lock",
        })
        .eq("id", 1);
    } else {
      return { synced: 0, changed: 0, errors: "Order sync already in progress" };
    }
  }

  const syncStartedAt = new Date().toISOString();
  await admin
    .from("order_sync_state")
    .update({
      status: "syncing",
      sync_phase: "fetching",
      orders_synced: 0,
      orders_with_status_change: 0,
      orders_total: 0,
      started_at: syncStartedAt,
      errors: null,
    })
    .eq("id", 1);

  let totalSynced = 0;
  let totalChanged = 0;
  let syncError: string | null = null;

  try {
    const lastSyncedAt = state?.last_synced_at || null;
    let page = 1;

    while (true) {
      const params = new URLSearchParams();
      params.set("per_page", String(PER_PAGE));
      params.set("page", String(page));
      params.set("orderby", "modified");
      params.set("order", "desc");
      if (lastSyncedAt) params.set("modified_after", lastSyncedAt);

      const orders = await wcFetch<WCOrderForSync[]>(`/orders?${params.toString()}`);
      if (orders.length === 0) break;

      const wcIds = orders.map((o) => o.id);
      const { data: existingRows } = await admin
        .from("orders")
        .select("wc_order_id, wc_status, customer_email")
        .in("wc_order_id", wcIds);

      const existingMap = new Map<number, { status: string | null; email: string | null }>(
        (existingRows || []).map((r) => [
          r.wc_order_id as number,
          { status: r.wc_status as string | null, email: r.customer_email as string | null },
        ])
      );

      await admin
        .from("order_sync_state")
        .update({ sync_phase: "writing" })
        .eq("id", 1);

      const nowIso = new Date().toISOString();
      for (const order of orders) {
        // Skip WC orders we have no row for in Supabase (e.g. orders
        // created before Shimeru's own backend was on, or test orders).
        if (!existingMap.has(order.id)) continue;

        totalSynced++;
        const existing = existingMap.get(order.id)!;
        const previous = existing.status;
        if (previous === order.status) continue; // no write needed

        totalChanged++;
        await admin
          .from("orders")
          .update({ wc_status: order.status, wc_status_synced_at: nowIso })
          .eq("wc_order_id", order.id);

        // Shipped email — only on a genuine transition INTO "completed".
        // `previous` must be a known, non-completed status: a null prior
        // status means we never recorded this order's state, so we skip the
        // email to avoid blasting historical orders on the first sync.
        if (
          order.status === "completed" &&
          previous &&
          previous !== "completed" &&
          existing.email
        ) {
          await sendShippedEmail(order.id, existing.email);
        }
      }

      await admin
        .from("order_sync_state")
        .update({
          orders_synced: totalSynced,
          orders_with_status_change: totalChanged,
          sync_phase: "fetching",
        })
        .eq("id", 1);

      if (orders.length < PER_PAGE) break;
      page++;
    }
  } catch (err) {
    syncError = err instanceof Error ? err.message : "Unknown sync error";
  }

  await admin
    .from("order_sync_state")
    .update({
      status: syncError ? "error" : "idle",
      sync_phase: null,
      last_synced_at: syncStartedAt,
      orders_synced: totalSynced,
      orders_with_status_change: totalChanged,
      errors: syncError,
      completed_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return { synced: totalSynced, changed: totalChanged, errors: syncError };
}
