# Alumni Outreach Tracker

**Live:** https://connect-ai-recruiting.vercel.app

A shared tracker for Connect.AI's alumni outreach. Everyone in the class logs the alumni they contact — status, notes, and a screenshot as proof it happened — and it updates live for anyone with the link. No login required.

## What it does

- Log an alumni contact with status (to contact, awaiting reply, in conversation, visit scheduled, complete, no response), method, notes, and a required proof-of-contact screenshot.
- Edit any entry after the fact to fill in details or swap the screenshot.
- One-click Google and LinkedIn lookups next to each name.
- 👏 / 🎉 reactions on entries.
- A leaderboard ranking who's contacted the most people — click a name to filter the feed to just their entries.
- A shared "Suggested contacts" queue — drop in a name worth reaching out to, anyone can claim it.
- Two daily auto-discovery jobs (free Vercel crons) that feed the suggestions queue automatically:
  - **Page scan** (`api/scrape.js`) — checks specific pages you point it at (a department's "notable alumni" page, a spotlight listing) for names.
  - **Search-based discovery** (`api/search.js`) — runs search queries you configure through Google's Custom Search API (free, 100 queries/day) and pulls candidate names out of the results — including what's publicly indexed about LinkedIn profiles, without scraping LinkedIn directly (which blocks scrapers and disallows it in their terms).
  
  Both are heuristics, not verified facts — treat anything they surface as a lead to glance at and claim or dismiss, same as a suggestion a person typed in by hand.
- Everything's shared and updates live across everyone who has the page open.

## Setting up auto-discovery

**Page scan** — add a row to `watch_pages` in Supabase (SQL Editor):
```sql
insert into watch_pages (url, label) values
  ('https://alumni.business.uconn.edu/hof/past-inductees/', 'UConn Business Hall of Fame');
```
Trigger it immediately by opening `/api/scrape` in a browser, or wait for the daily run.

**Search-based discovery** — needs a free Google Custom Search setup (~10 min, no payment info required):
1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project (or use an existing one), and enable the **Custom Search API** under APIs & Services.
2. Create an API key under APIs & Services → Credentials. This is `GOOGLE_SEARCH_API_KEY`.
3. Go to [programmablesearchengine.google.com](https://programmablesearchengine.google.com), create a new search engine, set it to **search the entire web**. Copy its **Search engine ID** — this is `GOOGLE_SEARCH_CX`.
4. In Vercel → Settings → Environment Variables, add both as Production variables, then redeploy.
5. Add search queries to run in Supabase:
   ```sql
   insert into search_queries (query, label) values
     ('"Connect.AI" UConn alumni', 'Connect.AI alumni mentions'),
     ('UConn computer science alumni AI startup', 'CS alumni working in AI');
   ```
6. Trigger it immediately by opening `/api/search` in a browser, or wait for the daily run.

Free tier caps at 100 Google searches/day total across all queries — plenty for a handful of daily queries with room to spare.

## Stack

Plain HTML/JS front end, no build step, hosted on Vercel. Data and screenshot storage run on Supabase (Postgres + Storage). Two small serverless functions (`api/scrape.js`, `api/search.js`) run on Vercel's free daily cron for auto-discovery. See `supabase/schema.sql` and `supabase/migrations/` for the database setup.
