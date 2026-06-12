import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Customer detail — full order history + addresses + products for one email.

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ email: string }> }
) {
  const { email: rawEmail } = await ctx.params;
  const email = decodeURIComponent(rawEmail).toLowerCase();
  const sb = getSupabaseAdmin();

  const { data: orders, error } = await sb
    .from("orders")
    .select("*")
    .ilike("customer_email", email)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const pids = new Set<number>();
  for (const o of orders) {
    for (const li of (o.line_items as Array<{ pid: number }>) || []) {
      if (li.pid) pids.add(li.pid);
    }
  }

  // Join product names for the "Products bought" list
  let products: Array<{ id: number; name: string; slug: string }> = [];
  if (pids.size > 0) {
    const { data } = await sb
      .from("products")
      .select("id, name, slug")
      .in("id", Array.from(pids));
    products = data || [];
  }

  return NextResponse.json({
    email,
    orders,
    products,
  });
}

// Update the customer's display name. Orders are keyed by email, so we write
// the chosen name onto every order row for this customer. Useful when orders
// arrive without a name and we infer one from the billing address.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ email: string }> }
) {
  const { email: rawEmail } = await ctx.params;
  const email = decodeURIComponent(rawEmail).toLowerCase();

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("orders")
    .update({ customer_name: name })
    .ilike("customer_email", email)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ email, name, updated: data?.length ?? 0 });
}
