-- Opry Ops 1.0: Communications inbox (one row per Gmail thread).
-- Sync is run by Claude through the Gmail connector (scripts/comms-sync.mjs builds the SQL); the app never sends email.
alter table public.communications
  add column if not exists snippet text,
  add column if not exists message_count int,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_from_me boolean default false,
  add column if not exists view_url text,
  add column if not exists task_id uuid references public.tasks(id) on delete set null,
  add column if not exists state_set_by text default 'SYNC',
  add column if not exists last_synced_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- States from REQUIREMENTS: Needs my reply / Waiting on them / Resolved / FYI.
-- "No response >24h" is WAITING with last_message_at older than 24h, computed in the app so it never goes stale.
alter table public.communications drop constraint if exists communications_state_check;
alter table public.communications add constraint communications_state_check
  check (state is null or state in ('NEEDS_REPLY', 'WAITING', 'RESOLVED', 'FYI'));
alter table public.communications drop constraint if exists communications_state_set_by_check;
alter table public.communications add constraint communications_state_set_by_check
  check (state_set_by in ('SYNC', 'RACHEL'));

create unique index if not exists communications_account_thread_key
  on public.communications (account, external_thread_id);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communications') then
    alter publication supabase_realtime add table public.communications;
  end if;
end $$;
