-- 016: switching a show to a house night / rental clears its open artist-only checklist steps
-- (done steps are kept as history). Switching back to an artist show regenerates them via generate_show_workflow.
create or replace function public.events_generate_workflow() returns trigger language plpgsql set search_path to '' as $function$
begin
  if public.show_kind(new.show_type) = 'HOUSE' then
    delete from public.tasks t using public.workflow_rules w
     where t.event_id = new.id and t.source_rule_id = w.code and w.kind = 'SHOW_STEP'
       and not ('HOUSE' = any (w.show_kinds)) and t.status <> 'COMPLETE';
  end if;
  perform public.generate_show_workflow(new.id);
  return new;
end $function$;
