import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { encryptJson, decryptJson } from "@/lib/crypto-vault";

type BankDetails = {
  bank_name: string;
  account_holder: string;
  routing_number: string; // 9 digits (US ABA)
  account_number: string; // 4-17 digits
};

async function affiliateByToken(token: string) {
  if (!token || token.length < 16) return null;
  const { data } = await getSupabaseAdmin()
    .from("affiliates")
    .select("id, status, bank_details")
    .eq("access_token", token)
    .maybeSingle();
  return data;
}

// GET: masked view of stored bank details (never returns full numbers).
export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  const affiliate = await affiliateByToken(token);
  if (!affiliate) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const blob = affiliate.bank_details as { enc?: string } | null;
  if (!blob?.enc) {
    return NextResponse.json({ has: false });
  }

  try {
    const bank = decryptJson<BankDetails>(blob.enc);
    return NextResponse.json({
      has: true,
      bank_name: bank.bank_name ?? "",
      account_holder: bank.account_holder,
      routing_number_masked: `•••••${bank.routing_number.slice(-4)}`,
      account_number_masked: `••••${bank.account_number.slice(-4)}`,
    });
  } catch {
    return NextResponse.json({ has: false });
  }
}

// POST: save/update bank details (encrypted at rest).
export async function POST(req: NextRequest) {
  let body: { token?: string } & Partial<BankDetails>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const affiliate = await affiliateByToken(token);
  if (!affiliate || affiliate.status !== "approved") {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const bankName = (body.bank_name ?? "").trim().slice(0, 120);
  const accountHolder = (body.account_holder ?? "").trim().slice(0, 120);
  const routingNumber = (body.routing_number ?? "").replace(/\D/g, "");
  const accountNumber = (body.account_number ?? "").replace(/\D/g, "");

  if (!bankName) {
    return NextResponse.json({ error: "Enter the bank name" }, { status: 400 });
  }
  if (!accountHolder) {
    return NextResponse.json({ error: "Enter the account holder name" }, { status: 400 });
  }
  if (routingNumber.length !== 9) {
    return NextResponse.json({ error: "Routing number must be 9 digits" }, { status: 400 });
  }
  if (accountNumber.length < 4 || accountNumber.length > 17) {
    return NextResponse.json({ error: "Enter a valid account number" }, { status: 400 });
  }

  const enc = encryptJson({
    bank_name: bankName,
    account_holder: accountHolder,
    routing_number: routingNumber,
    account_number: accountNumber,
  });

  const { error } = await getSupabaseAdmin()
    .from("affiliates")
    .update({ bank_details: { enc } })
    .eq("id", affiliate.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
