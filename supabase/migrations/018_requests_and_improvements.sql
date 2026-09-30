-- 018 (2026-09-28): plain-English requests with a goal and a way to check them, and a dated log of improvements + results.
-- Rach asks; Clay/Barbie/Jamie decide. An approved request becomes an improvement to check back on. Nothing is sent automatically.

alter table public.decisions drop constraint if exists decisions_kind_check;
alter table public.decisions add constraint decisions_kind_check check (kind = any (array[
  'QUESTION','BUDGET','PUBLISH','CONTRACT','DEPOSIT','TRACKING','RULE','OTHER','PURCHASE','TOOL','PROCESS']));
alter table public.decisions add column if not exists goal text;            -- what it should do
alter table public.decisions add column if not exists success_measure text; -- how we'll know it worked
alter table public.decisions add column if not exists check_on date;        -- when Rach reports back
alter table public.decisions add column if not exists note text;            -- the short personal note

create table if not exists public.improvements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  area text,                                   -- Tickets, Ads, Office, Show day, Systems …
  business_unit public.business_unit not null default 'SHARED',
  started_on date not null default current_date,
  why text,                                    -- the problem it fixes
  what_changed text,                           -- what was actually done
  goal text,
  measure text,                                -- how we'll know
  baseline text,                               -- how it was before (a number if we have one)
  check_on date,
  result text,
  result_on date,
  status text not null default 'IN_PLACE' check (status in ('PLANNED','IN_PLACE','WORKED','MIXED','DIDNT_WORK','STOPPED')),
  decision_id uuid references public.decisions(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  share_with_owners boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists improvements_decision_uq on public.improvements(decision_id) where decision_id is not null;
alter table public.improvements enable row level security;
drop policy if exists "ops admin full access" on public.improvements;
create policy "ops admin full access" on public.improvements for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'improvements') then
    alter publication supabase_realtime add table public.improvements;
  end if;
end $$;

-- An approved request (not a plain question) starts the improvement clock.
create or replace function public.decision_to_improvement() returns trigger language plpgsql set search_path to '' as $function$
begin
  if new.status = 'APPROVED' and old.status is distinct from 'APPROVED' and new.kind <> 'QUESTION' then
    insert into public.improvements (title, area, business_unit, started_on, why, goal, measure, check_on, decision_id, event_id, what_changed)
    values (new.title, case new.kind when 'BUDGET' then 'Ads' when 'TOOL' then 'Systems' when 'PROCESS' then 'Office' when 'PURCHASE' then 'Show day' else 'Office' end,
            new.business_unit, coalesce(new.decided_at::date, current_date), new.why, new.goal, new.success_measure, new.check_on, new.id, new.event_id,
            'Approved by ' || coalesce(new.decided_by, '—') || coalesce(': ' || new.decision, ''))
    on conflict (decision_id) where decision_id is not null do nothing;
  end if;
  return new;
end $function$;
drop trigger if exists decisions_to_improvement on public.decisions;
create trigger decisions_to_improvement after update of status on public.decisions
  for each row execute function public.decision_to_improvement();

-- Starting record: what Rach has already put in place, in plain words. Results only where they are known.
-- [PUBLIC COPY] seed data for improvements removed

