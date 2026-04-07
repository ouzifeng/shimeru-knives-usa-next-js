-- Orders table — backup of all Stripe checkout completions
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  stripe_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent TEXT,
  wc_order_id INTEGER,
  customer_email TEXT,
  customer_name TEXT,
  amount_total NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'completed',
  line_items JSONB,
  billing_address JSONB,
  shipping_address JSONB,
  coupon_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for idempotency check (fast lookup by stripe session)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session
  ON orders (stripe_session_id);

-- Index for customer lookups
CREATE INDEX IF NOT EXISTS idx_orders_customer_email
  ON orders (customer_email);

-- Index for WC order cross-reference
CREATE INDEX IF NOT EXISTS idx_orders_wc_order_id
  ON orders (wc_order_id);
