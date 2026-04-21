/**
 * Inventory health, velocity calculation, and PO draft generation.
 *
 * Business rules:
 *  - Inventory unit = simple product SKU OR variation SKU (variable parent rows are ignored)
 *  - Excluded: product ID 10969 (Yoshii — sourced separately), accessories (sharpeners etc)
 *  - Velocity: dual-window — use the HIGHER of 7-day and 30-day rolling daily averages
 *  - Coverage target: 60 days (40-day lead time + 20-day safety buffer)
 *  - Warning: <45 days remaining. Critical: <30 days
 *  - Insufficient data flag: <7 days of order history for that SKU
 *  - Incoming stock = sum of final_qty on PO lines whose PO status is 'sent' or 'shipped'
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StockStatus = "ok" | "warning" | "critical" | "out_of_stock" | "insufficient_data";

export interface SkuHealth {
  sku: string;
  productName: string;
  productId: number;
  variationId: number | null;
  /** Current on-hand stock (from products / product_variations table) */
  stockQty: number;
  /** Daily units sold — higher of 7-day and 30-day rolling averages */
  velocityUsed: number;
  /** 7-day rolling daily average */
  velocity7d: number;
  /** 30-day rolling daily average */
  velocity30d: number;
  /** Units expected from sent/shipped POs */
  incomingQty: number;
  /** Days of cover remaining = (stockQty + incomingQty) / velocityUsed */
  daysRemaining: number | null;
  /** Units to order to reach 60-day cover target */
  recommendedOrderQty: number;
  /** Reorder point in units = velocityUsed × 45 (warning threshold) */
  reorderPoint: number;
  status: StockStatus;
}

export interface InventorySummary {
  skus: SkuHealth[];
  generatedAt: string;
  totalSkus: number;
  criticalCount: number;
  warningCount: number;
  insufficientDataCount: number;
}

export interface GeneratedPO {
  reference: string;
  lines: Array<{
    sku: string;
    productName: string;
    recommendedQty: number;
    currentStock: number;
    daysRemaining: number | null;
    status: StockStatus;
  }>;
  totalLines: number;
  createdAt: string;
  /** Supabase row id of the newly-inserted draft PO, if persisted */
  poId?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXCLUDED_PRODUCT_IDS = new Set([10969]);
const EXCLUDED_NAME_PATTERNS = [/sharpener/i, /sharpening/i, /strop/i, /accessory/i, /accessories/i, /whetstone/i, /cutting board/i, /knife roll/i, /knife bag/i, /magnetic.*strip/i, /knife stand/i, /knife holder/i];
const COVERAGE_TARGET_DAYS = 60;
const WARNING_THRESHOLD_DAYS = 45;
const CRITICAL_THRESHOLD_DAYS = 30;
const INSUFFICIENT_DATA_DAYS = 7; // min order history required

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawSku {
  sku: string;
  productName: string;
  productId: number;
  variationId: number | null;
  stockQty: number;
}

/** Build a flat list of all trackable SKUs from products + variations. */
async function resolveSkus(sb: SupabaseClient): Promise<RawSku[]> {
  // Fetch all products (simple + variable parents) that are published
  const { data: products, error: pErr } = await sb
    .from("products")
    .select("id, name, sku, type, stock_quantity, stock_status, status");

  if (pErr) throw new Error(`resolveSkus/products: ${pErr.message}`);

  // Fetch all variations
  const { data: variations, error: vErr } = await sb
    .from("product_variations")
    .select("id, product_id, sku, stock_quantity, stock_status");

  if (vErr) throw new Error(`resolveSkus/variations: ${vErr.message}`);

  const skus: RawSku[] = [];

  for (const p of products ?? []) {
    // Skip excluded product IDs
    if (EXCLUDED_PRODUCT_IDS.has(p.id)) continue;

    // Skip accessories by name pattern
    if (EXCLUDED_NAME_PATTERNS.some((re) => re.test(p.name))) continue;

    // Skip non-published
    if (p.status !== "publish") continue;

    if (p.type === "simple") {
      // Simple products are their own inventory unit
      if (!p.sku) continue; // no SKU = can't track
      skus.push({
        sku: p.sku,
        productName: p.name,
        productId: p.id,
        variationId: null,
        stockQty: p.stock_quantity ?? 0,
      });
    }
    // variable parent rows are intentionally skipped — tracked via variations below
  }

  const variableProductIds = new Set(
    (products ?? []).filter((p) => p.type === "variable").map((p) => p.id)
  );

  for (const v of variations ?? []) {
    // Only include variations belonging to non-excluded, published variable products
    if (!variableProductIds.has(v.product_id)) continue;
    if (EXCLUDED_PRODUCT_IDS.has(v.product_id)) continue;
    if (!v.sku) continue;

    // Find parent name
    const parent = (products ?? []).find((p) => p.id === v.product_id);
    if (!parent || parent.status !== "publish") continue;
    if (EXCLUDED_NAME_PATTERNS.some((re) => re.test(parent.name))) continue;

    skus.push({
      sku: v.sku,
      productName: parent.name,
      productId: v.product_id,
      variationId: v.id,
      stockQty: v.stock_quantity ?? 0,
    });
  }

  return skus;
}

interface LineItem {
  pid: number;
  qty: number;
  vid?: number;
  price?: number;
}

interface VelocityResult {
  sku: string;
  velocity7d: number;
  velocity30d: number;
  firstSaleDate: string | null;
}

/**
 * Calculate dual-window velocity (7-day and 30-day rolling daily averages).
 * Fetches all completed orders in the last 30 days and aggregates by SKU.
 */
async function calculateVelocities(
  sb: SupabaseClient,
  skus: RawSku[]
): Promise<Map<string, VelocityResult>> {
  const now = new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // We only care about completed/processing orders (not cancelled, refunded, etc.)
  const completedStatuses = ["completed", "processing"];

  const { data: orders, error } = await sb
    .from("orders")
    .select("line_items, created_at, status")
    .in("status", completedStatuses)
    .gte("created_at", cutoff30d);

  if (error) throw new Error(`calculateVelocities: ${error.message}`);

  // Build lookup maps for fast resolution: productId → sku, variationId → sku
  const pidToSku = new Map<number, string>();
  const vidToSku = new Map<number, string>();
  for (const s of skus) {
    pidToSku.set(s.productId, s.sku);
    if (s.variationId !== null) {
      vidToSku.set(s.variationId, s.sku);
    }
  }

  // For simple products (no variationId in the line item), we need pid → sku
  // For variations, vid takes priority

  // Accumulators: sku → qty sold per window
  const qty30d = new Map<string, number>();
  const qty7d = new Map<string, number>();
  // Earliest sale date per SKU (for insufficient data check)
  const firstSale = new Map<string, string>();

  for (const order of orders ?? []) {
    const lineItems: LineItem[] = Array.isArray(order.line_items) ? order.line_items : [];
    const orderDate: string = order.created_at;
    const inLast7d = orderDate >= cutoff7d;

    for (const item of lineItems) {
      let sku: string | undefined;

      // Prefer variation lookup
      if (item.vid) {
        sku = vidToSku.get(item.vid);
      }
      // Fall back to product lookup (simple products)
      if (!sku && item.pid) {
        sku = pidToSku.get(item.pid);
      }

      if (!sku) continue;

      const qty = item.qty ?? 0;
      qty30d.set(sku, (qty30d.get(sku) ?? 0) + qty);
      if (inLast7d) {
        qty7d.set(sku, (qty7d.get(sku) ?? 0) + qty);
      }

      // Track earliest sale date
      const existing = firstSale.get(sku);
      if (!existing || orderDate < existing) {
        firstSale.set(sku, orderDate);
      }
    }
  }

  // We also need earliest sale date beyond 30d for the "insufficient data" check.
  // Fetch the very first order for each SKU if the earliest we found is within 30d.
  // To keep it simple: fetch all orders older than 30d to find any sales at all.
  const { data: oldOrders } = await sb
    .from("orders")
    .select("line_items, created_at, status")
    .in("status", completedStatuses)
    .lt("created_at", cutoff30d)
    .order("created_at", { ascending: true })
    .limit(1000);

  for (const order of oldOrders ?? []) {
    const lineItems: LineItem[] = Array.isArray(order.line_items) ? order.line_items : [];
    const orderDate: string = order.created_at;
    for (const item of lineItems) {
      let sku: string | undefined;
      if (item.vid) sku = vidToSku.get(item.vid);
      if (!sku && item.pid) sku = pidToSku.get(item.pid);
      if (!sku) continue;

      const existing = firstSale.get(sku);
      if (!existing || orderDate < existing) {
        firstSale.set(sku, orderDate);
      }
    }
  }

  const result = new Map<string, VelocityResult>();

  for (const s of skus) {
    const sold30 = qty30d.get(s.sku) ?? 0;
    const sold7 = qty7d.get(s.sku) ?? 0;
    result.set(s.sku, {
      sku: s.sku,
      velocity7d: sold7 / 7,
      velocity30d: sold30 / 30,
      firstSaleDate: firstSale.get(s.sku) ?? null,
    });
  }

  return result;
}

/** Sum final_qty from PO lines where the PO is in 'sent' or 'shipped' status. */
async function getIncomingStock(sb: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await sb
    .from("purchase_order_lines")
    .select("sku, final_qty, purchase_orders!inner(status)")
    .in("purchase_orders.status", ["sent", "shipped"]);

  if (error) throw new Error(`getIncomingStock: ${error.message}`);

  const incoming = new Map<string, number>();
  for (const row of data ?? []) {
    const qty = row.final_qty ?? 0;
    incoming.set(row.sku, (incoming.get(row.sku) ?? 0) + qty);
  }
  return incoming;
}

function deriveStatus(
  stockQty: number,
  incomingQty: number,
  velocity: number,
  firstSaleDate: string | null
): { status: StockStatus; daysRemaining: number | null } {
  if (stockQty <= 0 && incomingQty <= 0) {
    return { status: "out_of_stock", daysRemaining: 0 };
  }

  // Check if we have sufficient order history
  if (firstSaleDate !== null) {
    const daysSinceFirstSale =
      (Date.now() - new Date(firstSaleDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceFirstSale < INSUFFICIENT_DATA_DAYS) {
      return { status: "insufficient_data", daysRemaining: null };
    }
  } else {
    // No sales at all — flag as insufficient data (brand new product)
    return { status: "insufficient_data", daysRemaining: null };
  }

  if (velocity <= 0) {
    // No sales — stock is effectively infinite, treat as ok
    return { status: "ok", daysRemaining: null };
  }

  const daysRemaining = Math.floor((stockQty + incomingQty) / velocity);

  let status: StockStatus;
  if (daysRemaining < CRITICAL_THRESHOLD_DAYS) {
    status = "critical";
  } else if (daysRemaining < WARNING_THRESHOLD_DAYS) {
    status = "warning";
  } else {
    status = "ok";
  }

  return { status, daysRemaining };
}

function calcRecommendedQty(
  stockQty: number,
  incomingQty: number,
  velocity: number
): number {
  if (velocity <= 0) return 0;
  const targetUnits = Math.ceil(velocity * COVERAGE_TARGET_DAYS);
  const available = stockQty + incomingQty;
  const needed = targetUnits - available;
  return Math.max(0, needed);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Main entry point. Returns sorted SKU health list (worst first). */
export async function getStockHealth(sb: SupabaseClient): Promise<InventorySummary> {
  const [rawSkus, incomingMap] = await Promise.all([
    resolveSkus(sb),
    getIncomingStock(sb),
  ]);

  const velocityMap = await calculateVelocities(sb, rawSkus);

  const skuHealthList: SkuHealth[] = rawSkus.map((raw) => {
    const vel = velocityMap.get(raw.sku);
    const velocity7d = vel?.velocity7d ?? 0;
    const velocity30d = vel?.velocity30d ?? 0;
    const velocityUsed = Math.max(velocity7d, velocity30d);
    const incomingQty = incomingMap.get(raw.sku) ?? 0;
    const firstSaleDate = vel?.firstSaleDate ?? null;

    const { status, daysRemaining } = deriveStatus(
      raw.stockQty,
      incomingQty,
      velocityUsed,
      firstSaleDate
    );

    const recommendedOrderQty = calcRecommendedQty(raw.stockQty, incomingQty, velocityUsed);
    const reorderPoint = Math.ceil(velocityUsed * WARNING_THRESHOLD_DAYS);

    return {
      sku: raw.sku,
      productName: raw.productName,
      productId: raw.productId,
      variationId: raw.variationId,
      stockQty: raw.stockQty,
      velocityUsed,
      velocity7d,
      velocity30d,
      incomingQty,
      daysRemaining,
      recommendedOrderQty,
      reorderPoint,
      status,
    };
  });

  // Sort: worst first
  // out_of_stock → critical → warning → insufficient_data → ok
  const statusOrder: Record<StockStatus, number> = {
    out_of_stock: 0,
    critical: 1,
    warning: 2,
    insufficient_data: 3,
    ok: 4,
  };

  skuHealthList.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    // Within same status, sort by daysRemaining ascending (fewer days = worse)
    const aDays = a.daysRemaining ?? Infinity;
    const bDays = b.daysRemaining ?? Infinity;
    return aDays - bDays;
  });

  const criticalCount = skuHealthList.filter((s) => s.status === "critical" || s.status === "out_of_stock").length;
  const warningCount = skuHealthList.filter((s) => s.status === "warning").length;
  const insufficientDataCount = skuHealthList.filter((s) => s.status === "insufficient_data").length;

  return {
    skus: skuHealthList,
    generatedAt: new Date().toISOString(),
    totalSkus: skuHealthList.length,
    criticalCount,
    warningCount,
    insufficientDataCount,
  };
}

/** Upserts a daily snapshot to the inventory_snapshots table. */
export async function saveDailySnapshot(sb: SupabaseClient, skus: SkuHealth[]): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const rows = skus.map((s) => ({
    sku: s.sku,
    product_name: s.productName,
    stock_quantity: s.stockQty,
    velocity_7d: s.velocity7d,
    velocity_30d: s.velocity30d,
    velocity_used: s.velocityUsed,
    incoming_qty: s.incomingQty,
    days_remaining: s.daysRemaining,
    reorder_point: s.reorderPoint,
    snapshot_date: today,
  }));

  const { error } = await sb
    .from("inventory_snapshots")
    .upsert(rows, { onConflict: "sku,snapshot_date" });

  if (error) throw new Error(`saveDailySnapshot: ${error.message}`);
}

/**
 * Generates a draft purchase order for all SKUs that need reordering,
 * inserts it into the database, and returns the generated PO details.
 */
export async function generatePODraft(sb: SupabaseClient): Promise<GeneratedPO> {
  const summary = await getStockHealth(sb);

  // Include all SKUs where velocity math says we need to order, except insufficient_data
  // This covers critical/warning/out_of_stock but also ok-status SKUs that are drifting low
  const allToOrder = summary.skus.filter(
    (s) => s.recommendedOrderQty > 0 && s.status !== "insufficient_data"
  );

  const createdAt = new Date().toISOString();
  const reference = `PO-${createdAt.slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000) + 1000}`;

  // Insert the PO header
  const { data: poRow, error: poErr } = await sb
    .from("purchase_orders")
    .insert({
      reference,
      status: "draft",
      created_at: createdAt,
      notes: `Auto-generated draft. ${allToOrder.length} SKUs need reordering. Coverage target: ${COVERAGE_TARGET_DAYS} days.`,
    })
    .select("id")
    .single();

  if (poErr) throw new Error(`generatePODraft/insert PO: ${poErr.message}`);

  const poId = poRow.id as number;

  // Insert PO lines
  if (allToOrder.length > 0) {
    const lineRows = allToOrder.map((s) => ({
      po_id: poId,
      sku: s.sku,
      product_name: s.productName,
      recommended_qty: s.recommendedOrderQty,
      final_qty: s.recommendedOrderQty, // default to recommended; buyer can adjust
    }));

    const { error: lineErr } = await sb.from("purchase_order_lines").insert(lineRows);
    if (lineErr) throw new Error(`generatePODraft/insert lines: ${lineErr.message}`);
  }

  return {
    reference,
    poId,
    lines: allToOrder.map((s) => ({
      sku: s.sku,
      productName: s.productName,
      recommendedQty: s.recommendedOrderQty,
      currentStock: s.stockQty,
      daysRemaining: s.daysRemaining,
      status: s.status,
    })),
    totalLines: allToOrder.length,
    createdAt,
  };
}
