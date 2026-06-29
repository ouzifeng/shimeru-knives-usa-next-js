import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

type ShippingAddress = {
  full_name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

async function affiliateByToken(token: string) {
  if (!token || token.length < 16) return null;
  const { data } = await getSupabaseAdmin()
    .from("affiliates")
    .select("id, status, shipping_address")
    .eq("access_token", token)
    .maybeSingle();
  return data;
}

// GET: the affiliate's saved shipping address (plaintext, not sensitive PII).
export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  const affiliate = await affiliateByToken(token);
  if (!affiliate) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }
  const addr = affiliate.shipping_address as ShippingAddress | null;
  return NextResponse.json({ has: !!addr, address: addr ?? null });
}

// POST: save/update the shipping address.
export async function POST(req: NextRequest) {
  let body: { token?: string } & Partial<ShippingAddress>;
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

  const address: ShippingAddress = {
    full_name: (body.full_name ?? "").trim().slice(0, 120),
    line1: (body.line1 ?? "").trim().slice(0, 200),
    line2: (body.line2 ?? "").trim().slice(0, 200),
    city: (body.city ?? "").trim().slice(0, 120),
    state: (body.state ?? "").trim().slice(0, 60),
    zip: (body.zip ?? "").trim().slice(0, 20),
    country: (body.country ?? "").trim().slice(0, 80) || "United States",
  };

  if (!address.full_name) {
    return NextResponse.json({ error: "Enter the recipient name" }, { status: 400 });
  }
  if (!address.line1) {
    return NextResponse.json({ error: "Enter the street address" }, { status: 400 });
  }
  if (!address.city) {
    return NextResponse.json({ error: "Enter the city" }, { status: 400 });
  }
  if (!address.state) {
    return NextResponse.json({ error: "Enter the state" }, { status: 400 });
  }
  if (!address.zip) {
    return NextResponse.json({ error: "Enter the ZIP code" }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("affiliates")
    .update({ shipping_address: address })
    .eq("id", affiliate.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
