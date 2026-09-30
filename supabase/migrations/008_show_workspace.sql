-- Opry Ops 1.0 — Phase 1: Show Workspace (docs/GAP_AUDIT.md §B, §E).
-- The show is the center: artist, venue, contracts, money, production, hospitality, assets, documents,
-- checklist and settlement all hang off events.id. Everything here is additive.

-- ---------- show record ----------
alter table public.events
  add column if not exists show_status text default 'BOOKED',
  add column if not exists announce_date date,
  add column if not exists on_sale_date date,
  add column if not exists ticket_url text,
  add column if not exists ticketable_capacity integer,   -- from Etix/host venue when known; else venue capacity
  add column if not exists show_type text,                 -- e.g. Classic Country, Gospel, Tribute, Comedy, Christmas
  add column if not exists notes text;
alter table public.events drop constraint if exists events_show_status_check;
alter table public.events add constraint events_show_status_check check (show_status in
  ('HOLD', 'BOOKED', 'CONTRACTED', 'ANNOUNCED', 'ON_SALE', 'ADVANCED', 'SHOW_DAY', 'SETTLED', 'CLOSED', 'CANCELLED'));

-- ---------- artists, venues, contacts ----------
alter table public.artists
  add column if not exists status text default 'ACTIVE',            -- ACTIVE / PROSPECT / DO_NOT_BOOK
  add column if not exists buckets text[] default '{}',              -- KY Opry candidate, Outside venue candidate, Tribute, ...
  add column if not exists agent_contact_id uuid,
  add column if not exists radius_notes text,
  add column if not exists last_contacted date,
  add column if not exists business_unit business_unit default 'SHARED';
create unique index if not exists artists_name_key on public.artists (lower(name));

create table if not exists public.artist_quotes (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  quoted_at date not null,
  amount numeric(12,2),
  terms text,
  source text,
  created_at timestamptz default now()
);

alter table public.venues
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists business_unit business_unit default 'SHARED',
  add column if not exists rental_cost numeric(12,2),
  add column if not exists ticketing_provider text,
  add column if not exists settlement_process text,
  add column if not exists insurance_requirements text,
  add column if not exists hospitality_notes text,
  add column if not exists production_notes text,
  add column if not exists hotel_notes text;
create unique index if not exists venues_name_key on public.venues (lower(name));

alter table public.contacts
  add column if not exists artist_id uuid references public.artists(id) on delete set null,
  add column if not exists venue_id uuid references public.venues(id) on delete set null,
  add column if not exists agency text,
  add column if not exists source text;
alter table public.artists drop constraint if exists artists_agent_contact_fk;
alter table public.artists add constraint artists_agent_contact_fk foreign key (agent_contact_id) references public.contacts(id) on delete set null;

alter table public.documents
  add column if not exists venue_id uuid references public.venues(id) on delete set null,
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists url text;

-- ---------- contracts, riders, venue agreements, insurance ----------
create table if not exists public.agreements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  artist_id uuid references public.artists(id) on delete set null,
  venue_id uuid references public.venues(id) on delete set null,
  kind text not null check (kind in ('OFFER', 'PROFORMA', 'ARTIST_CONTRACT', 'RIDER', 'VENUE_AGREEMENT', 'INSURANCE_COI')),
  status text not null default 'NOT_STARTED' check (status in ('NOT_STARTED', 'REQUESTED', 'RECEIVED', 'REVIEWED', 'SIGNED', 'SENT_BACK', 'FULLY_EXECUTED', 'NOT_NEEDED')),
  received_at date, signed_at date, sent_back_at date, fully_executed_at date,
  signed_by text,                       -- who signed for us (Clay signs contracts)
  radius_clause text, merch_fee text, payable_to text, force_majeure text, ticket_holds text,
  document_id uuid references public.documents(id) on delete set null,
  notes text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (event_id, kind)
);

-- ---------- money: every line is an estimate and/or an actual ----------
alter table public.financial_obligations
  add column if not exists category text,          -- Artist fee, Artist deposit, Venue rent, Venue deposit, Sound, Insurance, Hospitality, Hotel, Marketing, Other
  add column if not exists direction text default 'EXPENSE',
  add column if not exists estimated_amount numeric(12,2),
  add column if not exists actual_amount numeric(12,2),
  add column if not exists data_confidence text default 'VERIFIED',
  add column if not exists updated_at timestamptz default now();
alter table public.financial_obligations drop constraint if exists financial_obligations_direction_check;
alter table public.financial_obligations add constraint financial_obligations_direction_check check (direction in ('EXPENSE', 'INCOME'));

-- ---------- production / hospitality / artist / venue details as sourced facts ----------
create table if not exists public.show_facts (
  event_id uuid not null references public.events(id) on delete cascade,
  section text not null,               -- Artist, Production, Hospitality, Venue, Tickets
  field text not null,                 -- e.g. 'Tour manager', 'Load-in', 'Hotel rooms'
  value text,
  source text,                          -- where it came from (rider, email, phone call with …)
  updated_at timestamptz default now(),
  primary key (event_id, section, field)
);

-- ---------- marketing asset intake ----------
create table if not exists public.asset_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  asset_type text not null,            -- Show graphic, Vertical video, Clean photos, Logo, Bio, Songs/credits, MP3, Sizzle reel
  status text not null default 'MISSING' check (status in ('MISSING', 'REQUESTED', 'WAITING', 'RECEIVED', 'APPROVED', 'NOT_NEEDED')),
  requested_at date, received_at date, approved_at date,
  approved_by text,                    -- artist team / publicist
  url text, notes text,
  updated_at timestamptz default now(),
  unique (event_id, asset_type)
);

-- ---------- settlement / wrap-up ----------
create table if not exists public.settlements (
  event_id uuid primary key references public.events(id) on delete cascade,
  status text default 'OPEN' check (status in ('OPEN', 'REPORT_REQUESTED', 'SETTLED', 'RECONCILED')),
  final_tickets integer,
  final_gross numeric(12,2),           -- actual ticketing gross (Etix / host venue box office)
  total_expenses numeric(12,2),
  profit numeric(12,2),
  marketing_spend numeric(12,2),
  box_office_report_url text,
  check_to_partners text,
  lessons text,
  settled_at date,
  updated_at timestamptz default now()
);

-- ---------- tasks carry the full "what / why / done when / who" ----------
alter table public.tasks
  add column if not exists purpose text,
  add column if not exists done_when text,
  add column if not exists blocked_by text,
  add column if not exists handling text default 'RACHEL',
  add column if not exists approver text,
  add column if not exists section text,
  add column if not exists catch_up boolean default false;   -- generated for a date already passed: confirm, don't nag
alter table public.tasks drop constraint if exists tasks_handling_check;
alter table public.tasks add constraint tasks_handling_check check (handling in ('RACHEL', 'CLARIFY', 'APPROVAL', 'TEAM'));
create unique index if not exists tasks_event_rule_key on public.tasks (event_id, source_rule_id) where event_id is not null and source_rule_id is not null;

-- ---------- workflow templates (show-date relative), extending workflow_rules ----------
alter table public.workflow_rules
  add column if not exists kind text default 'RULE',          -- RULE (trigger text) | SHOW_STEP (generates a task per show)
  add column if not exists code text,
  add column if not exists offset_days integer,               -- relative to show date; negative = before
  add column if not exists section text,
  add column if not exists applies_to text default 'ALL',     -- KY_OPRY | CCP | ALL
  add column if not exists purpose text,
  add column if not exists done_when text,
  add column if not exists handling text default 'RACHEL',
  add column if not exists approver text,
  add column if not exists priority text default 'Medium',
  add column if not exists sort integer default 0;
create unique index if not exists workflow_rules_code_key on public.workflow_rules (code) where code is not null;

-- Standard KY Opry show workflow, from the Concert Checklist, Admin Checklist, Administrative Assistant
-- handbook and the brief's 90/60/45/30/14/10/7/48h/24h/T+1 milestones. Editable later (workflow_rules).
insert into public.workflow_rules (id, name, trigger_type, kind, code, offset_days, section, applies_to, purpose, done_when, handling, approver, priority, sort, active, source_document, task_template)
select 'step-' || lower(v.code), v.name, 'Show date', 'SHOW_STEP', v.code, v.off, v.section, v.applies, v.purpose, v.done, v.handling, v.approver, v.prio, v.sort, true, v.src, '{}'::jsonb
from (values
  -- Artist & contract
  ('A01','Proforma ready (includes venue ticket fees)',-90,'Artist & Contract','ALL','Jamie needs the numbers before the offer; missing ticket fees throw off the budget.','Proforma exists in the artist''s folder and includes ticket fees (Clay-only shows may not need one).','CLARIFY','Jamie','High',10,'Admin Checklist; handbook: Proformas'),
  ('A02','Offer sent to agent (date, time, fee, ticket prices, load-in/soundcheck, on-sale, venue contact, food buyout)',-90,'Artist & Contract','ALL','The offer sets every term the contract will repeat.','Offer sent with all terms; $X/person meal buyout offered.','RACHEL',null,'High',20,'Handbook: Contracts and Riders'),
  ('A03','Contract & rider received — read and highlight for Clay',-85,'Artist & Contract','ALL','Catches force majeure, holds, food, stagehands, hotel, security, transportation, backline and insurance terms before signing.','Printed, highlighted; holds marked to 10, food marked "request food buyout".','RACHEL',null,'High',30,'Handbook: Contracts and Riders'),
  ('A04','Check 100-mile radius clause',-85,'Artist & Contract','ALL','A radius conflict can block other shows.','Radius clause read and recorded on the contract card.','RACHEL',null,'High',40,'Admin Checklist; Concert Checklist'),
  ('A05','Offer and ticket prices on contract match proforma',-85,'Artist & Contract','ALL','Mismatched prices mean the budget is wrong.','Contract face matches the proforma, or differences flagged to Clay/Jamie.','RACHEL',null,'High',50,'Admin Checklist'),
  ('A06','Clay reviews and signs contract & rider',-80,'Artist & Contract','ALL','Nothing is binding until Clay signs.','Contract and rider signed by Clay.','APPROVAL','Clay','High',60,'Handbook; Admin Checklist'),
  ('A07','Scan & save signed contract and rider separately; email back to management',-78,'Artist & Contract','ALL','The artist team needs our signed copy; files must be findable.','Saved as ArtistMM-DD-YYsigned in contracts/riders; emailed to manager with venue info sheet + dressing room photos.','RACHEL',null,'Medium',70,'Handbook; Admin Checklist'),
  ('A08','Fully executed contract returned and filed',-60,'Artist & Contract','ALL','Only a fully executed contract protects the show.','Countersigned contract saved in the private contracts folder.','TEAM','Artist team','Medium',80,'Admin Checklist'),
  -- Money
  ('M01','Show budget entered (fee, sound, hospitality, hotel, marketing)',-90,'Money','ALL','Profit and break-even need the costs.','Money card has an estimate for every cost line.','RACHEL',null,'Medium',10,'Brief §5'),
  ('M02','Artist deposit — remind Barbie; record paid',-60,'Money','ALL','Late deposits can cost the date.','Deposit marked paid with date; copy of check in artist file.','APPROVAL','Barbie','High',20,'Workflow rule: Deposit approaching; Admin Checklist'),
  -- Tickets
  ('T01','Announce and on-sale dates set (ask Jamie/Clay if missing; some artists must approve)',-90,'Tickets','ALL','Marketing and Etix setup wait on these dates.','Announce + on-sale dates entered on the show; artist team informed.','CLARIFY','Jamie / Clay','High',10,'Handbook: Advancing; workflow rule'),
  ('T02','Add show to Etix: confirmation message, concert type, keywords; set holds and pre-sale codes',-75,'Tickets','KY_OPRY','Tickets can''t sell until the show is built correctly.','Show live in Etix with holds (marketing / promoter / artist) and pre-sale codes recorded.','RACHEL',null,'High',20,'Admin Checklist; Concert Checklist'),
  ('T03','On sale: send ticket link to artist management; check artist/venue sites; update Tockify & Bandsintown',-70,'Tickets','KY_OPRY','Fans and the artist''s site must point to the right link and date.','Link sent; date/time verified on all sites; calendars updated.','RACHEL',null,'High',30,'Handbook; workflow rule: Tickets go on sale'),
  ('T04','Set up automatic Etix ticket-count report to artist management',-70,'Tickets','KY_OPRY','Managements ask how sales are going.','Automatic report scheduled in Etix.','RACHEL',null,'Medium',40,'Admin Checklist'),
  -- Marketing
  ('K01','Request marketing assets: images, MP3s, sizzle reel, bio, logo, vertical video',-90,'Marketing','ALL','Nothing can be designed or launched without them.','Asset checklist shows every item requested.','RACHEL',null,'High',10,'Admin Checklist; brief §18'),
  ('K02','Send assets to Jeff French / Jeff Lawrence / Mark Edwards; check corrections',-80,'Marketing','ALL','In-house team builds the graphics, radio spots and slides.','Drafts received and checked.','TEAM','Design team','Medium',20,'Handbook: In House Marketing'),
  ('K03','Artist team approves marketing materials before they go to venues/on-sale',-75,'Marketing','ALL','Unapproved materials can''t be used.','Approval from artist team / publicist recorded on the asset checklist.','APPROVAL','Artist team','High',30,'Handbook; workflow rule: Marketing asset created'),
  ('K04','Launch plan + staged budget recommendation for Jamie',-75,'Marketing','ALL','Start early, spend in stages (20/15/25/20/20 reserve).','Recommendation written; Jamie''s decision recorded (recommended ≠ approved).','APPROVAL','Jamie','High',40,'Brief §8–9'),
  ('K05','Order lobby posters',-45,'Marketing','KY_OPRY','Lobby promotion to current audiences.','Posters ordered.','RACHEL',null,'Low',50,'Admin Checklist'),
  ('K06','Campaign checkpoint: what''s working? (45 days)',-45,'Marketing','ALL','Catch weak creative or audiences early.','Checkpoint notes: pace, spend, creative/audience results; SCALE / HOLD / CHANGE / STOP recommended.','RACHEL',null,'Medium',60,'Brief §6, §9'),
  ('K07','30-day review: ads running? (30-day rule)',-30,'Marketing','ALL','Jamie''s rule: ads start at least 30 days before the show.','Ads confirmed running, or reason recorded.','RACHEL',null,'High',70,'Working Master: 30-day rule'),
  ('K08','Main sales push (14 days)',-14,'Marketing','ALL','Most tickets sell in the last two weeks.','Main-sales content scheduled; budget stage decision recorded.','RACHEL',null,'High',80,'Brief §6'),
  ('K09','Add show video/slides to ProPresenter',-14,'Marketing','KY_OPRY','Promotes the show to audiences at other Opry shows.','Video in ProPresenter; old slides removed.','RACHEL',null,'Low',90,'Admin Checklist; handbook'),
  ('K10','Final campaign review (7 days)',-7,'Marketing','ALL','Last chance to adjust spend and message.','Final-week plan set; reserve use recommended (not automatic).','RACHEL',null,'High',100,'Brief §6, §9'),
  ('K11','48-hour remaining-inventory decision',-2,'Marketing','ALL','Unsold seats: push or protect margin.','Decision recorded by Jamie.','APPROVAL','Jamie','High',110,'Brief §6'),
  ('K12','Day-before / day-of post and final push',-1,'Marketing','ALL','Last-minute buyers.','Final post(s) scheduled.','RACHEL',null,'Medium',120,'Brief §6'),
  ('K13','Show-day content capture list (load-in, soundcheck, marquee, crowd, merch)',-3,'Marketing','ALL','Content for this and future shows.','Capture list shared with whoever is on site.','RACHEL',null,'Low',130,'Workflow rule: Every show'),
  -- Production / advancing
  ('P01','Pre-advance: find tour/production/hospitality managers in the rider',-30,'Production','ALL','Advancing with the right people prevents show-day surprises.','Tour manager and production contact recorded on the show.','RACHEL',null,'High',10,'Handbook: Advancing'),
  ('P02','Venue info sheet sent to tour manager (production contact, meals/buyout, dressing rooms, show time, other acts, merch space)',-21,'Production','ALL','The artist team needs the venue facts to plan.','Venue info sheet emailed.','RACHEL',null,'High',20,'Handbook: Advancing'),
  ('P03','Stage plot, sound tech and backline confirmed',-21,'Production','ALL','Missing backline or wrong plot stops soundcheck.','Stage plot on file; sound + backline confirmed.','RACHEL',null,'High',30,'Concert Checklist'),
  ('P04','Load-in and soundcheck times confirmed',-14,'Production','ALL','Crew and staff scheduling.','Times recorded on the show.','RACHEL',null,'Medium',40,'Concert Checklist'),
  ('P05','Opening act confirmed (if any)',-30,'Production','ALL','Set times and advancing for both acts.','Opening act and set length recorded, or "none".','RACHEL',null,'Low',50,'Concert Checklist'),
  ('P06','Stagehands, runners, security and merch sellers arranged',-14,'Production','ALL','Rider requirements must be staffed.','Staffing confirmed.','RACHEL',null,'Medium',60,'Admin Checklist'),
  ('P07','Ushers confirmed',-10,'Production','ALL','Front of house needs coverage.','Ushers confirmed 10 days out.','RACHEL',null,'Medium',70,'Concert Checklist'),
  -- Hospitality
  ('H01','Hotel rooms booked (rooms × nights) from the hotel reference sheet',-30,'Hospitality','ALL','Artists need confirmed rooms.','Rooms and nights recorded; confirmation saved.','RACHEL',null,'High',10,'Handbook: Hotels; Concert Checklist'),
  ('H02','Food: buyout agreed or catering/hospitality ordered; totals to Barbie',-10,'Hospitality','ALL','Rider food is a contract term.','Buyout confirmed, or catering + Walmart pickups ordered and totals given to Barbie.','RACHEL',null,'High',20,'Handbook: Food/Hospitality; Admin Checklist'),
  ('H03','Dressing rooms ready per rider',-1,'Hospitality','ALL','First impression for the artist.','Dressing rooms set.','TEAM','Show-day crew','Low',30,'Brief §5'),
  -- Wrap-up
  ('W01','Request box-office report and save it',1,'Wrap-up','ALL','Jamie uses it to determine sales.','Report saved to the show and Drive.','RACHEL',null,'High',10,'Handbook: After the show; workflow rule: Show completed'),
  ('W02','Settlement: final tickets, gross, expenses, profit; copy of settlement check filed',1,'Wrap-up','ALL','Profit is only known after settlement.','Settlement card complete.','TEAM','Barbie','High',20,'Handbook; Concert Checklist: Wrap-up'),
  ('W03','Reconcile final sales and marketing results; write lessons',3,'Wrap-up','ALL','Every show becomes a benchmark for the next one.','Etix vs Cymbal vs Meta reconciled; lessons written.','RACHEL',null,'Medium',30,'Brief §22; workflow rule'),
  ('W04','Archive show file (contract, rider, settlement) to Drive',7,'Wrap-up','ALL','Institutional memory.','Files in the completed folder.','RACHEL',null,'Low',40,'Handbook; Admin Checklist')
) as v(code, name, off, section, applies, purpose, done, handling, approver, prio, sort, src)
where not exists (select 1 from public.workflow_rules w where w.code = v.code);

-- ---------- generate a show's workflow ----------
-- Idempotent: one task per (show, step). Steps whose date has already passed when first generated are
-- created as catch-up items ("confirm this was done") so they don't flood Overdue.
create or replace function public.generate_show_workflow(p_event uuid) returns integer
language plpgsql set search_path = '' as $$
declare e record; n integer;
begin
  select id, event_date, business_unit into e from public.events where id = p_event;
  if e.id is null or e.event_date is null or e.business_unit = 'CCP' then return 0; end if;  -- KY Opry first (Rachel 2026-09-28)
  insert into public.tasks (title, business_unit, category, section, status, priority, due_at, event_id, source_rule_id,
                            purpose, done_when, handling, approver, catch_up, source_document)
  select w.name, e.business_unit, 'Show & Artist Operations', w.section, 'OPEN', w.priority,
         ((e.event_date + w.offset_days)::text || 'T17:00:00-05:00')::timestamptz, e.id, w.code,
         w.purpose, w.done_when, w.handling, w.approver,
         (e.event_date + w.offset_days) < (now() at time zone 'America/Chicago')::date, w.source_document
  from public.workflow_rules w
  where w.kind = 'SHOW_STEP' and w.active and w.applies_to in ('ALL', e.business_unit::text)
  on conflict (event_id, source_rule_id) where event_id is not null and source_rule_id is not null do nothing;
  get diagnostics n = row_count;
  -- Standard asset package for the show.
  insert into public.asset_requests (event_id, asset_type)
  select e.id, a from unnest(array['Show graphic','Vertical video','Clean photos','Logo','Bio','Songs / credits','MP3 (radio)','Sizzle reel']) a
  on conflict (event_id, asset_type) do nothing;
  insert into public.settlements (event_id) values (e.id) on conflict (event_id) do nothing;
  return n;
end $$;
revoke all on function public.generate_show_workflow(uuid) from public, anon;
grant execute on function public.generate_show_workflow(uuid) to authenticated;

-- New shows get their workflow automatically.
create or replace function public.events_generate_workflow() returns trigger language plpgsql set search_path = '' as $$
begin perform public.generate_show_workflow(new.id); return new; end $$;
drop trigger if exists events_generate_workflow on public.events;
create trigger events_generate_workflow after insert or update of event_date on public.events
  for each row when (new.event_date is not null) execute function public.events_generate_workflow();

-- ---------- security + realtime ----------
do $$ declare t text; begin
  foreach t in array array['artist_quotes','agreements','show_facts','asset_requests','settlements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "ops admin full access" on public.%I', t);
    execute format('create policy "ops admin full access" on public.%I for all to authenticated using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()))', t);
  end loop;
  foreach t in array array['agreements','show_facts','asset_requests','settlements','financial_obligations','documents','ticket_snapshots','artists','venues','contacts'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
