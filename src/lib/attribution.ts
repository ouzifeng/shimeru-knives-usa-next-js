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
  gbraid?: string;
  wbraid?: string;
  ga_client_id?: string;
  ga_session_id?: string;
}

// Google issues gclid on most clicks, but gbraid (app to web) and wbraid (web to
// web) instead on iOS traffic where ATT blocks the usual click id. We only ever
// read gclid, so those conversions arrived with no click id at all and could
// never be uploaded to Google Ads. Order matters: gclid is the most precise.
const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid"] as const;
type ClickIdKey = (typeof CLICK_ID_KEYS)[number];

function readClickId(
  params: URLSearchParams
): { key: ClickIdKey; value: string } | null {
  for (const key of CLICK_ID_KEYS) {
    const value = params.get(key);
    if (value) return { key, value };
  }
  return null;
}

function hasClickId(data: Attribution | null): boolean {
  return Boolean(data && CLICK_ID_KEYS.some((k) => data[k]));
}

/**
 * Read the click id back out of Google's own first-party cookies.
 *
 * This is what closes the gap between us and the browser tag. gtag.js writes the
 * click id to a cookie with a 90 day life, matching the conversion window, while
 * we were holding it in sessionStorage which dies with the tab. So a visitor who
 * clicked an ad on Monday, closed the tab, and returned direct on Thursday to buy
 * was invisible to us but perfectly visible to Google. Reading the same cookie
 * means the server-side upload sees every click the tag would have seen.
 *
 * Formats are `GCL.<timestamp>.<id>`, but the prefix is not guaranteed across
 * gtag versions, so fall back to treating the whole value as the id.
 */
const CLICK_COOKIES: { cookie: string; key: ClickIdKey }[] = [
  { cookie: "_gcl_aw", key: "gclid" },
  { cookie: "_gcl_gb", key: "gbraid" },
  { cookie: "_gcl_gs", key: "wbraid" },
];

function readClickIdFromCookies(): { key: ClickIdKey; value: string } | null {
  for (const { cookie, key } of CLICK_COOKIES) {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${cookie}=([^;]+)`)
    );
    if (!match) continue;
    const raw = decodeURIComponent(match[1]);
    // "GCL.1690000000.<id>" -> "<id>". Rejoin the tail: ids are base64url and
    // should not contain dots, but splitting defensively costs nothing.
    const parts = raw.split(".");
    const value =
      parts.length >= 3 && /^\d+$/.test(parts[1])
        ? parts.slice(2).join(".")
        : raw;
    if (value) return { key, value };
  }
  return null;
}

/**
 * Read the GA4 client id and session id from Google's own cookies.
 *
 * client_id lives in `_ga`, session_id in the per-property `_ga_<CONTAINER>`.
 * Both are needed by the server-side Measurement Protocol event: without
 * session_id GA4 cannot join it to the browser session, so it lands in a
 * session of its own and session-scoped attribution breaks.
 */
function readGaCookies(): { ga_client_id?: string; ga_session_id?: string } {
  const out: { ga_client_id?: string; ga_session_id?: string } = {};

  const clientMatch = document.cookie.match(
    /(?:^|;\s*)_ga=GA\d+\.\d+\.(.+?)(?:;|$)/
  );
  if (clientMatch) out.ga_client_id = clientMatch[1];

  // `_ga_ABC123=GS1.1.<session_id>.<count>...` (GS2 on newer containers).
  const sessionMatch = document.cookie.match(
    /(?:^|;\s*)_ga_[A-Z0-9]+=GS\d\.\d\.(\d+)/
  );
  if (sessionMatch) out.ga_session_id = sessionMatch[1];

  return out;
}

/**
 * Capture UTM params, referrer and any Google click id.
 *
 * First touch wins for organic traffic, but a paid click always overrides an
 * earlier record. Previously this returned early whenever sessionStorage held
 * anything, so a visitor who browsed direct and then came back through an ad in
 * the same tab had their click id thrown away and the sale looked organic.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;

  let existing: Attribution | null = null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) existing = JSON.parse(raw) as Attribution;
  } catch {
    // Corrupt entry — fall through and overwrite it.
  }

  const params = new URLSearchParams(window.location.search);
  const clickId = readClickId(params);

  if (existing) {
    const gaCookies = readGaCookies();

    // Not a paid landing: keep first touch, but top up the GA ids, which are
    // written asynchronously by gtag.js and are often absent on first capture.
    if (!clickId) {
      let changed = false;
      if (!existing.ga_client_id && gaCookies.ga_client_id) {
        existing.ga_client_id = gaCookies.ga_client_id;
        changed = true;
      }
      // session_id rotates every 30 minutes of inactivity, so always refresh it.
      if (gaCookies.ga_session_id && existing.ga_session_id !== gaCookies.ga_session_id) {
        existing.ga_session_id = gaCookies.ga_session_id;
        changed = true;
      }
      // Returning visitor from an earlier ad click: no click id on this URL and
      // none in this session, but Google's 90 day cookie still holds it. This is
      // the case that made our capture lag the tag.
      if (!hasClickId(existing)) {
        const fromCookie = readClickIdFromCookies();
        if (fromCookie) {
          existing[fromCookie.key] = fromCookie.value;
          changed = true;
        }
      }
      if (changed) sessionStorage.setItem(KEY, JSON.stringify(existing));
      return;
    }

    // Same click id we already hold: nothing to re-attribute.
    if (existing[clickId.key] === clickId.value) {
      if (gaCookies.ga_session_id) existing.ga_session_id = gaCookies.ga_session_id;
      if (!existing.ga_client_id && gaCookies.ga_client_id) {
        existing.ga_client_id = gaCookies.ga_client_id;
      }
      sessionStorage.setItem(KEY, JSON.stringify(existing));
      return;
    }

    // A new paid click. This session is now attributable to that click, so
    // rebuild the record rather than merging a paid click into organic UTMs.
  }

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

  // A click id on the URL is the current click. Failing that, Google's cookie
  // may still hold an earlier one inside the 90 day window, which is exactly
  // what the browser tag would attribute this sale to.
  const resolvedClickId = clickId || readClickIdFromCookies();
  if (resolvedClickId) {
    data[resolvedClickId.key] = resolvedClickId.value;
    if (clickId) {
      // Only claim paid source/medium for a click that happened on this landing.
      // An older cookie click id should not relabel an organic visit as cpc.
      data.utm_source = data.utm_source || "google";
      data.utm_medium = data.utm_medium || "cpc";
    }
  }

  // Carry the GA client id forward. It identifies the browser, not the click,
  // so a re-attributed session must not lose it.
  const gaCookies = readGaCookies();
  data.ga_client_id = gaCookies.ga_client_id || existing?.ga_client_id;
  data.ga_session_id = gaCookies.ga_session_id || existing?.ga_session_id;

  sessionStorage.setItem(KEY, JSON.stringify(data));
}

/** True when this visit carries any Google Ads click id. */
export function hasGoogleClickId(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return hasClickId(JSON.parse(sessionStorage.getItem(KEY) || "null"));
  } catch {
    return false;
  }
}

/**
 * Update the GA4 client and session IDs if they weren't available on first
 * capture. The _ga cookies are set asynchronously after gtag.js loads, so we
 * re-check and patch them in on subsequent calls.
 *
 * Called at checkout, which is the last point we can still read the cookies
 * before the values are handed to Stripe metadata and used server-side.
 */
export function refreshGaClientId(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const data: Attribution = JSON.parse(raw);

    const { ga_client_id, ga_session_id } = readGaCookies();
    let changed = false;
    if (!data.ga_client_id && ga_client_id) {
      data.ga_client_id = ga_client_id;
      changed = true;
    }
    // Always take the freshest session id: GA4 rotates it after 30 minutes of
    // inactivity, and a stale one would attach the purchase to a dead session.
    if (ga_session_id && data.ga_session_id !== ga_session_id) {
      data.ga_session_id = ga_session_id;
      changed = true;
    }

    // Last chance to recover a click id before this is handed to Stripe
    // metadata and used server-side. Unlike page load, gtag.js has certainly
    // run by checkout, so _gcl_aw is present here even for a first visit where
    // the cookie had not been written yet when captureAttribution ran.
    if (!hasClickId(data)) {
      const fromCookie = readClickIdFromCookies();
      if (fromCookie) {
        data[fromCookie.key] = fromCookie.value;
        changed = true;
      }
    }

    if (changed) sessionStorage.setItem(KEY, JSON.stringify(data));
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
