"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { storeConfig } from "../../../store.config";

interface SupplierPriceRow {
  id: number;
  sku: string;
  product_name: string | null;
  supplier: string;
  tier1_min: number;
  tier1_max: number | null;
  tier1_unit_usd: number | null;
  tier2_min: number | null;
  tier2_max: number | null;
  tier2_unit_usd: number | null;
  tier3_min: number | null;
  tier3_unit_usd: number | null;
  box_type: string | null;
  box_price_usd: number | null;
  notes: string | null;
  image_url: string | null;
}

const BOX_LABELS: Record<string, string> = {
  single_knife: "Single knife",
  cleaver: "Cleaver box",
  steak_4pc: "4pc steak (magnetic)",
  eva_8pc: "8pc EVA",
  eva_5pc: "5pc EVA",
  eva_7pc: "7pc EVA",
  eva_10pc: "10pc EVA",
  wood_box: "Wood box",
  none: "—",
};

const IS_GBP = storeConfig.currency === "GBP";
const SYMBOL = storeConfig.currencySymbol;

function fmtPrice(usd: number | null | undefined, fx: number): string {
  if (usd == null) return "—";
  const v = IS_GBP ? usd * fx : usd;
  return `${SYMBOL}${v.toFixed(2)}`;
}

export function SupplierPricesTab() {
  const [rows, setRows] = useState<SupplierPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");

  const [fx, setFx] = useState<number>(0.79);
  const [fxInput, setFxInput] = useState<string>("0.79");
  const [savingFx, setSavingFx] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/supplier-prices");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setRows((data.rows ?? []) as SupplierPriceRow[]);
        if (data.fx != null) {
          setFx(Number(data.fx));
          setFxInput(String(data.fx));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveFx() {
    const n = Number(fxInput);
    if (!isFinite(n) || n <= 0) {
      setError("FX rate must be a positive number");
      return;
    }
    setSavingFx(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/supplier-prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usd_to_gbp: n }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setFx(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingFx(false);
    }
  }

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.supplier);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (supplierFilter !== "all" && r.supplier !== supplierFilter) return false;
      if (!q) return true;
      return (
        r.sku.toLowerCase().includes(q) ||
        (r.product_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, supplierFilter]);

  return (
    <div className="space-y-6">
      {/* Header / FX rate (GBP build only) */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Supplier Prices</h2>
          <p className="text-sm text-muted-foreground">
            EXW unit prices by tier, plus the gift-box price each SKU ships in.
            All-in prices include the box.
          </p>
        </div>
        {IS_GBP && (
          <div className="flex items-end gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">USD → GBP</label>
              <Input
                value={fxInput}
                onChange={(e) => setFxInput(e.target.value)}
                className="w-24"
              />
            </div>
            <Button onClick={saveFx} disabled={savingFx} variant="outline" size="sm">
              {savingFx ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search SKU or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {rows.length} SKUs
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border max-h-[75vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-16">Image</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">SKU</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Box</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Tier 1 (1–49)</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Tier 2 (50–200)</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Tier 3 (200+)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No supplier prices yet. Run the import script to populate.
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const box = r.box_price_usd ?? 0;
                const t1 = r.tier1_unit_usd != null ? r.tier1_unit_usd + box : null;
                const t2 = r.tier2_unit_usd != null ? r.tier2_unit_usd + box : null;
                const t3 = r.tier3_unit_usd != null ? r.tier3_unit_usd + box : null;
                const t1u = r.tier1_unit_usd != null ? Number(r.tier1_unit_usd) : null;
                const t2u = r.tier2_unit_usd != null ? Number(r.tier2_unit_usd) : null;
                const t3u = r.tier3_unit_usd != null ? Number(r.tier3_unit_usd) : null;
                const tierCell = (allIn: number | null, unit: number | null) => (
                  <div className="flex flex-col items-end leading-tight">
                    <span>{fmtPrice(allIn, fx)}</span>
                    {unit != null && box > 0 ? (
                      <span className="text-[10px] text-muted-foreground">
                        ex box {fmtPrice(unit, fx)}
                      </span>
                    ) : null}
                  </div>
                );
                return (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-2 py-2">
                      {r.image_url ? (
                        <Image
                          src={r.image_url}
                          alt={r.product_name ?? r.sku}
                          width={48}
                          height={48}
                          className="size-12 rounded-md object-cover bg-muted"
                          unoptimized
                        />
                      ) : (
                        <div className="size-12 rounded-md bg-muted" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">{r.sku}</td>
                    <td className="px-3 py-2 max-w-[260px] truncate" title={r.product_name ?? ""}>
                      {r.product_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-col">
                        <span>{r.box_type ? (BOX_LABELS[r.box_type] ?? r.box_type) : "—"}</span>
                        {r.box_price_usd ? (
                          <span className="text-muted-foreground">
                            {fmtPrice(r.box_price_usd, fx)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{tierCell(t1, t1u)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{tierCell(t2, t2u)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{tierCell(t3, t3u)}</td>
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
