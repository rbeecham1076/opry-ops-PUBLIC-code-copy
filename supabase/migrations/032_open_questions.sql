-- Open questions live in the app (not a doc): each has a status, current notes, and — when an email, note or document
-- answers it — the answer, where it came from, and a link. The morning routine looks for answers and fills them in as
-- "ANSWER_FOUND" for Rach to confirm; it never marks a question ANSWERED on its own.
create table if not exists public.open_questions (
  id uuid primary key default gen_random_uuid(),
  topic text not null default 'Other',          -- Shows & data · Sheets & riders · People & accounts · Website & Etix · Other
  question text not null,
  ask_who text,                                  -- who can answer (Jamie, Clay, Barbie, Tiff, venue, artist team…)
  priority text not null default 'Normal' check (priority in ('High', 'Normal', 'Low')),
  status text not null default 'OPEN' check (status in ('OPEN', 'ASKED', 'ANSWER_FOUND', 'ANSWERED', 'PARKED')),
  notes text,                                    -- current notes / what we know so far
  answer text,
  answer_source text,                            -- e.g. "Email from Jamie, Oct 1" or "Wednesday meeting"
  answer_url text,                               -- link to the email / doc / sheet
  found_by text,                                 -- 'Routine' or 'Rach'
  event_id uuid references public.events(id) on delete set null,
  asked_on date, answered_on date,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.open_questions enable row level security;
drop policy if exists "ops admin full access" on public.open_questions;
create policy "ops admin full access" on public.open_questions for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
do $$ begin alter publication supabase_realtime add table public.open_questions; exception when others then null; end $$;

-- [PUBLIC COPY] seed data for open_questions removed

