-- 015 (2026-09-28): house/rental nights, shared-sheet reminders, staff sheet, checklist gaps, auto-complete from facts.
-- Asked for by the office admin (administrative assistant, KY Opry / CCP — goes by "Rach").

-- ---------- 1. House nights & rentals ----------
-- Free Gospel / Bluegrass / Classic Country nights have no talent: we put them on or the building is rented.
-- Only rental fee and concessions are tracked for them.
alter table public.events drop constraint if exists events_show_type_check;
alter table public.events add constraint events_show_type_check check (show_type is null or show_type in ('ARTIST', 'HOUSE', 'RENTAL'));
alter table public.settlements add column if not exists concessions_gross numeric;
alter table public.settlements add column if not exists concessions_notes text;
alter table public.settlements add column if not exists rental_fee numeric;
alter table public.settlements add column if not exists renter text;

-- Which kinds of show a checklist step applies to. Artist steps stay artist-only.
alter table public.workflow_rules add column if not exists show_kinds text[] not null default '{ARTIST}';

create or replace function public.show_kind(p_type text) returns text language sql immutable set search_path = '' as
$$ select case when p_type in ('HOUSE', 'RENTAL') then 'HOUSE' else 'ARTIST' end $$;

-- Pending deals (HOLD) and cancelled shows get no checklist until they are booked.
create or replace function public.generate_show_workflow(p_event uuid)
 returns integer language plpgsql set search_path to '' as $function$
declare e record; n integer;
begin
  select id, event_date, business_unit, show_type, show_status into e from public.events where id = p_event;
  if e.id is null or e.event_date is null or e.business_unit = 'CCP' or coalesce(e.show_status, 'BOOKED') in ('HOLD', 'CANCELLED') then return 0; end if;
  insert into public.tasks (title, business_unit, category, section, status, priority, due_at, event_id, source_rule_id,
                            purpose, done_when, handling, approver, catch_up, source_document)
  select w.name, e.business_unit, 'Show & Artist Operations', w.section, 'OPEN', w.priority,
         ((e.event_date + w.offset_days)::text || 'T17:00:00-05:00')::timestamptz, e.id, w.code,
         w.purpose, w.done_when, w.handling, w.approver,
         (e.event_date + w.offset_days) < (now() at time zone 'America/Chicago')::date, w.source_document
  from public.workflow_rules w
  where w.kind = 'SHOW_STEP' and w.active and w.applies_to in ('ALL', e.business_unit::text)
    and public.show_kind(e.show_type) = any (w.show_kinds)
  on conflict (event_id, source_rule_id) where event_id is not null and source_rule_id is not null do nothing;
  get diagnostics n = row_count;
  if public.show_kind(e.show_type) = 'ARTIST' then
    insert into public.asset_requests (event_id, asset_type)
    select e.id, a from unnest(array['Show graphic','Vertical video','Clean photos','Logo','Bio','Songs / credits','MP3 (radio)','Sizzle reel']) a
    on conflict (event_id, asset_type) do nothing;
  end if;
  insert into public.settlements (event_id) values (e.id) on conflict (event_id) do nothing;
  return n;
end $function$;

-- Re-run the checklist when a show is booked or its kind changes, not only when the date moves.
drop trigger if exists events_generate_workflow on public.events;
create trigger events_generate_workflow after insert or update of event_date, show_status, show_type on public.events
  for each row when (new.event_date is not null) execute function public.events_generate_workflow();

-- ---------- 2. Checklist gaps found in the Admin Checklist ----------
insert into public.workflow_rules (id, name, trigger_type, business_unit, kind, code, offset_days, section, applies_to,
                                   purpose, done_when, handling, approver, priority, sort, source_document, active, task_template, show_kinds)
values
 ('step-a09', 'Rider saved in the venue''s Drive folder and shared with the sound tech', 'Show date', 'SHARED', 'SHOW_STEP', 'A09', -75, 'Artist & Contract', 'ALL',
  'Chris Rogers (sound) and the lighting person work from the rider in the venue folder.', 'Rider is in the venue folder and the sound tech can open it.',
  'RACHEL', null, 'Medium', 95, 'Admin Checklist', true, '{}', '{ARTIST}'),
 ('step-t05', 'All Venues Calendar: sale date and status updated', 'Show date', 'SHARED', 'SHOW_STEP', 'T05', -70, 'Tickets', 'ALL',
  'The All Venues Calendar is the team''s shared list of every show.', 'Row for this show has the right date, venue, sale date and status.',
  'RACHEL', null, 'Medium', 135, 'Admin Checklist: "Update the Sale Date Spreadsheets"', true, '{}', '{ARTIST,HOUSE}'),
 ('step-w05', 'ProPresenter (Opry Auditorium): remove this show''s video and slides', 'Show date', 'SHARED', 'SHOW_STEP', 'W05', 1, 'Wrap-up', 'ALL',
  'Old shows must come out so the pre-show loop only promotes what is coming up.', 'Video and slides for this show are gone from ProPresenter.',
  'RACHEL', null, 'Medium', 905, 'Admin Checklist; the office admin 2026-09-28', true, '{}', '{ARTIST,HOUSE}'),
 ('step-w06', 'Concessions sales recorded', 'Show date', 'SHARED', 'SHOW_STEP', 'W06', 1, 'Wrap-up', 'ALL',
  'Concessions are part of every night''s money, talent or not.', 'Show → After the show → concessions total entered.',
  'RACHEL', null, 'Medium', 906, 'the office admin 2026-09-28', true, '{}', '{ARTIST,HOUSE}'),
 ('step-x01', 'House night: who is hosting / performing, and rental fee agreed (if rented)', 'Show date', 'SHARED', 'SHOW_STEP', 'X01', -14, 'Money', 'ALL',
  'Free Gospel / Bluegrass / Classic Country nights have no contracted talent — just confirm the night is covered.', 'Host or renter noted on the show; rental fee entered if the building is rented.',
  'RACHEL', null, 'Medium', 5, 'the office admin 2026-09-28', true, '{}', '{HOUSE}'),
 ('step-x02', 'Rental fee received and recorded', 'Show date', 'SHARED', 'SHOW_STEP', 'X02', 3, 'Wrap-up', 'ALL',
  'Rentals are the only income on a house night besides concessions.', 'Rental fee entered under After the show (or "free night — no rental").',
  'RACHEL', null, 'Medium', 907, 'the office admin 2026-09-28', true, '{}', '{HOUSE}')
on conflict (id) do update set name = excluded.name, offset_days = excluded.offset_days, section = excluded.section,
  purpose = excluded.purpose, done_when = excluded.done_when, show_kinds = excluded.show_kinds, updated_at = now();

update public.workflow_rules set name = 'ProPresenter (Opry Auditorium): add this show''s video and slides', show_kinds = '{ARTIST,HOUSE}'
 where code = 'K09';
update public.tasks set title = 'ProPresenter (Opry Auditorium): add this show''s video and slides' where source_rule_id = 'K09';

-- ---------- 3. Mark the free nights as house nights and clear their artist checklist ----------
update public.events set show_type = 'HOUSE'
 where title ~* '(gospel night|^gospel$|bluegrass|classic country|country night)' and coalesce(show_type, '') <> 'HOUSE';
delete from public.tasks t using public.events e, public.workflow_rules w
 where t.event_id = e.id and e.show_type in ('HOUSE', 'RENTAL') and t.source_rule_id = w.code and w.kind = 'SHOW_STEP'
   and not ('HOUSE' = any (w.show_kinds)) and t.status <> 'COMPLETE';
delete from public.asset_requests a using public.events e where a.event_id = e.id and e.show_type in ('HOUSE', 'RENTAL') and a.status = 'MISSING';

-- New steps onto every upcoming show.
select public.generate_show_workflow(id) from public.events where event_date >= current_date;

-- ---------- 4. Shared-sheet reminder ----------
-- When a show changes in Opry Ops, one open reminder per show says what to copy into
-- Tiffany's OPRY Show Advance Sheet and the All Venues Calendar. Changes that came FROM those sheets don't count.
create or replace function public.flag_shared_sheet_update(p_event uuid, p_sheet text, p_what text)
 returns void language plpgsql set search_path to '' as $function$
declare e record; line text;
begin
  select id, title, event_date, business_unit into e from public.events where id = p_event;
  if e.id is null or e.event_date < (now() at time zone 'America/Chicago')::date then return; end if;
  line := to_char(now() at time zone 'America/Chicago', 'Mon DD') || ' — ' || p_sheet || ': ' || p_what;
  insert into public.tasks (title, business_unit, category, section, status, priority, due_at, event_id, source_rule_id,
                            description, purpose, done_when, handling, source_document)
  values ('Update the shared sheets: ' || e.title, e.business_unit, 'Admin', 'Admin', 'OPEN', 'Medium',
          now() + interval '2 days', e.id, 'SYNC', line,
          'Tiffany''s OPRY Show Advance Sheet and the All Venues Calendar are what the team reads. Keep them matching Opry Ops.',
          'Each change listed here is copied into the sheet named on its line.', 'RACHEL', 'Opry Ops change log')
  on conflict (event_id, source_rule_id) where event_id is not null and source_rule_id is not null do update
    set status = 'OPEN', completed_at = null, due_at = least(public.tasks.due_at, excluded.due_at),
        description = case when public.tasks.status = 'COMPLETE' then excluded.description
                           when position(p_what in coalesce(public.tasks.description, '')) > 0 then public.tasks.description
                           else left(coalesce(public.tasks.description || E'\n', '') || line, 3000) end,
        updated_at = now();
end $function$;

create or replace function public.events_flag_sheets() returns trigger language plpgsql set search_path to '' as $function$
declare changes text[] := '{}';
begin
  if new.title is distinct from old.title then changes := changes || ('name → ' || new.title); end if;
  if new.event_date is distinct from old.event_date then changes := changes || ('date → ' || new.event_date); end if;
  if new.starts_at is distinct from old.starts_at then changes := changes || 'show time'; end if;
  if new.doors_at is distinct from old.doors_at then changes := changes || 'doors time'; end if;
  if new.venue_id is distinct from old.venue_id then changes := changes || 'venue'; end if;
  if new.show_status is distinct from old.show_status then changes := changes || ('status → ' || new.show_status); end if;
  if new.on_sale_date is distinct from old.on_sale_date then changes := changes || ('on-sale date → ' || coalesce(new.on_sale_date::text, 'none')); end if;
  if array_length(changes, 1) > 0 then
    perform public.flag_shared_sheet_update(new.id, 'All Venues Calendar' || case when new.venue_id is not distinct from old.venue_id and new.title is not distinct from old.title and new.event_date is not distinct from old.event_date then '' else ' + Advance Sheet' end, array_to_string(changes, ', '));
  end if;
  return new;
end $function$;
drop trigger if exists events_flag_sheets on public.events;
create trigger events_flag_sheets after update of title, event_date, starts_at, doors_at, venue_id, show_status, on_sale_date on public.events
  for each row execute function public.events_flag_sheets();

create or replace function public.facts_flag_sheets() returns trigger language plpgsql set search_path to '' as $function$
begin
  if coalesce(new.source, '') ilike '%advance sheet%' then return new; end if;  -- came from the sheet already
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then return new; end if;
  if new.section in ('Production', 'Hospitality') and new.field not like 'Rider:%' and new.field <> 'Walmart list' then
    perform public.flag_shared_sheet_update(new.event_id, 'Advance Sheet', new.field);
  end if;
  return new;
end $function$;
drop trigger if exists show_facts_flag_sheets on public.show_facts;
create trigger show_facts_flag_sheets after insert or update on public.show_facts
  for each row execute function public.facts_flag_sheets();

-- ---------- 5. Answered in a rider or by Rach → step closes itself ----------
-- A checklist step completes when every fact it needs is filled in. Evidence says which facts did it.
create table if not exists public.step_fact_rules (code text primary key, fields text[] not null, note text);
alter table public.step_fact_rules enable row level security;
drop policy if exists "ops admin full access" on public.step_fact_rules;
create policy "ops admin full access" on public.step_fact_rules for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
insert into public.step_fact_rules (code, fields, note) values
 ('P01', '{Tour manager / production contact}', 'Pre-advance contact found'),
 ('P03', '{Stage plot,Sound tech,Backline}', 'Stage plot, sound tech and backline on file'),
 ('P04', '{Load-in,Soundcheck}', 'Load-in and soundcheck times on file'),
 ('P05', '{Opening act}', 'Opening act on file'),
 ('P06', '{Stagehands,Runner,Security,Merch seller}', 'Show-day helpers on file'),
 ('H01', '{Hotel,Rooms × nights}', 'Hotel and rooms on file'),
 ('H02', '{Food: buyout or catering}', 'Food plan on file')
on conflict (code) do update set fields = excluded.fields, note = excluded.note;

create or replace function public.complete_steps_from_facts(p_event uuid) returns integer
 language plpgsql set search_path to '' as $function$
declare n integer;
begin
  update public.tasks t set status = 'COMPLETE', completed_at = now(), catch_up = false, updated_at = now(),
         completion_evidence = 'Filled in automatically: ' || r.note || ' (' || array_to_string(r.fields, ', ') || ')'
  from public.step_fact_rules r
  where t.event_id = p_event and t.source_rule_id = r.code and t.status <> 'COMPLETE'
    and not exists (select 1 from unnest(r.fields) f
                    where not exists (select 1 from public.show_facts sf where sf.event_id = p_event and sf.field = f and nullif(trim(sf.value), '') is not null));
  get diagnostics n = row_count;
  return n;
end $function$;

create or replace function public.facts_complete_steps() returns trigger language plpgsql set search_path to '' as $function$
begin perform public.complete_steps_from_facts(new.event_id); return new; end $function$;
drop trigger if exists show_facts_complete_steps on public.show_facts;
create trigger show_facts_complete_steps after insert or update of value on public.show_facts
  for each row execute function public.facts_complete_steps();

select public.complete_steps_from_facts(id) from public.events where event_date >= current_date;

-- ---------- 6. Staff contact sheet ----------
alter table public.contacts add column if not exists staff_team text;
alter table public.contacts add column if not exists staff_sort integer;
update public.contacts c set staff_team = v.team, staff_sort = v.sort, role = coalesce(v.role, c.role),
       email = coalesce(v.email, c.email), updated_at = now()
from (values
  ('Clay Campbell', 'Owners', 10, 'Owner — reads and signs contracts', 'person@example.com, person@example.com'),
  ('Barbie', 'Owners', 20, 'Owner — office operations, pays deposits', null),
  ('Jamie', 'Owners', 30, 'Business partner — proformas, ad-spend approval; radio station GM', null),
  ('the office admin', 'Office', 40, 'Administrative assistant, Kentucky Opry & CCP (goes by Rach)', 'person@example.com, person@example.com'),
  ('Tiffany', 'Office', 50, 'Admin — hospitality & non-tech advance; trainings', null),
  ('Kentucky Opry office', 'Office', 60, 'Main office line', null),
  ('the day-of-show lead', 'Show day', 70, 'Day-of-Show Supervisor; runner for the act; Walmart orders (KY Opry-only weekends)', null),
  ('Chris Rogers', 'Production', 80, 'Sound engineer (front of house) — Dirt Floor Entertainment / 4 Rivers Productions', 'person@example.com, person@example.com'),
  ('Mark Edwards', 'Marketing', 90, 'Video & slides — show videos and ProPresenter content (Mark''s Bunker)', null),
  ('Jeff French', 'Marketing', 100, 'Graphics — show images and ads (Kingfisher Creations)', null),
  ('Jeff Lawrence', 'Marketing', 110, 'Radio commercials — audio (WKYQ)', null)
) as v(name, team, sort, role, email)
where c.name = v.name;
update public.contacts set name = 'office staff' where name = 'Tiffany' and staff_team = 'Office';
