-- Opry Ops 1.0 expansion: linked operations model
-- Additive migration. Does not delete or silently reconcile source data.

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text,
  role text,
  email text,
  phone text,
  business_unit business_unit default 'SHARED',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists event_contacts (
  event_id uuid references events(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  contact_role text,
  primary key (event_id, contact_id, contact_role)
);

create table if not exists workflow_rules (
  id text primary key,
  name text not null,
  trigger_type text not null,
  trigger_config jsonb default '{}'::jsonb,
  business_unit business_unit default 'SHARED',
  task_template jsonb not null,
  active boolean default true,
  source_document text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists task_dependencies (
  task_id uuid references tasks(id) on delete cascade,
  depends_on_task_id uuid references tasks(id) on delete cascade,
  primary key (task_id, depends_on_task_id)
);

create table if not exists ticket_builds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  system text default 'Etix',
  status text default 'NOT_STARTED',
  prior_appearance_notes text,
  artist_cost numeric(12,2),
  other_show_costs numeric(12,2),
  comps_holds integer,
  projected_gross jsonb default '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  qa_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  ticket_build_id uuid references ticket_builds(id) on delete cascade,
  name text not null,
  price numeric(10,2),
  seat_count integer,
  fee numeric(10,2),
  notes text,
  created_at timestamptz default now()
);

create table if not exists financial_obligations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  business_unit business_unit default 'SHARED',
  obligation_type text not null,
  payee text,
  amount numeric(12,2),
  due_at timestamptz,
  status text default 'OPEN',
  paid_at timestamptz,
  evidence_document_id uuid references documents(id),
  notes text,
  created_at timestamptz default now()
);

create table if not exists decision_followups (
  id uuid primary key default gen_random_uuid(),
  change_log_id uuid references change_log(id) on delete cascade,
  review_at timestamptz not null,
  metric_plan jsonb default '{}'::jsonb,
  status text default 'OPEN',
  result text,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists brand_profiles (
  id uuid primary key default gen_random_uuid(),
  business_unit business_unit unique not null,
  position text,
  internal_brand_idea text,
  visual_principle text,
  identity_truth text,
  voice text,
  audiences jsonb default '[]'::jsonb,
  content_pillars jsonb default '[]'::jsonb,
  rules jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists brand_assets (
  id uuid primary key default gen_random_uuid(),
  business_unit business_unit default 'KY_OPRY',
  title text not null,
  asset_type text,
  storage_path text,
  source text,
  era text,
  file_quality text,
  current_use text,
  audit_status text default 'REVIEW',
  notes text,
  created_at timestamptz default now()
);

create table if not exists content_performance (
  id uuid primary key default gen_random_uuid(),
  content_idea_id uuid references content_ideas(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  business_unit business_unit default 'SHARED',
  platform text,
  published_at timestamptz,
  metrics jsonb default '{}'::jsonb,
  attributed_sales jsonb default '{}'::jsonb,
  lesson text,
  created_at timestamptz default now()
);

create table if not exists website_retail_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('CONCESSION','MERCH')),
  name text not null,
  description text,
  price numeric(10,2),
  variants jsonb default '[]'::jsonb,
  inventory_note text,
  image_document_id uuid references documents(id),
  verified boolean default false,
  published boolean default false,
  updated_at timestamptz default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  business_unit business_unit default 'SHARED',
  category text,
  status text default 'IDEA',
  goal text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists source_records (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  source_system text not null,
  source_id text,
  canonical boolean default false,
  observed_at timestamptz default now(),
  payload jsonb default '{}'::jsonb,
  stale boolean default false,
  error text
);

create table if not exists email_extracted_facts (
  id uuid primary key default gen_random_uuid(),
  communication_id uuid references communications(id) on delete cascade,
  fact_type text not null,
  proposed_value jsonb not null,
  confidence numeric(5,4),
  status text default 'CONFIRM',
  applied_entity_type text,
  applied_entity_id uuid,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

-- Private tables: authenticated access for Rachel-only v1.
do $$ declare t text; begin
  foreach t in array array[
    'contacts','event_contacts','workflow_rules','task_dependencies','ticket_builds',
    'ticket_tiers','financial_obligations','decision_followups','brand_profiles',
    'brand_assets','content_performance','website_retail_items','projects',
    'source_records','email_extracted_facts'
  ] loop
    execute format('alter table %I enable row level security', t);
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename=t and policyname='authenticated full access'
    ) then
      execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- Realtime publication for core live-work tables. Ignore duplicate publication membership.
do $$ begin
  begin alter publication supabase_realtime add table tasks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table events; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table ideas; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table meeting_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table content_ideas; exception when duplicate_object then null; end;
end $$;
