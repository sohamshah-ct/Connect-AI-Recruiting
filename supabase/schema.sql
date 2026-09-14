-- Alumni Outreach Tracker — run this once in Supabase SQL Editor
-- (Project → SQL Editor → New query → paste → Run)

create extension if not exists pgcrypto;

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  logged_by text not null,
  alum_name text not null,
  status text not null default 'awaiting',
  method text not null default 'LinkedIn',
  visit_date date,
  notes text,
  proof_url text,
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entries_created_at_idx on entries (created_at desc);
create index if not exists entries_logged_by_idx on entries (logged_by);

-- Atomic reaction increments so simultaneous claps don't clobber each other
create or replace function increment_reaction(entry_id uuid, emoji text)
returns jsonb
language plpgsql
as $$
declare
  updated jsonb;
begin
  update entries
  set reactions = jsonb_set(
        reactions,
        array[emoji],
        to_jsonb(coalesce((reactions->>emoji)::int, 0) + 1)
      ),
      updated_at = now()
  where id = entry_id
  returning reactions into updated;
  return updated;
end;
$$;

-- No login wall yet: anyone with the link can read/add/edit/react.
-- Tighten these policies later if you want people to only edit their own entries.
alter table entries enable row level security;

create policy "public read" on entries for select using (true);
create policy "public insert" on entries for insert with check (true);
create policy "public update" on entries for update using (true);

grant execute on function increment_reaction(uuid, text) to anon;

-- Storage bucket for proof-of-contact screenshots
insert into storage.buckets (id, name, public)
values ('proof', 'proof', true)
on conflict (id) do nothing;

create policy "public read proof" on storage.objects
  for select using (bucket_id = 'proof');

create policy "public upload proof" on storage.objects
  for insert with check (bucket_id = 'proof');
