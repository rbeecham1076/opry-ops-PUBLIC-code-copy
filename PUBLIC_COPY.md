# PUBLIC COPY — how this snapshot was made

This repository is **public on purpose** and contains **no private data**. It was generated from the private
`opry-ops` repository by copying the tracked source files and then:

1. Excluding `docs/`, `CLAUDE.md`, the private README, and `public/photos` + `public/brand`.
2. Replacing every email address with `person@example.com` and every phone number with `555-555-0100`.
3. Replacing staff and contact names with their roles, Google file IDs with `REDACTED`, and the Supabase project ID
   with `your-project-id`.
4. Removing seed-data `insert` statements for business records from migrations (marked
   `-- [PUBLIC COPY] seed data … removed`) and replacing dollar amounts in SQL and contract terms with `$X`.
   Schema, functions, triggers and workflow rules are unchanged.

If you are reviewing the code: the interesting logic is in `supabase/migrations/029`–`032` (office-day scheduling,
venue-specific checklists, task file links, open questions) and `src/screens.tsx`, `src/workspace.tsx`,
`src/campaign.tsx`.
