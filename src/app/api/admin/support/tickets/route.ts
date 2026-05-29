import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");

  let query = getSupabaseAdmin()
    .from("support_tickets")
    .select("id, customer_email, customer_name, customer_phone, order_number, subject, status, source, delivery_status, created_at, last_updated")
    .order("last_updated", { ascending: false });

  if (status && ["pending", "on_hold", "solved"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
