"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactCustomerModal } from "@/components/admin/contact-customer-modal";
import { formatPrice } from "@/lib/format";

type Order = {
  id: number;
  wc_order_id: number | null;
  customer_email: string | null;
  customer_name: string | null;
  amount_total: number;
  currency: string;
  status: string;
  wc_status: string | null;
  line_items: Array<{ pid: number; qty: number; vid?: number; price?: number }> | null;
  shipping_address: Record<string, string> | null;
  billing_address: Record<string, string> | null;
  created_at: string;
  coupon_code: string | null;
};

type Product = { id: number; name: string; slug: string };

type DetailResponse = {
  email: string;
  orders: Order[];
  products: Product[];
};

const STATUS_COLOR: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800",
  processing: "bg-sky-100 text-sky-800",
  "on-hold": "bg-amber-100 text-amber-800",
  refunded: "bg-rose-100 text-rose-800",
  cancelled: "bg-rose-100 text-rose-800",
  failed: "bg-rose-100 text-rose-800",
  abandoned: "bg-muted text-muted-foreground",
};

function formatAddress(addr: Record<string, string> | null | undefined): string[] {
  if (!addr) return [];
  const name = [addr.first_name, addr.last_name].filter(Boolean).join(" ").trim();
  return [
    name,
    addr.company,
    addr.address_1,
    addr.address_2,
    [addr.city, addr.postcode].filter(Boolean).join(" ").trim(),
    addr.state,
    addr.country,
  ].filter((s) => s && s.trim());
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ email: string }>();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSentTicketId, setContactSentTicketId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/customers/${params.email}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Failed (${res.status})`);
        }
        return res.json() as Promise<DetailResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.email]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading customer...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4 gap-1.5">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error || "Customer not found"}
        </div>
      </div>
    );
  }

  const PAID = new Set(["completed", "processing", "on-hold"]);
  const paid = data.orders.filter((o) => PAID.has(o.status));
  const ltv = paid.reduce((s, o) => s + Number(o.amount_total), 0);
  const aov = paid.length > 0 ? ltv / paid.length : 0;
  const refunded = data.orders.filter((o) => o.status === "refunded").length;
  const abandoned = data.orders.filter((o) => o.status === "abandoned").length;
  const lastPaid = paid[0];
  const firstPaid = paid[paid.length - 1];
  const displayName = data.orders.find((o) => o.customer_name)?.customer_name || data.email;
  const recentShipping =
    lastPaid?.shipping_address ||
    data.orders.find((o) => o.shipping_address)?.shipping_address ||
    null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 px-2">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setContactOpen(true)}
          className="gap-1.5"
        >
          <Mail className="size-3.5" />
          Contact customer
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.email}</p>
      </div>

      {contactSentTicketId && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <span>Email sent. A support ticket was created so any reply threads back here.</span>
          <Link
            href={`/admin?tab=support`}
            className="text-xs font-medium underline-offset-4 hover:underline"
          >
            Open Support
          </Link>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">Paid orders</div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{paid.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">Lifetime value</div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{formatPrice(ltv)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">Average order</div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{formatPrice(aov)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">Refunds / abandoned</div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {refunded} / {abandoned}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">Order history</h2>
              <span className="text-xs text-muted-foreground">{data.orders.length} total</span>
            </div>
            <ul className="divide-y">
              {data.orders.map((o) => {
                const ref = o.wc_order_id ? `#${o.wc_order_id}` : `#${o.id}`;
                const statusClass = STATUS_COLOR[o.status] || "bg-muted text-muted-foreground";
                return (
                  <li key={o.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {o.wc_order_id ? (
                            <a
                              href={`/admin/orders/${o.wc_order_id}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {ref}
                            </a>
                          ) : (
                            <span className="font-medium">{ref}</span>
                          )}
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClass}`}
                          >
                            {o.status}
                          </span>
                          {o.coupon_code && (
                            <span className="text-xs text-muted-foreground">
                              · {o.coupon_code}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {" · "}
                          {(o.line_items || []).reduce((s, li) => s + (li.qty || 0), 0)} items
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-medium tabular-nums">
                        {formatPrice(Number(o.amount_total))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {data.products.length > 0 && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold tracking-tight">Products bought</h2>
              <ul className="space-y-1.5 text-sm">
                {data.products.map((p) => (
                  <li key={p.id}>
                    <a
                      href={`/product/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                    >
                      {p.name}
                      <ExternalLink className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          {recentShipping && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold tracking-tight">Most recent shipping address</h2>
              <address className="space-y-0.5 text-sm not-italic text-foreground/85">
                {formatAddress(recentShipping).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </address>
            </section>
          )}

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">Activity</h2>
            <dl className="space-y-1.5 text-sm">
              {firstPaid && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">First order</dt>
                  <dd>
                    {new Date(firstPaid.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </dd>
                </div>
              )}
              {lastPaid && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Last order</dt>
                  <dd>
                    {new Date(lastPaid.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>

      <ContactCustomerModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        customerEmail={data.email}
        customerName={displayName !== data.email ? displayName : null}
        onSent={(ticketId) => setContactSentTicketId(ticketId)}
      />
    </div>
  );
}
