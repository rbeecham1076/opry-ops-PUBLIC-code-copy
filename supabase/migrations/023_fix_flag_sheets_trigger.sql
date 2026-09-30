-- Fix: "text[] || 'show time'" treats the bare literal as an array and fails ("malformed array literal"),
-- so changing a show's time, doors, or venue in Opry Ops errored. Use array_append for every label.
create or replace function public.events_flag_sheets()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare changes text[] := '{}';
begin
  if new.title is distinct from old.title then changes := array_append(changes, 'name → ' || new.title); end if;
  if new.event_date is distinct from old.event_date then changes := array_append(changes, 'date → ' || new.event_date); end if;
  if new.starts_at is distinct from old.starts_at then changes := array_append(changes, 'show time'); end if;
  if new.doors_at is distinct from old.doors_at then changes := array_append(changes, 'doors time'); end if;
  if new.venue_id is distinct from old.venue_id then changes := array_append(changes, 'venue'); end if;
  if new.show_status is distinct from old.show_status then changes := array_append(changes, 'status → ' || new.show_status); end if;
  if new.on_sale_date is distinct from old.on_sale_date then changes := array_append(changes, 'on-sale date → ' || coalesce(new.on_sale_date::text, 'none')); end if;
  if array_length(changes, 1) > 0 then
    perform public.flag_shared_sheet_update(new.id, 'All Venues Calendar' || case when new.venue_id is not distinct from old.venue_id and new.title is not distinct from old.title and new.event_date is not distinct from old.event_date then '' else ' + Advance Sheet' end, array_to_string(changes, ', '));
  end if;
  return new;
end $function$;
