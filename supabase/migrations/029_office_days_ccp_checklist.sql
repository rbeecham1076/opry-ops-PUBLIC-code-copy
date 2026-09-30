-- Rach works Tuesday, Wednesday and Friday (decided Sep 30, 2026).
-- 1. office_day(): move a date onto an office day — earlier for work before a show, later for wrap-up after it.
-- 2. Tasks: any due date Rach owns is kept on an office day automatically (team tasks keep their real date).
-- 3. State Theater / Marion (CCP) shows get a small checklist: only the steps that apply there.
-- 4. Walmart: Kentucky Opry-only weekends → the day-of-show lead places the order (not tracked here). If a State/Marion show
--    is the same weekend, or the show is at State/Marion, Rach places it 2+ weeks out and sends pickup details.
-- 5. Hotels: book as soon as the contract date is certain (step moved to 75 days out).

create or replace function public.office_day(d date, after_show boolean default false)
returns date language sql immutable set search_path to '' as $$
  select case extract(dow from d)::int
    when 1 then d + case when after_show then 1 else -3 end   -- Mon
    when 4 then d + case when after_show then 1 else -1 end   -- Thu
    when 6 then d + case when after_show then 3 else -1 end   -- Sat
    when 0 then d + case when after_show then 2 else -2 end   -- Sun
    else d end
$$;

create or replace function public.tasks_office_day()
returns trigger language plpgsql set search_path to '' as $$
declare local_d date; show_d date; target date;
begin
  if new.due_at is null or coalesce(new.handling, 'RACHEL') = 'TEAM' or new.status in ('COMPLETE', 'ARCHIVED') then return new; end if;
  if tg_op = 'UPDATE' and new.due_at is not distinct from old.due_at and new.handling is not distinct from old.handling then return new; end if;
  local_d := (new.due_at at time zone 'America/Chicago')::date;
  if new.event_id is not null then select event_date into show_d from public.events where id = new.event_id; end if;
  target := public.office_day(local_d, show_d is not null and local_d > show_d);
  if target <> local_d then new.due_at := new.due_at + make_interval(days => target - local_d); end if;
  return new;
end $$;
drop trigger if exists tasks_office_day on public.tasks;
create trigger tasks_office_day before insert or update of due_at, handling on public.tasks
  for each row execute function public.tasks_office_day();

-- CCP small checklist
alter table public.workflow_rules add column if not exists ccp_checklist boolean not null default false;
update public.workflow_rules set ccp_checklist = true
 where code in ('A03','A05','A06','A07','A08','A09','V01','I01','I02','H01','H02','H04','H05','P01','P02','P04','W02','W04');
insert into public.workflow_rules (id, name, kind, code, offset_days, section, applies_to, purpose, done_when, handling, priority, sort, show_kinds, active, ccp_checklist, trigger_type, business_unit, task_template)
select 'step-c01', 'Check the venue''s advance sheet (fill in only what’s ours)', 'SHOW_STEP', 'C01', -21, 'Production', 'CCP',
       'The venue keeps its own advance sheet; read it and fill in only the details we owe.', 'Our details are on the venue''s sheet.', 'RACHEL', 'Normal', 900, array['ARTIST'], true, true, 'Show date', 'SHARED', '{}'::jsonb
where not exists (select 1 from public.workflow_rules where code = 'C01');
insert into public.workflow_rules (id, name, kind, code, offset_days, section, applies_to, purpose, done_when, handling, priority, sort, show_kinds, active, ccp_checklist, trigger_type, business_unit, task_template)
select 'step-c02', 'Weekly ticket report reaching the artist and Barbie (Etix sends it)', 'SHOW_STEP', 'C02', -60, 'Tickets', 'CCP',
       'Artists and Barbie get ticket counts weekly; Etix should send it automatically.', 'Confirmed once that the automatic report is going out.', 'RACHEL', 'Normal', 910, array['ARTIST'], true, true, 'Show date', 'SHARED', '{}'::jsonb
where not exists (select 1 from public.workflow_rules where code = 'C02');
update public.workflow_rules set offset_days = -75 where code = 'H01';
update public.workflow_rules set name = 'Hotel rooms booked as soon as the contract date is certain (email subject: Ky Opry Reservations)' where code = 'H01';

create or replace function public.generate_show_workflow(p_event uuid)
returns integer language plpgsql set search_path to '' as $function$
declare e record; n integer; ccp boolean;
begin
  select id, event_date, business_unit, show_type, show_status into e from public.events where id = p_event;
  if e.id is null or e.event_date is null or coalesce(e.show_status, 'BOOKED') in ('HOLD', 'CANCELLED') then return 0; end if;
  ccp := e.business_unit = 'CCP';
  insert into public.tasks (title, business_unit, category, section, status, priority, due_at, event_id, source_rule_id,
                            purpose, done_when, handling, approver, catch_up, source_document)
  select w.name, e.business_unit, 'Show & Artist Operations', w.section, 'OPEN', w.priority,
         ((e.event_date + w.offset_days)::text || 'T17:00:00-05:00')::timestamptz, e.id, w.code,
         w.purpose, w.done_when, w.handling, w.approver,
         (e.event_date + w.offset_days) < (now() at time zone 'America/Chicago')::date, w.source_document
  from public.workflow_rules w
  where w.kind = 'SHOW_STEP' and w.active and public.show_kind(e.show_type) = any (w.show_kinds)
    and case when ccp then w.ccp_checklist else w.applies_to in ('ALL', e.business_unit::text) end
  on conflict (event_id, source_rule_id) where event_id is not null and source_rule_id is not null do nothing;
  get diagnostics n = row_count;
  if not ccp and public.show_kind(e.show_type) = 'ARTIST' then
    insert into public.asset_requests (event_id, asset_type)
    select e.id, a from unnest(array['Show graphic','Vertical video','Clean photos','Logo','Bio','Songs / credits','MP3 (radio)','Sizzle reel']) a
    on conflict (event_id, asset_type) do nothing;
  end if;
  insert into public.settlements (event_id) values (e.id) on conflict (event_id) do nothing;
  perform public.apply_walmart_rule(e.id);
  return n;
end $function$;

-- Walmart order: who places it depends on the weekend.
create or replace function public.apply_walmart_rule(p_event uuid)
returns void language plpgsql set search_path to '' as $$
declare e record; busy boolean;
begin
  select id, event_date, business_unit into e from public.events where id = p_event;
  if e.id is null then return; end if;
  busy := e.business_unit = 'CCP' or exists (select 1 from public.events o where o.business_unit = 'CCP' and o.id <> e.id
            and coalesce(o.show_status, 'BOOKED') not in ('HOLD', 'CANCELLED') and o.event_date between e.event_date - 2 and e.event_date + 2);
  if busy then
    update public.tasks set title = 'Walmart order: place it (2+ weeks out) and send the pickup details to the venue contacts',
           handling = 'RACHEL', status = case when status = 'ARCHIVED' then 'OPEN' else status end,
           due_at = ((e.event_date - 14)::text || 'T17:00:00-05:00')::timestamptz
     where event_id = e.id and source_rule_id = 'H05' and status <> 'COMPLETE'
       and (title not like 'Walmart order: place it%' or handling is distinct from 'RACHEL');
  else
    update public.tasks set title = 'Walmart order: the day-of-show lead places it (Kentucky Opry-only weekend)', handling = 'TEAM', status = 'ARCHIVED',
           next_action = 'the day-of-show lead places the Walmart order from the Day-of-Show sheet. Not tracked here.'
     where event_id = e.id and source_rule_id = 'H05' and status not in ('COMPLETE', 'ARCHIVED');
  end if;
end $$;
