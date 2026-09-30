-- 021 (2026-09-28): rental fees hidden for now; one-tap catch-up; email urgency; Walmart phone checklist; rider reader queue.

-- ---------- Rental fees: keep the code, hide it (Rach is new — not her call yet) ----------
update public.workflow_rules set active = false where code in ('X01', 'X02');
delete from public.tasks where source_rule_id in ('X01', 'X02') and status <> 'COMPLETE';
update public.improvements set what_changed = 'House nights now track only concessions and ProPresenter.',
  measure = 'Checklist steps per house night.' where id = md5('imp:house-nights')::uuid;

-- ---------- One tap: everything due before Opry Ops started (Sept 28) was handled ----------
create or replace function public.confirm_catch_up(p_event uuid default null) returns integer
 language plpgsql security invoker set search_path to '' as $function$
declare n integer;
begin
  if not public.is_ops_admin() then raise exception 'not allowed'; end if;
  update public.tasks set status = 'COMPLETE', completed_at = now(), catch_up = false, updated_at = now(),
         completion_evidence = coalesce(completion_evidence, 'Confirmed handled before Opry Ops started (Sept 28, 2026)')
   where catch_up and status not in ('COMPLETE', 'ARCHIVED') and (p_event is null or event_id = p_event);
  get diagnostics n = row_count;
  insert into public.change_log (entity_type, entity_id, what_changed, after_value)
  values ('task', p_event, 'Catch-up steps confirmed handled', jsonb_build_object('count', n));
  return n;
end $function$;
grant execute on function public.confirm_catch_up(uuid) to authenticated;

-- ---------- Morning email sorting ----------
alter table public.communications add column if not exists urgency text check (urgency is null or urgency in ('URGENT', 'TODAY', 'THIS_WEEK', 'FYI'));
alter table public.communications add column if not exists urgency_reason text;
alter table public.communications add column if not exists is_unread boolean;
alter table public.communications add column if not exists is_important boolean;
alter table public.communications add column if not exists suggested_action text;

-- ---------- Walmart phone checklist (a private link for the day-of-show lead, no login) ----------
create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  items jsonb not null default '[]'::jsonb,     -- [{ "group": "GREEN ROOM", "item": "12 hand towels" }]
  checked jsonb not null default '{}'::jsonb,   -- { "<index>": "2026-10-01T15:04:00Z" }
  shopper text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists shopping_lists_event_uq on public.shopping_lists(event_id);
alter table public.shopping_lists enable row level security;
drop policy if exists "ops admin full access" on public.shopping_lists;
create policy "ops admin full access" on public.shopping_lists for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_lists') then
    alter publication supabase_realtime add table public.shopping_lists;
  end if;
end $$;

-- The link holder can read and tick only that one list — nothing else in the database.
create or replace function public.shopping_list_by_token(p_token text) returns jsonb
 language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('title', s.title, 'items', s.items, 'checked', s.checked, 'shopper', s.shopper,
         'event_date', e.event_date, 'show', e.title)
  from public.shopping_lists s join public.events e on e.id = s.event_id
  where s.token = p_token and length(p_token) = 32
$$;
create or replace function public.shopping_list_tick(p_token text, p_index integer, p_done boolean) returns jsonb
 language plpgsql security definer set search_path to '' as $function$
declare s public.shopping_lists;
begin
  select * into s from public.shopping_lists where token = p_token and length(p_token) = 32;
  if s.id is null or p_index < 0 or p_index >= jsonb_array_length(s.items) then return null; end if;
  update public.shopping_lists set updated_at = now(),
    checked = case when p_done then checked || jsonb_build_object(p_index::text, now()) else checked - p_index::text end
  where id = s.id returning checked into s.checked;
  return s.checked;
end $function$;
revoke all on function public.shopping_list_by_token(text) from public;
revoke all on function public.shopping_list_tick(text, integer, boolean) from public;
grant execute on function public.shopping_list_by_token(text) to anon, authenticated;
grant execute on function public.shopping_list_tick(text, integer, boolean) to anon, authenticated;

-- ---------- Rider reader + other Claude jobs share the refresh queue ----------
alter table public.refresh_requests drop constraint if exists refresh_requests_kind_check;
alter table public.refresh_requests add constraint refresh_requests_kind_check check (kind in ('TICKET_SALES', 'READ_RIDER'));
alter table public.refresh_requests add column if not exists event_id uuid references public.events(id) on delete cascade;
alter table public.refresh_requests add column if not exists url text;
