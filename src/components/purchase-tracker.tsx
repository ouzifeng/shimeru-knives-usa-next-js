"use client";

import { useEffect, useRef } from "react";
import { trackPurchase, isTrackingReady } from "@/lib/tracking";
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

// gtag is only configured once /api/admin/tracking resolves. Poll for that
// rather than guessing, but give up eventually so GA4 still gets the event even
// if the Google Ads target never arrives.
const POLL_MS = 200;
const READY_TIMEOUT_MS = 10000;

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

    // Meta and TikTok do not depend on gtag, so they keep the original delay.
    setTimeout(() => {
      trackMetaPurchase(transactionId, value, currency);
      trackTikTokPurchase(transactionId, value, currency);
    }, 500);

    // The Google conversion used to fire on a flat 500ms timer. When the
    // tracking fetch took longer than that, window.gtag did not exist yet, the
    // call no-opped and the conversion was lost outright with no retry. Wait
    // for readiness instead.
    let waited = 0;
    const attempt = () => {
      if (isTrackingReady() || waited >= READY_TIMEOUT_MS) {
        trackPurchase(transactionId, value, items, currency);
        return;
      }
      waited += POLL_MS;
      setTimeout(attempt, POLL_MS);
    };
    setTimeout(attempt, POLL_MS);

    // No cleanup on purpose. `items` is a fresh array on every render, so a
    // re-render would otherwise clear these timers while firedRef already
    // blocks rescheduling, losing the conversion completely.
  }, [transactionId, value, currency, items]);

  return null;
}
