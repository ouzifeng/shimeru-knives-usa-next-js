import type { WCProduct, WCCategory, WCOrder, WCOrderPayload, WCShippingZone, WCShippingMethod, WCVariation, ProductReview } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_WORDPRESS_URL;
const CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

export async function wcFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = new URL(`/wp-json/wc/v3${endpoint}`, BASE_URL);
  url.searchParams.set("consumer_key", CONSUMER_KEY!);
  url.searchParams.set("consumer_secret", CONSUMER_SECRET!);

  const res = await fetch(url.toString(), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WooCommerce API error: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
  }

  return res.json();
}

export async function getProducts(params?: {
  per_page?: number;
  page?: number;
  category?: number;
  search?: string;
  orderby?: string;
  order?: "asc" | "desc";
  modified_after?: string;
}): Promise<WCProduct[]> {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value));
    });
  }
  const queryStr = query.toString() ? `&${query.toString()}` : "";
  return wcFetch<WCProduct[]>(`/products?${queryStr}`);
}

/** Like getProducts but also returns total count and pages from WC headers */
export async function getProductsPage(params?: Record<string, string | number>): Promise<{
  products: WCProduct[];
  total: number;
  totalPages: number;
}> {
  const url = new URL("/wp-json/wc/v3/products", BASE_URL);
  url.searchParams.set("consumer_key", CONSUMER_KEY!);
  url.searchParams.set("consumer_secret", CONSUMER_SECRET!);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
  }

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WooCommerce API error: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
  }

  const products: WCProduct[] = await res.json();
  const total = parseInt(res.headers.get("x-wp-total") || "0", 10);
  const totalPages = parseInt(res.headers.get("x-wp-totalpages") || "1", 10);

  return { products, total, totalPages };
}

export async function getProduct(slugOrId: string | number): Promise<WCProduct> {
  if (typeof slugOrId === "number") {
    return wcFetch<WCProduct>(`/products/${slugOrId}`);
  }
  const products = await wcFetch<WCProduct[]>(`/products?slug=${slugOrId}`);
  if (!products.length) throw new Error(`Product not found: ${slugOrId}`);
  return products[0];
}

export async function getCategories(): Promise<WCCategory[]> {
  return wcFetch<WCCategory[]>("/products/categories?per_page=100");
}

export async function getProductVariations(productId: number): Promise<WCVariation[]> {
  return wcFetch<WCVariation[]>(`/products/${productId}/variations?per_page=100`);
}

export async function getShippingZones(): Promise<WCShippingZone[]> {
  return wcFetch<WCShippingZone[]>("/shipping/zones");
}

export async function getShippingZoneMethods(zoneId: number): Promise<WCShippingMethod[]> {
  return wcFetch<WCShippingMethod[]>(`/shipping/zones/${zoneId}/methods`);
}

export async function getProductReviews(
  productId: number,
  params?: { per_page?: number; page?: number }
): Promise<ProductReview[]> {
  const query = new URLSearchParams();
  query.set("product", String(productId));
  query.set("per_page", String(params?.per_page || 25));
  if (params?.page) query.set("page", String(params.page));
  return wcFetch<ProductReview[]>(`/products/reviews?${query.toString()}`);
}

export async function createOrder(order: WCOrderPayload): Promise<WCOrder> {
  return wcFetch<WCOrder>("/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
}
