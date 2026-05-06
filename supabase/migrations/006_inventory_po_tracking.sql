-- ============================================================================
-- PO status rename (sent -> created) + shipping tracking columns
-- ============================================================================

-- Drop the old CHECK first so we can write 'created' before re-adding the constraint
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

-- Migrate existing rows
UPDATE purchase_orders SET status = 'created' WHERE status = 'sent';

-- Add new CHECK with 'created' replacing 'sent'
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft', 'created', 'shipped', 'arrived', 'cancelled'));

-- Rename sent_at -> finalised_at (timestamp of draft -> created transition)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE purchase_orders RENAME COLUMN sent_at TO finalised_at;
  END IF;
END $$;

-- New shipping/tracking columns
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS shipped_date DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tracking_carrier TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;

-- Backfill the currently-shipped PO with the known DPD tracking info.
-- Guarded by tracking_number IS NULL so re-running this migration is a no-op.
UPDATE purchase_orders
SET
  shipped_date = DATE '2026-04-21',
  tracking_carrier = 'DPD',
  tracking_number = '15503498210322',
  tracking_url = 'https://track.dpd.co.uk/parcels/15503498210322',
  expected_arrival = TIMESTAMPTZ '2026-05-21 00:00:00+00'
WHERE status = 'shipped'
  AND tracking_number IS NULL;
