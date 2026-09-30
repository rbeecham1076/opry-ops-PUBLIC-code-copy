-- 019 (2026-09-28): Barbie sells tickets and handles ticket reporting; Etix is expected to email weekly counts to each
-- artist's management. Nobody has confirmed they go out, so each artist show gets a check step (T06).
insert into public.workflow_rules (id, name, trigger_type, business_unit, kind, code, offset_days, section, applies_to, purpose, done_when, handling, approver, priority, sort, source_document, active, task_template, show_kinds)
values ('step-t06', 'Check the weekly Etix sales report is reaching the artist''s management', 'Show date', 'SHARED', 'SHOW_STEP', 'T06', -63, 'Tickets', 'ALL',
  'Etix should email ticket counts to each artist''s team every week — nobody has confirmed they actually go out.',
  'Barbie or Etix confirms the scheduled report is set up for this show, and the artist''s team got at least one.', 'TEAM', null, 'Medium', 138,
  'the office admin 2026-09-28; Admin Checklist', true, '{}', '{ARTIST}')
on conflict (id) do update set name = excluded.name, purpose = excluded.purpose, done_when = excluded.done_when;
select public.generate_show_workflow(id) from public.events where event_date >= current_date;
update public.contacts set role = 'Owner — office operations; sells tickets and handles ticket reporting; pays deposits' where name = 'Barbie';
