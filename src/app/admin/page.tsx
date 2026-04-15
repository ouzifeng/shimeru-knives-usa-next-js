"use client";

import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { SyncState, WCShippingMethod, WCShippingZone } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { Input } from "@/components/ui/input";
import {
  Globe,
  CreditCard,
  Package,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  ArrowDownToLine,
  Truck,
  CheckCircle2,
  XCircle,
  Sparkles,
  Eye,
  EyeOff,
  Check,
  BarChart3,
  ShoppingBag,
  ExternalLink,
  Ban,
  RotateCcw,
  ShieldAlert,
  MessageSquare,
} from "lucide-react";

/** Get current date/time parts in America/New_York timezone */
function localNow(): Date {
  const s = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  // en-US format: "M/D/YYYY, H:MM:SS AM/PM"
  const [datePart, timePart] = s.split(", ");
  const [month, day, year] = datePart.split("/").map(Number);
  const d = new Date(`${datePart} ${timePart}`);
  return new Date(year, month - 1, day, d.getHours(), d.getMinutes(), d.getSeconds());
}

/** Parse a UTC/ISO date string into local Date for comparison */
function toLocal(dateStr: string): Date {
  const s = new Date(dateStr).toLocaleString("en-US", { timeZone: "America/New_York" });
  const [datePart, timePart] = s.split(", ");
  const [month, day, year] = datePart.split("/").map(Number);
  const d = new Date(`${datePart} ${timePart}`);
  return new Date(year, month - 1, day, d.getHours(), d.getMinutes(), d.getSeconds());
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusDot({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    ok: { color: "bg-emerald-500", label: "Connected" },
    idle: { color: "bg-emerald-500", label: "Connected" },
    syncing: { color: "bg-sky-500 animate-pulse", label: "Syncing" },
    error: { color: "bg-rose-500", label: "Error" },
    checking: { color: "bg-slate-300 animate-pulse", label: "Checking" },
  };
  const { color, label } = config[status] || { color: "bg-slate-300", label: status };
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function StatBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-1.5 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

interface ShippingZoneData {
  zone: WCShippingZone;
  methods: WCShippingMethod[];
}

interface Order {
  id: number;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  wc_order_id: number | null;
  customer_email: string | null;
  customer_name: string | null;
  amount_total: number;
  currency: string;
  status: string;
  wc_created: boolean;
  line_items: { pid: number; qty: number; vid?: number; price?: number }[] | null;
  coupon_code: string | null;
  attribution: { utm_source?: string; utm_medium?: string; utm_campaign?: string; referrer?: string; landing_page?: string } | null;
  customer_ip: string | null;
  abandon_reason: string | null;
  stripe_fee: number | null;
  created_at: string;
}

type DateFilter = "today" | "yesterday" | "mtd" | "30d" | "ytd" | "12m" | "all" | "custom";

function getDateRange(filter: DateFilter, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = localNow();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (filter) {
    case "today":
      return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return {
        from: new Date(y.getFullYear(), y.getMonth(), y.getDate()),
        to: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999),
      };
    }
    case "mtd":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: d, to };
    }
    case "ytd":
      return { from: new Date(now.getFullYear(), 0, 1), to };
    case "12m": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { from: d, to };
    }
    case "custom":
      return {
        from: customFrom ? new Date(customFrom) : new Date(now.getFullYear(), 0, 1),
        to: customTo ? new Date(customTo + "T23:59:59.999") : to,
      };
    case "all":
    default:
      return { from: new Date(2020, 0, 1), to };
  }
}

type CostLookup = Record<number, { cogs: number; import: number; shipping: number }>;

interface MonthlyFixedCost {
  id: string;
  month: string;
  category: string;
  amount: number;
}

function calcOrderCost(
  order: Order,
  costByProductId: CostLookup,
  costByVariationId: CostLookup,
): number {
  if (order.status !== "completed" || !order.line_items) return 0;
  let variable = 0;
  for (const li of order.line_items) {
    const cost = (li.vid && costByVariationId[li.vid]) || costByProductId[li.pid] || null;
    if (cost) {
      variable += (cost.cogs + cost.import + cost.shipping) * li.qty;
    }
  }
  return variable;
}

function getMonthlyFixedTotal(
  fixedCosts: MonthlyFixedCost[],
  monthKey: string
): number {
  return fixedCosts
    .filter((c) => c.month.startsWith(monthKey))
    .reduce((sum, c) => sum + Number(c.amount), 0);
}

function getProRatedFixedCosts(
  fixedCosts: MonthlyFixedCost[],
  from: Date,
  to: Date
): number {
  let total = 0;
  // Iterate each month that overlaps the range
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);

  while (cursor <= endMonth) {
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const monthlyTotal = getMonthlyFixedTotal(fixedCosts, monthKey);

    // Calculate overlap days
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    const overlapStart = from > monthStart ? from : monthStart;
    const overlapEnd = to < monthEnd ? to : monthEnd;
    const overlapDays = Math.max(0, Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1);

    total += (monthlyTotal / daysInMonth) * overlapDays;
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return total;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function OrdersTab() {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [costByProductId, setCostByProductId] = useState<CostLookup>({});
  const [costByVariationId, setCostByVariationId] = useState<CostLookup>({});
  const [fixedCosts, setFixedCosts] = useState<MonthlyFixedCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [adSpend, setAdSpend] = useState<number>(0);
  const [adClicks, setAdClicks] = useState<number>(0);
  const [adLoading, setAdLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/orders").then((r) => r.json()),
      fetch("/api/admin/fixed-costs").then((r) => r.json()),
    ])
      .then(([orderData, fixedData]) => {
        setAllOrders(orderData.orders);
        setCostByProductId(orderData.costByProductId);
        setCostByVariationId(orderData.costByVariationId);
        setFixedCosts(fixedData.costs || []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load orders");
      })
      .finally(() => setLoading(false));
  }, []);

  const { from, to } = getDateRange(dateFilter, customFrom, customTo);

  // Fetch Google Ads data when date range changes
  useEffect(() => {
    const fromStr = fmtDate(from);
    const toStr = fmtDate(to);
    setAdLoading(true);
    fetch(`/api/admin/google-ads?from=${fromStr}&to=${toStr}`)
      .then((r) => r.json())
      .then((data) => {
        setAdSpend(data.totalSpend || 0);
        setAdClicks(data.totalClicks || 0);
      })
      .catch(() => {
        setAdSpend(0);
        setAdClicks(0);
      })
      .finally(() => setAdLoading(false));
  }, [dateFilter, customFrom, customTo]);

  const orders = allOrders.filter((o) => {
    const d = toLocal(o.created_at);
    return d >= from && d <= to;
  });
  const completedOrders = orders.filter((o) => o.status === "completed");
  const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.amount_total), 0);

  // Variable costs: COGS + fulfillment per order
  const totalVariableCost = completedOrders.reduce(
    (sum, o) => sum + calcOrderCost(o, costByProductId, costByVariationId),
    0
  );
  // Pro-rated monthly fixed costs for the selected date range
  const proRatedFixed = getProRatedFixedCosts(fixedCosts, from, to);
  const totalStripeFees = completedOrders.reduce((sum, o) => sum + Number(o.stripe_fee || 0), 0);
  const grossProfit = totalRevenue - totalVariableCost;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const netProfit = grossProfit - proRatedFixed - totalStripeFees - adSpend;
  const roas = adSpend > 0 ? totalRevenue / adSpend : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading orders...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16">
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["today", "Today"],
            ["yesterday", "Yesterday"],
            ["mtd", "MTD"],
            ["30d", "30 Days"],
            ["ytd", "YTD"],
            ["12m", "12 Months"],
            ["all", "All Time"],
            ["custom", "Custom"],
          ] as [DateFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setDateFilter(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              dateFilter === key
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        {dateFilter === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded border bg-transparent px-2 py-1 text-xs"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded border bg-transparent px-2 py-1 text-xs"
            />
          </div>
        )}
      </div>

      {/* Stats — Row 1: P&L */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ShoppingBag className="size-3.5" />
            <span className="text-xs font-medium">Paid Orders</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{completedOrders.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CreditCard className="size-3.5" />
            <span className="text-xs font-medium">Revenue</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {formatPrice(totalRevenue)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart3 className="size-3.5" />
            <span className="text-xs font-medium">Gross Profit</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {formatPrice(grossProfit)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart3 className="size-3.5" />
            <span className="text-xs font-medium">Gross Margin</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {grossMargin.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart3 className="size-3.5" />
            <span className="text-xs font-medium">Net Profit</span>
          </div>
          <p className={`mt-1.5 text-2xl font-semibold tracking-tight ${netProfit < 0 ? "text-rose-600" : ""}`}>
            {adLoading ? "..." : formatPrice(netProfit)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart3 className="size-3.5" />
            <span className="text-xs font-medium">Net Margin</span>
          </div>
          <p className={`mt-1.5 text-2xl font-semibold tracking-tight ${netProfit < 0 ? "text-rose-600" : ""}`}>
            {adLoading ? "..." : totalRevenue > 0 ? `${((netProfit / totalRevenue) * 100).toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>
      {/* Stats — Row 2: Ads & other */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart3 className="size-3.5" />
            <span className="text-xs font-medium">Ad Spend</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {adLoading ? "..." : formatPrice(adSpend)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart3 className="size-3.5" />
            <span className="text-xs font-medium">Fixed Costs</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {formatPrice(proRatedFixed)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart3 className="size-3.5" />
            <span className="text-xs font-medium">ROAS</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {adLoading ? "..." : roas > 0 ? `${roas.toFixed(2)}x` : "—"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart3 className="size-3.5" />
            <span className="text-xs font-medium">CPA</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {adLoading ? "..." : completedOrders.length > 0 ? formatPrice(adSpend / completedOrders.length) : "—"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Ban className="size-3.5" />
            <span className="text-xs font-medium">Abandoned</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{orders.filter((o) => o.status === "abandoned").length}</p>
        </div>
      </div>

      {/* Orders Table */}
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ShoppingBag className="size-10" />
          <p className="text-sm">No orders yet</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Coupon</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium">#{order.id}</span>
                      {order.wc_order_id && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (WC #{order.wc_order_id})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{order.customer_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{order.customer_email || ""}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {order.line_items?.length
                        ? `${order.line_items.reduce((sum, li) => sum + li.qty, 0)} item${order.line_items.reduce((sum, li) => sum + li.qty, 0) !== 1 ? "s" : ""}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {order.coupon_code ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          {order.coupon_code}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatPrice(Number(order.amount_total))}
                    </td>
                    <td className="px-4 py-3">
                      {order.attribution ? (
                        <div className="text-xs">
                          <span className="font-medium">
                            {order.attribution.utm_source || "direct"}
                          </span>
                          {order.attribution.utm_medium && (
                            <span className="text-muted-foreground"> / {order.attribution.utm_medium}</span>
                          )}
                          {order.attribution.utm_campaign && (
                            <div className="text-muted-foreground truncate max-w-[120px]" title={order.attribution.utm_campaign}>
                              {order.attribution.utm_campaign}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {order.customer_ip || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const s = order.status;
                        const badge = s === "completed"
                          ? { bg: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="size-3" />, label: "Created" }
                          : s === "refunded"
                          ? { bg: "bg-amber-50 text-amber-700", icon: <RotateCcw className="size-3" />, label: "Refunded" }
                          : s === "disputed"
                          ? { bg: "bg-purple-50 text-purple-700", icon: <ShieldAlert className="size-3" />, label: "Disputed" }
                          : s === "abandoned"
                          ? { bg: "bg-zinc-100 text-zinc-500", icon: <Ban className="size-3" />, label: "Abandoned" }
                          : { bg: "bg-rose-50 text-rose-700", icon: <XCircle className="size-3" />, label: "WC Failed" };
                        return (
                          <div>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.bg}`}>
                              {badge.icon} {badge.label}
                            </span>
                            {order.abandon_reason && (
                              <div className="text-[10px] text-rose-500 mt-0.5 max-w-[140px] truncate" title={order.abandon_reason}>
                                {order.abandon_reason}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(order.created_at).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "America/New_York",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {order.stripe_payment_intent && (
                          <a
                            href={`https://dashboard.stripe.com/payments/${order.stripe_payment_intent}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="View in Stripe"
                          >
                            <CreditCard className="size-3.5" />
                          </a>
                        )}
                        {order.wc_order_id && (
                          <a
                            href={`${process.env.NEXT_PUBLIC_WORDPRESS_URL}/wp-admin/post.php?post=${order.wc_order_id}&action=edit`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="View in WooCommerce"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FunnelTab() {
  const [data, setData] = useState<{ event: string; count: number }[]>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("7d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const since = period === "all"
      ? ""
      : new Date(Date.now() - (period === "7d" ? 7 : 30) * 86400000).toISOString();

    const params = since ? `?since=${encodeURIComponent(since)}` : "";
    fetch(`/api/admin/funnel${params}`)
      .then((res) => res.json())
      .then((counts: { event: string; count: number }[]) => {
        setData(counts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const labels: Record<string, string> = {
    add_to_cart: "Added to Cart",
    checkout_viewed: "Viewed Checkout",
    payment_started: "Started Payment",
    payment_completed: "Completed Purchase",
  };

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Conversion Funnel</h2>
        <div className="flex gap-1 rounded-lg border bg-muted/50 p-0.5">
          {(["7d", "30d", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "All Time"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((stage, i) => {
            const prevCount = i > 0 ? data[i - 1].count : stage.count;
            const dropoff = prevCount > 0 ? ((prevCount - stage.count) / prevCount * 100).toFixed(1) : "0.0";
            const conversionFromTop = data[0].count > 0 ? (stage.count / data[0].count * 100).toFixed(1) : "0.0";
            const barWidth = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;

            return (
              <div key={stage.event} className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium">{labels[stage.event] || stage.event}</p>
                    <p className="text-2xl font-semibold tracking-tight mt-0.5">{stage.count.toLocaleString()}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground space-y-0.5">
                    {i > 0 && (
                      <>
                        <p><span className="text-rose-600 font-medium">{dropoff}%</span> drop-off</p>
                        <p><span className="text-foreground font-medium">{conversionFromTop}%</span> of top</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ReturnRequest {
  id: number;
  order_id: number;
  wc_order_id: number;
  customer_email: string;
  customer_name: string | null;
  items: { pid: number; vid?: number; name: string; qty: number; price: number }[];
  reason: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const RETURN_STATUSES = ["pending", "approved", "received", "refunded", "rejected"] as const;

function ReturnsTab() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch("/api/admin/returns")
      .then((res) => res.json())
      .then((data: ReturnRequest[]) => setReturns(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load returns"))
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      await fetch("/api/admin/returns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      setReturns((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status, updated_at: new Date().toISOString() } : r))
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveNotes(id: number) {
    setUpdatingId(id);
    try {
      await fetch("/api/admin/returns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, admin_notes: editNotes[id] ?? "" }),
      });
      setReturns((prev) =>
        prev.map((r) => (r.id === id ? { ...r, admin_notes: editNotes[id] ?? "" } : r))
      );
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading returns...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16">
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  const pending = returns.filter((r) => r.status === "pending").length;
  const refunded = returns.filter((r) => r.status === "refunded").length;

  const statusColor: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-sky-100 text-sky-800",
    received: "bg-indigo-100 text-indigo-800",
    refunded: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <RotateCcw className="size-3.5" />
            <span className="text-xs font-medium">Total Returns</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{returns.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5" />
            <span className="text-xs font-medium">Pending</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{pending}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="size-3.5" />
            <span className="text-xs font-medium">Refunded</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{refunded}</p>
        </div>
      </div>

      {returns.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No return requests yet.</p>
      ) : (
        <div className="rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Order</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Items</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => {
                const isExpanded = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    >
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "short",
                          timeZone: "America/New_York",
                        })}
                      </td>
                      <td className="px-4 py-3 font-medium">#{r.wc_order_id}</td>
                      <td className="px-4 py-3">
                        <div>{r.customer_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.customer_email}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.items.map((i) => `${i.name} x${i.qty}`).join(", ")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            statusColor[r.status] || "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={r.status}
                          onChange={(e) => updateStatus(r.id, e.target.value)}
                          disabled={updatingId === r.id}
                          className="rounded border bg-background px-2 py-1 text-xs"
                        >
                          {RETURN_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="space-y-3 max-w-xl">
                            {r.reason && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Reason</p>
                                <p className="text-sm">{r.reason}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Items</p>
                              <ul className="text-sm space-y-0.5">
                                {r.items.map((item, idx) => (
                                  <li key={idx}>
                                    {item.name} x{item.qty}
                                    {item.price > 0 && (
                                      <span className="text-muted-foreground">
                                        {" "}
                                        — ${(item.price * item.qty).toFixed(2)}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Admin Notes</p>
                              <div className="flex gap-2">
                                <textarea
                                  value={editNotes[r.id] ?? r.admin_notes ?? ""}
                                  onChange={(e) =>
                                    setEditNotes((prev) => ({ ...prev, [r.id]: e.target.value }))
                                  }
                                  placeholder="Add internal notes..."
                                  className="flex-1 rounded border bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => saveNotes(r.id)}
                                  disabled={updatingId === r.id}
                                >
                                  {updatingId === r.id ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    "Save"
                                  )}
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Updated {timeAgo(r.updated_at)}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ProductRow {
  product_id: number;
  variation_id: number | null;
  name: string;
  sku: string;
  image: string | null;
  price: number | null;
  cogs: number | null;
  import: number | null;
  shipping: number | null;
}

function FixedCostsSubTab() {
  const [costs, setCosts] = useState<MonthlyFixedCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = localNow();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    fetch("/api/admin/fixed-costs")
      .then((r) => r.json())
      .then((data) => {
        setCosts(data.costs || []);
        setLoading(false);
      });
  }, []);

  const months = Array.from(new Set(costs.map((c) => c.month.slice(0, 7)))).sort();
  const monthCosts = costs.filter((c) => c.month.startsWith(selectedMonth));
  const monthTotal = monthCosts.reduce((sum, c) => sum + Number(c.amount), 0);

  const updateAmount = async (category: string, value: string) => {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return;

    // Optimistic update
    setCosts((prev) =>
      prev.map((c) =>
        c.month.startsWith(selectedMonth) && c.category === category
          ? { ...c, amount: numVal }
          : c
      )
    );

    await fetch("/api/admin/fixed-costs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: `${selectedMonth}-01`,
        category,
        amount: numVal,
      }),
    });
  };

  const addMonth = async () => {
    // Find next month after the latest
    const latest = months[months.length - 1] || selectedMonth;
    const [y, m] = latest.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;

    const res = await fetch("/api/admin/fixed-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: `${next}-01` }),
    });

    if (res.ok) {
      // Refetch
      const data = await fetch("/api/admin/fixed-costs").then((r) => r.json());
      setCosts(data.costs || []);
      setSelectedMonth(next);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded border bg-transparent px-3 py-1.5 text-sm"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(m + "-01").toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </option>
            ))}
          </select>
          <button
            onClick={addMonth}
            className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            + Add Month
          </button>
        </div>
        <p className="text-sm font-medium">
          Total: <span className="tabular-nums">{formatPrice(monthTotal)}</span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium w-[140px]">Amount (inc VAT)</th>
            </tr>
          </thead>
          <tbody>
            {monthCosts.map((cost) => (
              <tr key={cost.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-2 font-medium">{cost.category}</td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={cost.amount}
                    key={`${cost.id}-${selectedMonth}`}
                    onBlur={(e) => updateAmount(cost.category, e.target.value)}
                    className="w-full rounded border bg-transparent px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-foreground"
                  />
                </td>
              </tr>
            ))}
            {monthCosts.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                  No fixed costs for this month
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30">
              <td className="px-4 py-2 font-semibold">Total</td>
              <td className="px-4 py-2 font-semibold tabular-nums">{formatPrice(monthTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ProductsTab() {
  const [subTab, setSubTab] = useState<"products" | "fixed-costs">("products");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/products")
      .then((r) => r.json())
      .then((data) => {
        setRows(data);
        setLoading(false);
      });
  }, []);

  const updateCost = async (
    sku: string,
    field: "cogs" | "import" | "shipping",
    value: string
  ) => {
    const row = rows.find((r) => r.sku === sku);
    if (!row) return;

    const numVal = value === "" ? null : parseFloat(value);
    if (value !== "" && isNaN(numVal as number)) return;

    // Optimistic update
    setRows((prev) =>
      prev.map((r) => (r.sku === sku ? { ...r, [field]: numVal } : r))
    );

    setSaving(sku);
    await fetch("/api/admin/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku,
        cogs: field === "cogs" ? numVal : row.cogs,
        import: field === "import" ? numVal : row.import,
        shipping: field === "shipping" ? numVal : row.shipping,
      }),
    });
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setSubTab("products")}
          className={`px-3 py-1.5 text-xs font-medium transition-colors relative ${
            subTab === "products"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Products
          {subTab === "products" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
          )}
        </button>
        <button
          onClick={() => setSubTab("fixed-costs")}
          className={`px-3 py-1.5 text-xs font-medium transition-colors relative ${
            subTab === "fixed-costs"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Fixed Costs
          {subTab === "fixed-costs" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
          )}
        </button>
      </div>

      {subTab === "products" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {rows.length} products
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium w-[50px]">Image</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium w-[100px]">Price</th>
                  <th className="px-4 py-3 font-medium w-[100px]">COGs</th>
                  <th className="px-4 py-3 font-medium w-[100px]">Import</th>
                  <th className="px-4 py-3 font-medium w-[100px]">Shipping</th>
                  <th className="px-4 py-3 font-medium w-[100px]">Gross</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.product_id}-${row.variation_id || "s"}-${row.shipping}`}
                    className="border-b last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-2">
                      {row.image ? (
                        <img
                          src={row.image}
                          alt={row.name}
                          className="size-[50px] rounded object-cover"
                        />
                      ) : (
                        <div className="size-[50px] rounded bg-muted flex items-center justify-center">
                          <Package className="size-4 text-muted-foreground" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 font-medium">{row.name}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                      {row.sku}
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {row.price != null ? formatPrice(row.price) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={row.cogs ?? ""}
                        onBlur={(e) => updateCost(row.sku, "cogs", e.target.value)}
                        className="w-full rounded border bg-transparent px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-foreground"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={row.import ?? ""}
                        onBlur={(e) => updateCost(row.sku, "import", e.target.value)}
                        className="w-full rounded border bg-transparent px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-foreground"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={row.shipping ?? ""}
                        onBlur={(e) =>
                          updateCost(row.sku, "shipping", e.target.value)
                        }
                        className="w-full rounded border bg-transparent px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-foreground"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {row.price != null && row.price > 0 && row.cogs != null && row.import != null && row.shipping != null
                        ? `${formatPrice(row.price - row.cogs - row.import - row.shipping)} (${(((row.price - row.cogs - row.import - row.shipping) / row.price) * 100).toFixed(1)}%)`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {subTab === "fixed-costs" && <FixedCostsSubTab />}
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "orders" | "products" | "funnel" | "returns">("dashboard");
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [productCount, setProductCount] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [wcStatus, setWcStatus] = useState<"checking" | "ok" | "error">("checking");
  const [stripeStatus, setStripeStatus] = useState<"checking" | "ok" | "error">("checking");
  const [shippingZones, setShippingZones] = useState<ShippingZoneData[] | null>(null);
  const [shippingError, setShippingError] = useState<string | null>(null);

  // Tracking settings
  const [ga4MeasurementId, setGa4MeasurementId] = useState("");
  const [ga4ApiSecret, setGa4ApiSecret] = useState("");
  const [adsConversionId, setAdsConversionId] = useState("");
  const [adsConversionLabel, setAdsConversionLabel] = useState("");
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [trackingSaved, setTrackingSaved] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [showGa4Secret, setShowGa4Secret] = useState(false);

  // AI settings
  const [aiProvider, setAiProvider] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiModels, setAiModels] = useState<{ id: string; name: string }[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // SEO generation
  const [seoGenerating, setSeoGenerating] = useState(false);
  const [seoResults, setSeoResults] = useState<{ productId: number; name: string; meta_title: string; meta_description: string; focus_keyword: string; og_title: string; error?: string }[]>([]);
  const [seoError, setSeoError] = useState<string | null>(null);

  // Specs generation
  const [specsGenerating, setSpecsGenerating] = useState(false);
  const [specsResults, setSpecsResults] = useState<{ productId: number; name: string; specs?: Record<string, string>; error?: string }[]>([]);
  const [specsTotal, setSpecsTotal] = useState(0);
  const [specsError, setSpecsError] = useState<string | null>(null);

  // Reviews generation
  const [reviewsGenerating, setReviewsGenerating] = useState(false);
  const [reviewsMin, setReviewsMin] = useState(20);
  const [reviewsMax, setReviewsMax] = useState(50);
  const [reviewsDateFrom, setReviewsDateFrom] = useState(() => {
    const d = localNow();
    d.setMonth(d.getMonth() - 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [reviewsDateTo, setReviewsDateTo] = useState(() => {
    const d = localNow();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [reviewsResults, setReviewsResults] = useState<{ productId: number; name: string; generated: number; pushed: number; failed: number; error?: string }[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  const fetchStatus = async () => {
    const syncRes = await fetch("/api/admin/sync-state");
    const syncData = await syncRes.json();
    if (syncData && !syncData.error) setSyncState(syncData as SyncState);

    const { count } = await supabase.from("products").select("*", { count: "exact", head: true });
    setProductCount(count || 0);

    try {
      const res = await fetch("/api/health/woocommerce");
      setWcStatus(res.ok ? "ok" : "error");
    } catch {
      setWcStatus("error");
    }

    try {
      const res = await fetch("/api/health/stripe");
      setStripeStatus(res.ok ? "ok" : "error");
    } catch {
      setStripeStatus("error");
    }
  };

  const fetchShipping = async () => {
    try {
      const res = await fetch("/api/admin/shipping");
      const data = await res.json();
      if (data.ok) {
        setShippingZones(data.zones);
      } else {
        setShippingError(data.error);
      }
    } catch (err) {
      setShippingError(err instanceof Error ? err.message : "Failed to fetch shipping");
    }
  };

  const fetchAiSettings = async () => {
    try {
      const res = await fetch("/api/admin/settings?keys=ai_provider,ai_api_key,ai_model");
      const data = await res.json();
      if (data.settings) {
        if (data.settings.ai_provider) setAiProvider(data.settings.ai_provider);
        if (data.settings.ai_api_key) setAiApiKey(data.settings.ai_api_key);
        if (data.settings.ai_model) setAiModel(data.settings.ai_model);
        // Fetch models if we have provider + key
        if (data.settings.ai_provider && data.settings.ai_api_key) {
          fetchModels(data.settings.ai_provider, data.settings.ai_api_key, data.settings.ai_model);
        }
      }
    } catch {
      // Settings table may not exist yet
    }
  };

  const fetchModels = async (provider: string, apiKey: string, currentModel?: string) => {
    setAiModelsLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/admin/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await res.json();
      if (data.error) {
        setAiError(data.error);
        setAiModels([]);
      } else {
        setAiModels(data.models || []);
        // Keep current model if still valid, otherwise clear
        if (currentModel && data.models?.some((m: any) => m.id === currentModel)) {
          setAiModel(currentModel);
        } else if (!currentModel && data.models?.length) {
          setAiModel(data.models[0].id);
        }
      }
    } catch {
      setAiError("Failed to fetch models");
    } finally {
      setAiModelsLoading(false);
    }
  };

  const saveAiSettings = async () => {
    setAiSaving(true);
    setAiSaved(false);
    setAiError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { ai_provider: aiProvider, ai_api_key: aiApiKey, ai_model: aiModel },
        }),
      });
      const data = await res.json();
      if (data.error) {
        setAiError(data.error);
      } else {
        setAiSaved(true);
        setTimeout(() => setAiSaved(false), 3000);
      }
    } catch {
      setAiError("Failed to save settings");
    } finally {
      setAiSaving(false);
    }
  };

  const [seoTotal, setSeoTotal] = useState(0);

  const generateSeoAll = async () => {
    setSeoGenerating(true);
    setSeoError(null);
    setSeoResults([]);
    setSeoTotal(0);
    try {
      const { data: products } = await supabase.from("products").select("id, name");
      if (!products?.length) {
        setSeoError("No products found");
        setSeoGenerating(false);
        return;
      }
      setSeoTotal(products.length);

      for (const product of products) {
        try {
          const res = await fetch("/api/admin/ai/generate-seo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productIds: [product.id] }),
          });
          const data = await res.json();
          if (data.error) {
            setSeoResults((prev) => [...prev, {
              productId: product.id, name: product.name,
              meta_title: "", meta_description: "", focus_keyword: "", og_title: "",
              error: data.error,
            }]);
          } else if (data.results?.[0]) {
            setSeoResults((prev) => [...prev, data.results[0]]);
          }
        } catch {
          setSeoResults((prev) => [...prev, {
            productId: product.id, name: product.name,
            meta_title: "", meta_description: "", focus_keyword: "", og_title: "",
            error: "Request failed",
          }]);
        }
      }
    } catch {
      setSeoError("Failed to generate SEO");
    } finally {
      setSeoGenerating(false);
    }
  };

  const generateSpecsAll = async () => {
    setSpecsGenerating(true);
    setSpecsError(null);
    setSpecsResults([]);
    setSpecsTotal(0);
    try {
      const { data: products } = await supabase.from("products").select("id, name");
      if (!products?.length) {
        setSpecsError("No products found");
        setSpecsGenerating(false);
        return;
      }
      setSpecsTotal(products.length);

      for (const product of products) {
        try {
          const res = await fetch("/api/admin/ai/generate-specs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productIds: [product.id] }),
          });
          const data = await res.json();
          if (data.error) {
            setSpecsResults((prev) => [...prev, {
              productId: product.id, name: product.name, error: data.error,
            }]);
          } else if (data.results?.[0]) {
            setSpecsResults((prev) => [...prev, data.results[0]]);
          }
        } catch {
          setSpecsResults((prev) => [...prev, {
            productId: product.id, name: product.name, error: "Request failed",
          }]);
        }
      }
    } catch {
      setSpecsError("Failed to generate specs");
    } finally {
      setSpecsGenerating(false);
    }
  };

  const generateReviewsAll = async () => {
    setReviewsGenerating(true);
    setReviewsError(null);
    setReviewsResults([]);
    setReviewsTotal(0);
    try {
      const { data: products } = await supabase.from("products").select("id, name").eq("status", "publish");
      if (!products?.length) {
        setReviewsError("No active products found");
        setReviewsGenerating(false);
        return;
      }
      setReviewsTotal(products.length);

      for (const product of products) {
        try {
          const res = await fetch("/api/admin/ai/generate-reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: product.id, count: Math.floor(Math.random() * (reviewsMax - reviewsMin + 1)) + reviewsMin, dateFrom: reviewsDateFrom, dateTo: reviewsDateTo }),
          });
          const data = await res.json();
          if (data.error) {
            setReviewsResults((prev) => [...prev, {
              productId: product.id, name: product.name, generated: 0, pushed: 0, failed: 0, error: data.error,
            }]);
          } else {
            setReviewsResults((prev) => [...prev, {
              productId: product.id, name: data.productName || product.name,
              generated: data.generated, pushed: data.pushed, failed: data.failed,
            }]);
          }
        } catch {
          setReviewsResults((prev) => [...prev, {
            productId: product.id, name: product.name, generated: 0, pushed: 0, failed: 0, error: "Request failed",
          }]);
        }
      }
    } catch {
      setReviewsError("Failed to generate reviews");
    } finally {
      setReviewsGenerating(false);
    }
  };

  const fetchTrackingSettings = async () => {
    try {
      const res = await fetch("/api/admin/tracking");
      const data = await res.json();
      if (data.settings) {
        if (data.settings.ga4_measurement_id) setGa4MeasurementId(data.settings.ga4_measurement_id);
        if (data.settings.ga4_api_secret) setGa4ApiSecret(data.settings.ga4_api_secret);
        if (data.settings.google_ads_conversion_id) setAdsConversionId(data.settings.google_ads_conversion_id);
        if (data.settings.google_ads_conversion_label) setAdsConversionLabel(data.settings.google_ads_conversion_label);
      }
    } catch {
      // Settings may not exist yet
    }
  };

  const saveTrackingSettings = async () => {
    setTrackingSaving(true);
    setTrackingSaved(false);
    setTrackingError(null);
    try {
      const res = await fetch("/api/admin/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ga4_measurement_id: ga4MeasurementId,
            ga4_api_secret: ga4ApiSecret,
            google_ads_conversion_id: adsConversionId,
            google_ads_conversion_label: adsConversionLabel,
          },
        }),
      });
      const data = await res.json();
      if (data.error) {
        setTrackingError(data.error);
      } else {
        setTrackingSaved(true);
        setTimeout(() => setTrackingSaved(false), 3000);
      }
    } catch {
      setTrackingError("Failed to save tracking settings");
    } finally {
      setTrackingSaving(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchShipping();
    fetchAiSettings();
    fetchTrackingSettings();
  }, []);

  // Poll sync_state while syncing
  useEffect(() => {
    if (!syncing) return;
    const interval = setInterval(async () => {
      const res = await fetch("/api/admin/sync-state");
      const data = await res.json();
      if (data && !data.error) {
        setSyncState(data as SyncState);
        if (data.status !== "syncing") {
          setSyncing(false);
          fetchStatus();
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [syncing]);

  const handleSync = async () => {
    setSyncing(true);
    fetch("/api/admin/sync-now", { method: "POST" });
  };

  const handleFullResync = async () => {
    setSyncing(true);
    await fetch("/api/admin/sync-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_synced_at: null }),
    });
    fetch("/api/admin/sync-now", { method: "POST" });
  };

  const syncDisplayStatus = syncState?.status === "syncing"
    ? "syncing"
    : syncState?.status === "error"
      ? "error"
      : "ok";

  const totalShippingMethods = shippingZones?.reduce((sum, z) => sum + z.methods.length, 0) || 0;
  const enabledShippingMethods = shippingZones?.reduce(
    (sum, z) => sum + z.methods.filter((m) => m.enabled).length,
    0
  ) || 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-2">
      {/* Header + Tabs */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <div className="mt-4 flex gap-1 border-b">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === "dashboard"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Dashboard
            {activeTab === "dashboard" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === "orders"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Orders
            {activeTab === "orders" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("products")}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === "products"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Products
            {activeTab === "products" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("funnel")}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === "funnel"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Funnel
            {activeTab === "funnel" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("returns")}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === "returns"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Returns
            {activeTab === "returns" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
        </div>
      </div>

      {activeTab === "orders" && <OrdersTab />}
      {activeTab === "products" && <ProductsTab />}
      {activeTab === "funnel" && <FunnelTab />}
      {activeTab === "returns" && <ReturnsTab />}

      {activeTab === "dashboard" && <>
      {/* Connection Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-4 rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
            <Globe className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">WooCommerce</h3>
              <StatusDot status={wcStatus} />
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {process.env.NEXT_PUBLIC_WORDPRESS_URL || "Not configured"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <CreditCard className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Stripe</h3>
              <StatusDot status={stripeStatus} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test")
                ? "Test mode"
                : "Live mode"}
            </p>
          </div>
        </div>
      </div>

      {/* Product Sync */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Package className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Product Sync</h3>
              <p className="text-xs text-muted-foreground">
                {syncState?.status === "syncing"
                  ? "Sync in progress..."
                  : "WooCommerce to Supabase"}
              </p>
            </div>
          </div>
          <StatusDot status={syncDisplayStatus} />
        </div>

        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          <StatBox
            icon={<Package className="size-3.5" />}
            label="Products"
            value={productCount}
          />
          <StatBox
            icon={<ArrowDownToLine className="size-3.5" />}
            label="Last sync count"
            value={syncState?.products_synced || 0}
          />
          <StatBox
            icon={<Clock className="size-3.5" />}
            label="Last synced"
            value={syncState?.last_synced_at ? timeAgo(syncState.last_synced_at) : "Never"}
          />
          <StatBox
            icon={<Clock className="size-3.5" />}
            label="Completed"
            value={syncState?.completed_at ? timeAgo(syncState.completed_at) : "Never"}
          />
        </div>

        {syncing && syncState?.status === "syncing" && (
          <div className="mx-6 mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {syncState.sync_phase === "fetching"
                  ? "Fetching products from WooCommerce..."
                  : syncState.sync_phase === "images"
                    ? "Downloading images to Supabase Storage..."
                    : syncState.sync_phase === "writing"
                      ? "Writing to database..."
                      : "Syncing..."}
              </span>
              {syncState.products_total ? (
                <span className="tabular-nums font-medium">
                  {syncState.products_synced} / {syncState.products_total}
                </span>
              ) : null}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full bg-sky-500 transition-all duration-500 ${
                  syncState.sync_phase === "images" || syncState.sync_phase === "writing"
                    ? "animate-pulse"
                    : ""
                }`}
                style={{
                  width:
                    syncState.sync_phase === "writing"
                      ? "90%"
                      : syncState.sync_phase === "images"
                        ? "70%"
                        : syncState.products_total
                          ? `${Math.min(60, (syncState.products_synced / syncState.products_total) * 60)}%`
                          : "30%",
                }}
              />
            </div>
          </div>
        )}

        {syncState?.errors && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {syncState.errors}
          </div>
        )}

        <div className="flex gap-2 px-6 py-4">
          <Button
            onClick={handleSync}
            disabled={syncing}
            className="bg-sky-500 text-white hover:bg-sky-600"
          >
            {syncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>
          <Button variant="outline" onClick={handleFullResync} disabled={syncing}>
            Full Re-sync
          </Button>
        </div>
      </div>

      {/* Shipping */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Truck className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Shipping</h3>
              <p className="text-xs text-muted-foreground">
                {shippingZones
                  ? `${enabledShippingMethods} active method${enabledShippingMethods !== 1 ? "s" : ""} across ${shippingZones.length} zone${shippingZones.length !== 1 ? "s" : ""}`
                  : "Loading from WooCommerce..."}
              </p>
            </div>
          </div>
          {shippingZones && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShippingZones(null);
                setShippingError(null);
                fetchShipping();
              }}
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          )}
        </div>

        {shippingError && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {shippingError}
          </div>
        )}

        {shippingZones && (
          <div className="divide-y">
            {shippingZones.map(({ zone, methods }) => (
              <div key={zone.id} className="px-6 py-4">
                <h4 className="text-sm font-medium">{zone.name}</h4>
                {methods.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">No shipping methods configured</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {methods.map((method) => (
                      <div
                        key={method.id}
                        className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {method.enabled ? (
                            <CheckCircle2 className="size-3.5 text-emerald-500" />
                          ) : (
                            <XCircle className="size-3.5 text-muted-foreground" />
                          )}
                          <span className={method.enabled ? "" : "text-muted-foreground"}>
                            {method.settings.title?.value || method.method_title}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {method.method_id}
                          </span>
                        </div>
                        <span className="font-medium">
                          {method.method_id === "free_shipping"
                            ? "Free"
                            : method.settings.cost?.value
                              ? formatPrice(parseFloat(method.settings.cost.value))
                              : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!shippingZones && !shippingError && (
          <div className="flex items-center justify-center gap-2 px-6 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading shipping zones...
          </div>
        )}

        <div className="border-t px-6 py-3">
          <p className="text-xs text-muted-foreground">
            Shipping zones and methods are managed in{" "}
            <a
              href={`${process.env.NEXT_PUBLIC_WORDPRESS_URL}/wp-admin/admin.php?page=wc-settings&tab=shipping`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              WooCommerce → Settings → Shipping
            </a>
            . Changes there are reflected here immediately.
          </p>
        </div>
      </div>

      {/* Tracking & Analytics */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <BarChart3 className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Tracking & Analytics</h3>
              <p className="text-xs text-muted-foreground">
                Google Analytics 4 + Google Ads conversion tracking (client-side + server-side)
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* GA4 */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-3">Google Analytics 4</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Measurement ID</label>
                <Input
                  value={ga4MeasurementId}
                  onChange={(e) => setGa4MeasurementId(e.target.value)}
                  placeholder="G-XXXXXXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  API Secret <span className="text-muted-foreground/60">(for server-side tracking)</span>
                </label>
                <div className="relative">
                  <Input
                    type={showGa4Secret ? "text" : "password"}
                    value={ga4ApiSecret}
                    onChange={(e) => setGa4ApiSecret(e.target.value)}
                    placeholder="Enter API secret"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGa4Secret(!showGa4Secret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showGa4Secret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Google Ads */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-3">Google Ads</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Conversion ID</label>
                <Input
                  value={adsConversionId}
                  onChange={(e) => setAdsConversionId(e.target.value)}
                  placeholder="AW-123456789"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Conversion Label</label>
                <Input
                  value={adsConversionLabel}
                  onChange={(e) => setAdsConversionLabel(e.target.value)}
                  placeholder="abcDEFghiJKL"
                />
              </div>
            </div>
          </div>

          {trackingError && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {trackingError}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              onClick={saveTrackingSettings}
              disabled={trackingSaving || !ga4MeasurementId}
              className="bg-sky-500 text-white hover:bg-sky-600"
            >
              {trackingSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : trackingSaved ? (
                <Check className="size-4" />
              ) : null}
              {trackingSaved ? "Saved" : "Save Tracking Settings"}
            </Button>
          </div>
        </div>

        <div className="border-t px-6 py-3">
          <p className="text-xs text-muted-foreground">
            Client-side tracking fires on page views, add to cart, and checkout. Server-side tracking fires from the Stripe webhook for reliable purchase conversion tracking (works even with Apple ITP and ad blockers).
            <span className="block mt-1 text-muted-foreground/60">
              Find your API Secret in GA4 → Admin → Data Streams → Measurement Protocol API secrets.
            </span>
          </p>
        </div>
      </div>

      {/* AI & SEO */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-medium">AI & SEO</h3>
              <p className="text-xs text-muted-foreground">
                Configure an AI provider to generate product SEO metadata
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Provider */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Provider</label>
              <select
                value={aiProvider}
                onChange={(e) => {
                  setAiProvider(e.target.value);
                  setAiModels([]);
                  setAiModel("");
                  setAiError(null);
                }}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select provider...</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">API Key</label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={aiApiKey}
                  onChange={(e) => {
                    setAiApiKey(e.target.value);
                    setAiModels([]);
                    setAiModel("");
                  }}
                  placeholder={
                    aiProvider === "openai" ? "sk-..." :
                    aiProvider === "anthropic" ? "sk-ant-..." :
                    aiProvider === "deepseek" ? "sk-..." : "Enter API key"
                  }
                  className="pr-16"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                  {aiProvider && aiApiKey && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={aiModelsLoading}
                      onClick={() => fetchModels(aiProvider, aiApiKey)}
                    >
                      {aiModelsLoading ? <Loader2 className="size-3 animate-spin" /> : "Fetch"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Model */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Model
                {aiModels.length > 0 && (
                  <span className="ml-1 text-muted-foreground/60">({aiModels.length} available)</span>
                )}
              </label>
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                disabled={!aiModels.length}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value="">
                  {aiModelsLoading ? "Loading models..." : aiModels.length ? "Select model..." : "Fetch models first"}
                </option>
                {aiModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {aiError && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {aiError}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              onClick={saveAiSettings}
              disabled={aiSaving || !aiProvider || !aiApiKey || !aiModel}
              className="bg-sky-500 text-white hover:bg-sky-600"
            >
              {aiSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : aiSaved ? (
                <Check className="size-4" />
              ) : null}
              {aiSaved ? "Saved" : "Save AI Settings"}
            </Button>
          </div>
        </div>

        {/* SEO Generation */}
        {aiProvider && aiApiKey && aiModel && (
          <div className="border-t px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Generate Product SEO</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generate meta titles and descriptions for all products using {aiProvider === "anthropic" ? "Claude" : aiProvider === "openai" ? "OpenAI" : "DeepSeek"}
                </p>
              </div>
              <Button
                onClick={generateSeoAll}
                disabled={seoGenerating}
                variant="outline"
              >
                {seoGenerating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {seoGenerating
                  ? `Generating ${seoResults.length + 1} of ${seoTotal}...`
                  : "Generate All"}
              </Button>
            </div>

            {seoError && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {seoError}
              </div>
            )}

            {seoResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    {seoGenerating
                      ? `Generating... ${seoResults.length} of ${seoTotal}`
                      : `Generated ${seoResults.filter((r) => !r.error).length} of ${seoResults.length} products`}
                  </p>
                  {seoGenerating && seoTotal > 0 && (
                    <span className="text-xs tabular-nums font-medium text-muted-foreground">
                      {Math.round((seoResults.length / seoTotal) * 100)}%
                    </span>
                  )}
                </div>
                {seoTotal > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full bg-violet-500 transition-all duration-500 ${seoGenerating ? "animate-pulse" : ""}`}
                      style={{ width: `${(seoResults.length / seoTotal) * 100}%` }}
                    />
                  </div>
                )}
                <div className="max-h-96 overflow-y-auto space-y-2 rounded-lg border p-3">
                  {seoResults.map((r) => (
                    <div key={r.productId} className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1.5">
                      {r.error ? (
                        <div className="text-rose-500">{r.name}: {r.error}</div>
                      ) : (
                        <>
                          <div className="font-medium">{r.name}</div>
                          <div className="grid gap-1 text-xs">
                            <div><span className="text-muted-foreground">Title:</span> <span className={r.meta_title.length > 60 ? "text-amber-600" : ""}>{r.meta_title}</span> <span className="text-muted-foreground/60">({r.meta_title.length}/50)</span></div>
                            <div><span className="text-muted-foreground">Description:</span> {r.meta_description} <span className="text-muted-foreground/60">({r.meta_description.length}/140)</span></div>
                            <div><span className="text-muted-foreground">Keyword:</span> <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700">{r.focus_keyword}</span></div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Specs Generation */}
        {aiProvider && aiApiKey && aiModel && (
          <div className="border-t px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Generate Product Specs</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Extract knife specifications (blade length, steel type, handle, etc.) using AI
                </p>
              </div>
              <Button
                onClick={generateSpecsAll}
                disabled={specsGenerating}
                variant="outline"
              >
                {specsGenerating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {specsGenerating
                  ? `Generating ${specsResults.length + 1} of ${specsTotal}...`
                  : "Generate All"}
              </Button>
            </div>

            {specsError && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {specsError}
              </div>
            )}

            {specsResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    {specsGenerating
                      ? `Generating... ${specsResults.length} of ${specsTotal}`
                      : `Generated ${specsResults.filter((r) => !r.error).length} of ${specsResults.length} products`}
                  </p>
                  {specsGenerating && specsTotal > 0 && (
                    <span className="text-xs tabular-nums font-medium text-muted-foreground">
                      {Math.round((specsResults.length / specsTotal) * 100)}%
                    </span>
                  )}
                </div>
                {specsTotal > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full bg-violet-500 transition-all duration-500 ${specsGenerating ? "animate-pulse" : ""}`}
                      style={{ width: `${(specsResults.length / specsTotal) * 100}%` }}
                    />
                  </div>
                )}
                <div className="max-h-96 overflow-y-auto space-y-2 rounded-lg border p-3">
                  {specsResults.map((r) => (
                    <div key={r.productId} className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1.5">
                      {r.error ? (
                        <div className="text-rose-500">{r.name}: {r.error}</div>
                      ) : (
                        <>
                          <div className="font-medium">{r.name}</div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
                            {r.specs && Object.entries(r.specs).map(([key, val]) => (
                              <div key={key}>
                                <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}:</span>{" "}
                                <span className={val === "Unknown" ? "text-muted-foreground/50" : ""}>{val}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reviews Generation */}
        {aiProvider && aiApiKey && aiModel && (
          <div className="border-t px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Generate Product Reviews</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generate realistic reviews for each product and push them to WooCommerce
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Min:</label>
                  <Input
                    type="number"
                    min={5}
                    max={100}
                    value={reviewsMin}
                    onChange={(e) => setReviewsMin(Math.min(100, Math.max(5, parseInt(e.target.value) || 20)))}
                    className="w-20 h-9 text-sm"
                    disabled={reviewsGenerating}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Max:</label>
                  <Input
                    type="number"
                    min={5}
                    max={100}
                    value={reviewsMax}
                    onChange={(e) => setReviewsMax(Math.min(100, Math.max(5, parseInt(e.target.value) || 50)))}
                    className="w-20 h-9 text-sm"
                    disabled={reviewsGenerating}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">From:</label>
                  <Input
                    type="date"
                    value={reviewsDateFrom}
                    onChange={(e) => setReviewsDateFrom(e.target.value)}
                    className="w-36 h-9 text-sm"
                    disabled={reviewsGenerating}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">To:</label>
                  <Input
                    type="date"
                    value={reviewsDateTo}
                    onChange={(e) => setReviewsDateTo(e.target.value)}
                    className="w-36 h-9 text-sm"
                    disabled={reviewsGenerating}
                  />
                </div>
                <Button
                  onClick={generateReviewsAll}
                  disabled={reviewsGenerating}
                  variant="outline"
                >
                  {reviewsGenerating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MessageSquare className="size-4" />
                  )}
                  {reviewsGenerating
                    ? `Product ${reviewsResults.length + 1} of ${reviewsTotal}...`
                    : "Generate All"}
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              Rating distribution: ~60% 5-star, ~30% 4-star, ~10% 3-star. Reviews are pushed directly to WooCommerce and will survive product reimports.
            </div>

            {reviewsError && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {reviewsError}
              </div>
            )}

            {reviewsResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    {reviewsGenerating
                      ? `Generating... ${reviewsResults.length} of ${reviewsTotal} products`
                      : `Done — ${reviewsResults.filter((r) => !r.error).length} of ${reviewsResults.length} products`}
                  </p>
                  {reviewsGenerating && reviewsTotal > 0 && (
                    <span className="text-xs tabular-nums font-medium text-muted-foreground">
                      {Math.round((reviewsResults.length / reviewsTotal) * 100)}%
                    </span>
                  )}
                </div>
                {reviewsTotal > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full bg-emerald-500 transition-all duration-500 ${reviewsGenerating ? "animate-pulse" : ""}`}
                      style={{ width: `${(reviewsResults.length / reviewsTotal) * 100}%` }}
                    />
                  </div>
                )}
                <div className="max-h-96 overflow-y-auto space-y-2 rounded-lg border p-3">
                  {reviewsResults.map((r) => (
                    <div key={r.productId} className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
                      {r.error ? (
                        <div className="text-rose-500">{r.name}: {r.error}</div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{r.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {r.pushed} pushed
                            {r.failed > 0 && <span className="text-rose-500 ml-1">({r.failed} failed)</span>}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </>}
    </div>
  );
}
