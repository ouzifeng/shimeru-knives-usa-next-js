import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { decryptJson } from "@/lib/crypto-vault";

type Bank = {
  bank_name?: string;
  account_holder: string;
  routing_number: string;
  account_number: string;
};

// GET: decrypted bank details + shipping address for one affiliate, so the admin
// knows where to send money and ship product. Admin-only; the list endpoint
// deliberately never returns these.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const { data: affiliate, error } = await getSupabaseAdmin()
    .from("affiliates")
    .select("id, bank_details, shipping_address")
    .eq("id", id)
    .maybeSingle();

  if (error || !affiliate) {
    return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
  }

  let bank: Bank | null = null;
  const blob = affiliate.bank_details as { enc?: string } | null;
  if (blob?.enc) {
    try {
      bank = decryptJson<Bank>(blob.enc);
    } catch {
      bank = null;
    }
  }

  return NextResponse.json({
    bank,
    shipping: affiliate.shipping_address ?? null,
  });
}
