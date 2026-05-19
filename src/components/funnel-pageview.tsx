"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackFunnelEvent } from "@/lib/funnel";

const SKIP_PREFIXES = ["/admin", "/api", "/setup", "/_next"];

function readAttributionCookie(): Record<string, string> | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )_wc_attribution=([^;]*)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function FunnelPageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return;

    const attribution = readAttributionCookie();

    trackFunnelEvent("page_view", {
      metadata: {
        path: pathname,
        referrer: typeof document !== "undefined" ? document.referrer || null : null,
        attribution: attribution ?? null,
      },
    });
  }, [pathname]);

  return null;
}
