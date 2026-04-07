import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("monthly_fixed_costs")
    .select("*")
    .order("month", { ascending: true })
    .order("category", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ costs: data });
}

export async function PUT(req: NextRequest) {
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { month, category, amount } = body;

  if (!month || !category) {
    return NextResponse.json({ error: "month and category required" }, { status: 400 });
  }

  const { error } = await sb
    .from("monthly_fixed_costs")
    .upsert(
      { month, category, amount: amount ?? 0, updated_at: new Date().toISOString() },
      { onConflict: "month,category" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  // Seed a new month with default values from the most recent month
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { month } = body;

  if (!month) {
    return NextResponse.json({ error: "month required" }, { status: 400 });
  }

  // Check if month already has data
  const { data: existing } = await sb
    .from("monthly_fixed_costs")
    .select("id")
    .eq("month", month)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, message: "already exists" });
  }

  // Get the most recent month's data as defaults
  const { data: latest } = await sb
    .from("monthly_fixed_costs")
    .select("category, amount")
    .order("month", { ascending: false })
    .limit(5);

  if (!latest || latest.length === 0) {
    return NextResponse.json({ error: "no previous data to copy" }, { status: 400 });
  }

  // Dedupe categories (we ordered by month desc so first occurrence is latest)
  const seen = new Set<string>();
  const defaults: { month: string; category: string; amount: number }[] = [];
  for (const row of latest) {
    if (!seen.has(row.category)) {
      seen.add(row.category);
      defaults.push({ month, category: row.category, amount: row.amount });
    }
  }

  const { error } = await sb.from("monthly_fixed_costs").insert(defaults);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
