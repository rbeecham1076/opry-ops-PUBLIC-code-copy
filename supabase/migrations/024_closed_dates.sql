-- Closed dates: weekends/days nothing gets booked (Thanksgiving, fall break, Christmas…). Shown greyed on the Shows calendar.
create table if not exists public.closed_dates (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  label text not null,
  venue_id uuid references public.venues(id) on delete cascade,  -- null = every venue
  note text,
  created_at timestamptz default now(),
  check (ends_on >= starts_on)
);
alter table public.closed_dates enable row level security;
drop policy if exists "ops admin full access" on public.closed_dates;
create policy "ops admin full access" on public.closed_dates for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));

-- [PUBLIC COPY] seed data for closed_dates removed

