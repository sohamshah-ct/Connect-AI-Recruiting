-- Run after 003_suggestions.sql.
-- Pages the auto-scan checks for alumni names. Add a row per page you want
-- watched (a department "notable alumni" page, an alumni spotlight/news
-- listing, etc). Anything meant for LinkedIn scraping does NOT belong here
-- — LinkedIn blocks scrapers and it's against their terms; this is only for
-- pages that are public and meant to be browsed.
--
-- Add a page from the SQL Editor:
--   insert into watch_pages (url, label) values
--     ('https://business.uconn.edu/notable-alumni/', 'UConn School of Business — notable alumni');

create table if not exists watch_pages (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  label text,
  last_scanned_at timestamptz,
  last_found_count int,
  created_at timestamptz not null default now()
);

alter table watch_pages enable row level security;
create policy "public read watch_pages" on watch_pages for select using (true);
create policy "public write watch_pages" on watch_pages for all using (true) with check (true);
