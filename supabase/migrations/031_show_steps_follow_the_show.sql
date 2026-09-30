-- A show's checklist follows the show: created the moment a show is added (or goes from HOLD to BOOKED),
-- rebuilt for the right venue if the venue/business unit changes, and moved with the show if its date changes.
-- (Applied to the live database Sep 30, 2026; verified with test shows at the Opry, State Theater and Marion.)
create or replace function public.events_generate_workflow()
returns trigger language plpgsql set search_path to '' as $function$
declare delta int;
begin
  if public.show_kind(new.show_type) = 'HOUSE' then
    delete from public.tasks t using public.workflow_rules w
     where t.event_id = new.id and t.source_rule_id = w.code and w.kind = 'SHOW_STEP'
       and not ('HOUSE' = any (w.show_kinds)) and t.status <> 'COMPLETE';
  end if;
  if tg_op = 'UPDATE' and new.business_unit is distinct from old.business_unit then
    delete from public.tasks t using public.workflow_rules w
     where t.event_id = new.id and t.source_rule_id = w.code and w.kind = 'SHOW_STEP' and t.status in ('OPEN')
       and not (case when new.business_unit = 'CCP' then w.ccp_checklist else w.applies_to in ('ALL', new.business_unit::text) end);
  end if;
  if tg_op = 'UPDATE' and old.event_date is not null and new.event_date is distinct from old.event_date then
    delta := new.event_date - old.event_date;
    update public.tasks set due_at = due_at + make_interval(days => delta),
           catch_up = (due_at + make_interval(days => delta)) < now()
     where event_id = new.id and source_rule_id is not null and status in ('OPEN', 'IN_PROGRESS', 'WAITING') and due_at is not null;
  end if;
  perform public.generate_show_workflow(new.id);
  return new;
end $function$;
drop trigger if exists events_generate_workflow on public.events;
create trigger events_generate_workflow after insert or update of event_date, show_status, show_type, business_unit, venue_id on public.events
  for each row when (new.event_date is not null) execute function public.events_generate_workflow();
