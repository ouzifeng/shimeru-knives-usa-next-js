import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = getSupabaseAdmin();
  const [pricesRes, settingsRes] = await Promise.all([
    sb
      .from("supplier_prices")
      .select("*")
      .order("supplier", { ascending: true })
      .order("sku", { ascending: true }),
    sb.from("supplier_settings").select("usd_to_gbp").eq("id", 1).maybeSingle(),
  ]);
  if (pricesRes.error) {
    return NextResponse.json({ error: pricesRes.error.message }, { status: 500 });
  }
  if (settingsRes.error) {
    return NextResponse.json({ error: settingsRes.error.message }, { status: 500 });
  }
  return NextResponse.json({
    rows: pricesRes.data ?? [],
    fx: settingsRes.data?.usd_to_gbp ?? 0.79,
  });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const fx = Number(body?.usd_to_gbp);
  if (!isFinite(fx) || fx <= 0) {
    return NextResponse.json({ error: "usd_to_gbp must be a positive number" }, { status: 400 });
  }
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("supplier_settings")
    .upsert({ id: 1, usd_to_gbp: fx, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, fx });
}
