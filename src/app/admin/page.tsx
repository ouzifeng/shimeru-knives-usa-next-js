"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { InventoryTab } from "@/components/admin/inventory-tab";
import { SupplierPricesTab } from "@/components/admin/supplier-prices-tab";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AffiliatesTab } from "@/components/admin/affiliates-tab";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { OrderSyncState, SyncState, WCShippingMethod, WCShippingZone } from "@/lib/types";
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
  BellRing,
  ChefHat,
  Send,
  Paperclip,
  X,
} from "lucide-react";

/** Get current date/time parts in Europe/London timezone */
function londonNow(): Date {
  const s = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
  // en-GB format: "DD/MM/YYYY, HH:MM:SS"
  const [datePart, timePart] = s.split(", ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hours, minutes, seconds] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/** Parse a UTC/ISO date string into London-local Date for comparison */
function toLondon(dateStr: string): Date {
  const s = new Date(dateStr).toLocaleString("en-GB", { timeZone: "Europe/London" });
  const [datePart, timePart] = s.split(", ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hours, minutes, seconds] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds);
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
  funnel_session_id: string | null;
  created_at: string;
  tp_invite: { status: "sent" | "skipped"; sent_at: string | null } | null;
}

type DateFilter = "today" | "yesterday" | "mtd" | "30d" | "ytd" | "12m" | "all" | "custom";

function getDateRange(filter: DateFilter, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = londonNow();
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
      return { from: new Date(2015, 0, 1), to };
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

function CountryFlag({ cc }: { cc: string }) {
  return (
    <img
      src={`https://flagcdn.com/20x15/${cc.toLowerCase()}.png`}
      alt={cc}
      title={cc}
      width={20}
      height={15}
      className="inline-block"
    />
  );
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [prefix, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  const ipInt = ipToInt(ip);
  const prefixInt = ipToInt(prefix);
  if (ipInt === null || prefixInt === null || isNaN(bits)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (prefixInt & mask);
}

function isGoogleIp(ip: string | null, prefixes: string[]): boolean {
  if (!ip || prefixes.length === 0) return false;
  return prefixes.some((cidr) => isIpInCidr(ip, cidr));
}

function useGoogleIpRanges(): string[] {
  const [prefixes, setPrefixes] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/admin/google-ip-ranges")
      .then((r) => r.json())
      .then((data: { prefixes: string[] }) => {
        setPrefixes(data.prefixes || []);
      })
      .catch(() => {});
  }, []);
  return prefixes;
}

function useIpCountries(ips: string[]) {
  const [map, setMap] = useState<Record<string, string>>({});
  const resolvedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newIps = ips.filter((ip) => ip && !resolvedRef.current.has(ip));
    if (newIps.length === 0) return;
    newIps.forEach((ip) => resolvedRef.current.add(ip));

    const batch = [...new Set(newIps)].slice(0, 100);
    fetch("/api/admin/ip-geo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ips: batch }),
    })
      .then((r) => r.json())
      .then((result: Record<string, string>) => {
        setMap((prev) => ({ ...prev, ...result }));
      })
      .catch(() => {});
  }, [ips.join(",")]);

  return map;
}

function OrdersTab() {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [costByProductId, setCostByProductId] = useState<CostLookup>({});
  const [costByVariationId, setCostByVariationId] = useState<CostLookup>({});
  const [funnelBySession, setFunnelBySession] = useState<Record<string, string[]>>({});
  const [fixedCosts, setFixedCosts] = useState<MonthlyFixedCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("mtd");
  const [tpFilter, setTpFilter] = useState<"all" | "to_review" | "reviewed" | "skipped">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [adSpend, setAdSpend] = useState<number>(0);
  const [adClicks, setAdClicks] = useState<number>(0);
  const [adLoading, setAdLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  // Debounce: only apply the search after 250ms of no typing,
  // and only when the user has typed at least 3 characters
  // (or cleared the field entirely).
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) {
      setAppliedQuery("");
      return;
    }
    if (trimmed.length < 3) return;
    const handle = setTimeout(() => setAppliedQuery(trimmed), 250);
    return () => clearTimeout(handle);
  }, [searchInput]);
  const ipCountryMap = useIpCountries(allOrders.map((o) => o.customer_ip).filter(Boolean) as string[]);
  const googleIpRanges = useGoogleIpRanges();

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/orders").then((r) => r.json()),
      fetch("/api/admin/fixed-costs").then((r) => r.json()),
    ])
      .then(([orderData, fixedData]) => {
        setAllOrders(orderData.orders);
        setCostByProductId(orderData.costByProductId);
        setCostByVariationId(orderData.costByVariationId);
        setFunnelBySession(orderData.funnelBySession || {});
        setFixedCosts(fixedData.costs || []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load orders");
      })
      .finally(() => setLoading(false));
  }, []);

  const { from, to } = useMemo(
    () => getDateRange(dateFilter, customFrom, customTo),
    [dateFilter, customFrom, customTo]
  );

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

  const orders = useMemo(() => {
    return allOrders.filter((o) => {
      // Abandoned carts live in their own tab now — not part of the Orders view
      if (o.status === "abandoned") return false;
      const d = toLondon(o.created_at);
      if (d < from || d > to) return false;
      if (tpFilter === "to_review") return o.status === "completed" && !!o.customer_email && !o.tp_invite;
      if (tpFilter === "reviewed") return o.tp_invite?.status === "sent";
      if (tpFilter === "skipped") return o.tp_invite?.status === "skipped";
      return true;
    });
  }, [allOrders, from, to, tpFilter]);

  const searchedOrders = useMemo(() => {
    const q = appliedQuery.toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      if (o.status === "abandoned") return false;
      const ref = String(o.wc_order_id ?? o.id);
      return (
        ref.includes(q) ||
        (o.customer_name?.toLowerCase().includes(q) ?? false) ||
        (o.customer_email?.toLowerCase().includes(q) ?? false) ||
        (o.coupon_code?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [orders, appliedQuery]);

  const totalPages = Math.max(1, Math.ceil(searchedOrders.length / perPage));
  const pageStart = (currentPage - 1) * perPage;
  const pagedOrders = searchedOrders.slice(pageStart, pageStart + perPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedQuery, perPage, dateFilter, tpFilter, customFrom, customTo]);
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

  async function handleTpAction(orderId: number, action: "send" | "skip") {
    if (action === "send" && !confirm("Send Trustpilot review request to this customer?")) return;
    if (action === "skip" && !confirm("Mark this order as skipped (no review request)?")) return;

    const res = await fetch("/api/admin/trustpilot-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, action }),
    });

    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
      alert(`Failed: ${msg || res.statusText}`);
      return;
    }

    setAllOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              tp_invite: {
                status: action === "send" ? "sent" : "skipped",
                sent_at: action === "send" ? new Date().toISOString() : null,
              },
            }
          : o
      )
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
            <CreditCard className="size-3.5" />
            <span className="text-xs font-medium">Payment Fees</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {formatPrice(totalStripeFees)}
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
      </div>

      {/* Orders Table */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Trustpilot:</span>
          {(
            [
              ["all", "All"],
              ["to_review", "To review"],
              ["reviewed", "Reviewed"],
              ["skipped", "Skipped"],
            ] as ["all" | "to_review" | "reviewed" | "skipped", string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTpFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                tpFilter === key
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={async () => {
            const res = await fetch("/api/admin/trustpilot-invite", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ test: true }),
            });
            if (res.ok) alert("Test email sent to mr.davidoak@gmail.com");
            else alert("Failed to send test email");
          }}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Send a test Trustpilot invite email to mr.davidoak@gmail.com"
        >
          <MessageSquare className="size-3.5" />
          Send test TP email
        </button>
      </div>
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ShoppingBag className="size-10" />
          <p className="text-sm">No orders yet</p>
        </div>
      ) : (
        <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            type="search"
            placeholder="Search by order #, name, email, coupon (3+ chars)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="max-w-sm"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Per page</span>
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">TP</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Coupon</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Drop-off</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pagedOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      {order.wc_order_id ? (
                        <a
                          href={`/admin/orders/${order.wc_order_id}`}
                          className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          #{order.wc_order_id}
                        </a>
                      ) : (
                        <div className="font-medium">#{order.id}</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {(() => {
                          const d = new Date(order.created_at);
                          return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{order.customer_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{order.customer_email || ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      {order.status === "completed" && order.customer_email ? (
                        order.tp_invite ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              order.tp_invite.status === "sent"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-zinc-100 text-zinc-500"
                            }`}
                            title={
                              order.tp_invite.status === "sent" && order.tp_invite.sent_at
                                ? `TP review sent ${new Date(order.tp_invite.sent_at).toLocaleDateString("en-GB")}`
                                : "TP review skipped"
                            }
                          >
                            {order.tp_invite.status === "sent" ? "TP ✓" : "TP —"}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleTpAction(order.id, "send")}
                              className="rounded p-1 text-muted-foreground hover:text-emerald-600 hover:bg-muted transition-colors"
                              title="Send Trustpilot review request"
                            >
                              <MessageSquare className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTpAction(order.id, "skip")}
                              className="rounded p-1 text-muted-foreground hover:text-rose-600 hover:bg-muted transition-colors"
                              title="Skip Trustpilot request (don't ask)"
                            >
                              <Ban className="size-3.5" />
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
                      {order.customer_ip ? (
                        <span className="inline-flex items-center gap-1.5">
                          {ipCountryMap[order.customer_ip] && (
                            <CountryFlag cc={ipCountryMap[order.customer_ip]} />
                          )}
                          {order.customer_ip}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const s = order.status;
                        const badge = s === "completed"
                          ? { bg: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="size-3" />, label: "Created" }
                          : s === "refunded"
                          ? { bg: "bg-amber-50 text-amber-700", icon: <RotateCcw className="size-3" />, label: "Refunded" }
                          : s === "partially_refunded"
                          ? { bg: "bg-amber-50 text-amber-700", icon: <RotateCcw className="size-3" />, label: "Partially refunded" }
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
                    <td className="px-4 py-3 text-xs">
                      {order.status === "abandoned" ? (() => {
                        const stages = order.funnel_session_id
                          ? funnelBySession[order.funnel_session_id] || []
                          : [];
                        const last = stages[stages.length - 1];
                        const label = last === "payment_started" ? "At payment"
                          : last === "checkout_viewed" ? "At checkout"
                          : last === "add_to_cart" ? "Cart only"
                          : "Unknown";
                        const color = last === "payment_started" ? "text-amber-600"
                          : last === "checkout_viewed" ? "text-orange-600"
                          : last === "add_to_cart" ? "text-rose-600"
                          : "text-muted-foreground";
                        return <span className={color}>{label}</span>;
                      })() : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(order.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Europe/London",
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
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>
            {searchedOrders.length === 0
              ? "No orders match your search"
              : `Showing ${pageStart + 1}–${Math.min(pageStart + perPage, searchedOrders.length)} of ${searchedOrders.length}`}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-7 px-2 text-xs"
              >
                Previous
              </Button>
              <span className="px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-7 px-2 text-xs"
              >
                Next
              </Button>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}

function AbandonedTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  useEffect(() => {
    fetch("/api/admin/orders")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const abandoned = (data.orders as Order[]).filter((o) => o.status === "abandoned");
        setOrders(abandoned);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) {
      setAppliedQuery("");
      return;
    }
    if (trimmed.length < 3) return;
    const handle = setTimeout(() => setAppliedQuery(trimmed), 250);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedQuery, perPage]);

  const searchedOrders = useMemo(() => {
    const q = appliedQuery.toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      return (
        (o.customer_email?.toLowerCase().includes(q) ?? false) ||
        (o.customer_name?.toLowerCase().includes(q) ?? false) ||
        (o.abandon_reason?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [orders, appliedQuery]);

  const totalPages = Math.max(1, Math.ceil(searchedOrders.length / perPage));
  const pageStart = (currentPage - 1) * perPage;
  const pagedOrders = searchedOrders.slice(pageStart, pageStart + perPage);

  const totalValue = orders.reduce((sum, o) => sum + Number(o.amount_total || 0), 0);
  const withEmail = orders.filter((o) => !!o.customer_email).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading abandoned carts...
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
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Abandoned carts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Checkouts that started but never completed payment.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Ban className="size-3.5" />
            <span className="text-xs font-medium">Total abandoned</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{orders.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ShoppingBag className="size-3.5" />
            <span className="text-xs font-medium">Lost value</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{formatPrice(totalValue)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MessageSquare className="size-3.5" />
            <span className="text-xs font-medium">With email (recoverable)</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{withEmail}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          type="search"
          placeholder="Search by email, name, reason (3+ chars)..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Per page</span>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {searchedOrders.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {orders.length === 0 ? "No abandoned carts yet." : "No carts match your search."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">When</th>
                <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                <th className="px-4 py-2.5 text-left font-medium">Items</th>
                <th className="px-4 py-2.5 text-left font-medium">Reason</th>
                <th className="px-4 py-2.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pagedOrders.map((o) => {
                const itemCount = (o.line_items || []).reduce((s, li) => s + (li.qty || 0), 0);
                return (
                  <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.customer_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{o.customer_email || "(no email)"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {itemCount} {itemCount === 1 ? "item" : "items"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {o.abandon_reason || "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatPrice(Number(o.amount_total))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          {searchedOrders.length === 0
            ? "No carts"
            : `Showing ${pageStart + 1}–${Math.min(pageStart + perPage, searchedOrders.length)} of ${searchedOrders.length}`}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-7 px-2 text-xs"
            >
              Previous
            </Button>
            <span className="px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-7 px-2 text-xs"
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

type Customer = {
  email: string;
  name: string | null;
  first_order_at: string;
  last_order_at: string;
  paid_orders: number;
  total_spend: number;
  avg_order_value: number;
  refunded_orders: number;
  abandoned_carts: number;
  product_count: number;
  shipping_country: string | null;
  segment: "vip" | "repeat" | "new" | "abandoned-only";
};

const SEGMENT_COLOR: Record<Customer["segment"], string> = {
  vip: "bg-amber-100 text-amber-800",
  repeat: "bg-emerald-100 text-emerald-800",
  new: "bg-sky-100 text-sky-800",
  "abandoned-only": "bg-muted text-muted-foreground",
};

const SEGMENT_LABEL: Record<Customer["segment"], string> = {
  vip: "VIP",
  repeat: "Repeat",
  new: "New",
  "abandoned-only": "Cart only",
};

function CustomersTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segmentFilter, setSegmentFilter] = useState<"all" | Customer["segment"]>("all");
  const [sortBy, setSortBy] = useState<"recent" | "ltv" | "orders">("recent");
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  useEffect(() => {
    fetch("/api/admin/customers")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setCustomers(data.customers as Customer[]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) {
      setAppliedQuery("");
      return;
    }
    if (trimmed.length < 3) return;
    const handle = setTimeout(() => setAppliedQuery(trimmed), 250);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedQuery, segmentFilter, sortBy, perPage]);

  const filtered = useMemo(() => {
    const q = appliedQuery.toLowerCase();
    return customers.filter((c) => {
      if (segmentFilter !== "all" && c.segment !== segmentFilter) return false;
      if (q) {
        const hit =
          c.email.includes(q) ||
          (c.name?.toLowerCase().includes(q) ?? false) ||
          (c.shipping_country?.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }
      return true;
    });
  }, [customers, segmentFilter, appliedQuery]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "ltv") arr.sort((a, b) => b.total_spend - a.total_spend);
    else if (sortBy === "orders") arr.sort((a, b) => b.paid_orders - a.paid_orders);
    else arr.sort((a, b) => b.last_order_at.localeCompare(a.last_order_at));
    return arr;
  }, [filtered, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const pageStart = (currentPage - 1) * perPage;
  const paged = sorted.slice(pageStart, pageStart + perPage);

  const totalCustomers = customers.length;
  const repeaters = customers.filter((c) => c.paid_orders >= 2).length;
  const totalLtv = customers.reduce((s, c) => s + c.total_spend, 0);
  const repeatRate = totalCustomers > 0 ? (repeaters / totalCustomers) * 100 : 0;
  const avgLtv =
    customers.filter((c) => c.paid_orders > 0).length > 0
      ? totalLtv / customers.filter((c) => c.paid_orders > 0).length
      : 0;

  const counts = {
    all: customers.length,
    vip: customers.filter((c) => c.segment === "vip").length,
    repeat: customers.filter((c) => c.segment === "repeat").length,
    new: customers.filter((c) => c.segment === "new").length,
    "abandoned-only": customers.filter((c) => c.segment === "abandoned-only").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading customers...
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

  const chips: Array<{ key: "all" | Customer["segment"]; label: string }> = [
    { key: "all", label: "All" },
    { key: "vip", label: "VIP (5+ orders)" },
    { key: "repeat", label: "Repeat (2-4)" },
    { key: "new", label: "New (1 order)" },
    { key: "abandoned-only", label: "Cart only" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Customers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggregated from the orders table — one row per email.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ShoppingBag className="size-3.5" />
            <span className="text-xs font-medium">Total customers</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{totalCustomers}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <RefreshCw className="size-3.5" />
            <span className="text-xs font-medium">Repeat rate</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {repeatRate.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CreditCard className="size-3.5" />
            <span className="text-xs font-medium">Total LTV</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {formatPrice(totalLtv)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart3 className="size-3.5" />
            <span className="text-xs font-medium">Avg LTV</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            {formatPrice(avgLtv)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => {
            const active = segmentFilter === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => setSegmentFilter(chip.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {chip.label}
                <span className="ml-1.5 opacity-70">
                  {counts[chip.key]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "recent" | "ltv" | "orders")}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="recent">Most recent</option>
            <option value="ltv">Highest LTV</option>
            <option value="orders">Most orders</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          type="search"
          placeholder="Search email, name, country (3+ chars)..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Per page</span>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {paged.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No customers match this view.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                <th className="px-4 py-2.5 text-left font-medium">Country</th>
                <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                <th className="px-4 py-2.5 text-right font-medium">LTV</th>
                <th className="px-4 py-2.5 text-left font-medium">Last order</th>
                <th className="px-4 py-2.5 text-left font-medium">Segment</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paged.map((c) => (
                <tr key={c.email} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/customers/${encodeURIComponent(c.email)}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {c.name || c.email}
                    </a>
                    {c.name && (
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.shipping_country || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.paid_orders}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatPrice(c.total_spend)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(c.last_order_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEGMENT_COLOR[c.segment]}`}
                    >
                      {SEGMENT_LABEL[c.segment]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          {sorted.length === 0
            ? "No customers"
            : `Showing ${pageStart + 1}–${Math.min(pageStart + perPage, sorted.length)} of ${sorted.length}`}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-7 px-2 text-xs"
            >
              Previous
            </Button>
            <span className="px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-7 px-2 text-xs"
            >
              Next
            </Button>
          </div>
        )}
      </div>
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
                        {new Date(r.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          timeZone: "Europe/London",
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
                                        — £{(item.price * item.qty).toFixed(2)}
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
    const now = londonNow();
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
                {new Date(m + "-01").toLocaleDateString("en-GB", {
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
                    key={`${row.product_id}-${row.variation_id || "s"}`}
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

interface StockNotification {
  id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  email: string;
  created_at: string;
  notified_at: string | null;
  unsubscribed_at: string | null;
}

function WaitingStockTab() {
  const [rows, setRows] = useState<StockNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/stock-notifications")
      .then((res) => res.json())
      .then((data: StockNotification[]) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading waiting stock subscribers...
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

  const pending = rows.filter((r) => r.notified_at === null && r.unsubscribed_at === null);
  const sent = rows.filter((r) => r.notified_at !== null);

  // Aggregate: subscribers per product (pending only)
  const perProduct = new Map<string, { product_name: string; product_slug: string; count: number }>();
  for (const r of pending) {
    const key = String(r.product_id);
    const existing = perProduct.get(key);
    if (existing) existing.count++;
    else perProduct.set(key, { product_name: r.product_name, product_slug: r.product_slug, count: 1 });
  }
  const productSummary = [...perProduct.values()].sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BellRing className="size-3.5" />
            <span className="text-xs font-medium">Pending</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{pending.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="size-3.5" />
            <span className="text-xs font-medium">Notified</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{sent.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="size-3.5" />
            <span className="text-xs font-medium">Products waiting</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{productSummary.length}</p>
        </div>
      </div>

      {productSummary.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-medium">By product (pending only)</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b">
              <tr>
                <th className="px-5 py-2 font-medium">Product</th>
                <th className="px-5 py-2 font-medium text-right">Subscribers</th>
              </tr>
            </thead>
            <tbody>
              {productSummary.map((p) => (
                <tr key={p.product_slug} className="border-b last:border-0">
                  <td className="px-5 py-2.5">
                    <a href={`/product/${p.product_slug}`} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1">
                      {p.product_name}
                      <ExternalLink className="size-3" />
                    </a>
                  </td>
                  <td className="px-5 py-2.5 text-right font-medium">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/30">
          <h3 className="text-sm font-medium">All subscriptions</h3>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            No back-in-stock subscriptions yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b">
              <tr>
                <th className="px-5 py-2 font-medium">Email</th>
                <th className="px-5 py-2 font-medium">Product</th>
                <th className="px-5 py-2 font-medium">Signed up</th>
                <th className="px-5 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-5 py-2.5">{r.email}</td>
                  <td className="px-5 py-2.5">
                    <a href={`/product/${r.product_slug}`} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1">
                      {r.product_name}
                      <ExternalLink className="size-3" />
                    </a>
                  </td>
                  <td className="px-5 py-2.5 text-muted-foreground">{timeAgo(r.created_at)}</td>
                  <td className="px-5 py-2.5">
                    {r.unsubscribed_at ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                        <Ban className="size-3" /> Unsubscribed
                      </span>
                    ) : r.notified_at ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs">
                        <CheckCircle2 className="size-3" /> Notified {timeAgo(r.notified_at)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs">
                        <BellRing className="size-3" /> Waiting
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface ChefApplicationUpload {
  url: string;
  path: string;
  original_name: string;
  size: number;
  type: string;
  uploaded_at: string;
}

interface ChefApplication {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  instagram: string | null;
  tiktok: string | null;
  job_title: string;
  venue: string;
  city: string;
  years_experience: string;
  shipping_address: string;
  shipping_postcode: string;
  agreed_to_terms: boolean;
  status: string;
  admin_notes: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string | null;
  access_token: string | null;
  email_sent_at: string | null;
  contract_signed_at: string | null;
  signed_name: string | null;
  signed_ip: string | null;
  signed_user_agent: string | null;
  uploads: ChefApplicationUpload[] | null;
}

const CHEF_STATUSES = ["pending", "approved", "invited", "signed", "shipped", "completed", "rejected"] as const;

function AmbassadorsTab() {
  const [apps, setApps] = useState<ChefApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState<Record<number, string>>({});
  const [editVenue, setEditVenue] = useState<Record<number, string>>({});
  const [editJobTitle, setEditJobTitle] = useState<Record<number, string>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | typeof CHEF_STATUSES[number]>("all");
  const [messageTarget, setMessageTarget] = useState<ChefApplication | null>(null);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  function openMessage(a: ChefApplication) {
    setMessageTarget(a);
    setMessageSubject("Your Shimeru Chef Ambassador application");
    setMessageBody(`Hi ${a.full_name.trim().split(/\s+/)[0] || "there"},\n\n\n\nBest,\nDavid\nShimeru Knives`);
  }

  function closeMessage() {
    if (sendingMessage) return;
    setMessageTarget(null);
    setMessageSubject("");
    setMessageBody("");
  }

  async function sendMessage() {
    if (!messageTarget) return;
    if (!messageSubject.trim() || !messageBody.trim()) return;
    setSendingMessage(true);
    try {
      const res = await fetch("/api/admin/chef-applications/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: messageTarget.id,
          subject: messageSubject,
          body: messageBody,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
        alert(`Failed: ${msg || res.statusText}`);
        return;
      }
      setMessageTarget(null);
      setMessageSubject("");
      setMessageBody("");
    } finally {
      setSendingMessage(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/chef-applications")
      .then((res) => res.json())
      .then((data: ChefApplication[]) => setApps(Array.isArray(data) ? data : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load applications"))
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      await fetch("/api/admin/chef-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      setApps((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status, updated_at: new Date().toISOString() } : a))
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveNotes(id: number) {
    setUpdatingId(id);
    try {
      await fetch("/api/admin/chef-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, admin_notes: editNotes[id] ?? "" }),
      });
      setApps((prev) =>
        prev.map((a) => (a.id === id ? { ...a, admin_notes: editNotes[id] ?? "" } : a))
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveApplicationField(
    id: number,
    field: "venue" | "job_title",
    value: string
  ) {
    if (!value.trim()) return;
    setUpdatingId(id);
    try {
      const res = await fetch("/api/admin/chef-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value.trim() }),
      });
      if (!res.ok) {
        alert("Failed to save.");
        return;
      }
      setApps((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, [field]: value.trim(), updated_at: new Date().toISOString() } : a
        )
      );
      if (field === "venue") setEditVenue((prev) => ({ ...prev, [id]: "" }));
      if (field === "job_title") setEditJobTitle((prev) => ({ ...prev, [id]: "" }));
    } finally {
      setUpdatingId(null);
    }
  }

  async function sendInviteEmail(a: ChefApplication) {
    const alreadySent = !!a.email_sent_at;
    const ok = confirm(
      alreadySent
        ? `Resend invite to ${a.full_name} at ${a.email}?`
        : `Send acceptance email to ${a.full_name} at ${a.email}?`
    );
    if (!ok) return;
    setUpdatingId(a.id);
    try {
      const res = await fetch("/api/admin/chef-applications/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
        alert(`Failed: ${msg || res.statusText}`);
        return;
      }
      const nowIso = new Date().toISOString();
      setApps((prev) =>
        prev.map((p) =>
          p.id === a.id
            ? { ...p, status: "invited", email_sent_at: nowIso, updated_at: nowIso }
            : p
        )
      );
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading applications...
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

  const filtered =
    statusFilter === "all"
      ? apps.filter((a) => a.status !== "rejected")
      : apps.filter((a) => a.status === statusFilter);
  const pending = apps.filter((a) => a.status === "pending").length;
  const approved = apps.filter((a) => a.status === "approved").length;
  const completed = apps.filter((a) => a.status === "completed").length;

  const statusColor: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-sky-100 text-sky-800",
    invited: "bg-violet-100 text-violet-800",
    signed: "bg-teal-100 text-teal-800",
    shipped: "bg-indigo-100 text-indigo-800",
    completed: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ChefHat className="size-3.5" />
            <span className="text-xs font-medium">Total</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{apps.length}</p>
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
            <Check className="size-3.5" />
            <span className="text-xs font-medium">Approved</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{approved}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="size-3.5" />
            <span className="text-xs font-medium">Completed</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{completed}</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "All"],
            ["pending", "Pending"],
            ["approved", "Approved"],
            ["invited", "Invited"],
            ["signed", "Signed"],
            ["shipped", "Shipped"],
            ["completed", "Completed"],
            ["rejected", "Rejected"],
          ] as ["all" | typeof CHEF_STATUSES[number], string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === key
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No applications match this filter.</p>
      ) : (
        <div className="rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Job</th>
                <th className="px-4 py-3 text-left font-medium">Restaurant</th>
                <th className="px-4 py-3 text-left font-medium">Exp.</th>
                <th className="px-4 py-3 text-left font-medium">Socials</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const isExpanded = expandedId === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr
                      className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : a.id)}
                    >
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(a.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          timeZone: "Europe/London",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{a.full_name}</div>
                        <div className="text-xs text-muted-foreground">{a.email}</div>
                      </td>
                      <td className="px-4 py-3">{a.job_title}</td>
                      <td className="px-4 py-3">{a.venue}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.years_experience}</td>
                      <td className="px-4 py-3 text-xs" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-0.5">
                          {a.instagram && (
                            <a
                              href={`https://instagram.com/${a.instagram.replace(/^@|^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline text-foreground"
                              title="Instagram"
                            >
                              IG: {a.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "")}
                            </a>
                          )}
                          {a.tiktok && (
                            <a
                              href={`https://tiktok.com/@${a.tiktok.replace(/^@|^https?:\/\/(www\.)?tiktok\.com\/@?/i, "").replace(/\/$/, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline text-foreground"
                              title="TikTok"
                            >
                              TT: {a.tiktok.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, "").replace(/\/$/, "")}
                            </a>
                          )}
                          {!a.instagram && !a.tiktok && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            statusColor[a.status] || "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <select
                            value={a.status}
                            onChange={(e) => updateStatus(a.id, e.target.value)}
                            disabled={updatingId === a.id}
                            className="rounded border bg-background px-2 py-1 text-xs"
                          >
                            {CHEF_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          {(a.status === "approved" || a.status === "invited") && (
                            <button
                              type="button"
                              onClick={() => sendInviteEmail(a)}
                              disabled={updatingId === a.id}
                              className="inline-flex items-center gap-1 rounded border bg-card px-2 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                              title={
                                a.email_sent_at
                                  ? `Resend (last sent ${timeAgo(a.email_sent_at)})`
                                  : "Send acceptance email"
                              }
                            >
                              {updatingId === a.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <MessageSquare className="size-3" />
                              )}
                              {a.email_sent_at ? "Resend" : "Send"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openMessage(a)}
                            disabled={updatingId === a.id}
                            className="inline-flex items-center gap-1 rounded border bg-card px-2 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                            title={`Send a custom message to ${a.email}`}
                          >
                            <MessageSquare className="size-3" />
                            Email
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Contact</p>
                              <p className="text-sm">{a.email}</p>
                              <p className="text-sm">{a.phone}</p>
                              {a.instagram && (
                                <p className="text-sm">
                                  IG:{" "}
                                  <a
                                    href={`https://instagram.com/${a.instagram.replace(/^@/, "")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline"
                                  >
                                    {a.instagram}
                                  </a>
                                </p>
                              )}
                              {a.tiktok && (
                                <p className="text-sm">
                                  TT:{" "}
                                  <a
                                    href={`https://tiktok.com/@${a.tiktok.replace(/^@/, "")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline"
                                  >
                                    {a.tiktok}
                                  </a>
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Shipping</p>
                              <p className="text-sm whitespace-pre-wrap">{a.shipping_address}</p>
                              <p className="text-sm">{a.shipping_postcode}</p>
                              <p className="text-sm text-muted-foreground">{a.city}</p>
                            </div>
                            <div className="sm:col-span-2 rounded border bg-card p-3 space-y-2.5">
                              <p className="text-xs font-medium text-muted-foreground">
                                Application data — clean these up before sending the email
                              </p>
                              <div className="grid sm:grid-cols-2 gap-2.5">
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Restaurant
                                  </label>
                                  <div className="flex gap-1.5">
                                    <Input
                                      value={editVenue[a.id] ?? a.venue}
                                      onChange={(e) =>
                                        setEditVenue((prev) => ({ ...prev, [a.id]: e.target.value }))
                                      }
                                      className="h-8 text-xs"
                                    />
                                    {(editVenue[a.id] ?? a.venue) !== a.venue && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          saveApplicationField(
                                            a.id,
                                            "venue",
                                            editVenue[a.id] ?? a.venue
                                          )
                                        }
                                        disabled={updatingId === a.id}
                                        className="h-8 px-2 text-xs"
                                      >
                                        Save
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Job title
                                  </label>
                                  <div className="flex gap-1.5">
                                    <Input
                                      value={editJobTitle[a.id] ?? a.job_title}
                                      onChange={(e) =>
                                        setEditJobTitle((prev) => ({
                                          ...prev,
                                          [a.id]: e.target.value,
                                        }))
                                      }
                                      className="h-8 text-xs"
                                    />
                                    {(editJobTitle[a.id] ?? a.job_title) !== a.job_title && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          saveApplicationField(
                                            a.id,
                                            "job_title",
                                            editJobTitle[a.id] ?? a.job_title
                                          )
                                        }
                                        disabled={updatingId === a.id}
                                        className="h-8 px-2 text-xs"
                                      >
                                        Save
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            {a.access_token && (
                              <div className="sm:col-span-2 rounded border bg-card p-3 text-xs space-y-1.5">
                                <p className="font-medium text-muted-foreground">Pipeline</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                  {a.email_sent_at && (
                                    <span>Email sent {timeAgo(a.email_sent_at)}</span>
                                  )}
                                  {a.contract_signed_at ? (
                                    <span className="text-emerald-700">
                                      Signed by {a.signed_name} {timeAgo(a.contract_signed_at)}
                                    </span>
                                  ) : (
                                    <span className="text-amber-700">Not signed yet</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-3 pt-1">
                                  <a
                                    href={`/ambassador-contract/${a.access_token}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline inline-flex items-center gap-1"
                                  >
                                    <ExternalLink className="size-3" /> Contract link
                                  </a>
                                  <a
                                    href={`/ambassador-upload/${a.access_token}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline inline-flex items-center gap-1"
                                  >
                                    <ExternalLink className="size-3" /> Upload link
                                  </a>
                                </div>
                              </div>
                            )}
                            {a.uploads && a.uploads.length > 0 && (
                              <div className="sm:col-span-2">
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Uploaded content ({a.uploads.length})
                                </p>
                                <ul className="divide-y border rounded">
                                  {a.uploads.map((u) => (
                                    <li key={u.path} className="flex items-center gap-2 p-2 text-xs">
                                      <span className="flex-1 truncate">{u.original_name}</span>
                                      <span className="text-muted-foreground whitespace-nowrap">
                                        {(u.size / (1024 * 1024)).toFixed(1)} MB
                                      </span>
                                      <a
                                        href={u.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-muted-foreground hover:text-foreground"
                                      >
                                        view
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="sm:col-span-2">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Admin notes</p>
                              <div className="flex gap-2">
                                <textarea
                                  value={editNotes[a.id] ?? a.admin_notes ?? ""}
                                  onChange={(e) =>
                                    setEditNotes((prev) => ({ ...prev, [a.id]: e.target.value }))
                                  }
                                  placeholder="Add internal notes..."
                                  className="flex-1 rounded border bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => saveNotes(a.id)}
                                  disabled={updatingId === a.id}
                                >
                                  {updatingId === a.id ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    "Save"
                                  )}
                                </Button>
                              </div>
                            </div>
                            {a.updated_at && (
                              <p className="text-xs text-muted-foreground sm:col-span-2">
                                Updated {timeAgo(a.updated_at)}
                              </p>
                            )}
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

      {messageTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeMessage}
        >
          <div
            className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Email {messageTarget.full_name}</h3>
                <p className="text-xs text-muted-foreground">{messageTarget.email}</p>
              </div>
              <button
                type="button"
                onClick={closeMessage}
                disabled={sendingMessage}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subject
                </label>
                <Input
                  value={messageSubject}
                  onChange={(e) => setMessageSubject(e.target.value)}
                  className="mt-1 h-9 text-sm"
                  disabled={sendingMessage}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Message
                </label>
                <textarea
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  rows={12}
                  disabled={sendingMessage}
                  className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm font-mono resize-y disabled:opacity-50"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={closeMessage}
                  disabled={sendingMessage}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={sendMessage}
                  disabled={
                    sendingMessage || !messageSubject.trim() || !messageBody.trim()
                  }
                >
                  {sendingMessage ? (
                    <>
                      <Loader2 className="mr-1.5 size-3 animate-spin" /> Sending…
                    </>
                  ) : (
                    "Send"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type SupportTicket = {
  id: string;
  customer_email: string;
  customer_name: string | null;
  customer_phone: string | null;
  order_number: string | null;
  subject: string;
  status: "pending" | "on_hold" | "solved";
  source: "contact_form" | "email";
  delivery_status: "ok" | "bounced" | "spam_complaint";
  created_at: string;
  last_updated: string;
};

type SupportTicketMessage = {
  id: string;
  ticket_id: string;
  direction: "inbound" | "outbound" | "note";
  from_addr: string | null;
  content_text: string | null;
  content_html: string | null;
  attachments: Array<{ name: string; url: string; content_type?: string; size?: number }>;
  created_at: string;
};

const SUPPORT_STATUS_LABEL: Record<SupportTicket["status"], string> = {
  pending: "Pending",
  on_hold: "On Hold",
  solved: "Solved",
};

const SUPPORT_STATUS_COLOR: Record<SupportTicket["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  on_hold: "bg-sky-100 text-sky-800",
  solved: "bg-emerald-100 text-emerald-800",
};

function formatTicketDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function SupportTab({ onTicketsChanged }: { onTicketsChanged?: () => void }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | SupportTicket["status"]>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/support/tickets");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to load tickets (${res.status})`);
      }
      const data = (await res.json()) as SupportTicket[];
      setTickets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Debounce: apply search after 250ms of no typing, only at 3+ chars
  // (or when the field is cleared). Matches the Orders/Carts tabs.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) {
      setAppliedQuery("");
      return;
    }
    if (trimmed.length < 3) return;
    const handle = setTimeout(() => setAppliedQuery(trimmed), 250);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const counts = {
    all: tickets.length,
    pending: tickets.filter((t) => t.status === "pending").length,
    on_hold: tickets.filter((t) => t.status === "on_hold").length,
    solved: tickets.filter((t) => t.status === "solved").length,
  };

  const visibleTickets = useMemo(
    () => (filterStatus === "all" ? tickets : tickets.filter((t) => t.status === filterStatus)),
    [tickets, filterStatus]
  );

  const searchedTickets = useMemo(() => {
    const q = appliedQuery.toLowerCase();
    if (!q) return visibleTickets;
    return visibleTickets.filter(
      (t) =>
        (t.customer_name?.toLowerCase().includes(q) ?? false) ||
        (t.customer_email?.toLowerCase().includes(q) ?? false) ||
        (t.subject?.toLowerCase().includes(q) ?? false) ||
        (t.order_number?.toLowerCase().includes(q) ?? false)
    );
  }, [visibleTickets, appliedQuery]);

  const totalPages = Math.max(1, Math.ceil(searchedTickets.length / perPage));
  const pageStart = (currentPage - 1) * perPage;
  const pagedTickets = searchedTickets.slice(pageStart, pageStart + perPage);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [appliedQuery, perPage, filterStatus]);

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pageIds = pagedTickets.map((t) => t.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  function toggleAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function bulkSolve() {
    if (selectedIds.size === 0) return;
    setBulkUpdating(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/admin/support/tickets/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "solved" }),
          })
        )
      );
      setSelectedIds(new Set());
      await loadTickets();
      onTicketsChanged?.();
    } finally {
      setBulkUpdating(false);
    }
  }

  if (selectedId) {
    return (
      <SupportTicketDetail
        ticketId={selectedId}
        onBack={() => {
          setSelectedId(null);
          loadTickets();
          onTicketsChanged?.();
        }}
        onChanged={() => {
          loadTickets();
          onTicketsChanged?.();
        }}
      />
    );
  }

  const chips: Array<{ key: "all" | SupportTicket["status"]; label: string }> = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "on_hold", label: "On Hold" },
    { key: "solved", label: "Solved" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => {
            const active = filterStatus === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => setFilterStatus(chip.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {chip.label}
                <span className="ml-1.5 opacity-70">
                  {chip.key === "all" ? counts.all : counts[chip.key]}
                </span>
              </button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadTickets}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading tickets...
        </div>
      ) : error ? (
        <div className="mx-auto max-w-md py-16">
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        </div>
      ) : tickets.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No tickets yet.
        </div>
      ) : (
        <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            type="search"
            placeholder="Search by name, email, subject, order # (3+ chars)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="max-w-sm"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Per page</span>
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-2.5">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkUpdating}
                className="h-8 text-xs"
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={bulkSolve}
                disabled={bulkUpdating}
                className="h-8 gap-1.5 text-xs"
              >
                {bulkUpdating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                Mark solved
              </Button>
            </div>
          </div>
        )}
        {searchedTickets.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {appliedQuery ? "No tickets match your search." : "No tickets in this view."}
          </div>
        ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-2.5 text-left font-medium">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    className="size-4 cursor-pointer align-middle accent-foreground"
                  />
                </th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                <th className="px-4 py-2.5 text-left font-medium">Subject</th>
                <th className="px-4 py-2.5 text-left font-medium">Source</th>
                <th className="px-4 py-2.5 text-left font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pagedTickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ticket ${t.subject || t.id}`}
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleOne(t.id)}
                      className="size-4 cursor-pointer align-middle accent-foreground"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SUPPORT_STATUS_COLOR[t.status]}`}
                    >
                      {SUPPORT_STATUS_LABEL[t.status]}
                    </span>
                    {t.delivery_status !== "ok" && (
                      <span className="ml-1.5 inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                        {t.delivery_status === "bounced" ? "Bounced" : "Spam"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.customer_name || t.customer_email}</div>
                    <div className="text-xs text-muted-foreground">{t.customer_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="line-clamp-1">{t.subject}</div>
                    {t.order_number && (
                      <div className="text-xs text-muted-foreground">Order #{t.order_number}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {t.source === "contact_form" ? "Form" : "Email"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatTicketDate(t.last_updated)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>
            {searchedTickets.length === 0
              ? "No tickets match your search"
              : `Showing ${pageStart + 1}–${Math.min(pageStart + perPage, searchedTickets.length)} of ${searchedTickets.length}`}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-7 px-2 text-xs"
              >
                Previous
              </Button>
              <span className="px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-7 px-2 text-xs"
              >
                Next
              </Button>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}

type SupportTicketCustomerOrder = {
  id: number;
  wc_order_id: number | null;
  customer_email: string | null;
  customer_name: string | null;
  amount_total: number;
  currency: string;
  status: string;
  line_items: { pid: number; qty: number; vid?: number; price?: number }[] | null;
  created_at: string;
};

function SupportTicketDetail({
  ticketId,
  onBack,
  onChanged,
}: {
  ticketId: string;
  onBack: () => void;
  onChanged?: () => void;
}) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [customerOrders, setCustomerOrders] = useState<SupportTicketCustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to load ticket (${res.status})`);
      }
      const data = (await res.json()) as {
        ticket: SupportTicket;
        messages: SupportTicketMessage[];
        customer_orders?: SupportTicketCustomerOrder[];
      };
      setTicket(data.ticket);
      setMessages(data.messages);
      setCustomerOrders(data.customer_orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(newStatus: SupportTicket["status"]) {
    if (!ticket) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setTicket({ ...ticket, status: newStatus });
        onChanged?.();
      }
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function sendReply() {
    if (!reply.trim() && attachedFiles.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("message", reply);
      attachedFiles.forEach((file) => formData.append("files", file));

      const res = await fetch(`/api/admin/support/tickets/${ticketId}/reply`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to send (${res.status})`);
      }
      setReply("");
      setAttachedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading ticket...
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ChevronLeft />
          Back
        </Button>
        <div className="mx-auto max-w-md py-16">
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error || "Ticket not found"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 px-2">
          <ChevronLeft />
          Back to tickets
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          <select
            value={ticket.status}
            onChange={(e) => changeStatus(e.target.value as SupportTicket["status"])}
            disabled={updatingStatus}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="pending">Pending</option>
            <option value="on_hold">On Hold</option>
            <option value="solved">Solved</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">{ticket.subject}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">
                  {ticket.customer_name || ticket.customer_email}
                </span>
                {ticket.customer_name && (
                  <span className="ml-1.5">&lt;{ticket.customer_email}&gt;</span>
                )}
              </span>
              {ticket.customer_phone && <span>· {ticket.customer_phone}</span>}
              {ticket.order_number && <span>· Order #{ticket.order_number}</span>}
              <span>· {ticket.source === "contact_form" ? "Contact form" : "Email"}</span>
            </div>
          </div>
          <span
            className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${SUPPORT_STATUS_COLOR[ticket.status]}`}
          >
            {SUPPORT_STATUS_LABEL[ticket.status]}
          </span>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight">Order history</h3>
          <span className="text-xs text-muted-foreground">
            {customerOrders.length === 0
              ? "No orders for this email"
              : customerOrders.length === 1
              ? "1 order"
              : `${customerOrders.length} orders`}
          </span>
        </div>
        {customerOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            We have no orders on file for <span className="font-medium">{ticket.customer_email}</span>.
            They may have used a different email at checkout.
          </p>
        ) : (
          <ul className="divide-y">
            {customerOrders.slice(0, 5).map((o) => {
              const orderRef = o.wc_order_id ? `#${o.wc_order_id}` : `#${o.id}`;
              const itemCount = (o.line_items || []).reduce((sum, li) => sum + (li.qty || 0), 0);
              const row = (
                <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{orderRef}</span>
                      <span className="inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {o.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {itemCount} {itemCount === 1 ? "item" : "items"}
                      {" · "}
                      {new Date(o.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-medium tabular-nums">
                    {formatPrice(Number(o.amount_total))}
                  </div>
                </div>
              );
              return (
                <li key={o.id}>
                  {o.wc_order_id ? (
                    <a
                      href={`/admin/orders/${o.wc_order_id}`}
                      className="block rounded-md transition-colors hover:bg-muted/40"
                    >
                      {row}
                    </a>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
            {customerOrders.length > 5 && (
              <li className="pt-2 text-center text-xs text-muted-foreground">
                Showing 5 of {customerOrders.length}
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        {messages.map((m) => {
          const isOutbound = m.direction === "outbound";
          return (
            <div
              key={m.id}
              className={`rounded-xl border p-4 shadow-sm ${
                isOutbound ? "bg-sky-50/40 border-sky-100" : "bg-card"
              }`}
            >
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {isOutbound ? "You" : m.from_addr || ticket.customer_email}
                </span>
                <span>{formatTicketDate(m.created_at)}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {m.content_text || "(no content)"}
              </div>
              {m.attachments && m.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.attachments.map((a, i) => (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Package className="size-3" />
                      {a.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <label className="mb-2 block text-xs font-medium text-muted-foreground">
          Reply to {ticket.customer_email}
        </label>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={6}
          placeholder="Write your reply..."
          className="block w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files || []);
            if (picked.length > 0) setAttachedFiles((prev) => [...prev, ...picked]);
          }}
        />
        {attachedFiles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachedFiles.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs"
              >
                <Paperclip className="size-3" />
                <span className="max-w-[200px] truncate">{file.name}</span>
                <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
                <button
                  type="button"
                  onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {error && (
          <p className="mt-2 text-sm text-rose-600">{error}</p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="gap-1.5"
          >
            <Paperclip className="size-3.5" />
            Attach file
          </Button>
          <Button
            onClick={sendReply}
            disabled={sending || (!reply.trim() && attachedFiles.length === 0)}
            className="gap-1.5"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? "Sending..." : "Send reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

type EmailLogMessage = {
  message_id: string;
  status: string;
  to: Array<{ Email: string; Name?: string }>;
  from: string;
  subject: string;
  tag: string | null;
  stream: string;
  received_at: string;
  opened: boolean;
  clicked: boolean;
};

type EmailLogResponse = {
  total: number;
  messages: EmailLogMessage[];
};

type EmailLogDetails = {
  MessageID: string;
  To?: Array<{ Email: string }>;
  Subject?: string;
  Status?: string;
  MessageEvents?: Array<{ Type: string; ReceivedAt: string; Details?: Record<string, unknown> }>;
  Recipients?: string[];
  TextBody?: string;
  HtmlBody?: string;
};

const EMAIL_STATUS_COLOR: Record<string, string> = {
  Sent: "bg-sky-100 text-sky-800",
  Queued: "bg-amber-100 text-amber-800",
  Processed: "bg-sky-100 text-sky-800",
  Bounced: "bg-rose-100 text-rose-800",
  SoftBounced: "bg-rose-100 text-rose-800",
};

function formatEmailDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function EmailLogsTab() {
  const [messages, setMessages] = useState<EmailLogMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<EmailLogDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) {
      setAppliedSearch("");
      return;
    }
    if (trimmed.length < 3) return;
    const handle = setTimeout(() => setAppliedSearch(trimmed), 250);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [appliedSearch, statusFilter, perPage]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("count", String(perPage));
      params.set("offset", String((page - 1) * perPage));
      if (appliedSearch) params.set("recipient", appliedSearch);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/email-logs?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to load (${res.status})`);
      }
      const data = (await res.json()) as EmailLogResponse;
      setMessages(data.messages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, appliedSearch, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetails(messageId: string) {
    if (expandedId === messageId) {
      setExpandedId(null);
      setDetails(null);
      return;
    }
    setExpandedId(messageId);
    setDetails(null);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/admin/email-logs/${messageId}`);
      if (res.ok) {
        const data = (await res.json()) as EmailLogDetails;
        setDetails(data);
      }
    } finally {
      setDetailsLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageStart = (page - 1) * perPage;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Email logs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every email sent through the Shimeru Postmark server. Click a row for the open / click / bounce timeline.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input
            type="search"
            placeholder="Recipient email (3+ chars)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="max-w-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="queued">Queued</option>
            <option value="bounced">Bounced</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Per page</span>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading logs...
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : messages.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No emails match this filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">When</th>
                <th className="px-4 py-2.5 text-left font-medium">To</th>
                <th className="px-4 py-2.5 text-left font-medium">Subject</th>
                <th className="px-4 py-2.5 text-left font-medium">Tag</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {messages.map((m) => {
                const expanded = expandedId === m.message_id;
                const statusClass =
                  EMAIL_STATUS_COLOR[m.status] ?? "bg-muted text-muted-foreground";
                const recipient = m.to?.[0]?.Email ?? "—";
                return (
                  <Fragment key={m.message_id}>
                    <tr
                      onClick={() => openDetails(m.message_id)}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatEmailDate(m.received_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{recipient}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="line-clamp-1 text-sm">{m.subject || "(no subject)"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {m.tag || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                          >
                            {m.status}
                          </span>
                          {m.opened && (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              Opened
                            </span>
                          )}
                          {m.clicked && (
                            <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                              Clicked
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={5} className="bg-muted/20 px-4 py-4">
                          {detailsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" />
                              Loading details...
                            </div>
                          ) : details ? (
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Event timeline
                                </div>
                                {(details.MessageEvents || []).length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    No events recorded yet.
                                  </p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {(details.MessageEvents || []).map((ev, i) => (
                                      <li
                                        key={i}
                                        className="flex items-center gap-3 text-xs"
                                      >
                                        <span className="font-medium">{ev.Type}</span>
                                        <span className="text-muted-foreground">
                                          {formatEmailDate(ev.ReceivedAt)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div>
                                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Email content
                                </div>
                                {details.HtmlBody ? (
                                  <div
                                    className="rounded-md border bg-background p-3 text-xs [&_a]:text-foreground [&_a]:underline"
                                    dangerouslySetInnerHTML={{ __html: details.HtmlBody }}
                                  />
                                ) : details.TextBody ? (
                                  <pre className="rounded-md border bg-background p-3 text-xs whitespace-pre-wrap font-sans">
                                    {details.TextBody}
                                  </pre>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    No body captured.
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              No details available.
                            </div>
                          )}
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          {total === 0
            ? "No messages"
            : `Showing ${pageStart + 1}–${Math.min(pageStart + perPage, total)} of ${total}`}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="h-7 px-2 text-xs"
            >
              Previous
            </Button>
            <span className="px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-7 px-2 text-xs"
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

type MarketingTemplateMeta = {
  id: string;
  name: string;
  description: string;
  tagline: string | null;
  subject: string;
};

type MarketingCampaign = {
  id: string;
  template_id: string;
  name: string;
  subject: string;
  segment: string;
  recipient_count: number;
  status: "sending" | "sent" | "partial" | "failed";
  sent_at: string;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  unsubscribed_count: number;
};

type SegmentKey = "all" | "vip" | "repeat" | "new" | "abandoned-only";

const SEGMENT_LABELS: Record<SegmentKey, string> = {
  all: "All paying customers",
  vip: "VIP (5+ orders)",
  repeat: "Repeat (2-4 orders)",
  new: "New (1 order)",
  "abandoned-only": "Cart only (never bought)",
};

const CAMPAIGN_STATUS_COLOR: Record<MarketingCampaign["status"], string> = {
  sending: "bg-sky-100 text-sky-800",
  sent: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  failed: "bg-rose-100 text-rose-800",
};

function EmailMarketingTab() {
  const router = useRouter();
  const [templates, setTemplates] = useState<MarketingTemplateMeta[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, "idle" | "sending" | "sent" | "error">>({});
  const [testError, setTestError] = useState<Record<string, string>>({});

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/emails/marketing/campaigns");
      const data = await res.json();
      if (!data.error) setCampaigns(data.campaigns as MarketingCampaign[]);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/emails/marketing/templates").then((r) => r.json()),
      fetch("/api/admin/emails/marketing/campaigns").then((r) => r.json()),
    ])
      .then(([tplData, campData]) => {
        if (tplData.error) throw new Error(tplData.error);
        setTemplates(tplData.templates as MarketingTemplateMeta[]);
        if (!campData.error) setCampaigns(campData.campaigns as MarketingCampaign[]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function sendTest(id: string) {
    setTestStatus((prev) => ({ ...prev, [id]: "sending" }));
    setTestError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/emails/marketing/${id}/send-test`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      setTestStatus((prev) => ({ ...prev, [id]: "sent" }));
      setTimeout(() => setTestStatus((prev) => ({ ...prev, [id]: "idle" })), 4000);
    } catch (err) {
      setTestStatus((prev) => ({ ...prev, [id]: "error" }));
      setTestError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Send failed",
      }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Marketing campaigns</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bulk marketing emails — sent via Postmark's <strong>Broadcast</strong> stream (separate from transactional).
          Add a campaign by asking Claude to build the template, then send it to a segment from the Customers tab.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {templates.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
          <p className="mb-3 font-medium text-foreground">No marketing templates yet.</p>
          <p>
            Ask Claude to build a campaign — e.g. &ldquo;build a Father&apos;s Day email&rdquo;.
            It&apos;ll add a template file under <code className="rounded bg-muted px-1.5 py-0.5">src/lib/email-templates/marketing/</code>, register it,
            and the card will appear here ready to preview / test / send.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const status = testStatus[t.id] ?? "idle";
            const priorSends = campaigns.filter((c) => c.template_id === t.id);
            const lastSend = priorSends[0]; // campaigns are sorted desc by sent_at
            return (
              <div key={t.id} className="rounded-xl border bg-card p-5 shadow-sm flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold tracking-tight">{t.name}</div>
                    {t.tagline && (
                      <p className="mt-0.5 text-xs italic text-muted-foreground">{t.tagline}</p>
                    )}
                    <div className="mt-2 rounded-md bg-muted/40 px-3 py-1.5 text-xs">
                      <span className="font-medium uppercase tracking-wide text-muted-foreground">Subject:</span>{" "}
                      <span className="text-foreground">{t.subject}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
                    {lastSend && (
                      <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                        <AlertCircle className="size-3.5 shrink-0 text-amber-700" />
                        <span className="text-amber-900">
                          <strong>Already sent</strong> on{" "}
                          {new Date(lastSend.sent_at).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          to {lastSend.recipient_count} customers ({lastSend.segment})
                          {priorSends.length > 1 && ` · ${priorSends.length} total sends`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <a
                    href={`/api/admin/emails/marketing/${t.id}/preview`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Preview <ExternalLink className="size-3.5" />
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => sendTest(t.id)}
                    disabled={status === "sending"}
                    className="gap-1.5"
                  >
                    {status === "sending" && <Loader2 className="size-3.5 animate-spin" />}
                    {status === "sent"
                      ? "Sent ✓"
                      : status === "sending"
                        ? "Sending..."
                        : "Send test to me"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => router.push(`/admin/emails/marketing/${t.id}/send`)}
                    className="ml-auto gap-1.5"
                  >
                    Send campaign
                  </Button>
                </div>
                {status === "error" && testError[t.id] && (
                  <p className="mt-2 text-xs text-rose-600">{testError[t.id]}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <h3 className="mt-2 text-sm font-semibold tracking-tight">Campaign history</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Snapshots of every campaign sent. Postmark stats sync via the existing event webhooks.
        </p>
      </div>
      {campaigns.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
          No campaigns sent yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Sent</th>
                <th className="px-4 py-2.5 text-left font-medium">Campaign</th>
                <th className="px-4 py-2.5 text-left font-medium">Segment</th>
                <th className="px-4 py-2.5 text-right font-medium">Recipients</th>
                <th className="px-4 py-2.5 text-right font-medium">Opens</th>
                <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((c) => {
                const cls = CAMPAIGN_STATUS_COLOR[c.status];
                return (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {new Date(c.sent_at).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{c.subject}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {SEGMENT_LABELS[c.segment as SegmentKey] ?? c.segment}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.recipient_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.opened_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.clicked_count}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmailTemplatesTab() {
  const [testStatus, setTestStatus] = useState<Record<string, "idle" | "sending" | "sent" | "error">>({});
  const [testError, setTestError] = useState<Record<string, string>>({});

  const templates = [
    {
      id: "order-confirmed",
      name: "Order confirmed",
      description: "Sent the moment Stripe payment succeeds.",
      status: "ready" as const,
      previewUrl: "/api/admin/emails/preview/order-confirmed",
      sendTestUrl: "/api/admin/emails/preview/order-confirmed/send-test",
    },
    {
      id: "order-shipped",
      name: "Order shipped",
      description: "Fires when the 3PL flips the WC order to shipped (5-min sync).",
      status: "todo" as const,
      previewUrl: null,
      sendTestUrl: null,
    },
    {
      id: "order-refunded",
      name: "Order refunded",
      description: "Fires from the Stripe webhook on a full refund (or a WC refund transition).",
      status: "todo" as const,
      previewUrl: null,
      sendTestUrl: null,
    },
    {
      id: "order-partially-refunded",
      name: "Order partially refunded",
      description: "Fires from the Stripe webhook on a partial refund (charge.refunded with amount remaining).",
      status: "todo" as const,
      previewUrl: null,
      sendTestUrl: null,
    },
    {
      id: "order-cancelled",
      name: "Order cancelled",
      description: "Fires when the WC status transitions to cancelled.",
      status: "todo" as const,
      previewUrl: null,
      sendTestUrl: null,
    },
  ];

  async function sendTest(id: string, url: string) {
    setTestStatus((prev) => ({ ...prev, [id]: "sending" }));
    setTestError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      setTestStatus((prev) => ({ ...prev, [id]: "sent" }));
      setTimeout(() => setTestStatus((prev) => ({ ...prev, [id]: "idle" })), 4000);
    } catch (err) {
      setTestStatus((prev) => ({ ...prev, [id]: "error" }));
      setTestError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Send failed",
      }));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Email templates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Branded transactional emails — sent through Postmark, styled to match the site.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => {
          const status = testStatus[t.id] ?? "idle";
          return (
            <div
              key={t.id}
              className="rounded-xl border bg-card p-5 shadow-sm flex flex-col"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold tracking-tight">{t.name}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    t.status === "ready"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t.status === "ready" ? "Ready" : "To do"}
                </span>
              </div>
              {(t.previewUrl || t.sendTestUrl) && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {t.previewUrl && (
                    <a
                      href={t.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      Preview <ExternalLink className="size-3.5" />
                    </a>
                  )}
                  {t.sendTestUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => sendTest(t.id, t.sendTestUrl!)}
                      disabled={status === "sending"}
                      className="gap-1.5"
                    >
                      {status === "sending" && <Loader2 className="size-3.5 animate-spin" />}
                      {status === "sent" ? "Sent ✓" : status === "sending" ? "Sending..." : "Send test to me"}
                    </Button>
                  )}
                </div>
              )}
              {status === "error" && testError[t.id] && (
                <p className="mt-2 text-xs text-rose-600">{testError[t.id]}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ADMIN_TABS = ["dashboard", "orders", "abandoned", "customers", "products", "inventory", "supplier-prices", "funnel", "returns", "waiting-stock", "ambassadors", "affiliates", "support", "email-logs", "email-templates", "email-marketing"] as const;
type AdminTab = (typeof ADMIN_TABS)[number];

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: AdminTab = (ADMIN_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as AdminTab)
    : "dashboard";
  const setActiveTab = useCallback((tab: AdminTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "dashboard") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.replace(qs ? `/admin?${qs}` : "/admin", { scroll: false });
  }, [router, searchParams]);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [productCount, setProductCount] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [orderSyncState, setOrderSyncState] = useState<OrderSyncState | null>(null);
  const [orderSyncing, setOrderSyncing] = useState(false);
  const [orderCount, setOrderCount] = useState<number>(0);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    imported: number;
    skipped: number;
    total: number | null;
    page: number;
  }>({ imported: 0, skipped: 0, total: null, page: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const [wcStatus, setWcStatus] = useState<"checking" | "ok" | "error">("checking");
  const [stripeStatus, setStripeStatus] = useState<"checking" | "ok" | "error">("checking");
  const [shippingZones, setShippingZones] = useState<ShippingZoneData[] | null>(null);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [pendingSupportCount, setPendingSupportCount] = useState<number>(0);

  const refreshSupportCount = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support/tickets");
      if (!res.ok) return;
      const data = (await res.json()) as SupportTicket[];
      setPendingSupportCount(data.filter((t) => t.status === "pending").length);
    } catch {
      // Silently ignore — count just won't update this cycle
    }
  }, []);

  useEffect(() => {
    refreshSupportCount();
  }, [activeTab, refreshSupportCount]);

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
    const d = londonNow();
    d.setMonth(d.getMonth() - 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [reviewsDateTo, setReviewsDateTo] = useState(() => {
    const d = londonNow();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [reviewsResults, setReviewsResults] = useState<{ productId: number; name: string; generated: number; pushed: number; failed: number; error?: string }[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  const fetchStatus = async () => {
    const syncRes = await fetch("/api/admin/sync-state");
    const syncData = await syncRes.json();
    if (syncData && !syncData.error) setSyncState(syncData as SyncState);

    const orderSyncRes = await fetch("/api/admin/order-sync-state");
    const orderSyncData = await orderSyncRes.json();
    if (orderSyncData && !orderSyncData.error)
      setOrderSyncState(orderSyncData as OrderSyncState);

    const { count } = await supabase.from("products").select("*", { count: "exact", head: true });
    setProductCount(count || 0);

    const { count: oCount } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .not("wc_order_id", "is", null);
    setOrderCount(oCount || 0);

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

  // Poll order_sync_state while order sync is running
  useEffect(() => {
    if (!orderSyncing) return;
    const interval = setInterval(async () => {
      const res = await fetch("/api/admin/order-sync-state");
      const data = await res.json();
      if (data && !data.error) {
        setOrderSyncState(data as OrderSyncState);
        if (data.status !== "syncing") {
          setOrderSyncing(false);
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [orderSyncing]);

  const handleOrderSync = async () => {
    setOrderSyncing(true);
    fetch("/api/admin/sync-orders-now", { method: "POST" });
  };

  const handleOrderFullResync = async () => {
    setOrderSyncing(true);
    await fetch("/api/admin/order-sync-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_synced_at: null }),
    });
    fetch("/api/admin/sync-orders-now", { method: "POST" });
  };

  const orderSyncDisplayStatus = orderSyncState?.status === "syncing"
    ? "syncing"
    : orderSyncState?.status === "error"
      ? "error"
      : "ok";

  const handleImportFromWC = async () => {
    if (importing) return;
    if (!confirm("Import all historical orders from WooCommerce? This is a one-off and may take ~90s.")) return;
    setImporting(true);
    setImportError(null);
    setImportProgress({ imported: 0, skipped: 0, total: null, page: 0 });
    let page = 1;
    let cumImported = 0;
    let cumSkipped = 0;
    let total: number | null = null;
    try {
      while (true) {
        const res = await fetch(`/api/admin/orders/import-from-wc?page=${page}`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `Failed at page ${page} (${res.status})`);
        }
        const data = (await res.json()) as {
          imported: number;
          skipped: number;
          has_more: boolean;
          total_estimate: number | null;
        };
        cumImported += data.imported;
        cumSkipped += data.skipped;
        if (total === null && data.total_estimate) total = data.total_estimate;
        setImportProgress({ imported: cumImported, skipped: cumSkipped, total, page });
        if (!data.has_more) break;
        page++;
      }
      // Refresh the orders count + sync state so the dashboard reflects reality
      await fetchStatus();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
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
    <div className="mx-auto max-w-7xl px-4 pb-8 pt-6">
      <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <AdminSidebar
          activeTab={activeTab}
          onChange={setActiveTab}
          pendingSupportCount={pendingSupportCount}
        />

        <main className="min-w-0 space-y-8">

      {activeTab === "orders" && <OrdersTab />}
      {activeTab === "abandoned" && <AbandonedTab />}
      {activeTab === "customers" && <CustomersTab />}
      {activeTab === "products" && <ProductsTab />}
      {activeTab === "inventory" && <InventoryTab />}
      {activeTab === "supplier-prices" && <SupplierPricesTab />}
      {activeTab === "funnel" && <FunnelTab />}
      {activeTab === "returns" && <ReturnsTab />}
      {activeTab === "waiting-stock" && <WaitingStockTab />}
      {activeTab === "ambassadors" && <AmbassadorsTab />}
      {activeTab === "affiliates" && <AffiliatesTab />}
      {activeTab === "support" && <SupportTab onTicketsChanged={refreshSupportCount} />}
      {activeTab === "email-logs" && <EmailLogsTab />}
      {activeTab === "email-templates" && <EmailTemplatesTab />}
      {activeTab === "email-marketing" && <EmailMarketingTab />}

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

      {/* Order Sync */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <ShoppingBag className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Order Sync</h3>
              <p className="text-xs text-muted-foreground">
                {orderSyncState?.status === "syncing"
                  ? "Sync in progress..."
                  : "WooCommerce order statuses to Supabase"}
              </p>
            </div>
          </div>
          <StatusDot status={orderSyncDisplayStatus} />
        </div>

        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          <StatBox
            icon={<ShoppingBag className="size-3.5" />}
            label="Orders"
            value={orderCount}
          />
          <StatBox
            icon={<ArrowDownToLine className="size-3.5" />}
            label="Last sync count"
            value={orderSyncState?.orders_synced || 0}
          />
          <StatBox
            icon={<RefreshCw className="size-3.5" />}
            label="Status changes"
            value={orderSyncState?.orders_with_status_change || 0}
          />
          <StatBox
            icon={<Clock className="size-3.5" />}
            label="Last synced"
            value={orderSyncState?.last_synced_at ? timeAgo(orderSyncState.last_synced_at) : "Never"}
          />
        </div>

        {orderSyncing && orderSyncState?.status === "syncing" && (
          <div className="mx-6 mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {orderSyncState.sync_phase === "fetching"
                  ? "Fetching orders from WooCommerce..."
                  : orderSyncState.sync_phase === "writing"
                    ? "Writing status changes..."
                    : "Syncing..."}
              </span>
              <span className="tabular-nums font-medium">
                {orderSyncState.orders_synced} processed
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-500 animate-pulse"
                style={{ width: orderSyncState.sync_phase === "writing" ? "85%" : "40%" }}
              />
            </div>
          </div>
        )}

        {orderSyncState?.errors && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {orderSyncState.errors}
          </div>
        )}

        {importing && (
          <div className="mx-6 mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Importing legacy WC orders... page {importProgress.page}
              </span>
              <span className="tabular-nums font-medium">
                {importProgress.imported} imported · {importProgress.skipped} skipped
                {importProgress.total ? ` of ${importProgress.total}` : ""}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{
                  width: importProgress.total
                    ? `${Math.min(100, ((importProgress.imported + importProgress.skipped) / importProgress.total) * 100)}%`
                    : "10%",
                }}
              />
            </div>
          </div>
        )}

        {importError && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {importError}
          </div>
        )}

        <div className="flex flex-wrap gap-2 px-6 py-4">
          <Button
            onClick={handleOrderSync}
            disabled={orderSyncing || importing}
            className="bg-sky-500 text-white hover:bg-sky-600"
          >
            {orderSyncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {orderSyncing ? "Syncing..." : "Sync Now"}
          </Button>
          <Button
            variant="outline"
            onClick={handleOrderFullResync}
            disabled={orderSyncing || importing}
          >
            Full Re-sync
          </Button>
          <Button
            variant="outline"
            onClick={handleImportFromWC}
            disabled={orderSyncing || importing}
            className="ml-auto"
          >
            {importing ? <Loader2 className="size-4 animate-spin" /> : null}
            {importing ? "Importing..." : "Import legacy WC orders"}
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
        </main>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  );
}
