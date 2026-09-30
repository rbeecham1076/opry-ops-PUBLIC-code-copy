-- Opry Ops 1.0 — Phase 2: decision log (brief §13, §32, §33).
-- FACT (verified source data) lives on the records themselves. This table holds the other two, kept apart:
--   RECOMMENDATION — what Rachel/the system proposes (recommendation, recommended_amount, recommended_by)
--   DECISION       — what management actually authorized (decision, approved_amount, decided_by, decided_at)
-- A recommendation can never become an approval by accident: the constraints below require an approver and a
-- date before a decision or approved amount can exist.
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'QUESTION' check (kind in ('QUESTION', 'BUDGET', 'PUBLISH', 'CONTRACT', 'DEPOSIT', 'TRACKING', 'RULE', 'OTHER')),
  status text not null default 'OPEN' check (status in ('OPEN', 'RECOMMENDED', 'APPROVED', 'DECLINED', 'ANSWERED', 'WITHDRAWN')),
  business_unit business_unit default 'SHARED',
  event_id uuid references public.events(id) on delete set null,
  approver text,                     -- who must decide (Jamie / Clay / Barbie / Owners)
  why text,
  recommendation text, recommended_amount numeric(12,2), recommended_by text, recommended_at timestamptz, evidence text,
  decision text, approved_amount numeric(12,2), decided_by text, decided_at timestamptz,
  next_step text,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint decided_needs_who_and_when check (status in ('OPEN', 'RECOMMENDED', 'WITHDRAWN') or (decided_by is not null and decided_at is not null)),
  constraint approved_amount_only_when_approved check (approved_amount is null or status = 'APPROVED'),
  constraint open_items_have_no_decision check (status not in ('OPEN', 'RECOMMENDED') or (decision is null and approved_amount is null and decided_by is null))
);
create index if not exists decisions_status on public.decisions (status);

alter table public.decisions enable row level security;
drop policy if exists "ops admin full access" on public.decisions;
create policy "ops admin full access" on public.decisions for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'decisions') then
    alter publication supabase_realtime add table public.decisions;
  end if;
end $$;

-- Open questions from the workbook (currently Wednesday items) move to the decision log so they stay visible until answered.
-- [PUBLIC COPY] seed data for decisions removed

update public.meeting_items set status = 'MOVED_TO_DECISIONS'
where id in (select id from public.decisions) and status = 'OPEN';

-- Working rules already adopted become decided rules (who adopted them is kept as recorded).
-- [PUBLIC COPY] seed data for decisions removed


-- Approval matrix Rachel confirmed today.
-- [PUBLIC COPY] seed data for decisions removed

