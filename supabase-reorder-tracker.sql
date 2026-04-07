-- Tracks when the reorder counter was last reset.
-- The cron counts completed-order units since last_reset_at;
-- when that count reaches the reorder threshold (50) it fires
-- an order-form email and resets the timestamp.

CREATE TABLE IF NOT EXISTS reorder_tracker (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- singleton row
  last_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ                         -- when the last email was sent
);

-- Seed the single row (day zero = now)
INSERT INTO reorder_tracker (id, last_reset_at)
VALUES (1, NOW())
ON CONFLICT (id) DO NOTHING;
