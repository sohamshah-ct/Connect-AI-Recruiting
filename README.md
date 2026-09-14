# Alumni Outreach Tracker

**Live:** https://connect-ai-recruiting.vercel.app

A shared tracker for Connect.AI's alumni outreach. Everyone in the class logs the alumni they contact — status, notes, and a screenshot as proof it happened — and it updates live for anyone with the link. No login required.

## What it does

- Log an alumni contact with status (to contact, awaiting reply, in conversation, visit scheduled, complete, no response), method, notes, and a required proof-of-contact screenshot.
- Edit any entry after the fact to fill in details or swap the screenshot.
- One-click Google and LinkedIn lookups next to each name.
- 👏 / 🎉 reactions on entries.
- A leaderboard ranking who's contacted the most people — click a name to filter the feed to just their entries.
- Everything's shared and updates live across everyone who has the page open.

## Stack

Plain HTML/JS, no build step, hosted on Vercel. Data and screenshot storage run on Supabase (Postgres + Storage). See `supabase/schema.sql` and `supabase/migrations/` for the database setup.
