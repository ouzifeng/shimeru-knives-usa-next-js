// Resolves a marketing segment to a list of {email, name} recipients,
// driven off the same orders-table aggregation the Customers tab uses.
//
// Segments:
//   all              — every customer who has paid at least once
//   vip              — 5+ paid orders
//   repeat           — 2-4 paid orders
//   new              — exactly 1 paid order
//   abandoned-only   — never paid, but abandoned a cart (email captured)

import { getSupabaseAdmin } from "./supabase";

export type Segment = "all" | "vip" | "repeat" | "new" | "abandoned-only";

const PAID_STATUSES = new Set(["completed", "processing", "on-hold"]);

export type Recipient = {
  email: string;
  name: string | null;
};

type OrderSlice = {
  customer_email: string | null;
  customer_name: string | null;
  status: string;
  created_at: string;
};

async function fetchAllOrderSlices(): Promise<OrderSlice[]> {
  const sb = getSupabaseAdmin();
  const PAGE = 1000;
  let from = 0;
  const all: OrderSlice[] = [];
  while (true) {
    const { data, error } = await sb
      .from("orders")
      .select("customer_email, customer_name, status, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as OrderSlice[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function resolveSegmentRecipients(segment: Segment): Promise<Recipient[]> {
  const rows = await fetchAllOrderSlices();

  const byEmail = new Map<string, { name: string | null; paid_orders: number; abandoned: number }>();

  for (const o of rows) {
    if (!o.customer_email) continue;
    const email = o.customer_email.toLowerCase();
    let entry = byEmail.get(email);
    if (!entry) {
      entry = { name: null, paid_orders: 0, abandoned: 0 };
      byEmail.set(email, entry);
    }
    if (!entry.name && o.customer_name) entry.name = o.customer_name;
    if (PAID_STATUSES.has(o.status)) entry.paid_orders++;
    else if (o.status === "abandoned") entry.abandoned++;
  }

  const out: Recipient[] = [];
  for (const [email, e] of byEmail) {
    let include = false;
    if (segment === "all") include = e.paid_orders > 0;
    else if (segment === "vip") include = e.paid_orders >= 5;
    else if (segment === "repeat") include = e.paid_orders >= 2 && e.paid_orders <= 4;
    else if (segment === "new") include = e.paid_orders === 1;
    else if (segment === "abandoned-only") include = e.paid_orders === 0 && e.abandoned > 0;

    if (include) out.push({ email, name: e.name });
  }

  return out;
}
