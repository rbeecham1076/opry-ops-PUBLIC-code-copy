-- Church & Faith Partner Network, per-artist marketing rules, and the full per-item spec for campaign plans.

-- Each act's own rules (e.g. "approve on-sale dates", "approved copy only", "no meet & greet") carry into every plan for their shows.
alter table public.artists add column if not exists marketing_rules jsonb;

-- Campaign plan items: everything a post/email/ad needs to be produced and judged.
alter table public.marketing_plan_items
  add column if not exists rights text check (rights in ('OURS','ARTIST_ASSETS','REQUEST')) default 'OURS',
  add column if not exists paid boolean default false,
  add column if not exists spend text,
  add column if not exists meta_setup text,
  add column if not exists retargeting text,
  add column if not exists kpi text,
  add column if not exists link text,
  add column if not exists tags text,
  add column if not exists funnel text check (funnel in ('Discover','Consider','Convert','Remind','Partner','Setup')),
  add column if not exists owner text;

-- Church & Faith Partner Network: churches and ministries we can appropriately contact about Christian/Gospel shows.
create table if not exists public.church_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text, state text default 'KY', county text,
  drive_minutes int,
  denomination text,           -- Baptist (SBC), Baptist (other), Non-denominational, Methodist, Wesleyan, Nazarene, Assembly of God, Pentecostal/Full Gospel, Church of Christ, Christian Church, Catholic, Other
  association text,            -- e.g. Blood River Baptist Association
  approx_size text,            -- e.g. '<100', '100–300', '300–800', '800+', unknown
  music_fit text check (music_fit in ('CONTEMPORARY','SOUTHERN_GOSPEL','BOTH','TRADITIONAL','UNKNOWN')) default 'UNKNOWN',
  has_youth boolean, has_college boolean, has_womens boolean,
  website text, facebook text, instagram text,
  office_email text, office_phone text,
  pastor text, pastor_email text,
  worship_leader text, worship_email text,
  youth_leader text, youth_email text,
  comms_contact text, comms_email text,
  womens_contact text, womens_email text,
  preferred_contact text,      -- who/what works best
  status text default 'PROSPECT' check (status in ('PROSPECT','CONTACTED','FRIENDLY','PARTNER','DO_NOT_CONTACT')),
  source text,                 -- where we found them (e.g. Elevate FM supporter list, association directory)
  last_contact date, follow_up_on date,
  notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.partner_outreach (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.church_partners(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  contacted_on date default current_date,
  channel text,                -- email, phone, visit, Facebook message, mailed kit
  contact_person text,
  what_sent text,              -- e.g. 'Church media kit v1'
  response text check (response in ('NONE','REPLIED','WILL_SHARE','SHARED','DECLINED')) default 'NONE',
  shared_how text,             -- slide, bulletin, pulpit announcement, Facebook, email
  promo_code text,             -- per-church Etix code / QR for attribution
  tickets_attributed int,
  follow_up_on date,
  notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists partner_outreach_event on public.partner_outreach(event_id);
alter table public.church_partners enable row level security;
alter table public.partner_outreach enable row level security;
drop policy if exists "ops admin full access" on public.church_partners;
create policy "ops admin full access" on public.church_partners for all to authenticated using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
drop policy if exists "ops admin full access" on public.partner_outreach;
create policy "ops admin full access" on public.partner_outreach for all to authenticated using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
