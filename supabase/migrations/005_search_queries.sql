-- Run after 004_watch_pages.sql.
-- Search queries the auto-search checks daily via Google's free Custom
-- Search API (100 queries/day at no cost). Add a row per query you want
-- run — a specific name to check, or a broad discovery query.
--
-- Examples:
--   insert into search_queries (query, label) values
--     ('"Connect.AI" UConn alumni', 'Connect.AI alumni mentions'),
--     ('UConn computer science alumni LinkedIn AI startup', 'CS alumni in AI'),
--     ('Kelly Kennedy UConn', 'Check a specific name');

create table if not exists search_queries (
  id uuid primary key default gen_random_uuid(),
  query text not null unique,
  label text,
  last_run_at timestamptz,
  last_found_count int,
  created_at timestamptz not null default now()
);

alter table search_queries enable row level security;
create policy "public read search_queries" on search_queries for select using (true);
create policy "public write search_queries" on search_queries for all using (true) with check (true);
