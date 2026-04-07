"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    fbq: (...args: unknown[]) => void;
    _fbq: (...args: unknown[]) => void;
  }
}

/**
 * Tracks PageView on client-side route changes.
 * The initial PageView + script load is handled by the Script tag in layout.tsx.
 */
export function MetaPixelEvents() {
  const pathname = usePathname();
  const initialLoad = useRef(true);

  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
  }, [pathname]);

  return null;
}

/**
 * Fire Meta Purchase conversion event.
 */
export function trackMetaPurchase(transactionId: string, value: number, currency: string = "USD") {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", "Purchase", {
      value,
      currency,
      content_type: "product",
      order_id: transactionId,
    });
  }
}

/**
 * Fire Meta ViewContent event (product page views).
 */
export function trackMetaViewContent(productId: string, productName: string, value: number, currency: string = "USD") {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", "ViewContent", {
      content_ids: [productId],
      content_name: productName,
      content_type: "product",
      value,
      currency,
    });
  }
}

/**
 * Fire Meta AddToCart event.
 */
export function trackMetaAddToCart(productId: string, productName: string, value: number, currency: string = "USD") {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", "AddToCart", {
      content_ids: [productId],
      content_name: productName,
      content_type: "product",
      value,
      currency,
    });
  }
}

/**
 * Fire Meta InitiateCheckout event.
 */
export function trackMetaInitiateCheckout(value: number, numItems: number, currency: string = "USD") {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", "InitiateCheckout", {
      value,
      currency,
      num_items: numItems,
    });
  }
}
