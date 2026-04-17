"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { useCartStore } from "@/lib/cart-store";
import { formatPrice } from "@/lib/format";
import { Loader2, ShoppingBag, ArrowLeft, Tag, X, Truck, Check } from "lucide-react";
import type { ShippingOption } from "@/lib/shipping";
import { trackFunnelEvent, getFunnelSessionId } from "@/lib/funnel";
import { trackMetaInitiateCheckout } from "@/components/meta-pixel";
import { trackTikTokInitiateCheckout } from "@/components/tiktok-pixel";
import { getAttribution, refreshGaClientId } from "@/lib/attribution";

export default function CheckoutPage() {
  const { items, total } = useCartStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [shippingLoading, setShippingLoading] = useState(true);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_type: "percent" | "fixed_cart" | "fixed_product";
    amount: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    trackFunnelEvent("checkout_viewed", { cart_value: total() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/shipping")
      .then((res) => res.json())
      .then((data: ShippingOption[]) => {
        const sorted = [...data].sort((a, b) => a.cost - b.cost);
        setShippingOptions(sorted);
        if (sorted.length) setSelectedShipping(sorted[0]);
      })
      .catch(() => {})
      .finally(() => setShippingLoading(false));
  }, []);

  const shippingCost = selectedShipping?.cost || 0;
  const discount = appliedCoupon
    ? appliedCoupon.discount_type === "percent"
      ? total() * (appliedCoupon.amount / 100)
      : appliedCoupon.amount
    : 0;

  const handleApplyCoupon = async () => {
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode, cartTotal: total() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.error);
      } else {
        setAppliedCoupon(data);
        setCouponCode("");
      }
    } catch {
      setCouponError("Failed to validate coupon");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    trackFunnelEvent("payment_started", { cart_value: total() - discount + shippingCost });
    trackMetaInitiateCheckout(total() - discount + shippingCost, items.length);
    trackTikTokInitiateCheckout(total() - discount + shippingCost);
    // Ensure GA4 client ID is captured before sending (cookie may not exist on first page load)
    refreshGaClientId();
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            price: item.product.price,
            quantity: item.quantity,
            image: item.product.images[0]?.src,
            variationId: item.variationId,
          })),
          couponCode: appliedCoupon?.code,
          attribution: getAttribution(),
          funnelSessionId: getFunnelSessionId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create checkout session");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <ShoppingBag className="size-12 text-muted-foreground" />
          <p className="font-serif text-xl text-muted-foreground">Your cart is empty</p>
          <Link
            href="/product"
            className="text-sm tracking-wide uppercase text-primary hover:underline underline-offset-4"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
      <div className="mx-auto max-w-xl">
        <Link
          href="/product"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Continue shopping
        </Link>

        <h1 className="font-serif text-2xl lg:text-3xl font-light mb-8">Checkout</h1>

        {/* Cart Items */}
        <div className="divide-y border-y border-border">
          {items.map((item) => (
            <div key={`${item.product.id}-${item.variationId}`} className="flex gap-4 py-5">
              <div className="relative w-20 h-20 shrink-0 bg-muted overflow-hidden">
                {item.product.images[0] && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={item.product.images[0].src}
                    alt={item.product.images[0].alt || item.product.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.product.name}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Qty: {item.quantity}
                </p>
              </div>
              <p className="text-sm font-medium shrink-0">
                {formatPrice(item.product.price * item.quantity)}
              </p>
            </div>
          ))}
        </div>

        {/* Coupon */}
        <div className="mt-6 space-y-2">
          {appliedCoupon ? (
            <div className="flex items-center justify-between bg-secondary/20 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 text-secondary">
                <Tag className="size-4" />
                &ldquo;{appliedCoupon.code}&rdquo; &mdash;{" "}
                {appliedCoupon.discount_type === "percent"
                  ? `${appliedCoupon.amount}% off`
                  : `${formatPrice(appliedCoupon.amount)} off`}
              </span>
              <button
                type="button"
                onClick={() => setAppliedCoupon(null)}
                className="text-secondary hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Coupon code"
                value={couponCode}
                className="h-11"
                onChange={(e) => setCouponCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && couponCode && handleApplyCoupon()}
              />
              <button
                onClick={handleApplyCoupon}
                disabled={couponLoading || !couponCode}
                className="px-5 h-11 border border-border text-sm tracking-wide uppercase hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {couponLoading ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
              </button>
            </div>
          )}
          {couponError && <p className="text-sm text-destructive">{couponError}</p>}
        </div>

        {/* Shipping */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-muted-foreground">
            <Truck className="size-4" />
            Shipping
          </div>
          {shippingLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-[48px] bg-muted rounded border border-border" />
              <div className="h-[48px] bg-muted/60 rounded border border-border" />
            </div>
          ) : shippingOptions.length > 0 ? (
            <div className="space-y-2">
              {shippingOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedShipping(opt)}
                  className={`flex w-full items-center justify-between border px-4 py-3.5 text-sm transition-colors min-h-[48px] ${
                    selectedShipping?.id === opt.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {selectedShipping?.id === opt.id && (
                      <Check className="size-3.5 text-primary" />
                    )}
                    {opt.title}
                  </span>
                  <span className="font-medium">
                    {opt.cost === 0 ? "Free" : formatPrice(opt.cost)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No shipping options available</p>
          )}
        </div>

        {/* Totals */}
        <div className="mt-8 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatPrice(total())}</span>
          </div>
          {appliedCoupon && (
            <div className="flex justify-between text-secondary">
              <span>Discount</span>
              <span>-{formatPrice(discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            <span className="font-medium">
              {selectedShipping
                ? selectedShipping.cost === 0
                  ? "Free"
                  : formatPrice(selectedShipping.cost)
                : "\u2014"}
            </span>
          </div>
          <div className="border-t border-border pt-3 flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatPrice(total() - discount + shippingCost)}</span>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={loading || shippingLoading}
          className={`mt-8 w-full py-4 text-sm tracking-widest uppercase font-medium transition-all min-h-[52px] flex items-center justify-center gap-2 ${
            loading || shippingLoading
              ? "bg-muted text-muted-foreground cursor-wait"
              : "bg-foreground text-background hover:opacity-90"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Redirecting to payment...
            </>
          ) : (
            `Proceed to Payment \u2014 ${formatPrice(total() - discount + shippingCost)}`
          )}
        </button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Secure checkout powered by Stripe. Your card details never touch our servers.
        </p>
      </div>
    </div>
  );
}
