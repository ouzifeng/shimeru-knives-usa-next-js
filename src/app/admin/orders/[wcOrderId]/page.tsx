"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactCustomerModal } from "@/components/admin/contact-customer-modal";
import { formatPrice } from "@/lib/format";

type LineItem = {
  id: number;
  name: string;
  quantity: number;
  total: string;
  sku: string | null;
  variation_id: number | null;
  meta: Array<{ key: string; value: string }>;
};

type ShippingLine = { method_title: string; total: string };
type CouponLine = { code: string; discount: string };
type Refund = { id: number; reason?: string; total: string; date_created: string };
type Tracking = {
  tracking_number: string;
  tracking_provider?: string;
  custom_tracking_provider?: string;
  tracking_link?: string;
  custom_tracking_link?: string;
  date_shipped?: string | number;
};

type SupabaseOverlay = {
  id: number;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  stripe_fee: number | null;
  wc_created: boolean | null;
  coupon_code: string | null;
  attribution: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    referrer?: string;
    landing_page?: string;
  } | null;
  customer_ip: string | null;
  abandon_reason: string | null;
  funnel_session_id: string | null;
  created_at: string;
};

type OrderResponse = {
  supabase: SupabaseOverlay | null;
  id: number;
  number: string;
  status: string;
  currency: string;
  date_created: string;
  date_modified: string;
  total: string;
  subtotal: string | null;
  shipping_total: string;
  total_tax: string;
  discount_total: string;
  customer_note: string;
  payment_method_title: string;
  transaction_id: string;
  billing: Record<string, string>;
  shipping: Record<string, string>;
  line_items: LineItem[];
  shipping_lines: ShippingLine[];
  coupon_lines: CouponLine[];
  refunds: Refund[];
  shipment_tracking: Tracking[];
};

const STATUS_COLOR: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800",
  processing: "bg-sky-100 text-sky-800",
  "on-hold": "bg-amber-100 text-amber-800",
  pending: "bg-amber-100 text-amber-800",
  cancelled: "bg-rose-100 text-rose-800",
  refunded: "bg-rose-100 text-rose-800",
  failed: "bg-rose-100 text-rose-800",
  abandoned: "bg-muted text-muted-foreground",
};

function formatAddress(addr: Record<string, string>): string[] {
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
  ].filter((line) => line && line.trim().length > 0);
}

function trackingDisplay(t: Tracking): { provider: string; link: string | null } {
  const provider =
    t.tracking_provider ||
    t.custom_tracking_provider ||
    "Tracking";
  const link = t.tracking_link || t.custom_tracking_link || null;
  return { provider, link };
}

function formatTrackingDate(value: string | number | undefined): string | null {
  if (!value) return null;
  const ms = typeof value === "number" ? value * 1000 : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ wcOrderId: string }>();
  const wcOrderId = params.wcOrderId;
  const [data, setData] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSentTicketId, setContactSentTicketId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/support/orders/${wcOrderId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Failed to load order (${res.status})`);
        }
        return res.json() as Promise<OrderResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load order");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wcOrderId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading order #{wcOrderId}...
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
          {error || "Order not found"}
        </div>
      </div>
    );
  }

  const statusClass = STATUS_COLOR[data.status] ?? "bg-muted text-muted-foreground";
  const refundedTotal = data.refunds.reduce((sum, r) => sum + Math.abs(Number(r.total) || 0), 0);
  const wcAdminUrl = `${process.env.NEXT_PUBLIC_WORDPRESS_URL || ""}/wp-admin/post.php?post=${data.id}&action=edit`;
  const customerEmail = data.billing?.email || "";
  const customerFullName = [data.billing?.first_name, data.billing?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 px-2">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          {customerEmail && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setContactOpen(true)}
              className="gap-1.5"
            >
              <Mail className="size-3.5" />
              Contact customer
            </Button>
          )}
          <a
            href={wcAdminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Open in WordPress admin
            <ExternalLink className="size-3" />
          </a>
        </div>
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

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order #{data.number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(data.date_created).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${statusClass}`}>
            {data.status}
          </span>
          <span className="text-2xl font-semibold tabular-nums">{formatPrice(Number(data.total))}</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">Items</h2>
            <ul className="divide-y">
              {data.line_items.map((li) => (
                <li key={li.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{li.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {li.sku && <span>SKU {li.sku}</span>}
                      {li.sku && " · "}
                      Qty {li.quantity}
                    </div>
                    {li.meta.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {li.meta.map((m, i) => (
                          <li key={i}>
                            <span className="font-medium">{m.key}:</span> {m.value}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    {formatPrice(Number(li.total))}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1 border-t pt-3 text-sm">
              {data.subtotal && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatPrice(Number(data.subtotal))}</span>
                </div>
              )}
              {data.shipping_lines.map((s, i) => (
                <div key={i} className="flex justify-between text-muted-foreground">
                  <span>Shipping ({s.method_title})</span>
                  <span className="tabular-nums">{formatPrice(Number(s.total))}</span>
                </div>
              ))}
              {Number(data.discount_total) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount{data.coupon_lines[0] ? ` (${data.coupon_lines[0].code})` : ""}</span>
                  <span className="tabular-nums">−{formatPrice(Number(data.discount_total))}</span>
                </div>
              )}
              {Number(data.total_tax) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">{formatPrice(Number(data.total_tax))}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(Number(data.total))}</span>
              </div>
              {refundedTotal > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>Refunded</span>
                  <span className="tabular-nums">−{formatPrice(refundedTotal)}</span>
                </div>
              )}
            </div>
          </section>

          {data.shipment_tracking.length > 0 && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold tracking-tight">Shipment tracking</h2>
              <ul className="space-y-3">
                {data.shipment_tracking.map((t, i) => {
                  const { provider, link } = trackingDisplay(t);
                  const date = formatTrackingDate(t.date_shipped);
                  return (
                    <li key={i} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{provider}</div>
                          <div className="mt-0.5 font-mono text-xs">{t.tracking_number}</div>
                          {date && (
                            <div className="mt-1 text-xs text-muted-foreground">Shipped {date}</div>
                          )}
                        </div>
                        {link && (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
                          >
                            Track
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {data.refunds.length > 0 && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold tracking-tight">Refunds</h2>
              <ul className="divide-y">
                {data.refunds.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium tabular-nums">
                        −{formatPrice(Math.abs(Number(r.total)))}
                      </div>
                      {r.reason && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{r.reason}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground">
                      {new Date(r.date_created).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.customer_note && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold tracking-tight">Customer note</h2>
              <p className="whitespace-pre-wrap text-sm">{data.customer_note}</p>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">Shipping address</h2>
            <address className="space-y-0.5 text-sm not-italic text-foreground/85">
              {formatAddress(data.shipping).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </address>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">Billing</h2>
            <address className="space-y-0.5 text-sm not-italic text-foreground/85">
              {formatAddress(data.billing).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {data.billing.email && (
                <div className="pt-1.5 text-muted-foreground">{data.billing.email}</div>
              )}
              {data.billing.phone && (
                <div className="text-muted-foreground">{data.billing.phone}</div>
              )}
            </address>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">Payment</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Method</dt>
                <dd>{data.payment_method_title || "—"}</dd>
              </div>
              {data.transaction_id && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Transaction</dt>
                  <dd className="truncate font-mono text-xs">{data.transaction_id}</dd>
                </div>
              )}
              {data.supabase?.stripe_fee != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Stripe fee</dt>
                  <dd className="tabular-nums">{formatPrice(Number(data.supabase.stripe_fee))}</dd>
                </div>
              )}
            </dl>
          </section>

          {data.supabase?.attribution && Object.values(data.supabase.attribution).some(Boolean) && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold tracking-tight">Attribution</h2>
              <dl className="space-y-1.5 text-sm">
                {data.supabase.attribution.utm_source && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="truncate">{data.supabase.attribution.utm_source}</dd>
                  </div>
                )}
                {data.supabase.attribution.utm_medium && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Medium</dt>
                    <dd className="truncate">{data.supabase.attribution.utm_medium}</dd>
                  </div>
                )}
                {data.supabase.attribution.utm_campaign && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Campaign</dt>
                    <dd className="truncate">{data.supabase.attribution.utm_campaign}</dd>
                  </div>
                )}
                {data.supabase.attribution.referrer && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Referrer</dt>
                    <dd className="truncate">{data.supabase.attribution.referrer}</dd>
                  </div>
                )}
                {data.supabase.attribution.landing_page && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Landing</dt>
                    <dd className="truncate">{data.supabase.attribution.landing_page}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold tracking-tight">Back to support</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Return to the support queue.
            </p>
            <Link
              href="/admin?tab=support"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Open Support tab
            </Link>
          </section>
        </div>
      </div>

      <ContactCustomerModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        customerEmail={customerEmail}
        customerName={customerFullName}
        orderNumber={data.number}
        onSent={(ticketId) => setContactSentTicketId(ticketId)}
      />
    </div>
  );
}
