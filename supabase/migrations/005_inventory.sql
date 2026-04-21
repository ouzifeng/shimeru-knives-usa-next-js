-- ============================================================================
-- Inventory Management System
-- Replaces the old threshold-based reorder_tracker with velocity-based
-- purchase order tracking and daily inventory snapshots.
-- ============================================================================

-- Drop the old reorder tracker (replaced by velocity-based system)
DROP TABLE IF EXISTS reorder_tracker;

-- Purchase orders
CREATE TABLE purchase_orders (
  id SERIAL PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'shipped', 'arrived', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  expected_arrival TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX idx_po_status ON purchase_orders(status);

-- Purchase order line items
CREATE TABLE purchase_order_lines (
  id SERIAL PRIMARY KEY,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  recommended_qty INTEGER NOT NULL DEFAULT 0,
  final_qty INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_po_lines_po_id ON purchase_order_lines(po_id);
CREATE INDEX idx_po_lines_sku ON purchase_order_lines(sku);

-- Daily inventory snapshots
CREATE TABLE inventory_snapshots (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  velocity_7d NUMERIC(6,2) NOT NULL DEFAULT 0,
  velocity_30d NUMERIC(6,2) NOT NULL DEFAULT 0,
  velocity_used NUMERIC(6,2) NOT NULL DEFAULT 0,
  incoming_qty INTEGER NOT NULL DEFAULT 0,
  days_remaining INTEGER,
  reorder_point INTEGER NOT NULL DEFAULT 0,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE UNIQUE INDEX idx_snapshots_sku_date ON inventory_snapshots(sku, snapshot_date);
