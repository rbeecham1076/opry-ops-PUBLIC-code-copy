-- 017 (2026-09-28): plain venue language. "Inventory" means seats or tickets here — say so.
-- Merch/logo "inventory" gets its own everyday words. History tables (change_log, source_records) are left as written.

update public.workflow_rules set name = '48 hours out: how many seats are left? Push or hold'
 where code = 'K11';
update public.tasks set title = '48 hours out: how many seats are left? Push or hold'
 where source_rule_id = 'K11';

create or replace function pg_temp.say_seats(t text) returns text language sql as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(t,
    'If meaningful inventory remains', 'If plenty of seats are still open'),
    'Meaningful inventory remains one day before show', 'Plenty of seats still open the day before the show'),
    'meaningful inventory remains', 'plenty of seats are still open'),
    'why inventory matters more than a blanket timing rule', 'why seats left matter more than a blanket timing rule'),
    'demand, inventory and performance', 'demand, seats left and results'),
    'timing, inventory and demand', 'timing, seats left and demand'),
    'Inventory every current/historical logo', 'Collect every current and past logo'),
    'logo/source-file inventory is incomplete', 'logo/source-file collection is incomplete'),
    'concessions inventory/pricing', 'concessions menu and prices'),
    'who manages inventory', 'who keeps the merch table stocked'),
    'inventory approach', 'restocking plan'),
    'merch inventory', 'merch stock list')
$$;

update public.tasks set title = 'Count and photograph the Kentucky Opry merch table' where title = 'Inventory Kentucky Opry merch area';
update public.tasks set description = pg_temp.say_seats(description), next_action = pg_temp.say_seats(next_action)
 where description ilike '%inventor%' or next_action ilike '%inventor%';
update public.decisions set why = pg_temp.say_seats(why), decision = pg_temp.say_seats(decision)
 where why ilike '%inventor%' or decision ilike '%inventor%';
update public.data_quality_issues set title = pg_temp.say_seats(title) where title ilike '%inventor%';
update public.requirements_registry set requirement = pg_temp.say_seats(requirement) where requirement ilike '%inventor%';
update public.role_impact_entries set need = pg_temp.say_seats(need) where need ilike '%inventor%';
