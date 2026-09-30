-- Every task links straight to the file it needs (contract, rider, proforma, advance sheet, hotel sheet) so Rach
-- never has to search. Links fill in automatically: when a show's steps are created and whenever a document is
-- linked to the show (the Drive watch adds them), so a new contract instantly shows up on its contract steps.
alter table public.tasks add column if not exists link_url text, add column if not exists link_label text;

create or replace function public.refresh_task_links(p_event uuid)
returns void language plpgsql set search_path to '' as $$
declare e record;
begin
  select ev.id, ev.business_unit, v.name venue into e from public.events ev left join public.venues v on v.id = ev.venue_id where ev.id = p_event;
  if e.id is null then return; end if;
  update public.tasks t set link_url = l.url, link_label = l.label
  from (
    select code, url, label from (values
      ('Contract', array['A03','A05','A06','A07','A08','A04'], 'Open the contract'),
      ('Rider', array['A09','H02','H03','H04','H05','P01','P03'], 'Open the rider'),
      ('Proforma', array['A01','M01','A02'], 'Open the proforma')
    ) as m(doc_type, codes, label)
    cross join lateral unnest(m.codes) code
    cross join lateral (select d.url from public.documents d where d.event_id = p_event and d.document_type = m.doc_type and d.url is not null
                        order by d.created_at desc limit 1) d
    union all
    select code, case when e.venue ilike '%State Theater%' then 'https://docs.google.com/spreadsheets/d/REDACTED/edit'
                      else 'https://docs.google.com/spreadsheets/d/REDACTED/edit' end, 'Open the advance sheet'
    from unnest(array['P02','P04','P06','C01']) code where e.business_unit = 'KY_OPRY' or e.venue ilike '%State Theater%'
    union all
    select 'H01', 'https://docs.google.com/spreadsheets/d/REDACTED/edit', 'Open the Hotel Rooms sheet'
  ) l
  where t.event_id = p_event and t.source_rule_id = l.code and t.link_url is distinct from l.url;
end $$;

create or replace function public.documents_refresh_links() returns trigger language plpgsql set search_path to '' as $$
begin
  if new.event_id is not null then perform public.refresh_task_links(new.event_id); end if;
  return new;
end $$;
drop trigger if exists documents_refresh_links on public.documents;
create trigger documents_refresh_links after insert or update of url, event_id, document_type on public.documents
  for each row execute function public.documents_refresh_links();

create or replace function public.tasks_after_workflow() returns trigger language plpgsql set search_path to '' as $$
begin perform public.refresh_task_links(new.id); return new; end $$;
drop trigger if exists zz_events_refresh_links on public.events;
create trigger zz_events_refresh_links after insert or update of show_status, event_date, venue_id on public.events
  for each row execute function public.tasks_after_workflow();

select public.refresh_task_links(id) from public.events where event_date >= current_date - 30;
