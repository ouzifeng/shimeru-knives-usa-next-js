-- ===========================================
-- Shimeru Knives US — Full Schema
-- Copied from live UK database (2026-04-07)
-- ===========================================

-- 1. Products (synced from WooCommerce)
create table products (
  id integer primary key,
  name text not null,
  slug text unique not null,
  status text default 'publish',
  type text default 'simple',
  description text,
  short_description text,
  price numeric(10,2),
  regular_price numeric(10,2),
  sale_price numeric(10,2),
  on_sale boolean default false,
  stock_status text default 'instock',
  images jsonb default '[]',
  categories jsonb default '[]',
  average_rating numeric(3,2) default 0,
  rating_count integer default 0,
  sku text,
  stock_quantity integer,
  wc_updated_at timestamptz,
  synced_at timestamptz default now()
);

alter table products add column fts tsvector
  generated always as (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(short_description, ''))) stored;

-- 2. Product variations
create table product_variations (
  id integer primary key,
  product_id integer references products(id) on delete cascade,
  price numeric(10,2),
  regular_price numeric(10,2),
  sale_price numeric(10,2),
  on_sale boolean default false,
  stock_status text default 'instock',
  stock_quantity integer,
  attributes jsonb default '[]',
  image jsonb,
  sku text,
  cached_at timestamptz default now()
);

-- 3. Product attributes (flattened for filtering)
create table product_attributes (
  id serial primary key,
  product_id integer references products(id) on delete cascade,
  attribute_name text not null,
  attribute_value text not null
);

-- 4. Product categories (flattened for filtering)
create table product_categories (
  id serial primary key,
  product_id integer references products(id) on delete cascade,
  category_id integer not null,
  category_name text not null,
  category_slug text not null
);

-- 5. Product tags
create table product_tags (
  id serial primary key,
  product_id integer references products(id) on delete cascade,
  tag_id integer not null,
  tag_name text not null,
  tag_slug text not null
);

-- 6. Product specs (AI-generated)
create table product_specs (
  product_id integer primary key references products(id) on delete cascade,
  blade_length text default 'Unknown',
  steel_type text default 'Unknown',
  handle_material text default 'Unknown',
  knife_type text default 'Unknown',
  best_for text default 'Unknown',
  generated_at timestamptz,
  generated_by text
);

-- 7. Product SEO metadata (AI-generated)
create table product_seo (
  product_id integer primary key references products(id) on delete cascade,
  meta_title text,
  meta_description text,
  generated_at timestamptz default now(),
  generated_by text
);

-- 8. Product costs (COGS tracking)
create table product_costs (
  sku text primary key,
  cogs numeric,
  import numeric,
  shipping numeric,
  updated_at timestamptz default now()
);

-- 9. Monthly fixed costs
create table monthly_fixed_costs (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  category text not null,
  amount numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (month, category)
);

-- 10. Sync state
create table sync_state (
  id integer primary key default 1,
  last_synced_at timestamptz,
  status text default 'idle' check (status in ('idle', 'syncing', 'error')),
  products_synced integer default 0,
  errors text,
  started_at timestamptz,
  completed_at timestamptz,
  products_total integer default 0,
  sync_phase text check (sync_phase in ('fetching', 'images', 'writing'))
);

insert into sync_state (id, status) values (1, 'idle');

-- 11. Settings (key-value store)
create table settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- 12. Orders (Stripe checkout completions)
create table orders (
  id bigserial primary key,
  stripe_session_id text unique not null,
  stripe_payment_intent text,
  wc_order_id integer,
  customer_email text,
  customer_name text,
  amount_total numeric(10,2) not null,
  currency text not null default 'USD',
  status text not null default 'completed',
  line_items jsonb,
  billing_address jsonb,
  shipping_address jsonb,
  coupon_code text,
  wc_created boolean default true,
  attribution jsonb,
  customer_ip text,
  abandon_reason text,
  created_at timestamptz not null default now()
);

-- 13. Funnel events (analytics)
create table funnel_events (
  id bigint generated always as identity primary key,
  event text not null,
  session_id text not null,
  product_id integer,
  product_name text,
  cart_value numeric,
  metadata jsonb,
  created_at timestamptz default now()
);

-- 14. Return requests
create table return_requests (
  id bigint generated always as identity primary key,
  order_id bigint references orders(id),
  wc_order_id int,
  customer_email text not null,
  customer_name text,
  items jsonb not null,
  reason text,
  status text not null default 'pending',
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 15. Reorder tracker (singleton)
create table reorder_tracker (
  id integer primary key default 1 check (id = 1),
  last_reset_at timestamptz not null default now(),
  last_notified_at timestamptz
);

insert into reorder_tracker (id, last_reset_at)
values (1, now())
on conflict (id) do nothing;

-- ===========================================
-- Indexes
-- ===========================================

create index idx_products_stock_status on products(stock_status);
create index idx_products_price on products(price);
create index idx_products_on_sale on products(on_sale);
create index idx_products_slug on products(slug);
create index idx_products_fts on products using gin(fts);
create index idx_product_variations_product_id on product_variations(product_id);
create index idx_product_attributes_name_value on product_attributes(attribute_name, attribute_value);
create index idx_product_categories_category_id on product_categories(category_id);
create index idx_product_tags_product_id on product_tags(product_id);
create index idx_product_tags_tag_slug on product_tags(tag_slug);
create index idx_product_specs_product_id on product_specs(product_id);
create index idx_orders_customer_email on orders(customer_email);
create index idx_orders_wc_order_id on orders(wc_order_id);
create index idx_funnel_events_event_created on funnel_events(event, created_at);
create index idx_return_requests_order on return_requests(order_id);
create index idx_return_requests_email on return_requests(customer_email);
create index idx_return_requests_status on return_requests(status);

-- ===========================================
-- RLS policies
-- ===========================================

alter table products enable row level security;
create policy "Public read products" on products for select using (true);

alter table product_variations enable row level security;
create policy "Public read variations" on product_variations for select using (true);

alter table product_attributes enable row level security;
create policy "Public read attributes" on product_attributes for select using (true);

alter table product_categories enable row level security;
create policy "Public read categories" on product_categories for select using (true);

alter table product_tags enable row level security;
create policy "Allow public read access on product_tags" on product_tags for select using (true);

alter table product_specs enable row level security;
create policy "Public read specs" on product_specs for select using (true);

alter table product_seo enable row level security;
create policy "Public read seo" on product_seo for select using (true);

alter table funnel_events enable row level security;
create policy "Anon insert funnel" on funnel_events for insert with check (true);

alter table sync_state enable row level security;
alter table settings enable row level security;
alter table orders enable row level security;
alter table reorder_tracker enable row level security;

-- ===========================================
-- Storage bucket for product images
-- ===========================================

insert into storage.buckets (id, name, public)
  values ('product-images', 'product-images', true)
  on conflict (id) do nothing;

create policy "Public read access"
  on storage.objects for select
  using (bucket_id = 'product-images');
