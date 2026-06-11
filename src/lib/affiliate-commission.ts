import type { SupabaseClient } from "@supabase/supabase-js";

// Create a pending commission for an attributed order. Idempotent: the unique
// index on affiliate_commissions.order_id means a webhook retry won't duplicate.
// baseAmount = product value after discount, excluding shipping + tax.
export async function createAffiliateCommission(
  admin: SupabaseClient,
  opts: { orderId: number; affiliateCode: string; baseAmount: number }
): Promise<void> {
  const code = opts.affiliateCode.trim().toUpperCase();
  if (!code || opts.baseAmount <= 0) return;

  const { data: affiliate } = await admin
    .from("affiliates")
    .select("id, status, commission_pct")
    .eq("code", code)
    .maybeSingle();

  // Only pay approved affiliates.
  if (!affiliate || affiliate.status !== "approved") return;

  const pct = Number(affiliate.commission_pct) || 0;
  if (pct <= 0) return;

  const commissionAmount = Math.round(opts.baseAmount * pct) / 100; // pct is a percent

  const { error } = await admin.from("affiliate_commissions").insert({
    affiliate_id: affiliate.id,
    order_id: opts.orderId,
    base_amount: opts.baseAmount,
    commission_pct: pct,
    commission_amount: commissionAmount,
    status: "pending",
  });

  // 23505 = unique violation on order_id (retry) — safe to ignore.
  if (error && error.code !== "23505") {
    console.error("[affiliate-commission] insert failed:", error);
  }
}
