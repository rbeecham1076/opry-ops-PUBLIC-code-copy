-- Opry Ops 1.0 — Phase 0: rule fixes from docs/GAP_AUDIT.md.
-- 1) Ticket history accumulates (brief §31): every change to an event's ticket numbers is kept as a snapshot.
-- 2) Data confidence / known issue on facts (brief §11).
-- 3) SMS consent stored separately from phone, never inferred (brief §12).
-- 4) An ordinary edit is not an approval (brief §32): clear the one app edit that was auto-stamped.

create table if not exists public.ticket_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  captured_at timestamptz not null default now(),
  tickets_sold integer,
  gross numeric(12,2),              -- actual ticketing gross (Etix for KY Opry). Never attributed revenue.
  source text,                      -- e.g. 'Etix via Cymbal', 'Host venue report', 'Workbook 2026-09-27'
  data_confidence text default 'VERIFIED' check (data_confidence in ('VERIFIED', 'UNCERTAIN', 'ESTIMATE')),
  known_issue text,
  created_at timestamptz default now()
);
create index if not exists ticket_snapshots_event_time on public.ticket_snapshots (event_id, captured_at desc);

alter table public.events
  add column if not exists data_confidence text default 'VERIFIED',
  add column if not exists known_issue text;
alter table public.events drop constraint if exists events_data_confidence_check;
alter table public.events add constraint events_data_confidence_check check (data_confidence in ('VERIFIED', 'UNCERTAIN', 'ESTIMATE'));
comment on column public.events.ticket_revenue is 'Actual ticketing gross (Etix for KY Opry; host venue for CCP). Latest value; history in ticket_snapshots. Never Cymbal/Meta attributed revenue.';
comment on column public.events.tickets_sold is 'Latest ticket count; history in ticket_snapshots.';

-- Record a snapshot whenever ticket numbers change, however they were written (app, import, connector pull).
create or replace function public.record_ticket_snapshot() returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and (new.tickets_sold is not null or new.ticket_revenue is not null))
     or (tg_op = 'UPDATE' and (new.tickets_sold is distinct from old.tickets_sold or new.ticket_revenue is distinct from old.ticket_revenue)) then
    insert into public.ticket_snapshots (event_id, captured_at, tickets_sold, gross, source, data_confidence, known_issue)
    values (new.id, coalesce(new.last_refreshed_at, now()), new.tickets_sold, new.ticket_revenue, new.external_source,
            coalesce(new.data_confidence, 'VERIFIED'), new.known_issue);
  end if;
  return new;
end $$;
drop trigger if exists events_ticket_snapshot on public.events;
create trigger events_ticket_snapshot after insert or update of tickets_sold, ticket_revenue on public.events
  for each row execute function public.record_ticket_snapshot();

-- Backfill: today's values become the first snapshot for each show.
-- [PUBLIC COPY] seed data for ticket_snapshots removed


-- SMS consent: a phone number is not consent.
alter table public.contacts
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_source text,
  add column if not exists sms_consent_date timestamptz;
alter table public.audience_suggestions
  add column if not exists sms_consent_source text,
  add column if not exists sms_consent_date timestamptz;
comment on column public.audience_suggestions.sms_opt_in is 'True only when the person explicitly opted in to marketing texts on the form. Never inferred from phone.';

-- The app used to write approved_by = 'Rachel' on every edit. Clear it on app edits (task/idea/meeting_item);
-- real approvals and working rules keep theirs.
update public.change_log set approved_by = null
where entity_type in ('task', 'idea', 'meeting_item') and approved_by = 'Rachel' and reason is null;

alter table public.ticket_snapshots enable row level security;
drop policy if exists "ops admin full access" on public.ticket_snapshots;
create policy "ops admin full access" on public.ticket_snapshots for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
