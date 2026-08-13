import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStockHealth } from "@/lib/inventory";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = getSupabaseAdmin();

  const [health, posRes] = await Promise.all([
    getStockHealth(sb),
    sb
      .from("purchase_orders")
      .select("*")
      .in("status", ["draft", "sent", "shipped"])
      .order("created_at", { ascending: false }),
  ]);

  if (posRes.error) {
    return NextResponse.json({ error: posRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ...health,
    pendingPOs: posRes.data ?? [],
  });
}
