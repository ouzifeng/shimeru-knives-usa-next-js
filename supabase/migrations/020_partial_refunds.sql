-- 020_partial_refunds.sql
-- Partial refund support.
--
-- The Stripe `charge.refunded` webhook fires for partial refunds too, but our
-- handler used to flip every refund (full or partial) to status = 'refunded'.
-- We now distinguish them: a full refund stays 'refunded', a partial refund
-- becomes 'partially_refunded'. `status` is a plain TEXT column with no check
-- constraint, so the new value needs no enum change — we only add columns to
-- record how much was refunded and when.

alter table orders
  add column if not exists refunded_amount numeric(10,2),
  add column if not exists refunded_at timestamptz;

comment on column orders.refunded_amount is 'Cumulative amount refunded for this order (from Stripe charge.amount_refunded). Null = never refunded.';
comment on column orders.refunded_at is 'When the most recent refund (full or partial) was processed by the Stripe webhook.';
