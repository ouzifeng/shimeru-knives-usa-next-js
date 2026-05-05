"use client";

import { useState, useCallback, useEffect } from "react";
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

      {/* Free shipping indicator — specific delivery window lives on
          /shipping-and-delivery to keep a single source of truth */}
      {canAdd && (
        <div className="text-base text-muted-foreground">
          <span className="text-foreground font-medium">Free shipping</span>
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
