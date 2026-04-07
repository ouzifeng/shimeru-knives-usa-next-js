"use client";

const KEY = "order_attribution";

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  landing_page?: string;
  session_entry?: string;
  gclid?: string;
  ga_client_id?: string;
}

/**
 * Capture UTM params and referrer on first page load.
 * Only stores once per session — first touch wins.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;

  // Only capture once per session
  if (sessionStorage.getItem(KEY)) return;

  const params = new URLSearchParams(window.location.search);
  const data: Attribution = {
    utm_source: params.get("utm_source") || undefined,
    utm_medium: params.get("utm_medium") || undefined,
    utm_campaign: params.get("utm_campaign") || undefined,
    utm_term: params.get("utm_term") || undefined,
    utm_content: params.get("utm_content") || undefined,
    referrer: document.referrer || undefined,
    landing_page: window.location.pathname,
    session_entry: new Date().toISOString(),
  };

  // Capture gclid (Google Ads click ID) — critical for Ads attribution
  const gclid = params.get("gclid");
  if (gclid) {
    data.gclid = gclid;
    data.utm_source = data.utm_source || "google";
    data.utm_medium = data.utm_medium || "cpc";
  }

  // Capture GA4 client ID from _ga cookie so server-side events match the browser session
  const gaMatch = document.cookie.match(/(?:^|;\s*)_ga=GA\d+\.\d+\.(.+?)(?:;|$)/);
  if (gaMatch) {
    data.ga_client_id = gaMatch[1];
  }

  sessionStorage.setItem(KEY, JSON.stringify(data));
}

/**
 * Update the GA4 client ID if it wasn't available on first capture.
 * The _ga cookie is set asynchronously after gtag.js loads, so we
 * re-check and patch it in on subsequent calls.
 */
export function refreshGaClientId(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const data: Attribution = JSON.parse(raw);
    if (data.ga_client_id) return; // already have it

    const gaMatch = document.cookie.match(/(?:^|;\s*)_ga=GA\d+\.\d+\.(.+?)(?:;|$)/);
    if (gaMatch) {
      data.ga_client_id = gaMatch[1];
      sessionStorage.setItem(KEY, JSON.stringify(data));
    }
  } catch { /* noop */ }
}

export function getAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
