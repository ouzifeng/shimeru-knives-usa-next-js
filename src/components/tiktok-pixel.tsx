"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    ttq: {
      load: (pixelId: string) => void;
      page: () => void;
      track: (event: string, params?: Record<string, unknown>) => void;
      identify: (params: Record<string, unknown>) => void;
    };
    TiktokAnalyticsObject: string;
  }
}

/**
 * Tracks PageView on client-side route changes.
 * The initial PageView + script load is handled by the Script tag in layout.tsx.
 */
export function TikTokPixelEvents() {
  const pathname = usePathname();
  const initialLoad = useRef(true);

  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    if (typeof window !== "undefined" && window.ttq) {
      window.ttq.page();
    }
  }, [pathname]);

  return null;
}

/**
 * Fire TikTok ViewContent event (product page views).
 */
export function trackTikTokViewContent(productId: string, productName: string, value: number, currency: string = "USD") {
  if (typeof window !== "undefined" && window.ttq) {
    window.ttq.track("ViewContent", {
      content_id: productId,
      content_name: productName,
      content_type: "product",
      value,
      currency,
    });
  }
}

/**
 * Fire TikTok AddToCart event.
 */
export function trackTikTokAddToCart(productId: string, productName: string, value: number, currency: string = "USD") {
  if (typeof window !== "undefined" && window.ttq) {
    window.ttq.track("AddToCart", {
      content_id: productId,
      content_name: productName,
      content_type: "product",
      value,
      currency,
    });
  }
}

/**
 * Fire TikTok InitiateCheckout event.
 */
export function trackTikTokInitiateCheckout(value: number, currency: string = "USD") {
  if (typeof window !== "undefined" && window.ttq) {
    window.ttq.track("InitiateCheckout", {
      value,
      currency,
    });
  }
}

/**
 * Fire TikTok CompletePayment event.
 */
export function trackTikTokPurchase(transactionId: string, value: number, currency: string = "USD") {
  if (typeof window !== "undefined" && window.ttq) {
    window.ttq.track("CompletePayment", {
      content_type: "product",
      value,
      currency,
    });
  }
}
