"use client";

function getSessionId(): string {
  const KEY = "funnel_session_id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

interface FunnelData {
  product_id?: number;
  product_name?: string;
  cart_value?: number;
  metadata?: Record<string, unknown>;
}

export function getFunnelSessionId(): string {
  return getSessionId();
}

export function trackFunnelEvent(event: string, data?: FunnelData): void {
  try {
    const payload = JSON.stringify({
      event,
      session_id: getSessionId(),
      ...data,
    });

    // Prefer sendBeacon for reliability (works even during page unload)
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/track", blob);
    } else {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Tracking should never break the app
  }
}
