-- Affiliate shipping address, so we know where to post product/gifts for them
-- to feature. Plaintext jsonb (a delivery address, not payment PII):
--   { full_name, line1, line2, city, state, zip, country }
-- Bank details remain encrypted (affiliates.bank_details, see lib/crypto-vault).

alter table affiliates add column if not exists shipping_address jsonb;
