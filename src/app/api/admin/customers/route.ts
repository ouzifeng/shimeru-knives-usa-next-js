import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Aggregate customers off the orders table. Grouped by customer_email.
// At ~2k orders this runs in well under 500ms server-side. If volume
// ever grows past ~50k orders, swap for a materialized view.

type OrderRow = {
  customer_email: string | null;
  customer_name: string | null;
  status: string;
  amount_total: number;
  created_at: string;
  line_items: Array<{ pid: number; qty: number }> | null;
  shipping_address: Record<string, string> | null;
  billing_address: Record<string, string> | null;
};

const PAID_STATUSES = new Set(["completed", "processing", "on-hold"]);

async function fetchAllOrderRows(sb: ReturnType<typeof getSupabaseAdmin>) {
  const PAGE = 1000;
  let from = 0;
  const all: OrderRow[] = [];
  while (true) {
    const { data, error } = await sb
      .from("orders")
      .select(
        "customer_email, customer_name, status, amount_total, created_at, line_items, shipping_address, billing_address"
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as OrderRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function GET() {
  const sb = getSupabaseAdmin();
  let orderRows: OrderRow[];
  try {
    orderRows = await fetchAllOrderRows(sb);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load" },
      { status: 500 }
    );
  }

  const byEmail = new Map<
    string,
    {
      email: string;
      name: string | null;
      first_order_at: string;
      last_order_at: string;
      paid_orders: number;
      total_spend: number;
      refunded_orders: number;
      abandoned_carts: number;
      pids: Set<number>;
      shipping_country: string | null;
    }
  >();

  for (const o of orderRows) {
    if (!o.customer_email) continue;
    const email = o.customer_email.toLowerCase();
    let row = byEmail.get(email);
    if (!row) {
      row = {
        email,
        name: o.customer_name,
        first_order_at: o.created_at,
        last_order_at: o.created_at,
        paid_orders: 0,
        total_spend: 0,
        refunded_orders: 0,
        abandoned_carts: 0,
        pids: new Set<number>(),
        shipping_country: null,
      };
      byEmail.set(email, row);
    }

    // Most-recent name wins (we sort by created_at desc; first hit per email is the latest)
    if (!row.name && o.customer_name) row.name = o.customer_name;

    if (PAID_STATUSES.has(o.status)) {
      row.paid_orders += 1;
      row.total_spend += Number(o.amount_total) || 0;
      const country =
        o.shipping_address?.country || o.billing_address?.country || null;
      if (!row.shipping_country && country) row.shipping_country = country;
    } else if (o.status === "refunded") {
      row.refunded_orders += 1;
    } else if (o.status === "abandoned") {
      row.abandoned_carts += 1;
    }

    for (const li of o.line_items || []) {
      if (li.pid) row.pids.add(li.pid);
    }

    if (o.created_at < row.first_order_at) row.first_order_at = o.created_at;
    if (o.created_at > row.last_order_at) row.last_order_at = o.created_at;
  }

  const customers = Array.from(byEmail.values())
    .filter((c) => c.paid_orders > 0 || c.abandoned_carts > 0)
    .map((c) => ({
      email: c.email,
      name: c.name,
      first_order_at: c.first_order_at,
      last_order_at: c.last_order_at,
      paid_orders: c.paid_orders,
      total_spend: Math.round(c.total_spend * 100) / 100,
      avg_order_value:
        c.paid_orders > 0
          ? Math.round((c.total_spend / c.paid_orders) * 100) / 100
          : 0,
      refunded_orders: c.refunded_orders,
      abandoned_carts: c.abandoned_carts,
      product_count: c.pids.size,
      shipping_country: c.shipping_country,
      segment:
        c.paid_orders >= 5
          ? "vip"
          : c.paid_orders >= 2
            ? "repeat"
            : c.paid_orders === 1
              ? "new"
              : "abandoned-only",
    }));

  return NextResponse.json({ customers });
}
