import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const since = req.nextUrl.searchParams.get("since");
  const admin = getSupabaseAdmin();

  const stages = ["add_to_cart", "checkout_viewed", "payment_started", "payment_completed"] as const;
  const counts: { event: string; count: number }[] = [];

  for (const event of stages) {
    let query = admin
      .from(event === "payment_completed" ? "orders" : "funnel_events")
      .select("*", { count: "exact", head: true });

    if (event === "payment_completed") {
      query = query.in("status", ["completed", "partially_refunded"]);
    } else {
      query = query.eq("event", event);
    }

    if (since) query = query.gte("created_at", since);

    const { count } = await query;
    counts.push({ event, count: count || 0 });
  }

  return NextResponse.json(counts);
}
