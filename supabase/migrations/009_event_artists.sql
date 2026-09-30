-- Opry Ops 1.0: a show can have more than one billed artist (co-headliners, openers). events.artist_id stays the headliner.
create table if not exists public.event_artists (
  event_id uuid not null references public.events(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  billing text default 'Headliner',       -- Headliner / Co-headliner / Opener
  primary key (event_id, artist_id)
);
alter table public.event_artists enable row level security;
drop policy if exists "ops admin full access" on public.event_artists;
create policy "ops admin full access" on public.event_artists for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
