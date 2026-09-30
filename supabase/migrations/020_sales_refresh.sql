-- 020 (2026-09-28): ticket-sales refresh from Cymbal.
-- The app can't reach Cymbal itself, so "Refresh now" files a request; a scheduled Claude routine (weekdays)
-- picks it up within the hour and also does a full refresh every weekday morning. Rach's office hours on her contact.
alter table public.contacts add column if not exists hours text;
update public.contacts set phone = '555-555-0100', hours = 'In the office Tue, Wed & Fri, 11 AM–3 PM Central' where name = 'the office admin';

create table if not exists public.refresh_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'TICKET_SALES',
  status text not null default 'PENDING' check (status in ('PENDING', 'DONE', 'FAILED')),
  requested_at timestamptz not null default now(),
  requested_by uuid default auth.uid(),
  done_at timestamptz,
  note text
);
alter table public.refresh_requests enable row level security;
drop policy if exists "ops admin full access" on public.refresh_requests;
create policy "ops admin full access" on public.refresh_requests for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'refresh_requests') then
    alter publication supabase_realtime add table public.refresh_requests;
  end if;
end $$;

-- [PUBLIC COPY] seed data for integration_sync_status removed

