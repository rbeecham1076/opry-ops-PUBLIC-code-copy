# ⚠️ PUBLIC COPY — Opry Ops (code review only)

> **This repository is PUBLIC.** It is a cleaned, read-only snapshot of the private `opry-ops` app, made so AI
> code-review tools can read it. It is **not** the live app, is **not** deployed, and is **not** kept in sync.
> Do not open issues or pull requests here; changes are made in the private repository.

## What this is
Opry Ops is an internal operations app for a small country-music theater and its touring-production company:
show checklists that build themselves from each show's date and venue, ticket-sales pacing, email triage,
campaign plans, a church-partner outreach list, day-of-show sheets, approvals and a Wednesday meeting agenda.

- React 18 + TypeScript + Vite, hosted as a static Cloudflare Worker.
- Supabase (Postgres, Auth, Realtime) with row-level security; all business logic that must run automatically
  (checklist generation, office-day scheduling, file links) lives in SQL triggers in `supabase/migrations/`.
- Scheduled Claude routines (not in this repo) refresh ticket sales, sort email, read riders and look for answers
  to open questions; they only write to the database and never send, post or spend.

## What was removed from this copy (see PUBLIC_COPY.md)
- All git history (this is a fresh snapshot).
- Every email address and phone number (replaced with `person@example.com` / `555-555-0100`).
- Staff and artist-team names (replaced with roles), Google Drive/Docs file IDs, the database project ID.
- Seed data in migrations (decisions, campaigns, audiences, work logs, questions, snapshots) and dollar amounts.
- Internal docs (decisions, brand notes, admin checklist, open questions) and all photos/logos.

## Running it
`npm install`, copy `.env.example` to `.env` with your own Supabase URL and anon key, apply the migrations to an
empty Supabase project, then `npm run dev`. Without data most screens will be empty.
