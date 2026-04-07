"use client";

import { useEffect, useRef } from "react";
import { trackPurchase } from "@/lib/tracking";
import { trackMetaPurchase } from "@/components/meta-pixel";
import { trackTikTokPurchase } from "@/components/tiktok-pixel";

interface PurchaseItem {
  item_id: string;
  item_name: string;
  quantity: number;
  price: number;
}

interface PurchaseTrackerProps {
  transactionId: string;
  value: number;
  currency: string;
  items: PurchaseItem[];
}

/**
 * Fires the client-side purchase event exactly once on mount.
 * Server-side tracking is handled separately by the Stripe webhook.
 */
export function PurchaseTracker({
  transactionId,
  value,
  currency,
  items,
}: PurchaseTrackerProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    // Small delay to ensure gtag is initialized by the Analytics component
    const timer = setTimeout(() => {
      trackPurchase(transactionId, value, items, currency);
      trackMetaPurchase(transactionId, value, currency);
      trackTikTokPurchase(transactionId, value, currency);
    }, 500);

    return () => clearTimeout(timer);
  }, [transactionId, value, currency, items]);

  return null;
}
