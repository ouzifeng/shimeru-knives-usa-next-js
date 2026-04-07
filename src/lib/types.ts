export interface WCProduct {
  id: number;
  name: string;
  slug: string;
  sku: string;
  status: "publish" | "draft" | "pending" | "private";
  type: "simple" | "variable" | "grouped" | "external";
  permalink: string;
  description: string;
  short_description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder";
  stock_quantity: number | null;
  images: WCImage[];
  categories: WCCategory[];
  tags: WCCategory[];
  attributes: WCAttribute[];
  variations: number[];
  average_rating: string;
  rating_count: number;
  date_modified: string;
}

export interface WCImage {
  id: number;
  src: string;
  name: string;
  alt: string;
}

export interface WCCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  image: WCImage | null;
  count: number;
}

export interface WCAttribute {
  id: number;
  name: string;
  options: string[];
}

export interface WCVariation {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder";
  stock_quantity: number | null;
  attributes: { name: string; option: string }[];
  image: WCImage | null;
}

export interface WCOrderLineItem {
  product_id: number;
  quantity: number;
  variation_id?: number;
}

export interface WCOrderPayload {
  payment_method: string;
  payment_method_title: string;
  set_paid: boolean;
  billing: WCAddress;
  shipping: WCAddress;
  line_items: WCOrderLineItem[];
  shipping_lines?: { method_id: string; method_title: string; total: string }[];
  coupon_lines?: { code: string }[];
  customer_note?: string;
}

export interface WCAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

export interface WCOrder {
  id: number;
  number: string;
  status: string;
  total: string;
  line_items: {
    id: number;
    name: string;
    quantity: number;
    total: string;
  }[];
}

export interface WCShippingZone {
  id: number;
  name: string;
  order: number;
}

export interface WCShippingMethod {
  id: number;
  instance_id: number;
  method_id: string;
  method_title: string;
  method_description: string;
  enabled: boolean;
  settings: {
    title?: { value: string };
    cost?: { value: string };
    min_amount?: { value: string };
    requires?: { value: string };
  };
}

// Supabase product row (what the frontend queries)
export interface Product {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  status: string;
  type: "simple" | "variable" | "grouped" | "external";
  description: string;
  short_description: string;
  price: number;
  regular_price: number | null;
  sale_price: number | null;
  on_sale: boolean;
  stock_status: string;
  stock_quantity: number | null;
  images: WCImage[];
  categories: { id: number; name: string; slug: string }[];
  average_rating: number | null;
  rating_count: number;
}

export interface ProductReview {
  id: number;
  reviewer: string;
  review: string;
  rating: number;
  verified: boolean;
  date_created: string;
}

// Cached variation row from Supabase
export interface ProductVariation {
  id: number;
  product_id: number;
  price: number;
  regular_price: number | null;
  sale_price: number | null;
  on_sale: boolean;
  stock_status: string;
  stock_quantity: number | null;
  attributes: { name: string; option: string }[];
  image: WCImage | null;
  cached_at: string;
}

export interface ProductFilter {
  search?: string;
  category?: string;
  stock_status?: string;
  min_price?: number;
  max_price?: number;
  on_sale?: boolean;
  attributes?: Record<string, string[]>;
  tags?: Record<string, string[]>;
  sort?: "price_asc" | "price_desc" | "name" | "newest";
  page?: number;
  per_page?: number;
}

export interface SyncState {
  id: number;
  last_synced_at: string | null;
  status: "idle" | "syncing" | "error";
  products_synced: number;
  products_total: number | null;
  sync_phase: "fetching" | "images" | "writing" | null;
  errors: string | null;
  started_at: string | null;
  completed_at: string | null;
}
