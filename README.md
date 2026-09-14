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
- Two daily auto-discovery jobs (free Vercel crons, no API key or billing account needed for either) that feed the suggestions queue automatically, manageable right from the "Auto-discovery" panel in the app — add/remove sources or hit "Run now", no SQL required:
  - **Page scan** (`api/scrape.js`) — checks specific pages you add (a department's "notable alumni" page, a spotlight listing) for names.
  - **Search-based discovery** (`api/search.js`) — runs search queries you add against DuckDuckGo's public results and pulls candidate names out of what comes back — including what's publicly indexed about LinkedIn profiles, without scraping LinkedIn directly (which actively blocks and pursues scrapers; DuckDuckGo doesn't enforce against light, occasional use like this).

  Both are heuristics, not verified facts — treat anything they surface as a lead to glance at and claim or dismiss, same as a suggestion a person typed in by hand.
- Everything's shared and updates live across everyone who has the page open.

## Auto-discovery

Managed entirely from the app — no Supabase SQL Editor needed for day-to-day use. In the **Auto-discovery** panel:
- Add a search query (e.g. "computer science alumni AI startup") and it'll get searched daily.
- Add a page URL (e.g. a department's alumni spotlight page) and it'll get scanned daily.
- Hit **Run auto-discovery now** to trigger both immediately instead of waiting for the next scheduled run.

Both crons run once a day for free on Vercel's Hobby plan. No API keys, no billing account, nothing to sign up for.

## Stack

Plain HTML/JS front end, no build step, hosted on Vercel. Data and screenshot storage run on Supabase (Postgres + Storage). Two small serverless functions (`api/scrape.js`, `api/search.js`) run on Vercel's free daily cron for auto-discovery. See `supabase/schema.sql` and `supabase/migrations/` for the database setup.
