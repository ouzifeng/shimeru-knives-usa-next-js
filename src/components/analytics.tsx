"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { setAdsConversionTarget } from "@/lib/tracking";
import { captureAttribution } from "@/lib/attribution";

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export function Analytics() {
  const pathname = usePathname();
  const initializedRef = useRef(false);
  const measurementIdRef = useRef<string | null>(null);

  // Capture UTM params and referrer on first load
  useEffect(() => {
    captureAttribution();
  }, []);

  // Fetch tracking settings and inject gtag script
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    fetch("/api/admin/tracking")
      .then((res) => res.json())
      .then(({ settings }) => {
        if (!settings) return;

        const ga4Id = settings.ga4_measurement_id;
        const adsId = settings.google_ads_conversion_id;

        if (!ga4Id) return;

        measurementIdRef.current = ga4Id;

        // Initialize dataLayer and gtag function
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () {
          // eslint-disable-next-line prefer-rest-params
          window.dataLayer.push(arguments);
        };
        window.gtag("js", new Date());

        // Configure GA4
        window.gtag("config", ga4Id, {
          send_page_view: true,
        });

        // Configure Google Ads if present
        if (adsId) {
          window.gtag("config", adsId);
          const adsLabel = settings.google_ads_conversion_label || "";
          setAdsConversionTarget(adsId, adsLabel);
        }

        // Inject the gtag.js script
        const script = document.createElement("script");
        script.src = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
        script.async = true;
        document.head.appendChild(script);
      })
      .catch(() => {
        // Silently fail — analytics should never break the site
      });
  }, []);

  // Track page views on route changes
  useEffect(() => {
    if (!measurementIdRef.current || !window.gtag) return;

    window.gtag("event", "page_view", {
      page_path: pathname,
    });
  }, [pathname]);

  return null;
}
