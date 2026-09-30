-- Show marketing plans: one plan per show (built from the standard template), and its dated line items
-- (posts, stories, emails, texts, ads, outreach). A plan is a working checklist; nothing here publishes or spends.
create table if not exists public.marketing_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  template text not null default 'standard-v1',
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_REVIEW','APPROVED','RUNNING','DONE')),
  summary text,            -- the one-paragraph strategy
  pillars jsonb,           -- ordered message pillars [{name, job}]
  facts jsonb,             -- [{fact, source, verified}]
  links jsonb,             -- {tickets, info, ...}
  audiences jsonb,         -- [{name, where, use}]
  budget jsonb,            -- {running, recommended, options:[{name, total, note}], stages:[{from,to,daily,note}], approval}
  targets jsonb,           -- [{by, tickets, why}]
  asks jsonb,              -- [{who, what, status}]
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists public.marketing_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.marketing_plans(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  week int,                -- campaign week (1 = first week)
  week_theme text,
  run_on date,
  run_time text,           -- plain words, e.g. '6:30–7:30 PM'
  channel text not null,   -- Facebook + Instagram, Stories, Email (Cymbal), Text (Cymbal), Meta ads, Churches, Radio, In venue, Artist team
  format text,             -- Reel, Carousel, Graphic, Story, Email, SMS, Ad creative, Outreach, Kit
  job text,                -- what this item is for
  hook text,               -- the on-screen / first-line hook
  caption text,            -- ready-to-paste copy
  creative text,           -- shot list / design instructions / dimensions
  assets_needed text,
  audience text,
  cta text,
  budget_note text,
  needs_approval boolean default false,
  status text not null default 'PLANNED' check (status in ('PLANNED','DRAFTED','APPROVED','SCHEDULED','DONE','SKIPPED')),
  result text,
  sort int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists marketing_plan_items_event on public.marketing_plan_items(event_id, run_on);
alter table public.marketing_plans enable row level security;
alter table public.marketing_plan_items enable row level security;
drop policy if exists "ops admin full access" on public.marketing_plans;
create policy "ops admin full access" on public.marketing_plans for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
drop policy if exists "ops admin full access" on public.marketing_plan_items;
create policy "ops admin full access" on public.marketing_plan_items for all to authenticated
  using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
