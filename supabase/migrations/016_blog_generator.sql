-- In-house blog generator: title queue + 'generated' provenance tag.
-- Replaces the paid Soro tool with a DeepSeek + Keyword Planner pipeline.

-- 1. Tag generated posts distinctly (was limited to 'wordpress'/'soro').
alter table blog_posts
  drop constraint if exists blog_posts_source_check;

alter table blog_posts
  add constraint blog_posts_source_check
  check (source in ('wordpress', 'soro', 'generated'));

-- 2. Permanent title queue / uniqueness ledger. Rows are never deleted:
--    status moves unused -> used, and every new research batch is deduped
--    against the full table (used + unused) so a topic can never repeat.
create table if not exists blog_titles (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  slug               text not null,
  target_keyword     text,
  search_volume      integer default 0,
  intent             text check (intent in ('commercial', 'informational')),
  angle              text,
  maps_to_category   text,
  secondary_keywords text[] default '{}',
  status             text not null default 'unused'
                       check (status in ('unused', 'used', 'skipped')),
  batch_id           text,
  post_id            uuid,
  created_at         timestamptz not null default now(),
  used_at            timestamptz
);

-- Uniqueness ledger: slug must be globally unique across the queue.
create unique index if not exists blog_titles_slug_key on blog_titles (slug);

-- The cron pulls the highest-volume unused title.
create index if not exists blog_titles_status_vol_idx
  on blog_titles (status, search_volume desc);

-- Lock the table down: only the service role (cron) touches it. With RLS on
-- and no policies, anon/auth clients get nothing; service_role bypasses RLS.
alter table blog_titles enable row level security;
