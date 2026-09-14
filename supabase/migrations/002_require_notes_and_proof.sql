-- Run this in Supabase SQL Editor after schema.sql.
-- Makes notes and proof required for new/updated rows going forward.
-- (Existing rows that predate this are left as-is so they don't break.)

alter table entries
  add constraint entries_notes_required check (notes is not null and length(trim(notes)) > 0) not valid;

alter table entries
  add constraint entries_proof_required check (proof_url is not null and length(trim(proof_url)) > 0) not valid;

-- "not valid" skips checking existing rows but enforces the rule on every
-- future insert/update. To also require it retroactively once every row
-- has both fields filled in, run:
--   alter table entries validate constraint entries_notes_required;
--   alter table entries validate constraint entries_proof_required;
