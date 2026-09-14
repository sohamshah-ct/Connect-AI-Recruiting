# Alumni Outreach Tracker

Static site + Supabase backend. No build step, no framework — plain HTML/JS, easy to hand off to anyone in the class to tweak.

## Set up the database (~3 min, free, no credit card)

1. Go to [supabase.com](https://supabase.com) → New project.
2. Once it's created, open **SQL Editor → New query**, paste in the contents of `supabase/schema.sql`, and hit Run. That creates the `entries` table, the reactions function, and a public `proof` storage bucket for screenshots.
3. Go to **Settings → API** and copy the **Project URL** and the **anon public** key.
4. Open `config.js` in this repo and paste them in:
   ```js
   window.SUPABASE_URL = "https://xxxx.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJ...";
   ```
   Commit and push that change (or edit it directly on GitHub — it's a two-line file).

## Deploy to Vercel (~2 min)

1. Go to [vercel.com/new](https://vercel.com/new), import this GitHub repo.
2. Framework preset: **Other** (it's a static site, no build command needed).
3. Deploy. You'll get a public `*.vercel.app` link — anyone can open it, no login required.

Every push to the connected branch redeploys automatically.

## What's in here

- `index.html` — the whole app (form, entry feed, reactions, leaderboard).
- `config.js` — your two Supabase keys. Safe to be public; the anon key only allows what the database policies in `schema.sql` permit.
- `supabase/schema.sql` — table, storage bucket, and RLS policies. Currently wide open (anyone can add/edit any entry, no login) — tighten `schema.sql`'s policies later if you want people restricted to editing their own entries.

## Notes

- Proof-of-contact screenshots upload straight to Supabase Storage and show as a thumbnail on the entry; click it to view full size.
- 👏 / 🎉 reactions increment atomically (a Postgres function), so simultaneous claps don't overwrite each other.
- The leaderboard at the bottom is clickable — clicking a name filters the feed above to just their logged entries, so you can click into anyone's "proof" instantly while presenting.
