"use client";

import { useEffect } from "react";

const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

const COOKIE_NAME = "_wc_attribution";
const COOKIE_DAYS = 30;

interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  landing_page?: string;
  captured_at?: string;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function UtmCapture() {
  useEffect(() => {
    // Only capture on first visit — don't overwrite existing attribution
    const existing = getCookie(COOKIE_NAME);
    if (existing) return;

    const url = new URL(window.location.href);
    const attribution: Attribution = {};

    // Capture UTM parameters
    let hasUtm = false;
    for (const param of UTM_PARAMS) {
      const value = url.searchParams.get(param);
      if (value) {
        attribution[param] = value;
        hasUtm = true;
      }
    }

    // Capture referrer and landing page
    if (document.referrer) {
      attribution.referrer = document.referrer;
    }
    attribution.landing_page = window.location.pathname + window.location.search;
    attribution.captured_at = new Date().toISOString();

    // Only set the cookie if we have UTM params or a referrer
    if (hasUtm || attribution.referrer) {
      setCookie(COOKIE_NAME, JSON.stringify(attribution), COOKIE_DAYS);
    }
  }, []);

  return null;
}
