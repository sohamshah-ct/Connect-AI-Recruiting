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
- A daily auto-scan (`api/scrape.js`, free Vercel cron) that checks pages you point it at — department "notable alumni" pages, news/spotlight listings — for names and feeds new ones straight into the suggestions queue. Not LinkedIn (blocked to scrapers, against their terms) — just public pages meant to be browsed. It's a heuristic, not perfect: treat what it finds as a lead to glance at and claim or dismiss, not a verified fact.
- Everything's shared and updates live across everyone who has the page open.

## Pointing the auto-scan at a page

Add a row to the `watch_pages` table in Supabase (SQL Editor):

```sql
insert into watch_pages (url, label) values
  ('https://business.uconn.edu/notable-alumni/', 'UConn School of Business — notable alumni');
```

It'll get checked on the next daily run (or trigger one immediately by opening `/api/scrape` in a browser).

## Stack

Plain HTML/JS front end, no build step, hosted on Vercel. Data and screenshot storage run on Supabase (Postgres + Storage). A small serverless function (`api/scrape.js`) runs on Vercel's free daily cron for the auto-scan. See `supabase/schema.sql` and `supabase/migrations/` for the database setup.
