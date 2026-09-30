-- Opry Ops 1.0 — Phase 3: marketing engine (brief §8–10, §20, §22).
-- Campaign numbers are Meta/Cymbal measurements. attributed_revenue is NEVER show revenue — actual revenue is the
-- Etix gross on events / ticket_snapshots / settlements.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  business_unit business_unit not null default 'KY_OPRY',
  platform text not null,                  -- Meta, Cymbal email, Cymbal SMS, Organic social, Radio, Other
  name text not null,
  ad_account text,                          -- which brand identity ran it (KY Opry vs CCP stay separate)
  external_id text,
  status text default 'PLANNED' check (status in ('PLANNED', 'ACTIVE', 'PAUSED', 'ENDED')),
  start_date date, end_date date,
  notes text, source text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.campaign_snapshots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  captured_at timestamptz not null default now(),
  spend numeric(12,2),
  impressions integer, reach integer, link_clicks integer,
  platform_purchases integer,              -- Meta-reported purchases (known dedupe concern)
  attributed_tickets integer,              -- Cymbal-attributed
  attributed_revenue numeric(12,2),        -- Cymbal/Meta attribution. Not show revenue.
  source text,
  data_confidence text default 'UNCERTAIN' check (data_confidence in ('VERIFIED', 'UNCERTAIN', 'ESTIMATE')),
  known_issue text,
  created_at timestamptz default now()
);

create table if not exists public.audiences (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  audience_type text,                      -- Standard Tag, Dynamic Tag, List, Segment
  meta_sync text,                          -- which Meta accounts it syncs to; null = Cymbal-only
  purpose text, notes text,
  source text, created_at timestamptz default now()
);
create table if not exists public.audience_counts (
  audience_id uuid not null references public.audiences(id) on delete cascade,
  captured_at timestamptz not null,
  count integer,
  source text,
  primary key (audience_id, captured_at)
);

do $$ declare t text; begin
  foreach t in array array['campaigns','campaign_snapshots','audiences','audience_counts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "ops admin full access" on public.%I', t);
    execute format('create policy "ops admin full access" on public.%I for all to authenticated using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()))', t);
  end loop;
  foreach t in array array['campaigns','campaign_snapshots'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Workbook campaign results → one campaign + one snapshot per show (deterministic ids from the provenance row).
-- [PUBLIC COPY] seed data for campaigns removed


-- [PUBLIC COPY] seed data for campaign_snapshots removed


-- Cymbal audience registry → audiences + a dated count.
-- [PUBLIC COPY] seed data for audiences removed

-- [PUBLIC COPY] seed data for audience_counts removed

