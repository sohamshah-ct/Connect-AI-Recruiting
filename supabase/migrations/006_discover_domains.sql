-- Run after 005_search_queries.sql.
-- Subdomains the Common Crawl-based discovery checks for alumni-related
-- pages. Seeded with real UConn subdomains found during setup; add more
-- any time via the SQL Editor or extend the app's UI to manage this table
-- the same way watch_pages/search_queries are managed.

create table if not exists discover_domains (
  id uuid primary key default gen_random_uuid(),
  host text not null unique,
  label text,
  last_run_at timestamptz,
  last_found_count int,
  created_at timestamptz not null default now()
);

alter table discover_domains enable row level security;
create policy "public read discover_domains" on discover_domains for select using (true);
create policy "public write discover_domains" on discover_domains for all using (true) with check (true);

insert into discover_domains (host, label) values
  ('alumni.business.uconn.edu', 'UConn Business alumni portal'),
  ('business.uconn.edu', 'UConn School of Business'),
  ('engineering.uconn.edu', 'UConn College of Engineering'),
  ('magazine.uconn.edu', 'UConn Magazine'),
  ('today.uconn.edu', 'UConn Today (news)')
on conflict (host) do nothing;
