import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Lightweight stock check — called at add-to-cart time as a safety net */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data } = await getSupabaseAdmin()
    .from("products")
    .select("stock_status")
    .eq("id", id)
    .single();

  return NextResponse.json(
    { in_stock: data?.stock_status === "instock" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
