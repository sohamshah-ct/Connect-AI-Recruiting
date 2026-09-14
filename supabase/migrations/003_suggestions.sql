-- Run this in Supabase SQL Editor after schema.sql and 002_require_notes_and_proof.sql.
-- Shared "suggested contacts" queue: anyone can drop in a name worth reaching
-- out to; anyone can claim it, which removes it from the queue.

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  alum_name text not null,
  note text,
  suggested_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists suggestions_created_at_idx on suggestions (created_at desc);

alter table suggestions enable row level security;

create policy "public read suggestions" on suggestions for select using (true);
create policy "public insert suggestions" on suggestions for insert with check (true);
create policy "public delete suggestions" on suggestions for delete using (true);

-- Live sync: adds this table to the realtime publication so claims/removals
-- show up for everyone instantly. Safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'suggestions'
  ) then
    alter publication supabase_realtime add table suggestions;
  end if;
end $$;
