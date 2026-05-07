-- ============================================================================
-- Supplier Prices
-- Tracks per-SKU EXW unit prices from suppliers (e.g. Grandsharp) across
-- volume tiers, plus the gift/packaging box price each SKU requires.
-- All prices stored in USD; GBP rendered client-side via supplier_settings.
-- ============================================================================

CREATE TABLE IF NOT EXISTS supplier_prices (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL,
  product_name TEXT,
  supplier TEXT NOT NULL DEFAULT 'Grandsharp',

  -- Tier 1 (default 1-49 pcs)
  tier1_min INTEGER NOT NULL DEFAULT 1,
  tier1_max INTEGER DEFAULT 49,
  tier1_unit_usd NUMERIC(10,4),

  -- Tier 2 (default 50-200 pcs)
  tier2_min INTEGER DEFAULT 50,
  tier2_max INTEGER DEFAULT 200,
  tier2_unit_usd NUMERIC(10,4),

  -- Tier 3 (default 200+)
  tier3_min INTEGER DEFAULT 201,
  tier3_unit_usd NUMERIC(10,4),

  -- Packaging box (added on top of unit price by manufacturer)
  box_type TEXT CHECK (box_type IN ('single_knife', 'cleaver', 'steak_4pc', 'eva_8pc', 'eva_5pc', 'eva_7pc', 'eva_10pc', 'wood_box', 'none', NULL)),
  box_price_usd NUMERIC(10,4) DEFAULT 0,

  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sku, supplier)
);

CREATE INDEX IF NOT EXISTS idx_supplier_prices_sku ON supplier_prices(sku);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_supplier ON supplier_prices(supplier);

-- Single-row settings (FX rate for GBP display)
CREATE TABLE IF NOT EXISTS supplier_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  usd_to_gbp NUMERIC(10,4) NOT NULL DEFAULT 0.79,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO supplier_settings (id, usd_to_gbp)
VALUES (1, 0.79)
ON CONFLICT (id) DO NOTHING;

-- RLS is ON: supplier costs are sensitive (margins, supplier names).
-- No policies are defined, so the anon (browser) client cannot read or
-- write these tables. All access goes through the password-gated server
-- route /api/admin/supplier-prices using the service role key.
ALTER TABLE supplier_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_settings ENABLE ROW LEVEL SECURITY;
