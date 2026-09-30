-- Opry Ops 1.0: Jamie's proforma (show budget) per show — a PLAN/ESTIMATE, never a fact.
-- Mirrors the "Revenue/Expense Analysis" sheet Jamie builds for every show so the workspace can show
-- plan vs. actual (Etix gross, real costs, settlement) and a break-even from the plan.
create table if not exists public.proformas (
  event_id uuid primary key references public.events(id) on delete cascade,
  prepared_by text default 'Jamie',
  source_file text, source_url text, source_modified date,
  proforma_date date,                    -- performance date written on the proforma (can differ from the booked date)
  show_time text,
  capacity integer,
  sellout_pct numeric(5,2),              -- "considered sold out at 93/94%"
  projected_tickets integer,
  tiers jsonb default '[]'::jsonb,       -- [{tier, seats, price}]
  gross_potential numeric(12,2),
  gross_projected numeric(12,2),
  guarantees jsonb default '[]'::jsonb,  -- [{payee, amount}]
  bonus_total numeric(12,2),
  bonus_terms text,
  expenses jsonb default '[]'::jsonb,    -- local expenses [{item, amount}]
  fixed_expenses numeric(12,2),
  presenter_profit numeric(12,2),
  total_fixed_expenses numeric(12,2),
  variable_expenses numeric(12,2),
  total_expenses numeric(12,2),
  total_revenues numeric(12,2),
  net_revenue numeric(12,2),
  net_is_computed boolean default false, -- true when the sheet didn't print it and we computed revenues − expenses
  artist_walkout numeric(12,2),
  radius_terms text,
  other_terms text,
  flags text,                            -- inconsistencies found on import, for Jamie to confirm
  data_confidence text default 'ESTIMATE' check (data_confidence in ('VERIFIED', 'UNCERTAIN', 'ESTIMATE')),
  imported_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.proformas enable row level security;
drop policy if exists "ops admin full access" on public.proformas;
create policy "ops admin full access" on public.proformas for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proformas') then
    alter publication supabase_realtime add table public.proformas;
  end if;
end $$;
