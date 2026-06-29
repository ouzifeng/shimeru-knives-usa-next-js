-- Track when the affiliate agreement was emailed, so the admin can see
-- "Awaiting signature" (sent, not yet signed) vs "Not sent". Signature itself
-- is recorded in contract_signed_at (migration 021).

alter table affiliates add column if not exists agreement_sent_at timestamptz;
