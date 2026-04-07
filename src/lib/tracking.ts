/**
 * Client-side ecommerce event tracking helpers.
 * All functions safely no-op if gtag is not loaded.
 */

interface TrackingProduct {
  id: number;
  name: string;
  price: number;
  categories?: { name: string }[];
}

interface TrackingItem {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
  item_category?: string;
}

function gtag(...args: unknown[]) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag(...args);
  }
}

function toItem(product: TrackingProduct, quantity: number): TrackingItem {
  return {
    item_id: String(product.id),
    item_name: product.name,
    price: product.price,
    quantity,
    ...(product.categories?.[0]?.name && {
      item_category: product.categories[0].name,
    }),
  };
}

/**
 * Track when a product is added to the cart.
 */
export function trackAddToCart(product: TrackingProduct, quantity: number) {
  const item = toItem(product, quantity);
  gtag("event", "add_to_cart", {
    currency: getCurrency(),
    value: item.price * item.quantity,
    items: [item],
  });
}

/**
 * Track when a user begins checkout.
 */
export function trackBeginCheckout(
  items: { product: TrackingProduct; quantity: number }[],
  total: number
) {
  gtag("event", "begin_checkout", {
    currency: getCurrency(),
    value: total,
    items: items.map((i) => toItem(i.product, i.quantity)),
  });
}

/**
 * Track a completed purchase — fires both GA4 purchase and Google Ads conversion.
 */
export function trackPurchase(
  transactionId: string,
  total: number,
  items: TrackingItem[],
  currency?: string
) {
  const cur = currency || getCurrency();

  // GA4 purchase event
  gtag("event", "purchase", {
    transaction_id: transactionId,
    value: total,
    currency: cur,
    items,
  });

  // Google Ads conversion (uses the same gtag instance)
  // The conversion is linked via the Google Ads config already loaded in the Analytics component.
  // Google Ads will automatically pick up the purchase event if enhanced conversions are enabled.
  // We also fire an explicit conversion event for traditional conversion tracking.
  gtag("event", "conversion", {
    send_to: getAdsConversionTarget(),
    transaction_id: transactionId,
    value: total,
    currency: cur,
  });
}

/**
 * Track a page view.
 */
export function trackPageView(url: string) {
  gtag("event", "page_view", {
    page_path: url,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrency(): string {
  // Try to read from the store config injected via env var
  if (typeof window !== "undefined") {
    // The store config currency is available as a public env var
    return process.env.NEXT_PUBLIC_CURRENCY || "USD";
  }
  return "USD";
}

let _adsTarget: string | null = null;

/**
 * Returns the Google Ads conversion send_to target (e.g. "AW-123456789/label").
 * Fetched lazily from the tracking API and cached.
 */
function getAdsConversionTarget(): string | undefined {
  if (_adsTarget) return _adsTarget;

  // Try to read from a cached value set by the Analytics component
  if (typeof window !== "undefined") {
    const el = document.querySelector('meta[name="gads-conversion"]');
    if (el) {
      _adsTarget = el.getAttribute("content");
      return _adsTarget || undefined;
    }
  }
  return undefined;
}

/**
 * Set the Google Ads conversion target. Called by the Analytics component
 * after it fetches tracking settings.
 */
export function setAdsConversionTarget(conversionId: string, label: string) {
  _adsTarget = label ? `${conversionId}/${label}` : conversionId;

  // Also store in a meta tag for persistence across navigations
  if (typeof document !== "undefined") {
    let meta = document.querySelector(
      'meta[name="gads-conversion"]'
    ) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "gads-conversion";
      document.head.appendChild(meta);
    }
    meta.content = _adsTarget;
  }
}
