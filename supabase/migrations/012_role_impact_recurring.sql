-- Opry Ops 1.0 — Phase 4: Role & Impact log (brief §24) and recurring reminders (brief §29).

-- Private record of systems built, problems solved and results. Not a task list; excluded from owner reports
-- unless Rachel chooses to include an entry.
create table if not exists public.role_impact_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  area text, work text not null, need text, what_i_did text, evidence_or_result text, business_impact text,
  hours numeric(6,2), status text default 'Done', next text,
  include_in_owner_report boolean not null default false,
  source text, created_at timestamptz default now()
);
alter table public.role_impact_entries enable row level security;
drop policy if exists "ops admin full access" on public.role_impact_entries;
create policy "ops admin full access" on public.role_impact_entries for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));

-- [PUBLIC COPY] seed data for role_impact_entries removed


-- Recurring (yearly) admin reminders from the Admin Checklist. Dates are editable defaults, not facts.
create unique index if not exists tasks_recurring_key on public.tasks (source_rule_id) where event_id is null and source_rule_id is not null;
insert into public.workflow_rules (id, name, trigger_type, kind, code, trigger_config, section, applies_to, purpose, done_when, handling, approver, priority, active, source_document, task_template)
select v.id, v.name, 'Every year', 'ANNUAL', v.code, v.cfg::jsonb, 'Admin', 'ALL', v.purpose, v.done, v.handling, v.approver, 'Medium', true, 'Admin Checklist', '{}'::jsonb
from (values
  ('annual-hotel-cc', 'Send updated credit-card forms to hotels (Barbie signs)', 'Y01', '{"month":12,"day":1,"default":true}', 'Hotels need a current card on file for next year.', 'Forms filled in, signed by Barbie and returned to every hotel on the reference sheet.', 'APPROVAL', 'Barbie'),
  ('annual-archive', 'Add the year''s complete business files to Google Drive (contracts, riders, insurance)', 'Y02', '{"month":1,"day":15,"default":true}', 'Keeps a complete, findable record for each year.', 'Last year''s folders complete in Drive.', 'RACHEL', null),
  ('annual-handbook', 'Update the Administrative Assistant handbook and binder', 'Y03', '{"month":1,"day":31,"default":true}', 'The handbook is how the job is handed on.', 'Handbook reflects how the work is done now (including Opry Ops).', 'RACHEL', null),
  ('annual-hotel-refs', 'Review the hotel reference sheet (who we book with, who not to)', 'Y04', '{"month":1,"day":31,"default":true}', 'Avoid booking hotels that caused problems.', 'Sheet reviewed and updated.', 'RACHEL', null)
) as v(id, name, code, cfg, purpose, done, handling, approver)
where not exists (select 1 from public.workflow_rules w where w.code = v.code);

create or replace function public.generate_recurring_tasks(p_year integer) returns integer
language plpgsql set search_path = '' as $$
declare n integer;
begin
  insert into public.tasks (title, business_unit, category, section, status, priority, due_at, source_rule_id, purpose, done_when, handling, approver, source_document)
  select w.name, 'SHARED', 'Admin', 'Admin', 'OPEN', w.priority,
         (make_date(p_year, (w.trigger_config->>'month')::int, (w.trigger_config->>'day')::int)::text || 'T17:00:00-06:00')::timestamptz,
         w.code || '-' || p_year, w.purpose, w.done_when, w.handling, w.approver, w.source_document
  from public.workflow_rules w where w.kind = 'ANNUAL' and w.active
    and make_date(p_year, (w.trigger_config->>'month')::int, (w.trigger_config->>'day')::int) >= (now() at time zone 'America/Chicago')::date  -- never create a reminder that is born overdue
  on conflict (source_rule_id) where event_id is null and source_rule_id is not null do nothing;
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.generate_recurring_tasks(integer) from public, anon;
grant execute on function public.generate_recurring_tasks(integer) to authenticated;
select public.generate_recurring_tasks(2026);
select public.generate_recurring_tasks(2027);

-- Gmail inbox sync status (first scan, 2026-09-28): no operational mail yet.
-- [PUBLIC COPY] seed data for integration_sync_status removed

alter table public.role_impact_entries add column if not exists updated_at timestamptz default now();
