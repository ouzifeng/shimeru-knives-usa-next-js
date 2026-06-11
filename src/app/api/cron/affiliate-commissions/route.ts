import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Daily commission lifecycle:
//   1. Reverse commissions whose order has since been refunded or cancelled
//      (works for both pending and approved; paid ones are left alone — a
//       post-payout refund is a manual clawback, not an automatic reversal).
//   2. Approve commissions that have cleared the 14-day refund hold.
const REFUND_HOLD_DAYS = 14;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  let reversed = 0;
  let approved = 0;

  // 1. Reverse for refunded / cancelled orders.
  const { data: badOrders } = await admin
    .from("orders")
    .select("id")
    .or("status.eq.refunded,wc_status.eq.refunded,wc_status.eq.cancelled");

  const badIds = (badOrders ?? []).map((o) => o.id);
  if (badIds.length > 0) {
    const { data: rev } = await admin
      .from("affiliate_commissions")
      .update({ status: "reversed" })
      .in("order_id", badIds)
      .in("status", ["pending", "approved"])
      .select("id");
    reversed = rev?.length ?? 0;
  }

  // 2. Approve commissions past the refund hold.
  const cutoff = new Date(Date.now() - REFUND_HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: appr } = await admin
    .from("affiliate_commissions")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");
  approved = appr?.length ?? 0;

  return NextResponse.json({ ok: true, reversed, approved });
}
