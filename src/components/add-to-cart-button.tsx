"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useCartStore } from "@/lib/cart-store";
import { VariationPicker } from "./variation-picker";
import { formatPrice } from "@/lib/format";
import { trackAddToCart } from "@/lib/tracking";
import { trackMetaAddToCart } from "@/components/meta-pixel";
import { trackTikTokAddToCart } from "@/components/tiktok-pixel";
import type { Product, ProductVariation, WCAttribute } from "@/lib/types";
import { EcommanderBadge } from "./ecommander-badge";
import { storeConfig } from "../../store.config";

interface Props {
  product: Product;
  attributes?: WCAttribute[];
}

// US federal holidays — update annually
const US_HOLIDAYS: Set<string> = new Set([
  // 2025
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-05-26",
  "2025-06-19", "2025-07-04", "2025-09-01", "2025-10-13",
  "2025-11-11", "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12",
  "2026-11-11", "2026-11-26", "2026-12-25",
]);

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const iso = date.toISOString().slice(0, 10);
  return !US_HOLIDAYS.has(iso);
}

function getEstimatedDelivery(): { from: string; to: string } {
  const now = new Date();
  const hour = now.getHours();
  // Cut-off 12pm — order before noon, dispatched same day
  const dispatchDay = new Date(now);
  if (hour >= 12) {
    dispatchDay.setDate(dispatchDay.getDate() + 1);
  }

  // Skip weekends and bank holidays for dispatch
  while (!isBusinessDay(dispatchDay)) {
    dispatchDay.setDate(dispatchDay.getDate() + 1);
  }

  // Delivery: 2-3 business days after dispatch (USPS Priority Mail)
  const addBusinessDays = (date: Date, days: number) => {
    const result = new Date(date);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      if (isBusinessDay(result)) {
        added++;
      }
    }
    return result;
  };

  const from = addBusinessDays(dispatchDay, 2);
  const to = addBusinessDays(dispatchDay, 3);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

  return { from: fmt(from), to: fmt(to) };
}

export function AddToCartButton({ product, attributes }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);
  const [added, setAdded] = useState(false);
  const [singleVariation, setSingleVariation] = useState<ProductVariation | null>(null);
  const [loadingSingle, setLoadingSingle] = useState(false);
  const [qty, setQty] = useState(1);

  const isVariable = product.type === "variable";

  // For variable products with 0 or 1 attribute options, auto-fetch the single variation
  const isSingleVariation = isVariable && (!attributes || attributes.length === 0 || attributes.every((a) => a.options.length <= 1));

  useEffect(() => {
    if (isSingleVariation) {
      setLoadingSingle(true);
      fetch(`/api/products/${product.id}/variations`)
        .then((res) => res.json())
        .then((data: ProductVariation[]) => {
          if (data.length >= 1) {
            setSingleVariation(data[0]);
            setSelectedVariation(data[0]);
          }
          setLoadingSingle(false);
        })
        .catch(() => setLoadingSingle(false));
    }
  }, [isSingleVariation, product.id]);

  const handleVariationChange = useCallback((variation: ProductVariation | null) => {
    setSelectedVariation(variation);
  }, []);

  const effectiveVariation = singleVariation || selectedVariation;

  const canAdd = isVariable
    ? effectiveVariation && effectiveVariation.stock_status === "instock"
    : product.stock_status === "instock";

  const [stockError, setStockError] = useState(false);

  const handleAdd = async () => {
    setStockError(false);
    try {
      const res = await fetch(`/api/stock?id=${product.id}`);
      const { in_stock } = await res.json();
      if (!in_stock) {
        setStockError(true);
        setTimeout(() => setStockError(false), 4000);
        return;
      }
    } catch {
      // If stock check fails, allow the add — checkout will catch it
    }
    addItem(product, qty, effectiveVariation?.id);
    trackAddToCart(product, qty);
    trackMetaAddToCart(String(product.id), product.name, product.price * qty);
    trackTikTokAddToCart(String(product.id), product.name, product.price * qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const buttonLabel = loadingSingle
    ? "Loading..."
    : !isVariable && product.stock_status !== "instock"
      ? "Out of Stock"
      : isVariable && !effectiveVariation
        ? "Select Options"
        : isVariable && effectiveVariation?.stock_status !== "instock"
          ? "Out of Stock"
          : added
            ? "Added"
            : "Add to Cart";

  // Show variation picker only for multi-variation products
  const showPicker = isVariable && !isSingleVariation && attributes;

  const delivery = useMemo(() => getEstimatedDelivery(), []);

  return (
    <div className="space-y-5">
      {showPicker && (
        <VariationPicker
          productId={product.id}
          attributes={attributes}
          onVariationChange={handleVariationChange}
        />
      )}

      {showPicker && selectedVariation && (
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-medium">{formatPrice(selectedVariation.price)}</span>
          {selectedVariation.on_sale && selectedVariation.regular_price && (
            <span className="text-base text-muted-foreground line-through">
              {formatPrice(selectedVariation.regular_price)}
            </span>
          )}
        </div>
      )}

      {/* Estimated delivery */}
      {canAdd && (
        <div className="text-base text-muted-foreground">
          <span className="text-foreground font-medium">Free shipping</span>
          <span className="mx-1.5">·</span>
          Est. delivery {delivery.from} – {delivery.to}
        </div>
      )}

      {/* Store reviews trust signal */}
      {storeConfig.showReviews && <EcommanderBadge variant="light" />}

      {/* Quantity + Add to Cart */}
      <div className="flex gap-3">
        <div className="flex items-center border border-border">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="w-11 h-12 flex items-center justify-center text-lg hover:bg-muted transition-colors"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-10 text-center text-sm tabular-nums">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            className="w-11 h-12 flex items-center justify-center text-lg hover:bg-muted transition-colors"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <button
          onClick={handleAdd}
          disabled={!canAdd || loadingSingle}
          className={`flex-1 py-4 text-sm tracking-widest uppercase font-medium transition-all ${
            canAdd
              ? added
                ? "bg-secondary text-secondary-foreground"
                : "bg-foreground text-background hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {buttonLabel}
        </button>
      </div>

      {stockError && (
        <p className="text-sm text-destructive">Sorry, this item is now out of stock.</p>
      )}

      {/* Payment methods */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-xs text-muted-foreground">Pay with</span>
        <img src="/payments/klarna.png" alt="Klarna" className="h-6 w-auto" />
        <img src="/payments/paypal.png" alt="PayPal" className="h-5 w-auto" />
        <img src="/payments/clearpay.png" alt="Clearpay" className="h-5 w-auto" />
      </div>
    </div>
  );
}
