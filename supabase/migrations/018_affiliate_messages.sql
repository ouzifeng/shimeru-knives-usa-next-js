-- Affiliate <-> admin messaging with a full audit trail, plus a tokenized
-- portal so approved affiliates can upload pre-approval content without a login.
--
-- Direction:
--   outbound = admin -> affiliate (also sent as a Postmark email)
--   inbound  = affiliate -> admin (submitted via the tokenized portal)
--   note     = internal admin note, not emailed
--
-- Large video/image content is uploaded direct from the browser to Cloudflare
-- R2 (presigned PUT), so it never passes through Vercel or Supabase. Only the
-- object reference is stored here in attachments:
--   [{ name, key, content_type, size, kind }]   kind = 'video' | 'image' | 'file'

alter table affiliates add column if not exists access_token text;
create unique index if not exists idx_affiliates_access_token
  on affiliates (access_token) where access_token is not null;

create table affiliate_messages (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'note')),
  from_addr text,
  subject text,
  content_text text,
  content_html text,
  postmark_message_id text,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_affiliate_messages_affiliate_created
  on affiliate_messages (affiliate_id, created_at);

create unique index idx_affiliate_messages_postmark_message_id
  on affiliate_messages (postmark_message_id) where postmark_message_id is not null;

alter table affiliate_messages enable row level security;
