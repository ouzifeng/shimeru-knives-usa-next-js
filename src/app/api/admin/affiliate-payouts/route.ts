import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";
import { decryptJson } from "@/lib/crypto-vault";

type BankDetails = { account_holder: string; routing_number: string; account_number: string };

function decryptBank(blob: unknown): BankDetails | null {
  const enc = (blob as { enc?: string } | null)?.enc;
  if (!enc) return null;
  try {
    return decryptJson<BankDetails>(enc);
  } catch {
    return null;
  }
}

// GET: who is owed what (approved, unpaid commissions) + payout history.
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: commissions } = await supabase
    .from("affiliate_commissions")
    .select("id, affiliate_id, commission_amount")
    .eq("status", "approved")
    .is("payout_id", null);

  const owedByAffiliate = new Map<string, { total: number; count: number }>();
  for (const c of commissions ?? []) {
    const agg = owedByAffiliate.get(c.affiliate_id) ?? { total: 0, count: 0 };
    agg.total += Number(c.commission_amount) || 0;
    agg.count += 1;
    owedByAffiliate.set(c.affiliate_id, agg);
  }

  const { data: affiliates } = await supabase
    .from("affiliates")
    .select("id, name, email, code, bank_details");

  const affMap = new Map((affiliates ?? []).map((a) => [a.id, a]));

  const payable = [...owedByAffiliate.entries()]
    .map(([affiliateId, agg]) => {
      const a = affMap.get(affiliateId);
      if (!a) return null;
      const bank = decryptBank(a.bank_details);
      return {
        affiliate_id: affiliateId,
        name: a.name,
        email: a.email,
        code: a.code,
        total: Math.round(agg.total * 100) / 100,
        count: agg.count,
        bank, // full details — admin only, needed to make the transfer
        has_bank: !!bank,
      };
    })
    .filter(Boolean)
    .sort((x, y) => (y!.total - x!.total));

  const { data: payouts } = await supabase
    .from("affiliate_payouts")
    .select("id, affiliate_id, period, total_amount, commission_count, status, paid_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const history = (payouts ?? []).map((p) => ({
    ...p,
    affiliate_name: affMap.get(p.affiliate_id)?.name ?? "—",
  }));

  return NextResponse.json({ payable, history });
}

// POST: pay an affiliate's approved-unpaid commissions. Marks them paid,
// records the payout batch, and emails the affiliate.
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { affiliate_id } = (await req.json()) as { affiliate_id?: string };
  if (!affiliate_id) {
    return NextResponse.json({ error: "Missing affiliate_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("id, name, email, bank_details")
    .eq("id", affiliate_id)
    .single();
  if (!affiliate) {
    return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
  }

  const { data: commissions } = await supabase
    .from("affiliate_commissions")
    .select("id, commission_amount")
    .eq("affiliate_id", affiliate_id)
    .eq("status", "approved")
    .is("payout_id", null);

  if (!commissions || commissions.length === 0) {
    return NextResponse.json({ error: "Nothing to pay for this affiliate" }, { status: 400 });
  }

  const total = Math.round(commissions.reduce((s, c) => s + (Number(c.commission_amount) || 0), 0) * 100) / 100;
  const now = new Date();
  const basePeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  let period = basePeriod;
  let payoutId: string | null = null;
  for (let attempt = 0; attempt < 5 && !payoutId; attempt++) {
    const { data: payout, error } = await supabase
      .from("affiliate_payouts")
      .insert({
        affiliate_id,
        period,
        total_amount: total,
        commission_count: commissions.length,
        status: "paid",
        paid_at: now.toISOString(),
        bank_snapshot: affiliate.bank_details ?? null,
      })
      .select("id")
      .single();
    if (payout) {
      payoutId = payout.id;
    } else if (error?.code === "23505") {
      period = `${basePeriod}-${attempt + 2}`;
    } else {
      return NextResponse.json({ error: error?.message || "Failed to record payout" }, { status: 500 });
    }
  }

  if (!payoutId) {
    return NextResponse.json({ error: "Could not record payout" }, { status: 500 });
  }

  const ids = commissions.map((c) => c.id);
  await supabase
    .from("affiliate_commissions")
    .update({ status: "paid", payout_id: payoutId })
    .in("id", ids);

  const firstName = affiliate.name.split(/\s+/)[0] || "there";
  await sendTransactionalEmail({
    to: affiliate.email,
    subject: "Your Shimeru Knives commission has been paid",
    tag: "affiliate-payout",
    metadata: { affiliate_id, payout_id: payoutId },
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
        <h1 style="font-size:20px;font-weight:600;">You've been paid, ${escapeHtml(firstName)}</h1>
        <p style="font-size:14px;line-height:1.6;color:#444;">
          We've just sent <strong>$${total.toFixed(2)}</strong> to your bank account, covering
          ${commissions.length} referred ${commissions.length === 1 ? "sale" : "sales"}. It should
          land within a couple of business days.
        </p>
        <p style="font-size:14px;line-height:1.6;color:#444;">Thanks for being a Shimeru affiliate.</p>
        <p style="font-size:14px;line-height:1.6;color:#444;margin-top:24px;">Shimeru Knives</p>
      </div>
    `,
    text:
      `You've been paid, ${firstName}.\n\n` +
      `We've just sent $${total.toFixed(2)} to your bank account, covering ${commissions.length} ` +
      `referred ${commissions.length === 1 ? "sale" : "sales"}. It should land within a couple of ` +
      `business days.\n\nThanks for being a Shimeru affiliate.\nShimeru Knives`,
  });

  return NextResponse.json({ ok: true, total, count: commissions.length });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
