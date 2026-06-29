-- Affiliate contract e-signature, mirroring the chef ambassador signing flow.
-- The affiliate types their name on /affiliate/agreement/[token]; the sign API
-- records who signed, when, and the IP/UA as a light audit trail.

alter table affiliates add column if not exists contract_signed_at timestamptz;
alter table affiliates add column if not exists signed_name text;
alter table affiliates add column if not exists signed_ip text;
alter table affiliates add column if not exists signed_user_agent text;
