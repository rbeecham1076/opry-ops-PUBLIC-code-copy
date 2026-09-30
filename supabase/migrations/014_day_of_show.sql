-- Day-of-Show packet + Walmart order (2026-09-28).
-- the day-of-show lead is the Day-of-Show Supervisor and the runner for the act. She needs the shopping list and
-- show-day details at least 10 days out. Walmart order owner: the day-of-show lead for Kentucky Opry-only weekends;
-- the office admin does BOTH orders when a KY Opry show shares a weekend with a CCP show at an outside venue
-- (worked out in the app from the event calendar, so it stays right as shows are added).

insert into public.workflow_rules (id, name, trigger_type, business_unit, kind, code, offset_days, section, applies_to,
                                   purpose, done_when, handling, approver, priority, sort, source_document, active, task_template)
values
 ('step-h04', 'Day-of-Show sheet + Walmart list sent to the day-of-show lead', 'Show date', 'SHARED', 'SHOW_STEP', 'H04', -10, 'Hospitality', 'ALL',
  'the day-of-show lead runs show day and is the artist''s runner. She needs times, contacts, rider hospitality and the shopping list at least 10 days out.',
  'Show → Day-of-Show sheet printed or sent to the day-of-show lead; Walmart order owner confirmed (the office admin if a CCP outside-venue show is the same weekend).',
  'RACHEL', null, 'High', 255, 'the office admin 2026-09-28; artist riders', true, '{}'),
 ('step-h05', 'Walmart order placed / picked up for show day', 'Show date', 'SHARED', 'SHOW_STEP', 'H05', -2, 'Hospitality', 'ALL',
  'Rider drinks, snacks and green-room items must be on hand when the artist arrives.',
  'Everything on the Walmart list is bought; receipt handed to Barbie.',
  'TEAM', null, 'High', 275, 'the office admin 2026-09-28; artist riders', true, '{}')
on conflict (id) do update set name = excluded.name, offset_days = excluded.offset_days, purpose = excluded.purpose,
  done_when = excluded.done_when, section = excluded.section, updated_at = now();

-- Backfill the new steps onto every upcoming show (the generator skips steps a show already has).
select public.generate_show_workflow(id) from public.events where event_date >= current_date;

-- People: who does what on show day.
update public.contacts set role = 'Day-of-Show Supervisor / runner for the act; Walmart orders for KY Opry-only weekends',
  phone = coalesce(phone, '555-555-0100'),
  notes = 'Day-of-Show Supervisor and the runner for the act/band/talent. Buys the Walmart order for Kentucky Opry-only weekends. '
       || 'Needs the Day-of-Show sheet + shopping list at least 10 days before each show. Phone from the 2025 advance sheet — verify.',
  updated_at = now()
where name = 'the day-of-show lead';

update public.contacts set name = 'the office admin',
  notes = notes || E'\nWalmart orders: does BOTH locations when a KY Opry show shares a weekend with a CCP outside-venue show.',
  updated_at = now()
where name = 'Rachel' and role like 'Marketing%';
