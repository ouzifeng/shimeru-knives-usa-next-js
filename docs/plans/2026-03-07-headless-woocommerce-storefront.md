# Headless WooCommerce Storefront - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a fast, modern, sellable Next.js storefront that uses WooCommerce as a headless backend, Supabase for product search/filtering, and Stripe Payment Element for checkout. Config-driven so any WooCommerce store owner can deploy it.

**Architecture:** Next.js App Router with server components for product pages (ISR). Supabase Postgres as a local product cache for fast search/filtering, synced from WooCommerce via a cron job using `modified_after` timestamps. Client-side cart via Zustand persisted to localStorage. Stripe Payment Element for checkout, with order creation via WooCommerce REST API. A store config file and setup wizard drive all customisation — no code changes needed for end users.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Zustand, Supabase (Postgres + Auth), Stripe Payment Element, WooCommerce REST API, Vercel Cron

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json` (via CLI)
- Create: `.env.local.example`
- Create: `store.config.ts`

**Step 1: Scaffold Next.js project**

Run:
```bash
cd C:/Users/David/woocommerce-next
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Expected: Next.js project created with App Router, TypeScript, Tailwind

**Step 2: Install dependencies**

Run:
```bash
npm install zustand @stripe/stripe-js @stripe/react-stripe-js stripe @supabase/supabase-js
```

**Step 3: Install shadcn/ui**

Run:
```bash
npx shadcn@latest init -d
```

**Step 4: Add shadcn components**

Run:
```bash
npx shadcn@latest add button card badge input label separator sheet skeleton select radio-group tabs
```

**Step 5: Create store config**

Create `store.config.ts`:
```typescript
export const storeConfig = {
  name: process.env.NEXT_PUBLIC_STORE_NAME || "Store",
  description: process.env.NEXT_PUBLIC_STORE_DESCRIPTION || "Fast, modern shopping",
  currency: process.env.NEXT_PUBLIC_CURRENCY || "GBP",
  currencySymbol: process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "£",
  locale: process.env.NEXT_PUBLIC_LOCALE || "en-GB",
  syncIntervalMinutes: 5,
};
```

**Step 6: Create environment variables template**

Create `.env.local.example`:
```env
# Store
NEXT_PUBLIC_STORE_NAME=My Store
NEXT_PUBLIC_STORE_DESCRIPTION=Fast, modern shopping
NEXT_PUBLIC_CURRENCY=GBP
NEXT_PUBLIC_CURRENCY_SYMBOL=£
NEXT_PUBLIC_LOCALE=en-GB

# WooCommerce
NEXT_PUBLIC_WORDPRESS_URL=https://your-store.com
WC_CONSUMER_KEY=ck_xxxxx
WC_CONSUMER_SECRET=cs_xxxxx

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_SECRET_KEY=sk_test_xxxxx

# Admin
ADMIN_PASSWORD=change-me
```

**Step 7: Verify it runs**

Run:
```bash
npm run dev
```

Expected: Dev server starts on localhost:3000

**Step 8: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Next.js project with dependencies and store config"
```

---

## Task 2: Supabase Schema & Client

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `supabase/migrations/001_initial_schema.sql`

**Step 1: Create Supabase migration**

Create `supabase/migrations/001_initial_schema.sql`:
```sql
-- Products table (synced from WooCommerce)
create table products (
  id integer primary key,
  name text not null,
  slug text unique not null,
  type text default 'simple',  -- simple, variable, grouped, external
  description text,
  short_description text,
  price numeric(10,2),
  regular_price numeric(10,2),
  sale_price numeric(10,2),
  on_sale boolean default false,
  stock_status text default 'instock',
  images jsonb default '[]',
  categories jsonb default '[]',
  wc_updated_at timestamptz,
  synced_at timestamptz default now()
);

-- Product attributes (flattened for filtering)
create table product_attributes (
  id serial primary key,
  product_id integer references products(id) on delete cascade,
  attribute_name text not null,
  attribute_value text not null
);

-- Product categories (flattened for filtering)
create table product_categories (
  id serial primary key,
  product_id integer references products(id) on delete cascade,
  category_id integer not null,
  category_name text not null,
  category_slug text not null
);

-- Product variations (cached from WC API, refreshed on demand)
create table product_variations (
  id integer primary key,
  product_id integer references products(id) on delete cascade,
  price numeric(10,2),
  regular_price numeric(10,2),
  sale_price numeric(10,2),
  on_sale boolean default false,
  stock_status text default 'instock',
  stock_quantity integer,
  attributes jsonb default '[]',  -- [{ "name": "Size", "option": "M" }, { "name": "Color", "option": "Blue" }]
  image jsonb,
  cached_at timestamptz default now()
);

create index idx_product_variations_product_id on product_variations(product_id);

-- Sync state
create table sync_state (
  id integer primary key default 1,
  last_synced_at timestamptz,
  status text default 'idle' check (status in ('idle', 'syncing', 'error')),
  products_synced integer default 0,
  errors text,
  started_at timestamptz,
  completed_at timestamptz
);

-- Insert initial sync state row
insert into sync_state (id, status) values (1, 'idle');

-- Indexes for fast filtering
create index idx_products_stock_status on products(stock_status);
create index idx_products_price on products(price);
create index idx_products_on_sale on products(on_sale);
create index idx_products_slug on products(slug);
create index idx_product_attributes_name_value on product_attributes(attribute_name, attribute_value);
create index idx_product_categories_category_id on product_categories(category_id);

-- Full text search
alter table products add column fts tsvector
  generated always as (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(short_description, ''))) stored;
create index idx_products_fts on products using gin(fts);
```

**Step 2: Create Supabase clients**

Create `src/lib/supabase.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

// Client-side (anon key, RLS applies)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server-side (service role, bypasses RLS)
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

**Step 3: Commit**

```bash
git add src/lib/supabase.ts supabase/
git commit -m "feat: add Supabase schema and client"
```

---

## Task 3: WooCommerce API Client

**Files:**
- Create: `src/lib/woocommerce.ts`
- Create: `src/lib/types.ts`

**Step 1: Define types**

Create `src/lib/types.ts`:
```typescript
export interface WCProduct {
  id: number;
  name: string;
  slug: string;
  type: "simple" | "variable" | "grouped" | "external";
  permalink: string;
  description: string;
  short_description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder";
  images: WCImage[];
  categories: WCCategory[];
  attributes: WCAttribute[];
  variations: number[];
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

export interface WCVariation {
  id: number;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder";
  stock_quantity: number | null;
  attributes: { name: string; option: string }[];
  image: WCImage | null;
}

export interface WCShippingMethod {
  id: number;
  method_id: string;
  method_title: string;
  settings: {
    cost?: { value: string };
  };
}

// Supabase product row (what the frontend queries)
export interface Product {
  id: number;
  name: string;
  slug: string;
  type: "simple" | "variable" | "grouped" | "external";
  description: string;
  short_description: string;
  price: number;
  regular_price: number | null;
  sale_price: number | null;
  on_sale: boolean;
  stock_status: string;
  images: WCImage[];
  categories: { id: number; name: string; slug: string }[];
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
  attributes?: Record<string, string[]>;
  sort?: "price_asc" | "price_desc" | "name" | "newest";
  page?: number;
  per_page?: number;
}

export interface SyncState {
  id: number;
  last_synced_at: string | null;
  status: "idle" | "syncing" | "error";
  products_synced: number;
  errors: string | null;
  started_at: string | null;
  completed_at: string | null;
}
```

**Step 2: Create WooCommerce API client**

Create `src/lib/woocommerce.ts`:
```typescript
import type { WCProduct, WCCategory, WCOrder, WCOrderPayload, WCShippingMethod } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_WORDPRESS_URL;
const CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

async function wcFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
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
    throw new Error(`WooCommerce API error: ${res.status} ${res.statusText}`);
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

export async function getShippingZoneMethods(zoneId: number): Promise<WCShippingMethod[]> {
  return wcFetch<WCShippingMethod[]>(`/shipping/zones/${zoneId}/methods`);
}

export async function getProductVariations(productId: number): Promise<WCVariation[]> {
  return wcFetch<WCVariation[]>(`/products/${productId}/variations?per_page=100`);
}

export async function createOrder(order: WCOrderPayload): Promise<WCOrder> {
  return wcFetch<WCOrder>("/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
}
```

**Step 3: Commit**

```bash
git add src/lib/
git commit -m "feat: add WooCommerce API client, types, and Supabase types"
```

---

## Task 4: Product Sync Engine

**Files:**
- Create: `src/lib/sync.ts`
- Create: `src/app/api/sync/route.ts`
- Create: `vercel.json`

**Step 1: Build sync engine**

Create `src/lib/sync.ts`:
```typescript
import { supabaseAdmin } from "./supabase";
import { getProducts } from "./woocommerce";
import type { WCProduct } from "./types";

export async function syncProducts(): Promise<{ synced: number; errors: string | null }> {
  // Check if already syncing
  const { data: state } = await supabaseAdmin
    .from("sync_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (state?.status === "syncing") {
    return { synced: 0, errors: "Sync already in progress" };
  }

  // Mark as syncing
  const syncStartedAt = new Date().toISOString();
  await supabaseAdmin
    .from("sync_state")
    .update({ status: "syncing", started_at: syncStartedAt, errors: null })
    .eq("id", 1);

  let totalSynced = 0;
  let syncError: string | null = null;

  try {
    const lastSyncedAt = state?.last_synced_at || null;
    let page = 1;

    while (true) {
      const params: Record<string, string | number> = {
        per_page: 100,
        page,
      };
      if (lastSyncedAt) {
        params.modified_after = lastSyncedAt;
      }

      const products = await getProducts(params as any);
      if (!products.length) break;

      await upsertProducts(products);
      totalSynced += products.length;
      page++;
    }
  } catch (err) {
    syncError = err instanceof Error ? err.message : "Unknown sync error";
  }

  // Update sync state — use startedAt as last_synced_at so overlapping changes get caught
  await supabaseAdmin
    .from("sync_state")
    .update({
      status: syncError ? "error" : "idle",
      last_synced_at: syncStartedAt,
      products_synced: totalSynced,
      errors: syncError,
      completed_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return { synced: totalSynced, errors: syncError };
}

async function upsertProducts(products: WCProduct[]) {
  // Upsert product rows
  const rows = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    type: p.type || "simple",
    description: p.description,
    short_description: p.short_description,
    price: parseFloat(p.price) || 0,
    regular_price: p.regular_price ? parseFloat(p.regular_price) : null,
    sale_price: p.sale_price ? parseFloat(p.sale_price) : null,
    on_sale: p.on_sale,
    stock_status: p.stock_status,
    images: p.images,
    categories: p.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    wc_updated_at: p.date_modified,
    synced_at: new Date().toISOString(),
  }));

  await supabaseAdmin.from("products").upsert(rows, { onConflict: "id" });

  // Rebuild attributes and categories for these products
  const productIds = products.map((p) => p.id);

  // Delete old attributes/categories for these products
  await supabaseAdmin.from("product_attributes").delete().in("product_id", productIds);
  await supabaseAdmin.from("product_categories").delete().in("product_id", productIds);

  // Insert fresh attributes
  const attrRows = products.flatMap((p) =>
    p.attributes.flatMap((attr) =>
      attr.options.map((value) => ({
        product_id: p.id,
        attribute_name: attr.name,
        attribute_value: value,
      }))
    )
  );
  if (attrRows.length) {
    await supabaseAdmin.from("product_attributes").insert(attrRows);
  }

  // Insert fresh categories
  const catRows = products.flatMap((p) =>
    p.categories.map((cat) => ({
      product_id: p.id,
      category_id: cat.id,
      category_name: cat.name,
      category_slug: cat.slug,
    }))
  );
  if (catRows.length) {
    await supabaseAdmin.from("product_categories").insert(catRows);
  }
}
```

**Step 2: Create sync API route**

Create `src/app/api/sync/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { syncProducts } from "@/lib/sync";

export async function POST(req: NextRequest) {
  // Verify this is from Vercel Cron or admin
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncProducts();
  return NextResponse.json(result);
}
```

**Step 3: Configure Vercel cron**

Create `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/sync",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Step 4: Commit**

```bash
git add src/lib/sync.ts src/app/api/sync/ vercel.json
git commit -m "feat: add product sync engine with cron support"
```

---

## Task 5: Product Query Layer (Supabase)

**Files:**
- Create: `src/lib/products.ts`

**Step 1: Build product query functions**

Create `src/lib/products.ts`:
```typescript
import { supabase } from "./supabase";
import type { Product, ProductFilter } from "./types";

export async function queryProducts(filters: ProductFilter = {}): Promise<{
  products: Product[];
  total: number;
}> {
  const page = filters.page || 1;
  const perPage = filters.per_page || 24;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase.from("products").select("*", { count: "exact" });

  // Full text search
  if (filters.search) {
    query = query.textSearch("fts", filters.search, { type: "websearch" });
  }

  // Stock status
  if (filters.stock_status) {
    query = query.eq("stock_status", filters.stock_status);
  }

  // Price range
  if (filters.min_price !== undefined) {
    query = query.gte("price", filters.min_price);
  }
  if (filters.max_price !== undefined) {
    query = query.lte("price", filters.max_price);
  }

  // On sale
  if (filters.attributes?.on_sale) {
    query = query.eq("on_sale", true);
  }

  // Category filter (requires subquery via product_categories)
  if (filters.category) {
    const { data: catProducts } = await supabase
      .from("product_categories")
      .select("product_id")
      .eq("category_slug", filters.category);
    const ids = catProducts?.map((r) => r.product_id) || [];
    query = query.in("id", ids.length ? ids : [-1]);
  }

  // Attribute filters (e.g. { "Color": ["Blue", "Red"], "Size": ["M"] })
  if (filters.attributes) {
    for (const [attrName, values] of Object.entries(filters.attributes)) {
      if (attrName === "on_sale") continue;
      const { data: attrProducts } = await supabase
        .from("product_attributes")
        .select("product_id")
        .eq("attribute_name", attrName)
        .in("attribute_value", values);
      const ids = attrProducts?.map((r) => r.product_id) || [];
      query = query.in("id", ids.length ? ids : [-1]);
    }
  }

  // Sorting
  switch (filters.sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "name":
      query = query.order("name", { ascending: true });
      break;
    case "newest":
    default:
      query = query.order("wc_updated_at", { ascending: false });
      break;
  }

  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  return { products: (data as Product[]) || [], total: count || 0 };
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) return null;
  return data as Product;
}

export async function getFilterOptions(): Promise<{
  categories: { slug: string; name: string; count: number }[];
  attributes: Record<string, { value: string; count: number }[]>;
  priceRange: { min: number; max: number };
}> {
  // Categories with counts
  const { data: cats } = await supabase
    .from("product_categories")
    .select("category_slug, category_name");

  const catCounts = new Map<string, { name: string; count: number }>();
  for (const row of cats || []) {
    const existing = catCounts.get(row.category_slug);
    if (existing) {
      existing.count++;
    } else {
      catCounts.set(row.category_slug, { name: row.category_name, count: 1 });
    }
  }
  const categories = Array.from(catCounts.entries()).map(([slug, { name, count }]) => ({
    slug,
    name,
    count,
  }));

  // Attributes with counts
  const { data: attrs } = await supabase
    .from("product_attributes")
    .select("attribute_name, attribute_value");

  const attrMap = new Map<string, Map<string, number>>();
  for (const row of attrs || []) {
    if (!attrMap.has(row.attribute_name)) {
      attrMap.set(row.attribute_name, new Map());
    }
    const valueMap = attrMap.get(row.attribute_name)!;
    valueMap.set(row.attribute_value, (valueMap.get(row.attribute_value) || 0) + 1);
  }
  const attributes: Record<string, { value: string; count: number }[]> = {};
  for (const [name, valueMap] of attrMap) {
    attributes[name] = Array.from(valueMap.entries()).map(([value, count]) => ({
      value,
      count,
    }));
  }

  // Price range
  const { data: priceData } = await supabase
    .from("products")
    .select("price")
    .order("price", { ascending: true })
    .limit(1);
  const { data: priceDataMax } = await supabase
    .from("products")
    .select("price")
    .order("price", { ascending: false })
    .limit(1);

  const priceRange = {
    min: priceData?.[0]?.price || 0,
    max: priceDataMax?.[0]?.price || 1000,
  };

  return { categories, attributes, priceRange };
}
```

**Step 2: Commit**

```bash
git add src/lib/products.ts
git commit -m "feat: add Supabase product query layer with search and filtering"
```

---

## Task 6: Cart Store

**Files:**
- Create: `src/lib/cart-store.ts`
- Create: `src/components/cart-provider.tsx`

**Step 1: Create Zustand cart store**

Create `src/lib/cart-store.ts`:
```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "./types";

export interface CartItem {
  product: Product;
  quantity: number;
  variationId?: number;
}

interface CartStore {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, variationId?: number) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  total: () => number;
  itemCount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, quantity = 1, variationId) => {
        set((state) => {
          // For variable products, match on variationId too
          const existing = state.items.find(
            (i) => i.product.id === product.id && i.variationId === variationId
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.product.id === product.id && i.variationId === variationId
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            };
          }
          return { items: [...state.items, { product, quantity, variationId }] };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((i) => i.product.id !== productId),
        }));
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.product.id === productId ? { ...i, quantity } : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      total: () =>
        get().items.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0
        ),

      itemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    { name: "wc-cart" }
  )
);
```

**Step 2: Create cart provider for hydration safety**

Create `src/components/cart-provider.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <>{children}</>;
  return <>{children}</>;
}
```

**Step 3: Commit**

```bash
git add src/lib/cart-store.ts src/components/cart-provider.tsx
git commit -m "feat: add Zustand cart store with localStorage persistence"
```

---

## Task 7: Site Layout & Navigation

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/components/header.tsx`
- Create: `src/components/cart-sheet.tsx`

**Step 1: Install lucide-react**

Run:
```bash
npm install lucide-react
```

**Step 2: Build header with cart button**

Create `src/components/header.tsx`:
```typescript
"use client";

import Link from "next/link";
import { ShoppingCart, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCartStore } from "@/lib/cart-store";
import { CartSheet } from "./cart-sheet";
import { useState } from "react";
import { storeConfig } from "../../store.config";

export function Header() {
  const itemCount = useCartStore((s) => s.itemCount());
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold">
          {storeConfig.name}
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/products" className="text-sm hover:underline">
            Products
          </Link>
          <Link href="/products?search=" className="text-sm hover:underline">
            <Search className="h-4 w-4" />
          </Link>
          <Button variant="outline" size="icon" className="relative" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-5 w-5" />
            {itemCount > 0 && (
              <Badge className="absolute -right-2 -top-2 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center">
                {itemCount}
              </Badge>
            )}
          </Button>
        </nav>
      </div>
      <CartSheet open={cartOpen} onOpenChange={setCartOpen} />
    </header>
  );
}
```

**Step 3: Build slide-out cart sheet**

Create `src/components/cart-sheet.tsx`:
```typescript
"use client";

import Link from "next/link";
import Image from "next/image";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCartStore } from "@/lib/cart-store";
import { Minus, Plus, Trash2 } from "lucide-react";
import { storeConfig } from "../../store.config";

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartSheet({ open, onOpenChange }: CartSheetProps) {
  const { items, updateQuantity, removeItem, total } = useCartStore();
  const sym = storeConfig.currencySymbol;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Cart</SheetTitle>
        </SheetHeader>
        {items.length === 0 ? (
          <p className="flex-1 flex items-center justify-center text-muted-foreground">
            Your cart is empty
          </p>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 py-4">
              {items.map((item) => (
                <div key={item.product.id} className="flex gap-3">
                  {item.product.images[0] && (
                    <Image
                      src={item.product.images[0].src}
                      alt={item.product.images[0].alt || item.product.name}
                      width={64}
                      height={64}
                      className="rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {sym}{item.product.price.toFixed(2)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm w-6 text-center">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-auto"
                        onClick={() => removeItem(item.product.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="py-4 space-y-4">
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span>{sym}{total().toFixed(2)}</span>
              </div>
              <Button className="w-full" asChild onClick={() => onOpenChange(false)}>
                <Link href="/checkout">Checkout</Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

**Step 4: Update root layout**

Modify `src/app/layout.tsx`:
```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { CartProvider } from "@/components/cart-provider";
import { storeConfig } from "../../store.config";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: storeConfig.name,
  description: storeConfig.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <CartProvider>
          <Header />
          <main className="container mx-auto px-4 py-8">{children}</main>
        </CartProvider>
      </body>
    </html>
  );
}
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add config-driven site layout, header, and cart slide-out"
```

---

## Task 8: Product Listing Page with Filters

**Files:**
- Create: `src/app/products/page.tsx`
- Create: `src/components/product-card.tsx`
- Create: `src/components/product-filters.tsx`

**Step 1: Build product card component**

Create `src/components/product-card.tsx`:
```typescript
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/lib/types";
import { storeConfig } from "../../store.config";

export function ProductCard({ product }: { product: Product }) {
  const sym = storeConfig.currencySymbol;

  return (
    <Link href={`/products/${product.slug}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        {product.images[0] && (
          <div className="aspect-square relative">
            <Image
              src={product.images[0].src}
              alt={product.images[0].alt || product.name}
              fill
              className="object-cover"
            />
            {product.on_sale && (
              <Badge className="absolute top-2 right-2" variant="destructive">
                Sale
              </Badge>
            )}
          </div>
        )}
        <CardContent className="p-4">
          <h3 className="font-medium">{product.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-bold">{sym}{product.price.toFixed(2)}</span>
            {product.on_sale && product.regular_price && (
              <span className="text-sm text-muted-foreground line-through">
                {sym}{product.regular_price.toFixed(2)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

**Step 2: Build product filters sidebar**

Create `src/components/product-filters.tsx`:
```typescript
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface FilterOptions {
  categories: { slug: string; name: string; count: number }[];
  attributes: Record<string, { value: string; count: number }[]>;
  priceRange: { min: number; max: number };
}

export function ProductFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/products?${params.toString()}`);
  };

  const currentCategory = searchParams.get("category");
  const currentStock = searchParams.get("stock_status");
  const currentSearch = searchParams.get("search");

  return (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <Label>Search</Label>
        <Input
          placeholder="Search products..."
          defaultValue={currentSearch || ""}
          onChange={(e) => {
            // Debounce would be nice here
            if (e.target.value.length > 2 || e.target.value.length === 0) {
              updateFilter("search", e.target.value || null);
            }
          }}
        />
      </div>

      <Separator />

      {/* Categories */}
      <div>
        <Label className="mb-2 block">Categories</Label>
        <div className="space-y-1">
          <button
            className={`text-sm block w-full text-left px-2 py-1 rounded ${!currentCategory ? "bg-accent" : "hover:bg-accent/50"}`}
            onClick={() => updateFilter("category", null)}
          >
            All
          </button>
          {options.categories.map((cat) => (
            <button
              key={cat.slug}
              className={`text-sm block w-full text-left px-2 py-1 rounded ${currentCategory === cat.slug ? "bg-accent" : "hover:bg-accent/50"}`}
              onClick={() => updateFilter("category", cat.slug)}
            >
              {cat.name} ({cat.count})
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Stock status */}
      <div>
        <Label className="mb-2 block">Availability</Label>
        <div className="space-y-1">
          <button
            className={`text-sm block w-full text-left px-2 py-1 rounded ${!currentStock ? "bg-accent" : "hover:bg-accent/50"}`}
            onClick={() => updateFilter("stock_status", null)}
          >
            All
          </button>
          <button
            className={`text-sm block w-full text-left px-2 py-1 rounded ${currentStock === "instock" ? "bg-accent" : "hover:bg-accent/50"}`}
            onClick={() => updateFilter("stock_status", "instock")}
          >
            In Stock
          </button>
        </div>
      </div>

      <Separator />

      {/* Dynamic attributes (Color, Size, etc.) */}
      {Object.entries(options.attributes).map(([attrName, values]) => (
        <div key={attrName}>
          <Label className="mb-2 block">{attrName}</Label>
          <div className="space-y-1">
            {values.map((v) => (
              <button
                key={v.value}
                className={`text-sm block w-full text-left px-2 py-1 rounded ${searchParams.get(`attr_${attrName}`) === v.value ? "bg-accent" : "hover:bg-accent/50"}`}
                onClick={() => updateFilter(`attr_${attrName}`, searchParams.get(`attr_${attrName}`) === v.value ? null : v.value)}
              >
                {v.value} ({v.count})
              </button>
            ))}
          </div>
          <Separator className="mt-4" />
        </div>
      ))}

      {/* Sort */}
      <div>
        <Label className="mb-2 block">Sort by</Label>
        <div className="space-y-1">
          {[
            { value: "newest", label: "Newest" },
            { value: "price_asc", label: "Price: Low to High" },
            { value: "price_desc", label: "Price: High to Low" },
            { value: "name", label: "Name" },
          ].map((option) => (
            <button
              key={option.value}
              className={`text-sm block w-full text-left px-2 py-1 rounded ${(searchParams.get("sort") || "newest") === option.value ? "bg-accent" : "hover:bg-accent/50"}`}
              onClick={() => updateFilter("sort", option.value === "newest" ? null : option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <Button variant="outline" className="w-full" onClick={() => router.push("/products")}>
        Clear Filters
      </Button>
    </div>
  );
}
```

**Step 3: Build products listing page**

Create `src/app/products/page.tsx`:
```typescript
import { queryProducts, getFilterOptions } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import { ProductFilters } from "@/components/product-filters";
import type { ProductFilter } from "@/lib/types";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;

  // Build filters from URL params
  const filters: ProductFilter = {
    search: params.search || undefined,
    category: params.category || undefined,
    stock_status: params.stock_status || undefined,
    sort: (params.sort as ProductFilter["sort"]) || undefined,
    page: params.page ? parseInt(params.page) : 1,
    per_page: 24,
  };

  // Extract attribute filters (attr_Color=Blue etc.)
  const attributes: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("attr_") && value) {
      attributes[key.replace("attr_", "")] = [value];
    }
  }
  if (Object.keys(attributes).length) {
    filters.attributes = attributes;
  }

  const [{ products, total }, filterOptions] = await Promise.all([
    queryProducts(filters),
    getFilterOptions(),
  ]);

  return (
    <div className="flex gap-8">
      <aside className="w-64 shrink-0 hidden md:block">
        <ProductFilters options={filterOptions} />
      </aside>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">{total} products</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        {products.length === 0 && (
          <p className="text-center text-muted-foreground py-12">
            No products found matching your filters.
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/app/products/page.tsx src/components/product-card.tsx src/components/product-filters.tsx
git commit -m "feat: add product listing with search, filtering, and sorting via Supabase"
```

---

## Task 9: Variation Caching Layer

**Files:**
- Create: `src/lib/variations.ts`
- Create: `src/app/api/products/[id]/variations/route.ts`

**Step 1: Build variation cache with stale-while-revalidate**

Create `src/lib/variations.ts`:
```typescript
import { supabaseAdmin } from "./supabase";
import { supabase } from "./supabase";
import { getProductVariations } from "./woocommerce";
import type { ProductVariation } from "./types";

const CACHE_TTL_MINUTES = 5;

// Get variations — returns cached data immediately, refreshes in background if stale
export async function getCachedVariations(productId: number): Promise<ProductVariation[]> {
  // Try cache first
  const { data: cached } = await supabase
    .from("product_variations")
    .select("*")
    .eq("product_id", productId)
    .order("id");

  const isStale = !cached?.length || isExpired(cached[0].cached_at);

  if (cached?.length && !isStale) {
    return cached as ProductVariation[];
  }

  // If stale or empty, refresh from WC
  // If we have stale data, return it and refresh in background
  if (cached?.length && isStale) {
    // Fire and forget — refresh in background
    refreshVariations(productId).catch(() => {});
    return cached as ProductVariation[];
  }

  // No cached data — must fetch synchronously
  return refreshVariations(productId);
}

async function refreshVariations(productId: number): Promise<ProductVariation[]> {
  const wcVariations = await getProductVariations(productId);

  // Delete old cached variations for this product
  await supabaseAdmin
    .from("product_variations")
    .delete()
    .eq("product_id", productId);

  const rows = wcVariations.map((v) => ({
    id: v.id,
    product_id: productId,
    price: parseFloat(v.price) || 0,
    regular_price: v.regular_price ? parseFloat(v.regular_price) : null,
    sale_price: v.sale_price ? parseFloat(v.sale_price) : null,
    on_sale: v.on_sale,
    stock_status: v.stock_status,
    stock_quantity: v.stock_quantity,
    attributes: v.attributes,
    image: v.image,
    cached_at: new Date().toISOString(),
  }));

  if (rows.length) {
    await supabaseAdmin.from("product_variations").upsert(rows, { onConflict: "id" });
  }

  return rows as ProductVariation[];
}

function isExpired(cachedAt: string): boolean {
  const cached = new Date(cachedAt).getTime();
  const now = Date.now();
  return now - cached > CACHE_TTL_MINUTES * 60 * 1000;
}
```

**Step 2: Create variations API route**

Create `src/app/api/products/[id]/variations/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCachedVariations } from "@/lib/variations";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const productId = parseInt(id);

  if (isNaN(productId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const variations = await getCachedVariations(productId);
  return NextResponse.json(variations);
}
```

**Step 3: Commit**

```bash
git add src/lib/variations.ts src/app/api/products/
git commit -m "feat: add variation caching layer with stale-while-revalidate"
```

---

## Task 10: Product Detail Page with Variation Picker

**Files:**
- Create: `src/app/products/[slug]/page.tsx`
- Create: `src/components/add-to-cart-button.tsx`
- Create: `src/components/variation-picker.tsx`

**Step 1: Create variation picker (lazy-loaded, fetches from cache)**

Create `src/components/variation-picker.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { storeConfig } from "../../store.config";
import type { ProductVariation, WCAttribute } from "@/lib/types";

interface Props {
  productId: number;
  attributes: WCAttribute[];
  onVariationChange: (variation: ProductVariation | null) => void;
}

export function VariationPicker({ productId, attributes, onVariationChange }: Props) {
  const [variations, setVariations] = useState<ProductVariation[] | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const sym = storeConfig.currencySymbol;

  // Lazy load variations from cached API
  useEffect(() => {
    fetch(`/api/products/${productId}/variations`)
      .then((res) => res.json())
      .then((data) => setVariations(data));
  }, [productId]);

  // Find matching variation when selection changes
  useEffect(() => {
    if (!variations) return;

    const attrCount = attributes.length;
    const selectedCount = Object.keys(selected).length;

    if (selectedCount < attrCount) {
      onVariationChange(null);
      return;
    }

    const match = variations.find((v) =>
      v.attributes.every((attr) => selected[attr.name] === attr.option)
    );

    onVariationChange(match || null);
  }, [selected, variations, attributes, onVariationChange]);

  // Check if a specific option is available (any variation with that option is in stock)
  const isOptionAvailable = (attrName: string, optionValue: string): boolean => {
    if (!variations) return true;
    return variations.some(
      (v) =>
        v.attributes.some((a) => a.name === attrName && a.option === optionValue) &&
        v.stock_status === "instock"
    );
  };

  if (!variations) {
    return (
      <div className="space-y-4">
        {attributes.map((attr) => (
          <div key={attr.name}>
            <Skeleton className="h-4 w-20 mb-2" />
            <div className="flex gap-2">
              {attr.options.map((opt) => (
                <Skeleton key={opt} className="h-10 w-16" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {attributes.map((attr) => (
        <div key={attr.name}>
          <Label className="mb-2 block">
            {attr.name}
            {selected[attr.name] && (
              <span className="text-muted-foreground ml-2">: {selected[attr.name]}</span>
            )}
          </Label>
          <div className="flex flex-wrap gap-2">
            {attr.options.map((option) => {
              const available = isOptionAvailable(attr.name, option);
              const isSelected = selected[attr.name] === option;

              return (
                <button
                  key={option}
                  type="button"
                  disabled={!available}
                  className={`px-4 py-2 border rounded-md text-sm transition-colors ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : available
                        ? "hover:border-primary"
                        : "opacity-40 line-through cursor-not-allowed"
                  }`}
                  onClick={() =>
                    setSelected((prev) => ({
                      ...prev,
                      [attr.name]: isSelected ? "" : option,
                    }))
                  }
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Create add-to-cart button (supports variations)**

Create `src/components/add-to-cart-button.tsx`:
```typescript
"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/cart-store";
import { VariationPicker } from "./variation-picker";
import { storeConfig } from "../../store.config";
import type { Product, ProductVariation, WCAttribute } from "@/lib/types";

interface Props {
  product: Product;
  attributes?: WCAttribute[];
}

export function AddToCartButton({ product, attributes }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);
  const sym = storeConfig.currencySymbol;

  const handleVariationChange = useCallback((variation: ProductVariation | null) => {
    setSelectedVariation(variation);
  }, []);

  const isVariable = product.type === "variable";
  const canAdd = isVariable
    ? selectedVariation && selectedVariation.stock_status === "instock"
    : product.stock_status === "instock";

  const displayPrice = isVariable && selectedVariation
    ? selectedVariation.price
    : product.price;

  const handleAdd = () => {
    addItem(product, 1, selectedVariation?.id);
  };

  return (
    <div className="space-y-4">
      {isVariable && attributes && (
        <VariationPicker
          productId={product.id}
          attributes={attributes}
          onVariationChange={handleVariationChange}
        />
      )}

      {isVariable && selectedVariation && (
        <p className="text-2xl font-bold">{sym}{selectedVariation.price.toFixed(2)}</p>
      )}

      <Button
        size="lg"
        onClick={handleAdd}
        disabled={!canAdd}
      >
        {!isVariable && product.stock_status !== "instock"
          ? "Out of Stock"
          : isVariable && !selectedVariation
            ? "Select Options"
            : isVariable && selectedVariation?.stock_status !== "instock"
              ? "Out of Stock"
              : "Add to Cart"}
      </Button>
    </div>
  );
}
```

**Step 3: Build product detail page (serves attributes for variation picker)**

Create `src/app/products/[slug]/page.tsx`:
```typescript
import Image from "next/image";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/products";
import { getProductAttributes } from "@/lib/products";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { Badge } from "@/components/ui/badge";
import { storeConfig } from "../../../../store.config";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  // Get attributes from Supabase for the variation picker
  const attributes = product.type === "variable"
    ? await getProductAttributes(product.id)
    : [];

  const sym = storeConfig.currencySymbol;
  const isVariable = product.type === "variable";

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div className="aspect-square relative rounded-lg overflow-hidden">
        {product.images[0] && (
          <Image
            src={product.images[0].src}
            alt={product.images[0].alt || product.name}
            fill
            className="object-cover"
          />
        )}
        {product.on_sale && (
          <Badge className="absolute top-4 right-4" variant="destructive">
            Sale
          </Badge>
        )}
      </div>
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">{product.name}</h1>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">
            {isVariable ? `From ${sym}${product.price.toFixed(2)}` : `${sym}${product.price.toFixed(2)}`}
          </span>
          {product.on_sale && product.regular_price && !isVariable && (
            <span className="text-lg text-muted-foreground line-through">
              {sym}{product.regular_price.toFixed(2)}
            </span>
          )}
        </div>
        <div
          className="prose prose-sm"
          dangerouslySetInnerHTML={{ __html: product.description }}
        />
        <AddToCartButton
          product={product}
          attributes={attributes.length ? attributes : undefined}
        />
      </div>
    </div>
  );
}
```

**Step 4: Add `getProductAttributes` to the products query layer**

Add to `src/lib/products.ts`:
```typescript
export async function getProductAttributes(productId: number): Promise<WCAttribute[]> {
  const { data } = await supabase
    .from("product_attributes")
    .select("attribute_name, attribute_value")
    .eq("product_id", productId);

  if (!data) return [];

  // Group by attribute name into WCAttribute format
  const attrMap = new Map<string, string[]>();
  for (const row of data) {
    if (!attrMap.has(row.attribute_name)) {
      attrMap.set(row.attribute_name, []);
    }
    attrMap.get(row.attribute_name)!.push(row.attribute_value);
  }

  return Array.from(attrMap.entries()).map(([name, options], i) => ({
    id: i,
    name,
    options,
  }));
}
```

**Step 5: Commit**

```bash
git add src/app/products/[slug]/ src/components/add-to-cart-button.tsx src/components/variation-picker.tsx src/lib/products.ts
git commit -m "feat: add product detail page with lazy-loaded variation picker"
```

---

## Task 11: Shipping Options

**Files:**
- Create: `src/lib/shipping.ts`
- Create: `src/components/shipping-selector.tsx`

**Step 1: Create shipping helper**

Create `src/lib/shipping.ts`:
```typescript
import { getShippingZoneMethods } from "./woocommerce";
import type { WCShippingMethod } from "./types";

export interface ShippingOption {
  id: string;
  title: string;
  cost: number;
}

export async function getShippingOptions(): Promise<ShippingOption[]> {
  // Fetch methods from the default zone (0) and zone 1
  // Adjust zone IDs based on your WooCommerce setup
  const zones = [0, 1];
  const allMethods: WCShippingMethod[] = [];

  for (const zoneId of zones) {
    try {
      const methods = await getShippingZoneMethods(zoneId);
      allMethods.push(...methods);
    } catch {
      // Zone might not exist, skip
    }
  }

  return allMethods
    .filter((m) => m.settings.cost)
    .map((m) => ({
      id: m.method_id,
      title: m.method_title,
      cost: parseFloat(m.settings.cost?.value || "0"),
    }));
}
```

**Step 2: Create shipping selector component**

Create `src/components/shipping-selector.tsx`:
```typescript
"use client";

import { Label } from "@/components/ui/label";
import { storeConfig } from "../../store.config";
import type { ShippingOption } from "@/lib/shipping";

interface Props {
  options: ShippingOption[];
  selected: string | null;
  onSelect: (option: ShippingOption) => void;
}

export function ShippingSelector({ options, selected, onSelect }: Props) {
  const sym = storeConfig.currencySymbol;

  return (
    <div>
      <Label className="mb-2 block">Shipping</Label>
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`w-full flex items-center justify-between p-3 border rounded-lg text-sm ${
              selected === option.id ? "border-primary bg-accent" : "hover:bg-accent/50"
            }`}
            onClick={() => onSelect(option)}
          >
            <span>{option.title}</span>
            <span className="font-medium">
              {option.cost === 0 ? "Free" : `${sym}${option.cost.toFixed(2)}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/lib/shipping.ts src/components/shipping-selector.tsx
git commit -m "feat: add shipping options from WooCommerce zones"
```

---

## Task 12: Checkout Page & Stripe Integration

**Files:**
- Create: `src/lib/stripe.ts`
- Create: `src/app/api/create-payment-intent/route.ts`
- Create: `src/app/api/create-order/route.ts`
- Create: `src/app/checkout/page.tsx`
- Create: `src/components/checkout-form.tsx`

**Step 1: Create Stripe helpers**

Create `src/lib/stripe.ts`:
```typescript
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia",
});
```

**Step 2: Create PaymentIntent API route**

Create `src/app/api/create-payment-intent/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { storeConfig } from "../../../../store.config";

export async function POST(req: NextRequest) {
  const { amount } = await req.json();

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: storeConfig.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
  });

  return NextResponse.json({ clientSecret: paymentIntent.client_secret });
}
```

**Step 3: Create order creation API route**

Create `src/app/api/create-order/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/woocommerce";

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const order = await createOrder({
      payment_method: "stripe",
      payment_method_title: "Credit Card (Stripe)",
      set_paid: true,
      billing: body.billing,
      shipping: body.shipping,
      line_items: body.line_items,
      shipping_lines: body.shipping_lines,
    });

    return NextResponse.json(order);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Order creation failed" },
      { status: 500 }
    );
  }
}
```

**Step 4: Build checkout form**

Create `src/components/checkout-form.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCartStore } from "@/lib/cart-store";
import { ShippingSelector } from "./shipping-selector";
import { storeConfig } from "../../store.config";
import type { WCAddress } from "@/lib/types";
import type { ShippingOption } from "@/lib/shipping";

interface Props {
  shippingOptions: ShippingOption[];
}

export function CheckoutForm({ shippingOptions }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { items, total, clearCart } = useCartStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(
    shippingOptions[0] || null
  );
  const sym = storeConfig.currencySymbol;

  const [billing, setBilling] = useState<WCAddress>({
    first_name: "",
    last_name: "",
    address_1: "",
    city: "",
    state: "",
    postcode: "",
    country: "GB",
    email: "",
    phone: "",
  });

  const updateField = (field: keyof WCAddress, value: string) => {
    setBilling((prev) => ({ ...prev, [field]: value }));
  };

  const shippingCost = selectedShipping?.cost || 0;
  const grandTotal = total() + shippingCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !selectedShipping) return;

    setLoading(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message || "Payment failed");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billing,
          shipping: billing,
          line_items: items.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
            ...(item.variationId && { variation_id: item.variationId }),
          })),
          shipping_lines: [
            {
              method_id: selectedShipping.id,
              method_title: selectedShipping.title,
              total: selectedShipping.cost.toFixed(2),
            },
          ],
        }),
      });

      const order = await res.json();
      if (!res.ok) throw new Error(order.error || "Order creation failed");

      clearCart();
      router.push(`/order-confirmation/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order creation failed");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" required value={billing.first_name} onChange={(e) => updateField("first_name", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" required value={billing.last_name} onChange={(e) => updateField("last_name", e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={billing.email} onChange={(e) => updateField("email", e.target.value)} />
      </div>
      <div>
        <Label htmlFor="address_1">Address</Label>
        <Input id="address_1" required value={billing.address_1} onChange={(e) => updateField("address_1", e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" required value={billing.city} onChange={(e) => updateField("city", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="state">State / County</Label>
          <Input id="state" required value={billing.state} onChange={(e) => updateField("state", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="postcode">Postcode</Label>
          <Input id="postcode" required value={billing.postcode} onChange={(e) => updateField("postcode", e.target.value)} />
        </div>
      </div>

      <Separator />

      <ShippingSelector
        options={shippingOptions}
        selected={selectedShipping?.id || null}
        onSelect={setSelectedShipping}
      />

      <Separator />

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{sym}{total().toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Shipping ({selectedShipping?.title})</span>
          <span>{shippingCost === 0 ? "Free" : `${sym}${shippingCost.toFixed(2)}`}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-bold text-base">
          <span>Total</span>
          <span>{sym}{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <div>
        <Label>Payment</Label>
        <div className="mt-2 p-4 border rounded-lg">
          <PaymentElement />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" size="lg" disabled={!stripe || loading}>
        {loading ? "Processing..." : `Pay ${sym}${grandTotal.toFixed(2)}`}
      </Button>
    </form>
  );
}
```

**Step 5: Build checkout page**

Create `src/app/checkout/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { CheckoutForm } from "@/components/checkout-form";
import { useCartStore } from "@/lib/cart-store";
import type { ShippingOption } from "@/lib/shipping";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function CheckoutPage() {
  const { items, total } = useCartStore();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);

  useEffect(() => {
    // Fetch shipping options
    fetch("/api/shipping")
      .then((res) => res.json())
      .then((data) => setShippingOptions(data));
  }, []);

  useEffect(() => {
    if (items.length === 0) return;

    // Create payment intent with estimated total (shipping added later)
    fetch("/api/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: total() + (shippingOptions[0]?.cost || 0) }),
    })
      .then((res) => res.json())
      .then((data) => setClientSecret(data.clientSecret));
  }, [items, total, shippingOptions]);

  if (items.length === 0) {
    return <p className="text-center text-muted-foreground py-12">Your cart is empty.</p>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Checkout</h1>
      {clientSecret ? (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <CheckoutForm shippingOptions={shippingOptions} />
        </Elements>
      ) : (
        <p className="text-center text-muted-foreground">Loading...</p>
      )}
    </div>
  );
}
```

**Step 6: Create shipping API route**

Create `src/app/api/shipping/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getShippingOptions } from "@/lib/shipping";

export async function GET() {
  const options = await getShippingOptions();
  return NextResponse.json(options);
}
```

**Step 7: Commit**

```bash
git add src/lib/stripe.ts src/app/api/ src/app/checkout/ src/components/checkout-form.tsx src/app/api/shipping/
git commit -m "feat: add checkout with Stripe, shipping selection, and order creation"
```

---

## Task 13: Order Confirmation Page

**Files:**
- Create: `src/app/order-confirmation/[id]/page.tsx`

**Step 1: Build confirmation page**

Create `src/app/order-confirmation/[id]/page.tsx`:
```typescript
import { CheckCircle } from "lucide-react";
import { storeConfig } from "../../../../store.config";

export default async function OrderConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="max-w-md mx-auto text-center py-12 space-y-4">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
      <h1 className="text-3xl font-bold">Order Confirmed</h1>
      <p className="text-muted-foreground">
        Your order #{id} has been placed successfully.
      </p>
      <p className="text-sm text-muted-foreground">
        You will receive a confirmation email shortly.
      </p>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/order-confirmation/
git commit -m "feat: add order confirmation page"
```

---

## Task 14: Homepage

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Build homepage**

Replace `src/app/page.tsx`:
```typescript
import Link from "next/link";
import { queryProducts } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { storeConfig } from "../../store.config";

export default async function HomePage() {
  const { products } = await queryProducts({ per_page: 8, sort: "newest" });

  return (
    <div className="space-y-12">
      <section className="text-center py-16 space-y-4">
        <h1 className="text-5xl font-bold">Welcome to {storeConfig.name}</h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          {storeConfig.description}
        </p>
        <Button size="lg" asChild>
          <Link href="/products">Shop Now</Link>
        </Button>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6">Latest Products</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add homepage with latest products from Supabase"
```

---

## Task 15: Footer

**Files:**
- Create: `src/components/footer.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Build footer component**

Create `src/components/footer.tsx`:
```typescript
import Link from "next/link";
import { storeConfig } from "../../store.config";

export function Footer() {
  return (
    <footer className="border-t mt-16">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold mb-4">{storeConfig.name}</h3>
            <p className="text-sm text-muted-foreground">
              {storeConfig.description}
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-4">Shop</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/products" className="hover:underline">All Products</Link></li>
              <li><Link href="/products?sort=newest" className="hover:underline">New Arrivals</Link></li>
              <li><Link href="/products?on_sale=true" className="hover:underline">Sale</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-4">Help</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/contact" className="hover:underline">Contact</Link></li>
              <li><Link href="/shipping" className="hover:underline">Shipping Info</Link></li>
              <li><Link href="/returns" className="hover:underline">Returns</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:underline">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:underline">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} {storeConfig.name}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
```

**Step 2: Add footer to layout**

Update `src/app/layout.tsx` — add `<Footer />` after `</main>`:
```typescript
import { Footer } from "@/components/footer";
// ... in the body:
          <main className="container mx-auto px-4 py-8">{children}</main>
          <Footer />
```

**Step 3: Commit**

```bash
git add src/components/footer.tsx src/app/layout.tsx
git commit -m "feat: add footer component"
```

---

## Task 16: Admin Panel

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/api/admin/sync-now/route.ts`

**Step 1: Create admin layout with password protection**

Create `src/app/admin/layout.tsx`:
```typescript
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) setAuthed(true);
  };

  if (!authed) {
    return (
      <div className="max-w-sm mx-auto py-20 space-y-4">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
        <Button onClick={handleLogin} className="w-full">Login</Button>
      </div>
    );
  }

  return <>{children}</>;
}
```

**Step 2: Create admin auth route**

Create `src/app/api/admin/auth/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password === process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}
```

**Step 3: Create sync-now route**

Create `src/app/api/admin/sync-now/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { syncProducts } from "@/lib/sync";

export async function POST() {
  const result = await syncProducts();
  return NextResponse.json(result);
}
```

**Step 4: Build admin dashboard**

Create `src/app/admin/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import type { SyncState } from "@/lib/types";

export default function AdminPage() {
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [productCount, setProductCount] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [wcStatus, setWcStatus] = useState<"checking" | "ok" | "error">("checking");
  const [stripeStatus, setStripeStatus] = useState<"checking" | "ok" | "error">("checking");

  const fetchStatus = async () => {
    // Sync state
    const { data } = await supabase.from("sync_state").select("*").eq("id", 1).single();
    if (data) setSyncState(data as SyncState);

    // Product count
    const { count } = await supabase.from("products").select("*", { count: "exact", head: true });
    setProductCount(count || 0);

    // WooCommerce connection
    try {
      const res = await fetch("/api/health/woocommerce");
      setWcStatus(res.ok ? "ok" : "error");
    } catch {
      setWcStatus("error");
    }

    // Stripe connection
    try {
      const res = await fetch("/api/health/stripe");
      setStripeStatus(res.ok ? "ok" : "error");
    } catch {
      setStripeStatus("error");
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    await fetch("/api/admin/sync-now", { method: "POST" });
    await fetchStatus();
    setSyncing(false);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "ok":
      case "idle":
        return <Badge className="bg-green-500">Connected</Badge>;
      case "syncing":
        return <Badge className="bg-blue-500">Syncing</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      case "checking":
        return <Badge variant="secondary">Checking...</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Store Admin</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              WooCommerce {statusBadge(wcStatus)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {process.env.NEXT_PUBLIC_WORDPRESS_URL}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Stripe {statusBadge(stripeStatus)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test") ? "Test mode" : "Live mode"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Product Sync {syncState && statusBadge(syncState.status)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Products in Supabase</p>
              <p className="text-2xl font-bold">{productCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last synced</p>
              <p className="font-medium">
                {syncState?.last_synced_at
                  ? new Date(syncState.last_synced_at).toLocaleString()
                  : "Never"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Products in last sync</p>
              <p className="font-medium">{syncState?.products_synced || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last completed</p>
              <p className="font-medium">
                {syncState?.completed_at
                  ? new Date(syncState.completed_at).toLocaleString()
                  : "Never"}
              </p>
            </div>
          </div>

          {syncState?.errors && (
            <p className="text-sm text-destructive">Error: {syncState.errors}</p>
          )}

          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 5: Create health check routes**

Create `src/app/api/health/woocommerce/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getProducts } from "@/lib/woocommerce";

export async function GET() {
  try {
    await getProducts({ per_page: 1 });
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

Create `src/app/api/health/stripe/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET() {
  try {
    await stripe.balance.retrieve();
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

**Step 6: Commit**

```bash
git add src/app/admin/ src/app/api/admin/ src/app/api/health/
git commit -m "feat: add admin panel with sync status, health checks, and manual sync"
```

---

## Task 17: Image Gallery on Product Page

**Files:**
- Create: `src/components/image-gallery.tsx`
- Modify: `src/app/products/[slug]/page.tsx`

**Step 1: Build image gallery component**

Create `src/components/image-gallery.tsx`:
```typescript
"use client";

import Image from "next/image";
import { useState } from "react";
import type { WCImage } from "@/lib/types";

export function ImageGallery({ images }: { images: WCImage[] }) {
  const [selected, setSelected] = useState(0);

  if (!images.length) return null;

  return (
    <div className="space-y-4">
      <div className="aspect-square relative rounded-lg overflow-hidden">
        <Image
          src={images[selected].src}
          alt={images[selected].alt || "Product image"}
          fill
          className="object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setSelected(i)}
              className={`relative w-16 h-16 rounded-md overflow-hidden shrink-0 border-2 transition-colors ${
                i === selected ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
              }`}
            >
              <Image src={img.src} alt={img.alt || ""} fill className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Replace single image in product page with gallery**

Update `src/app/products/[slug]/page.tsx` — replace the single image `<div className="aspect-square...">` block with:
```typescript
import { ImageGallery } from "@/components/image-gallery";

// In the JSX, replace the image div with:
<ImageGallery images={product.images} />
```

**Step 3: Commit**

```bash
git add src/components/image-gallery.tsx src/app/products/[slug]/page.tsx
git commit -m "feat: add product image gallery with thumbnails"
```

---

## Task 18: Pagination

**Files:**
- Create: `src/components/pagination.tsx`
- Modify: `src/app/products/page.tsx`

**Step 1: Build pagination component**

Create `src/components/pagination.tsx`:
```typescript
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  total: number;
  perPage: number;
  currentPage: number;
}

export function Pagination({ total, perPage, currentPage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / perPage);

  if (totalPages <= 1) return null;

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page === 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    router.push(`/products?${params.toString()}`);
  };

  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <Button
        variant="outline"
        size="icon"
        disabled={currentPage <= 1}
        onClick={() => goToPage(currentPage - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm text-muted-foreground px-4">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="icon"
        disabled={currentPage >= totalPages}
        onClick={() => goToPage(currentPage + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

**Step 2: Add pagination to products page**

Add to the bottom of the products grid in `src/app/products/page.tsx`:
```typescript
import { Pagination } from "@/components/pagination";

// After the product grid:
<Pagination total={total} perPage={24} currentPage={filters.page || 1} />
```

**Step 3: Commit**

```bash
git add src/components/pagination.tsx src/app/products/page.tsx
git commit -m "feat: add pagination to product listing"
```

---

## Task 19: Currency Formatting & Coupon Input

**Files:**
- Create: `src/lib/format.ts`
- Modify: `src/components/checkout-form.tsx`
- Modify: all components using currency display

**Step 1: Create currency formatter**

Create `src/lib/format.ts`:
```typescript
import { storeConfig } from "../../store.config";

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat(storeConfig.locale, {
    style: "currency",
    currency: storeConfig.currency,
  }).format(amount);
}
```

**Step 2: Replace all hardcoded currency formatting**

Search and replace all instances of `{sym}{amount.toFixed(2)}` with `{formatPrice(amount)}` across:
- `src/components/product-card.tsx`
- `src/components/cart-sheet.tsx`
- `src/components/checkout-form.tsx`
- `src/components/shipping-selector.tsx`
- `src/components/add-to-cart-button.tsx`
- `src/app/products/[slug]/page.tsx`

**Step 3: Create coupon validation API route**

Create `src/app/api/validate-coupon/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { wcFetch } from "@/lib/woocommerce";

interface WCCoupon {
  id: number;
  code: string;
  discount_type: "percent" | "fixed_cart" | "fixed_product";
  amount: string;
  minimum_amount: string;
  maximum_amount: string;
  usage_limit: number | null;
  usage_count: number;
}

export async function POST(req: NextRequest) {
  const { code } = await req.json();

  try {
    const coupons = await wcFetch<WCCoupon[]>(`/coupons?code=${encodeURIComponent(code)}`);
    if (!coupons.length) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 404 });
    }

    const coupon = coupons[0];

    // Check usage limit
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      return NextResponse.json({ error: "Coupon usage limit reached" }, { status: 400 });
    }

    return NextResponse.json({
      code: coupon.code,
      discount_type: coupon.discount_type,
      amount: parseFloat(coupon.amount),
      minimum_amount: parseFloat(coupon.minimum_amount) || 0,
    });
  } catch {
    return NextResponse.json({ error: "Could not validate coupon" }, { status: 500 });
  }
}
```

Note: Export `wcFetch` from `src/lib/woocommerce.ts` so the route can use it.

**Step 4: Add coupon input to checkout form**

Add to `src/components/checkout-form.tsx`:
```typescript
const [couponCode, setCouponCode] = useState("");
const [appliedCoupon, setAppliedCoupon] = useState<{
  code: string;
  discount_type: "percent" | "fixed_cart" | "fixed_product";
  amount: number;
} | null>(null);
const [couponError, setCouponError] = useState<string | null>(null);
const [couponLoading, setCouponLoading] = useState(false);

const discount = appliedCoupon
  ? appliedCoupon.discount_type === "percent"
    ? total() * (appliedCoupon.amount / 100)
    : appliedCoupon.amount  // fixed_cart
  : 0;

const grandTotal = total() + shippingCost - discount;

const handleApplyCoupon = async () => {
  setCouponLoading(true);
  setCouponError(null);
  const res = await fetch("/api/validate-coupon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: couponCode }),
  });
  const data = await res.json();
  setCouponLoading(false);

  if (!res.ok) {
    setCouponError(data.error);
    return;
  }
  setAppliedCoupon(data);
  setCouponCode("");
};

// In the JSX, before shipping selector:
<div>
  <Label htmlFor="coupon">Coupon Code</Label>
  <div className="flex gap-2 mt-1">
    <Input
      id="coupon"
      placeholder="Enter code"
      value={couponCode}
      onChange={(e) => setCouponCode(e.target.value)}
    />
    <Button type="button" variant="outline" onClick={handleApplyCoupon} disabled={couponLoading || !couponCode}>
      {couponLoading ? "Checking..." : "Apply"}
    </Button>
  </div>
  {couponError && <p className="text-sm text-destructive mt-1">{couponError}</p>}
  {appliedCoupon && (
    <div className="flex items-center justify-between text-sm text-green-600 mt-1">
      <span>"{appliedCoupon.code}" applied — {appliedCoupon.discount_type === "percent" ? `${appliedCoupon.amount}% off` : `${formatPrice(appliedCoupon.amount)} off`}</span>
      <button type="button" className="underline" onClick={() => setAppliedCoupon(null)}>Remove</button>
    </div>
  )}
</div>

// In the totals display, add discount line:
{appliedCoupon && (
  <div className="flex justify-between text-green-600">
    <span>Discount</span>
    <span>-{formatPrice(discount)}</span>
  </div>
)}

// In handleSubmit, pass coupon to order creation:
coupon_lines: appliedCoupon ? [{ code: appliedCoupon.code }] : [],
```

Note: The discount shown is our client-side estimate. WC recalculates the exact discount when creating the order. For percent and fixed_cart coupons this will match exactly. For complex coupon types (per-product, excluded categories) there may be a small difference — WC's calculation is always the one that matters.

**Step 5: Update WCOrderPayload type**

Add to the interface in `src/lib/types.ts`:
```typescript
coupon_lines?: { code: string }[];
```

**Step 5: Commit**

```bash
git add src/lib/format.ts src/components/ src/app/ src/lib/types.ts
git commit -m "feat: add proper currency formatting and coupon code support"
```

---

## Task 20: SEO & WooCommerce URL Redirects

**Files:**
- Modify: `next.config.ts`
- Modify: `src/app/products/[slug]/page.tsx`
- Modify: `src/app/products/page.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Configure Next.js with redirects and images**

Update `next.config.ts`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async redirects() {
    return [
      // WooCommerce default product URLs
      {
        source: "/product/:slug",
        destination: "/products/:slug",
        permanent: true,
      },
      {
        source: "/product/:slug/",
        destination: "/products/:slug",
        permanent: true,
      },
      // WooCommerce shop page
      {
        source: "/shop",
        destination: "/products",
        permanent: true,
      },
      {
        source: "/shop/:path*",
        destination: "/products/:path*",
        permanent: true,
      },
      // WooCommerce category URLs
      {
        source: "/product-category/:slug",
        destination: "/products?category=:slug",
        permanent: true,
      },
      {
        source: "/product-category/:slug/",
        destination: "/products?category=:slug",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
```

**Step 2: Add per-product SEO metadata**

Update `src/app/products/[slug]/page.tsx` — add generateMetadata:
```typescript
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  // Strip HTML tags from description for meta
  const description = product.short_description.replace(/<[^>]*>/g, "").slice(0, 160);

  return {
    title: `${product.name} | ${storeConfig.name}`,
    description,
    openGraph: {
      title: product.name,
      description,
      images: product.images[0] ? [{ url: product.images[0].src }] : [],
    },
  };
}
```

**Step 3: Add category-aware titles to product listing**

Update `src/app/products/page.tsx` — add dynamic metadata:
```typescript
import type { Metadata } from "next";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const category = params.category;
  const search = params.search;

  let title = `Products | ${storeConfig.name}`;
  if (category) title = `${category} | ${storeConfig.name}`;
  if (search) title = `Search: ${search} | ${storeConfig.name}`;

  return { title };
}
```

**Step 4: Commit**

```bash
git add next.config.ts src/app/products/
git commit -m "feat: add SEO metadata, OpenGraph, and WooCommerce URL redirects"
```

---

## Task 21: Sync Improvements — Hide Out of Stock & Deleted Products

**Files:**
- Modify: `src/lib/sync.ts`
- Modify: `src/lib/products.ts`

**Step 1: Handle WC "hide out of stock" setting in product queries**

The sync already captures `stock_status`. Add a config option to `store.config.ts`:
```typescript
hideOutOfStock: process.env.NEXT_PUBLIC_HIDE_OUT_OF_STOCK === "true",
```

Update `src/lib/products.ts` — in `queryProducts`, add before sorting:
```typescript
import { storeConfig } from "../../store.config";

// After building the query, before sorting:
if (storeConfig.hideOutOfStock) {
  query = query.neq("stock_status", "outofstock");
}
```

**Step 2: Handle deleted products**

Update `src/lib/sync.ts` — add a cleanup step after the main sync loop. After syncing, check for products in Supabase that no longer exist in WC:

```typescript
// After the main sync loop, on full syncs (no modified_after), clean up deleted products
if (!lastSyncedAt) {
  // This is a full sync — get all WC product IDs
  const allWcIds = new Set<number>();
  let cleanPage = 1;
  while (true) {
    const batch = await getProducts({ per_page: 100, page: cleanPage });
    if (!batch.length) break;
    batch.forEach((p) => allWcIds.add(p.id));
    cleanPage++;
  }

  // Delete Supabase products not in WC
  const { data: sbProducts } = await supabaseAdmin.from("products").select("id");
  const toDelete = (sbProducts || [])
    .filter((p) => !allWcIds.has(p.id))
    .map((p) => p.id);

  if (toDelete.length) {
    await supabaseAdmin.from("products").delete().in("id", toDelete);
  }
}
```

Note: This only runs on the initial full sync (when `last_synced_at` is null). For incremental syncs, deleted products won't appear in `modified_after` results. A manual "Full Re-sync" button in the admin panel can reset `last_synced_at` to null to trigger cleanup.

**Step 3: Add "Full Re-sync" to admin panel**

Add a second button in `src/app/admin/page.tsx`:
```typescript
const handleFullResync = async () => {
  setSyncing(true);
  // Reset last_synced_at to force full sync
  await supabase.from("sync_state").update({ last_synced_at: null }).eq("id", 1);
  await fetch("/api/admin/sync-now", { method: "POST" });
  await fetchStatus();
  setSyncing(false);
};

// In JSX, next to Sync Now button:
<Button variant="outline" onClick={handleFullResync} disabled={syncing}>
  Full Re-sync
</Button>
```

**Step 4: Commit**

```bash
git add src/lib/sync.ts src/lib/products.ts src/app/admin/page.tsx store.config.ts
git commit -m "feat: handle out-of-stock visibility and deleted product cleanup"
```

---

## Task 22: Next.js Config & Final Setup

**Files:**
- Verify all env vars documented
- Verify all routes working

**Step 1: Update `.env.local.example` with all env vars**

Add any missing vars:
```env
# Store
NEXT_PUBLIC_STORE_NAME=My Store
NEXT_PUBLIC_STORE_DESCRIPTION=Fast, modern shopping
NEXT_PUBLIC_CURRENCY=GBP
NEXT_PUBLIC_CURRENCY_SYMBOL=£
NEXT_PUBLIC_LOCALE=en-GB
NEXT_PUBLIC_HIDE_OUT_OF_STOCK=false

# WooCommerce
NEXT_PUBLIC_WORDPRESS_URL=https://your-store.com
WC_CONSUMER_KEY=ck_xxxxx
WC_CONSUMER_SECRET=cs_xxxxx

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_SECRET_KEY=sk_test_xxxxx

# Admin
ADMIN_PASSWORD=change-me

# Cron (Vercel sets this automatically)
CRON_SECRET=xxxxx
```

**Step 2: Final commit**

```bash
git add .
git commit -m "feat: finalise env vars and configuration"
```

---

## Summary

### Architecture Overview

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│   Supabase   │     │  WooCommerce    │
│   (Vercel)      │     │  (Postgres)  │◀────│  (WordPress)    │
│                 │     └──────────────┘     │                 │
│  - Product pages│          ▲               │  Source of truth │
│  - Cart (local) │          │ Cron sync     │  for products,  │
│  - Checkout     │          │ every 5 min   │  orders, shipping│
│  - Admin panel  │──────────┘               │                 │
│                 │                          │                 │
│                 │─────────────────────────▶│  Create orders  │
│                 │     (WC REST API)        │  Get shipping   │
└────────┬────────┘                          └─────────────────┘
         │
         │ Stripe Payment Element
         ▼
┌─────────────────┐
│     Stripe      │
│                 │
│  Payment intents│
│  Apple/Google   │
│  Pay, Klarna,   │
│  etc.           │
└─────────────────┘
```

### Data Flow

1. **Product sync**: Vercel cron → `/api/sync` → WC API (`modified_after`) → Supabase upsert
2. **Browsing/search**: Next.js pages → Supabase (instant filtering, full text search)
3. **Product detail (simple)**: Page from Supabase → instant render
4. **Product detail (variable)**: Page from Supabase → lazy-load variations from cache (Supabase) → if stale (>5 min), background refresh from WC API → user sees cached data immediately
5. **Add to cart (variable)**: Variation picker shows live stock per option → disabled if out of stock → cart stores `variationId`
6. **Checkout**: Client cart (with variationIds) → Stripe PaymentIntent → Confirm → WC order creation (with `variation_id` in line items)
7. **Shipping**: Fetched from WC shipping zones at checkout (flat rate methods)
8. **Admin**: `/admin` → health checks + sync status + manual sync trigger

### Sync Safety

- Uses `modified_after` with the sync **start** time, not end time
- Overlapping changes during sync are caught on next run
- CSV imports that are still running: unmodified products just get picked up later
- `status: "syncing"` prevents overlapping sync runs
- All upserts are idempotent

### Config-Driven (Sellable)

- `store.config.ts` + env vars drive all customisation
- No code changes needed for end users
- Admin panel for health checks and sync monitoring
- Currency, locale, store name all configurable

---

## Future Enhancements (Not in MVP)

- **Setup wizard** — guided `/setup` page that validates WC + Supabase + Stripe connections
- **Theme presets** — CSS variable-based colour/font themes
- **Customer accounts** — Supabase Auth, order history
- **Tax display at checkout** — show estimated tax before order creation (currently WC calculates on order create)
- **Server-side tracking** — GA4 Measurement Protocol, Facebook CAPI
- **Structured data** — JSON-LD product schema for rich search results
- **Sitemap** — auto-generated from Supabase product data
- **Email** — transactional emails via WC or Resend
- **Deploy button** — one-click "Deploy to Vercel" for buyers
- **Breadcrumbs** — category > subcategory > product navigation
- **Related/upsell products** — "You might also like" on product page (sync `upsell_ids` / `cross_sell_ids` from WC)
- **Product reviews** — pull reviews via WC API, display on product page
- **Downloadable/virtual products** — skip shipping for digital goods
- **Multi-currency** — support for WC multi-currency plugins
- **Stock quantity display** — "Only 3 left!" messaging
