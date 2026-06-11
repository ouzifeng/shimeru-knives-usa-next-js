-- Affiliate program.
--
-- Flow:
--   1. Social influencer applies via /affiliate/apply  -> affiliates row, status='pending'
--   2. Admin approves in /admin/affiliates             -> status='approved', code finalised
--   3. Approved affiliate shares link ?ref=CODE on any product/page
--        - each click logged to affiliate_clicks (Google-IP filtered)
--        - ref stored in a 30-day last-click cookie, folded into orders.affiliate_code at checkout
--   4. On a paid order with a valid ref, a commission row is created (20% of product
--      subtotal after discount, excl. shipping + VAT), status='pending'
--   5. After a 14-day refund hold the commission flips to 'approved' (or 'reversed' if refunded)
--   6. Monthly the admin groups approved+unpaid commissions into an affiliate_payouts batch,
--      transfers the money manually, and marks it paid -> commissions flip to 'paid'
--
-- Auth: magic-link only. No passwords. HMAC-signed cookie (see lib/affiliate-auth.ts),
--       so no session table is needed here.
--
-- Bank details: PII. Encrypted application-side before insert (AES, key in env),
--               stored as jsonb. Never written or logged in plaintext.

create table affiliates (
  id uuid primary key default gen_random_uuid(),
  code text unique,                       -- finalised on approval, used in ?ref=CODE
  name text not null,
  email text not null unique,
  country text,                           -- UK-only payouts/tax, lets you filter non-UK early
  social_channels jsonb not null default '[]'::jsonb,  -- [{platform, handle}], 1+ rows
  audience_size text,                     -- band: '<1k' / '1k-10k' / '10k-50k' / '50k-250k' / '250k+'
  prior_experience boolean,               -- have they done brand/affiliate/sponsored work before
  on_camera text,                         -- 'yes' / 'no' / 'sometimes' — face + talking on camera
  content_license_agreed boolean not null default false,  -- consent to reuse their content in our paid ads
  pitch text,                             -- "why you'd be a good fit" free text from the form
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  commission_pct numeric(5,2) not null default 20,
  bank_details jsonb,                     -- encrypted blob, populated by the affiliate later
  admin_notes text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  last_login_at timestamptz
);

create unique index idx_affiliates_code on affiliates (code) where code is not null;
create index idx_affiliates_status_created on affiliates (status, created_at desc);

-- Raw click log. Higher volume than the other tables, so bigint identity rather than uuid.
create table affiliate_clicks (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  product_id integer,                     -- nullable: link can point at any page
  landing_path text,
  ip text,
  ua text,
  created_at timestamptz not null default now()
);

create index idx_affiliate_clicks_affiliate_created
  on affiliate_clicks (affiliate_id, created_at desc);

-- One row per attributed sale.
create table affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  period text not null,                   -- 'YYYY-MM' the payout covers
  total_amount numeric(10,2) not null default 0,
  commission_count integer not null default 0,
  status text not null default 'due' check (status in ('due', 'paid')),
  bank_snapshot jsonb,                    -- encrypted copy of bank details at time of payout
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index idx_affiliate_payouts_affiliate_period
  on affiliate_payouts (affiliate_id, period);

create table affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  order_id bigint not null references orders(id) on delete cascade,
  base_amount numeric(10,2) not null,     -- product subtotal after discount, excl shipping + VAT
  commission_pct numeric(5,2) not null,
  commission_amount numeric(10,2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'reversed', 'paid')),
  payout_id uuid references affiliate_payouts(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- One commission per order (idempotent against webhook retries).
create unique index idx_affiliate_commissions_order on affiliate_commissions (order_id);
create index idx_affiliate_commissions_affiliate_status
  on affiliate_commissions (affiliate_id, status);
create index idx_affiliate_commissions_payout on affiliate_commissions (payout_id);

-- Queryable attribution without digging into orders.attribution JSONB.
alter table orders add column if not exists affiliate_code text;
create index if not exists idx_orders_affiliate_code
  on orders (affiliate_code) where affiliate_code is not null;

-- Admin-only via service role. Anon/auth roles get nothing.
alter table affiliates enable row level security;
alter table affiliate_clicks enable row level security;
alter table affiliate_commissions enable row level security;
alter table affiliate_payouts enable row level security;
