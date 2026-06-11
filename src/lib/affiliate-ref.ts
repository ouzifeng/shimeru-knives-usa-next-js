"use client";

// Affiliate referral capture. When a visitor lands with ?ref=CODE we:
//   1. store the code in a 30-day cookie (last-click wins — a newer ref overwrites)
//   2. log the click once per browser session per code
// The cookie is read at checkout and folded into the order so the sale attributes
// even if the purchase happens days after the click. This is separate from the
// UTM attribution in attribution.ts and does not disturb it.

const REF_COOKIE = "affiliate_ref";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const CLICK_FLAG_PREFIX = "aff_click_"; // sessionStorage, dedup click logging

export function captureAffiliateRef(): void {
  if (typeof window === "undefined") return;

  const raw = new URLSearchParams(window.location.search).get("ref");
  if (!raw) return;

  // Codes are uppercase alphanumeric (see admin generator).
  const code = raw.trim().toUpperCase().slice(0, 32);
  if (!/^[A-Z0-9]+$/.test(code)) return;

  // Last-click wins.
  document.cookie = `${REF_COOKIE}=${code}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;

  // Log the click only once per session per code, so a refresh of the landing
  // URL doesn't inflate the count.
  try {
    const flag = `${CLICK_FLAG_PREFIX}${code}`;
    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, "1");
  } catch {
    /* sessionStorage unavailable — still log, just without dedup */
  }

  fetch("/api/affiliate/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, path: window.location.pathname }),
    keepalive: true,
  }).catch(() => {});
}

export function getAffiliateRef(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)affiliate_ref=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
