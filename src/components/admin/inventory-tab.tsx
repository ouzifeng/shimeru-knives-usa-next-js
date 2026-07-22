"use client";

import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SkuStatus = "ok" | "warning" | "critical" | "out_of_stock" | "insufficient_data";

interface SkuRow {
  sku: string;
  productName: string;
  slug: string;
  imageUrl: string | null;
  stockQty: number;
  velocityUsed: number;
  velocity7d: number;
  velocity30d: number;
  units30d: number;
  units90d: number;
  incomingQty: number;
  daysRemaining: number | null;
  recommendedOrderQty: number;
  reorderPoint: number;
  status: SkuStatus;
}

interface PendingPO {
  id: number;
  reference: string;
  status: string;
  expected_arrival: string | null;
  shipped_date: string | null;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
}

interface InventoryData {
  skus: SkuRow[];
  generatedAt: string;
  totalSkus: number;
  criticalCount: number;
  warningCount: number;
  insufficientDataCount: number;
  pendingPOs: PendingPO[];
}

interface POLine {
  id: number;
  sku: string;
  product_name: string;
  recommended_qty: number;
  final_qty: number;
}

interface PODetail {
  id: number;
  reference: string;
  status: string;
  expected_arrival: string | null;
  shipped_date: string | null;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  notes: string | null;
  created_at: string;
  purchase_order_lines: POLine[];
}

interface POListItem {
  id: number;
  reference: string;
  status: string;
  expected_arrival: string | null;
  shipped_date: string | null;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
  totalUnits: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportPOCsv(
  reference: string,
  lines: Array<{ sku: string; product_name: string; final_qty: number }>
) {
  const header = "SKU,Product,Quantity\n";
  const rows = lines.map((l) => `${l.sku},"${l.product_name}",${l.final_qty}`).join("\n");
  const total = lines.reduce((sum, l) => sum + l.final_qty, 0);
  const csv = header + rows + `\n\nTotal,,${total}`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${reference}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Mintsoft ASN format — their importer requires the FULL template header row
// even when most columns are blank. Only SKU / Quantity / Name are populated;
// the rest can be edited inside Mintsoft after upload.
const MINTSOFT_ASN_HEADER =
  "SKU,Quantity,Name,EANBarcode,UPCBarcode,WeightInKG,Height,Length,Depth,DefaultLocation,CommodityCode,CountryOfManufacture,CustomsDescription,SSCCNumber";

async function downloadMintsoftAsn(poId: number, reference: string) {
  const res = await fetch(`/api/admin/inventory/purchase-orders/${poId}`);
  if (!res.ok) {
    alert("Failed to load PO lines for ASN export.");
    return;
  }
  const detail = (await res.json()) as PODetail;
  const totalCols = MINTSOFT_ASN_HEADER.split(",").length; // 14
  const blanks = ",".repeat(totalCols - 3); // pad SKU/Qty/Name out to full width

  // Mintsoft dedupes by SKU on import — pre-merge here so the CSV row count
  // matches what actually lands in Mintsoft.
  const merged = new Map<string, { sku: string; product_name: string; final_qty: number }>();
  for (const l of detail.purchase_order_lines) {
    const existing = merged.get(l.sku);
    if (existing) {
      existing.final_qty += l.final_qty;
    } else {
      merged.set(l.sku, { sku: l.sku, product_name: l.product_name, final_qty: l.final_qty });
    }
  }

  const rows = Array.from(merged.values())
    .map((l) => `${csvField(l.sku)},${l.final_qty},${csvField(l.product_name)}${blanks}`)
    .join("\n");
  const csv = MINTSOFT_ASN_HEADER + "\n" + rows + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${reference}-mintsoft-asn.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function POStatusBadge({ status }: { status: string }) {
  const config: Record<string, { dot: string; label: string }> = {
    draft: { dot: "bg-slate-400", label: "Draft" },
    created: { dot: "bg-blue-500", label: "Created" },
    shipped: { dot: "bg-amber-500", label: "Shipped" },
    arrived: { dot: "bg-emerald-500", label: "Arrived" },
    cancelled: { dot: "bg-red-600", label: "Cancelled" },
  };
  const { dot, label } = config[status] ?? { dot: "bg-slate-400", label: status };
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ─── Best Sellers Table ────────────────────────────────────────────────────────

type SortKey = "units90d" | "units30d";

function BestSellersTable({ skus }: { skus: SkuRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("units90d");

  // Show ALL products, ranked by the chosen window (the other window breaks ties).
  const other: SortKey = sortKey === "units90d" ? "units30d" : "units90d";
  const ranked = [...skus].sort((a, b) => b[sortKey] - a[sortKey] || b[other] - a[other]);

  const SortHeader = ({ col, label }: { col: SortKey; label: string }) => (
    <th className="px-4 py-2 text-right text-xs font-medium">
      <button
        onClick={() => setSortKey(col)}
        className={`inline-flex items-center gap-1 transition-colors ${
          sortKey === col ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        <span className="text-[10px]">{sortKey === col ? "▼" : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Every product ({ranked.length}), ranked by units sold. Click 90d or 30d to sort.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">#</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground"></th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">SKU</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Product</th>
              <SortHeader col="units90d" label="90d Sales" />
              <SortHeader col="units30d" label="30d Sales" />
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Stock</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Incoming</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Stock + Inc.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ranked.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No products found.
                </td>
              </tr>
            )}
            {ranked.map((row, i) => {
              const total = row.stockQty + row.incomingQty;
              // Flag rows where current stock is empty and nothing is inbound.
              const dry = row.stockQty <= 0 && row.incomingQty <= 0;
              // Running low: 90d sales outpace everything on hand plus inbound.
              const runningLow = !dry && row.units90d > total;
              const href = row.slug ? `/product/${row.slug}` : null;
              const thumb = row.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.imageUrl}
                  alt={row.productName}
                  className="size-9 rounded object-cover bg-muted"
                  loading="lazy"
                />
              ) : (
                <div className="size-9 rounded bg-muted" />
              );
              return (
                <tr
                  key={row.sku}
                  className={
                    dry
                      ? "bg-red-50 dark:bg-red-950/30"
                      : runningLow
                        ? "bg-orange-50 dark:bg-orange-950/30"
                        : ""
                  }
                >
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {thumb}
                      </a>
                    ) : (
                      thumb
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs tabular-nums">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
                        {row.sku}
                      </a>
                    ) : (
                      row.sku
                    )}
                  </td>
                  <td className="px-4 py-2 max-w-[220px] truncate">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline underline-offset-2">
                        {row.productName}
                      </a>
                    ) : (
                      row.productName
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{row.units90d}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.units30d}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${row.stockQty <= 0 ? "font-medium text-red-600" : ""}`}>
                    {row.stockQty}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.incomingQty > 0 ? row.incomingQty : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── PO Detail ────────────────────────────────────────────────────────────────

function PODetailPanel({
  poId,
  onClose,
  onUpdated,
}: {
  poId: number;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<PODetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shippedDate, setShippedDate] = useState("");
  const [trackingCarrier, setTrackingCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [expectedArrival, setExpectedArrival] = useState("");
  // qty edits: map of line id -> value
  const [qtyEdits, setQtyEdits] = useState<Record<number, number>>({});

  const fetchDetail = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/inventory/purchase-orders/${poId}`)
      .then((r) => r.json())
      .then((d) => {
        setDetail(d);
        // Initialise qty edits
        if (d.purchase_order_lines) {
          const initial: Record<number, number> = {};
          d.purchase_order_lines.forEach((l: POLine) => {
            initial[l.id] = l.final_qty;
          });
          setQtyEdits(initial);
        }
        if (d.shipped_date) setShippedDate(d.shipped_date.slice(0, 10));
        if (d.tracking_carrier) setTrackingCarrier(d.tracking_carrier);
        if (d.tracking_number) setTrackingNumber(d.tracking_number);
        if (d.tracking_url) setTrackingUrl(d.tracking_url);
        if (d.expected_arrival) setExpectedArrival(d.expected_arrival.slice(0, 10));
        else setExpectedArrival("");
      })
      .catch(() => setError("Failed to load PO details."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  const updateStatus = async (newStatus: string) => {
    if (!detail) return;
    setUpdating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { status: newStatus };
      if (newStatus === "shipped") {
        if (!shippedDate) {
          setError("Shipped date is required.");
          setUpdating(false);
          return;
        }
        body.shipped_date = shippedDate;
        if (trackingCarrier) body.tracking_carrier = trackingCarrier;
        if (trackingNumber) body.tracking_number = trackingNumber;
        if (trackingUrl) body.tracking_url = trackingUrl;
        // expected_arrival is auto-calculated server-side as shipped_date + 30 days
      }
      // Save qty edits if draft
      if (detail.status === "draft") {
        body.lines = detail.purchase_order_lines.map((l) => ({
          id: l.id,
          final_qty: qtyEdits[l.id] ?? l.final_qty,
        }));
      }
      const res = await fetch(`/api/admin/inventory/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      fetchDetail();
      onUpdated();
    } catch {
      setError("Failed to update PO.");
    } finally {
      setUpdating(false);
    }
  };

  const saveExpectedArrival = async () => {
    if (!detail || !expectedArrival) return;
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventory/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_arrival: expectedArrival }),
      });
      if (!res.ok) throw new Error("Save failed");
      fetchDetail();
      onUpdated();
    } catch {
      setError("Failed to update arrival date.");
    } finally {
      setUpdating(false);
    }
  };

  const saveQtyEdits = async () => {
    if (!detail) return;
    setUpdating(true);
    setError(null);
    try {
      const body = {
        lines: detail.purchase_order_lines.map((l) => ({
          id: l.id,
          final_qty: qtyEdits[l.id] ?? l.final_qty,
        })),
      };
      const res = await fetch(`/api/admin/inventory/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      fetchDetail();
    } catch {
      setError("Failed to save quantities.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <tr>
        <td colSpan={7} className="px-4 py-6 text-center">
          <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
        </td>
      </tr>
    );
  }

  if (!detail) {
    return (
      <tr>
        <td colSpan={7} className="px-4 py-4 text-center text-sm text-muted-foreground">
          {error ?? "PO not found."}
        </td>
      </tr>
    );
  }

  const isDraft = detail.status === "draft";
  const isCreated = detail.status === "created";
  const isShipped = detail.status === "shipped";

  return (
    <tr>
      <td colSpan={7} className="bg-muted/30 px-4 py-4">
        <div className="space-y-4">
          {/* Line items */}
          <div className="overflow-x-auto rounded border bg-background">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">SKU</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Product</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Rec. Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                    {isDraft ? "Final Qty (editable)" : "Final Qty"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.purchase_order_lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">{line.sku}</td>
                    <td className="px-3 py-2 max-w-[180px] truncate">{line.product_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{line.recommended_qty}</td>
                    <td className="px-3 py-2 text-right">
                      {isDraft ? (
                        <Input
                          type="number"
                          min={0}
                          value={qtyEdits[line.id] ?? line.final_qty}
                          onChange={(e) =>
                            setQtyEdits((prev) => ({
                              ...prev,
                              [line.id]: Number(e.target.value),
                            }))
                          }
                          className="ml-auto h-7 w-20 text-right tabular-nums"
                        />
                      ) : (
                        <span className="tabular-nums">{line.final_qty}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {isDraft && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveQtyEdits}
                  disabled={updating}
                >
                  {updating ? <Loader2 className="size-4 animate-spin" /> : "Save Quantities"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => updateStatus("created")}
                  disabled={updating}
                >
                  {updating ? <Loader2 className="size-4 animate-spin" /> : "Mark Created"}
                </Button>
              </>
            )}

            {isCreated && (
              <div className="grid w-full gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Shipped date
                  <Input
                    type="date"
                    value={shippedDate}
                    onChange={(e) => setShippedDate(e.target.value)}
                    className="h-8"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Carrier
                  <Input
                    type="text"
                    placeholder="e.g. DPD"
                    value={trackingCarrier}
                    onChange={(e) => setTrackingCarrier(e.target.value)}
                    className="h-8"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Tracking number
                  <Input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    className="h-8"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Tracking URL
                  <Input
                    type="url"
                    placeholder="https://…"
                    value={trackingUrl}
                    onChange={(e) => setTrackingUrl(e.target.value)}
                    className="h-8"
                  />
                </label>
                <div className="sm:col-span-2">
                  <Button
                    size="sm"
                    onClick={() => updateStatus("shipped")}
                    disabled={updating}
                  >
                    {updating ? <Loader2 className="size-4 animate-spin" /> : "Mark Shipped"}
                  </Button>
                  <span className="ml-3 text-xs text-muted-foreground">
                    ETA auto-set to shipped date + 30 days.
                  </span>
                </div>
              </div>
            )}

            {isShipped && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Expected arrival
                  <Input
                    type="date"
                    value={expectedArrival}
                    onChange={(e) => setExpectedArrival(e.target.value)}
                    className="h-8"
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveExpectedArrival}
                  disabled={
                    updating ||
                    !expectedArrival ||
                    expectedArrival === (detail.expected_arrival?.slice(0, 10) ?? "")
                  }
                >
                  {updating ? <Loader2 className="size-4 animate-spin" /> : "Save ETA"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => updateStatus("arrived")}
                  disabled={updating}
                >
                  {updating ? <Loader2 className="size-4 animate-spin" /> : "Mark Arrived"}
                </Button>
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportPOCsv(
                  detail.reference,
                  detail.purchase_order_lines.map((l) => ({
                    sku: l.sku,
                    product_name: l.product_name,
                    final_qty: isDraft ? (qtyEdits[l.id] ?? l.final_qty) : l.final_qty,
                  }))
                )
              }
            >
              Export CSV
            </Button>

            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </td>
    </tr>
  );
}

// ─── Purchase Orders Section ───────────────────────────────────────────────────

function PurchaseOrdersSection({ initialPOs }: { initialPOs: PendingPO[] }) {
  const [pos, setPOs] = useState<POListItem[]>([]);
  const [loadingPOs, setLoadingPOs] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchPOs = () => {
    setLoadingPOs(true);
    fetch("/api/admin/inventory/purchase-orders")
      .then((r) => r.json())
      .then((data) => setPOs(Array.isArray(data) ? data : data.purchaseOrders ?? []))
      .catch(() => {})
      .finally(() => setLoadingPOs(false));
  };

  useEffect(() => {
    fetchPOs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge initial pending POs if PO list is empty (fallback)
  const displayPOs: POListItem[] = pos.length > 0
    ? pos
    : initialPOs.map((p) => ({ ...p, totalUnits: 0 }));

  const generatePO = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/admin/inventory/generate-po", { method: "POST" });
      if (!res.ok) throw new Error("Generation failed");
      fetchPOs();
    } catch {
      setGenerateError("Failed to generate PO. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Purchase Orders</h2>
        <Button size="sm" onClick={generatePO} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Generating…
            </>
          ) : (
            "Generate Monthly PO"
          )}
        </Button>
      </div>

      {generateError && (
        <p className="text-xs text-red-600">{generateError}</p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Reference</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Units</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Expected Arrival</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tracking</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Created</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">ASN</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loadingPOs && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </td>
              </tr>
            )}
            {!loadingPOs && displayPOs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No purchase orders yet.
                </td>
              </tr>
            )}
            {!loadingPOs &&
              displayPOs.map((po) => (
                <Fragment key={po.id}>
                  <tr
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => toggleExpand(po.id)}
                  >
                    <td className="px-4 py-2 font-mono text-xs tabular-nums">{po.reference}</td>
                    <td className="px-4 py-2">
                      <POStatusBadge status={po.status} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{po.totalUnits}</td>
                    <td className="px-4 py-2">{formatDate(po.expected_arrival)}</td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      {po.tracking_number ? (
                        po.tracking_url ? (
                          <a
                            href={po.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                          >
                            {po.tracking_carrier ? `${po.tracking_carrier} ` : ""}
                            {po.tracking_number}
                          </a>
                        ) : (
                          <span className="font-mono text-xs">
                            {po.tracking_carrier ? `${po.tracking_carrier} ` : ""}
                            {po.tracking_number}
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{formatDate(po.created_at)}</td>
                    <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => downloadMintsoftAsn(po.id, po.reference)}
                      >
                        Mintsoft CSV
                      </Button>
                    </td>
                  </tr>
                  {expandedId === po.id && (
                    <PODetailPanel
                      key={`detail-${po.id}`}
                      poId={po.id}
                      onClose={() => setExpandedId(null)}
                      onUpdated={fetchPOs}
                    />
                  )}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function InventoryTab() {
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/inventory")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Failed to load inventory data.
      </div>
    );
  }

  const okCount = data.skus.filter((s) => s.status === "ok" || s.status === "insufficient_data").length;
  const outOfStockCount = data.skus.filter((s) => s.status === "out_of_stock").length;

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-card px-5 py-4 rounded-lg border">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium">Healthy</span>
          </div>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums">{okCount}</p>
        </div>

        <div className="bg-card px-5 py-4 rounded-lg border">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full bg-amber-500" />
            <span className="text-xs font-medium">Warning</span>
          </div>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums">{data.warningCount}</p>
        </div>

        <div className="bg-card px-5 py-4 rounded-lg border">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full bg-orange-500" />
            <span className="text-xs font-medium">Critical</span>
          </div>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums">{data.criticalCount}</p>
        </div>

        <div className="bg-card px-5 py-4 rounded-lg border">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full bg-red-600" />
            <span className="text-xs font-medium">Out of Stock</span>
          </div>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums">{outOfStockCount}</p>
        </div>
      </div>

      {/* Best Sellers */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Best Sellers</h2>
        <BestSellersTable skus={data.skus} />
      </div>

      {/* Purchase Orders */}
      <PurchaseOrdersSection initialPOs={data.pendingPOs} />
    </div>
  );
}
