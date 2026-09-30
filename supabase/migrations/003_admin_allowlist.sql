-- Opry Ops 1.0: restrict private data to an explicit admin allowlist.
-- 001/002 granted every authenticated user full access. Supabase allows public
-- sign-ups by default, so any stranger who signed up could read private ops data.
-- This migration replaces those policies with an allowlist check.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Emails allowed to become Opry Ops admins. Managed only via SQL / service role.
create table if not exists private.ops_admin_emails (
  email text primary key check (email = lower(email)),
  note text,
  created_at timestamptz default now()
);

-- Auth users who are Opry Ops admins. Managed only via SQL / service role / trigger.
create table if not exists private.ops_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create or replace function public.is_ops_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.ops_admins where user_id = auth.uid());
$$;
revoke all on function public.is_ops_admin() from public, anon;
grant execute on function public.is_ops_admin() to authenticated;

-- When an allowlisted email signs up / is created, grant admin and create a profile.
create or replace function private.grant_ops_admin_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.ops_admin_emails where email = lower(new.email)) then
    insert into private.ops_admins (user_id) values (new.id) on conflict do nothing;
    insert into public.profiles (id, display_name, role) values (new.id, split_part(new.email, '@', 1), 'admin')
      on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_grant_ops_admin on auth.users;
create trigger on_auth_user_created_grant_ops_admin
  after insert on auth.users
  for each row execute function private.grant_ops_admin_for_user();

-- When an email is allowlisted after the user already exists, grant admin too.
create or replace function private.grant_ops_admin_for_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare u record;
begin
  for u in select id, email from auth.users where lower(email) = new.email loop
    insert into private.ops_admins (user_id) values (u.id) on conflict do nothing;
    insert into public.profiles (id, display_name, role) values (u.id, split_part(u.email, '@', 1), 'admin')
      on conflict (id) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists on_ops_admin_email_added on private.ops_admin_emails;
create trigger on_ops_admin_email_added
  after insert on private.ops_admin_emails
  for each row execute function private.grant_ops_admin_for_email();

-- Swap "any authenticated user" policies for "allowlisted admin" policies.
do $$ declare t text; begin
  foreach t in array array[
    'profiles','artists','venues','events','tasks','notes','ideas','meeting_items','content_ideas',
    'documents','change_log','time_entries','communications','integration_sync_status',
    'data_quality_issues','requirements_registry',
    'contacts','event_contacts','workflow_rules','task_dependencies','ticket_builds',
    'ticket_tiers','financial_obligations','decision_followups','brand_profiles',
    'brand_assets','content_performance','website_retail_items','projects',
    'source_records','email_extracted_facts'
  ] loop
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    execute format('drop policy if exists "ops admin full access" on public.%I', t);
    execute format(
      'create policy "ops admin full access" on public.%I for all to authenticated using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()))',
      t);
  end loop;
end $$;

-- Audience suggestions: public may insert only; only admins may read/manage.
drop policy if exists "authenticated can manage suggestions" on public.audience_suggestions;
drop policy if exists "ops admin manage suggestions" on public.audience_suggestions;
create policy "ops admin manage suggestions" on public.audience_suggestions
  for all to authenticated using ((select public.is_ops_admin())) with check ((select public.is_ops_admin()));
