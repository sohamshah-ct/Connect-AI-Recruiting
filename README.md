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
- Three auto-discovery jobs (free, no API key or billing account needed for any of them) that feed the suggestions queue automatically, manageable right from the "Auto-Discovery" tab in the app — add/remove sources or hit "Run now", no SQL required:
  - **Pages watched** (`api/scrape.js`) — reads specific pages you add directly, and follows a few profile-shaped links off each one (real one-hop crawling, not just a single page read).
  - **Common Crawl domains** (`api/discover.js`) — the standout one. Queries [Common Crawl](https://commoncrawl.org)'s free public web index — a nonprofit crawl of billions of pages, the same category of open data Google's own index is built from — for alumni-shaped URLs across a whole UConn subdomain, then reads whatever it finds. No fixed list of pages: it discovers them.
  - **Search queries** (`api/search.js`) — runs queries against DuckDuckGo's public results. Best-effort; DuckDuckGo sometimes rate-limits requests from Vercel's shared IPs, so this one can come back empty even when the others work.

  All three are heuristics, not verified facts — treat anything they surface as a lead to glance at and claim or dismiss, same as a suggestion a person typed in by hand.
- Everything's shared and updates live across everyone who has the page open.

## Auto-discovery

Managed entirely from the app — no Supabase SQL Editor needed for day-to-day use. In the **Auto-Discovery** tab (under Tools):
- Add a page URL and it'll get scanned daily, plus a few links off it followed automatically.
- Add a domain (e.g. `business.uconn.edu`) and Common Crawl's index gets queried for alumni-shaped pages on it — no need to find the exact URLs yourself.
- Add a search query and it'll get searched daily (best-effort, see above).
- Hit **Run auto-discovery now** to trigger all three immediately instead of waiting for the next scheduled run.

The two scheduled crons (`scrape`, `discover`) run once a day for free on Vercel's Hobby plan (capped at 2 crons on that plan — `search` is manual-trigger only via the button). No API keys, no billing account, nothing to sign up for, across any of the three.

## Stack

Plain HTML/JS front end, no build step, hosted on Vercel. Data and screenshot storage run on Supabase (Postgres + Storage). Three small serverless functions (`api/scrape.js`, `api/discover.js`, `api/search.js`) handle auto-discovery, sharing extraction logic in `lib/pageExtract.js`. See `supabase/schema.sql` and `supabase/migrations/` for the database setup.
