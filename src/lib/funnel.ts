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

// Persistent across sessions/visits (localStorage), so we can tell new vs
// returning visitors and stitch multi-visit "researched Tuesday, bought
// Friday" journeys. Falls back to the per-tab session id if localStorage is
// unavailable (private mode etc).
function getVisitorId(): string {
  try {
    const KEY = "funnel_visitor_id";
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return getSessionId();
  }
}

// True the very first time we ever see this browser, false on every later
// visit. Set once, then sticky.
function isReturningVisitor(): boolean {
  try {
    const KEY = "funnel_visitor_seen";
    const seen = localStorage.getItem(KEY);
    if (!seen) {
      localStorage.setItem(KEY, new Date().toISOString());
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function deviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  const w = window.innerWidth || 0;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return "tablet";
  }
  if (/Mobi|iPhone|Android.*Mobile|Windows Phone/i.test(ua) || (w > 0 && w < 768)) {
    return "mobile";
  }
  if (w > 0 && w < 1024) return "tablet";
  return "desktop";
}

// Device / locale context attached to every event so the digest can split
// conversion by device, language, timezone without any new schema.
function getContext(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    let referrerHost: string | null = null;
    if (document.referrer) {
      try {
        const u = new URL(document.referrer);
        // Only record external referrers (cross-site), not internal navigation.
        if (u.hostname && u.hostname !== window.location.hostname) {
          referrerHost = u.hostname;
        }
      } catch {
        /* ignore */
      }
    }
    let tz: string | null = null;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      /* ignore */
    }
    return {
      device: deviceType(),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      screen: { w: window.screen?.width ?? null, h: window.screen?.height ?? null },
      dpr: window.devicePixelRatio ?? null,
      lang: navigator.language ?? null,
      tz,
      referrer_host: referrerHost,
    };
  } catch {
    return {};
  }
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

export function getFunnelVisitorId(): string {
  return getVisitorId();
}

export function trackFunnelEvent(event: string, data?: FunnelData): void {
  try {
    const { metadata, ...rest } = data || {};
    const payload = JSON.stringify({
      event,
      session_id: getSessionId(),
      ...rest,
      metadata: {
        visitor_id: getVisitorId(),
        is_returning: isReturningVisitor(),
        ctx: getContext(),
        ...(metadata || {}),
      },
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
