-- Omni OS security: permission helpers, integrity triggers, audit and RLS.

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

alter table public.north_stars add column last_change_summary text;

-- ---------------------------------------------------------------------------
-- Permission helpers (security definer so they can read membership tables
-- without recursive RLS evaluation). They only ever answer questions about
-- the calling user (auth.uid()).
-- ---------------------------------------------------------------------------
create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role = 'platform_admin');
$$;

create or replace function app.is_omni_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role is not null);
$$;

create or replace function app.company_role(cid uuid) returns public.company_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.company_memberships m where m.company_id = cid and m.user_id = auth.uid();
$$;

create or replace function app.has_company_access(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin()
      or exists (select 1 from public.company_memberships m where m.company_id = cid and m.user_id = auth.uid());
$$;

create or replace function app.can_write(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin()
      or exists (select 1 from public.company_memberships m
                 where m.company_id = cid and m.user_id = auth.uid()
                   and m.role in ('omni', 'company_admin', 'executive'));
$$;

create or replace function app.can_admin(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin()
      or exists (select 1 from public.company_memberships m
                 where m.company_id = cid and m.user_id = auth.uid()
                   and m.role in ('omni', 'company_admin'));
$$;

create or replace function app.is_omni_for(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin()
      or (app.is_omni_staff() and exists (select 1 from public.company_memberships m
                 where m.company_id = cid and m.user_id = auth.uid() and m.role = 'omni'));
$$;

create or replace function app.shares_company_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_memberships a
    join public.company_memberships b on a.company_id = b.company_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;

grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app.company_id_immutable() returns trigger
language plpgsql as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

-- Audit trigger: records who changed what. Runs as definer so users cannot
-- write to audit_log directly.
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  diff jsonb := '{}'::jsonb;
  k text;
  o jsonb;
  n jsonb;
  cid uuid;
  eid uuid;
begin
  if tg_op = 'INSERT' then
    n := to_jsonb(new);
    cid := (n->>'company_id')::uuid;
    eid := nullif(n->>'id', '')::uuid;
    insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, changes)
    values (cid, auth.uid(), tg_table_name, eid, 'insert', n - 'created_at' - 'updated_at');
    return new;
  elsif tg_op = 'UPDATE' then
    o := to_jsonb(old);
    n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at', 'created_at', 'version', 'last_change_summary') and (o->k) is distinct from (n->k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', o->k, 'to', n->k));
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return new;
    end if;
    cid := (n->>'company_id')::uuid;
    eid := nullif(n->>'id', '')::uuid;
    insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, changes)
    values (cid, auth.uid(), tg_table_name, eid, 'update', diff);
    return new;
  else
    o := to_jsonb(old);
    cid := (o->>'company_id')::uuid;
    eid := nullif(o->>'id', '')::uuid;
    -- the company itself may be in the middle of being deleted
    if not exists (select 1 from public.companies c where c.id = cid) then
      return old;
    end if;
    insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, changes)
    values (cid, auth.uid(), tg_table_name, eid, 'delete', o - 'created_at' - 'updated_at');
    return old;
  end if;
end $$;

-- North Star versioning: every material change produces a permanent version.
create or replace function app.north_star_bump_version() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'version' - 'updated_by' - 'last_change_summary')
     is distinct from (to_jsonb(old) - 'updated_at' - 'version' - 'updated_by' - 'last_change_summary') then
    new.version := old.version + 1;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  else
    new.last_change_summary := old.last_change_summary;
  end if;
  return new;
end $$;

create or replace function app.north_star_record_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.version <> old.version then
    insert into public.north_star_versions (company_id, north_star_id, version, snapshot, change_summary, changed_by)
    values (new.company_id, new.id, new.version,
            to_jsonb(new) - 'id' - 'company_id' - 'created_at' - 'last_change_summary',
            coalesce(new.last_change_summary, case when tg_op = 'INSERT' then 'Initial North Star' end),
            coalesce(auth.uid(), new.updated_by));
  end if;
  return new;
end $$;

create trigger north_star_bump before update on public.north_stars
  for each row execute function app.north_star_bump_version();
create trigger north_star_version after insert or update on public.north_stars
  for each row execute function app.north_star_record_version();

-- Membership guard: only Omni staff can hold the 'omni' role, and only
-- platform admins can grant or revoke it.
create or replace function app.membership_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.company_role;
  target uuid;
begin
  r := case when tg_op = 'DELETE' then old.role else new.role end;
  target := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  if tg_op = 'UPDATE' and old.role = 'omni' then
    r := 'omni';
  end if;
  if r = 'omni' then
    if auth.uid() is not null and not app.is_platform_admin() then
      raise exception 'only platform administrators can manage Omni access' using errcode = '42501';
    end if;
    if tg_op <> 'DELETE' and not exists (select 1 from public.profiles p where p.id = target and p.platform_role is not null) then
      raise exception 'omni role requires an Omni staff profile' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger membership_guard before insert or update or delete on public.company_memberships
  for each row execute function app.membership_guard();

-- Profiles: users may not grant themselves platform roles.
create or replace function app.profile_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.platform_role is distinct from old.platform_role and auth.uid() is not null and not app.is_platform_admin() then
    raise exception 'cannot change platform role' using errcode = '42501';
  end if;
  if new.id <> old.id or (new.email <> old.email and auth.uid() is not null) then
    raise exception 'cannot change identity fields' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profile_guard before update on public.profiles
  for each row execute function app.profile_guard();

-- Create a profile for each new auth user
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Winning Move limit (configurable per company via settings.max_winning_moves)
create or replace function app.enforce_winning_move_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lim int;
  cnt int;
begin
  if new.archived then
    return new;
  end if;
  select coalesce((c.settings->>'max_winning_moves')::int, 5) into lim from public.companies c where c.id = new.company_id;
  select count(*) into cnt from public.winning_moves w
   where w.company_id = new.company_id and not w.archived and w.id <> new.id;
  if cnt >= lim then
    raise exception 'Winning Move limit reached (% maximum). Archive a Winning Move or ask an administrator to change the limit.', lim
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger winning_move_limit before insert or update of archived on public.winning_moves
  for each row execute function app.enforce_winning_move_limit();

-- Stamp completion times
create or replace function app.action_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger action_completed before insert or update on public.actions
  for each row execute function app.action_completed_at();

create or replace function app.issue_resolved_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status <> 'resolved') then
    new.resolved_at := coalesce(new.resolved_at, now());
  elsif new.status <> 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end $$;
create trigger issue_resolved before insert or update on public.issues
  for each row execute function app.issue_resolved_at();

-- Attach generic triggers to tenant tables
do $$
declare
  t text;
begin
  foreach t in array array[
    'crew_members','org_gaps','north_stars','success_conditions','winning_moves','milestones',
    'annual_goals','quarterly_priorities','metrics','metric_values','meetings','issues',
    'decisions','actions','quarterly_resets','companies'
  ] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;

  foreach t in array array[
    'crew_members','org_gaps','north_stars','north_star_versions','success_conditions','winning_moves','milestones',
    'annual_goals','quarters','quarterly_priorities','dependencies','metrics','metric_values','metric_links',
    'meetings','meeting_attendees','meeting_agenda_items','issues','decisions','actions','quarterly_resets',
    'comments','omni_notes','company_memberships','investment_cases'
  ] loop
    execute format('create trigger company_id_immutable before update on public.%I for each row execute function app.company_id_immutable()', t);
  end loop;

  foreach t in array array[
    'crew_members','org_gaps','north_stars','success_conditions','winning_moves','milestones',
    'annual_goals','quarters','quarterly_priorities','metrics','metric_values','metric_links','issues',
    'decisions','actions','quarterly_resets','company_memberships','meetings'
  ] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_memberships enable row level security;
alter table public.investment_cases enable row level security;
alter table public.omni_notes enable row level security;
alter table public.audit_log enable row level security;
alter table public.north_star_versions enable row level security;
alter table public.comments enable row level security;

-- Companies
create policy companies_select on public.companies for select to authenticated
  using (app.has_company_access(id));
create policy companies_insert on public.companies for insert to authenticated
  with check (app.is_platform_admin());
create policy companies_update on public.companies for update to authenticated
  using (app.can_admin(id)) with check (app.can_admin(id));
create policy companies_delete on public.companies for delete to authenticated
  using (app.is_platform_admin());

-- Profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or app.is_platform_admin() or app.shares_company_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or app.is_platform_admin())
  with check (id = auth.uid() or app.is_platform_admin());
revoke update on public.profiles from authenticated;
grant update (full_name, title, avatar_color) on public.profiles to authenticated;

-- Memberships
create policy memberships_select on public.company_memberships for select to authenticated
  using (user_id = auth.uid() or app.has_company_access(company_id));
create policy memberships_write on public.company_memberships for all to authenticated
  using (app.can_admin(company_id)) with check (app.can_admin(company_id));

-- Omni-only confidential tables
create policy investment_cases_omni on public.investment_cases for all to authenticated
  using (app.is_omni_for(company_id)) with check (app.is_omni_for(company_id));
create policy omni_notes_select on public.omni_notes for select to authenticated
  using (app.is_omni_for(company_id));
create policy omni_notes_insert on public.omni_notes for insert to authenticated
  with check (app.is_omni_for(company_id) and author_id = auth.uid());
create policy omni_notes_delete on public.omni_notes for delete to authenticated
  using (app.is_omni_for(company_id) and author_id = auth.uid());

-- Audit & version history: readable by anyone with access, written only by triggers
create policy audit_select on public.audit_log for select to authenticated
  using (company_id is not null and app.has_company_access(company_id));
create policy ns_versions_select on public.north_star_versions for select to authenticated
  using (app.has_company_access(company_id));
revoke insert, update, delete on public.audit_log, public.north_star_versions from authenticated, anon;

-- Comments
create policy comments_select on public.comments for select to authenticated
  using (app.has_company_access(company_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (app.can_write(company_id) and author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() and app.can_write(company_id));

-- Standard tenant tables: read with access, write with write permission
do $$
declare
  t text;
begin
  foreach t in array array[
    'crew_members','org_gaps','north_stars','success_conditions','winning_moves','milestones',
    'annual_goals','quarters','quarterly_priorities','dependencies','metrics','metric_values','metric_links',
    'meetings','meeting_attendees','meeting_agenda_items','issues','decisions','actions','quarterly_resets'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.has_company_access(company_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.can_write(company_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.can_write(company_id)) with check (app.can_write(company_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.can_write(company_id))', t || '_delete', t);
  end loop;
end $$;

-- Deleting people and approving plans are administrative operations
drop policy crew_members_delete on public.crew_members;
create policy crew_members_delete on public.crew_members for delete to authenticated using (app.can_admin(company_id));
drop policy quarters_delete on public.quarters;
create policy quarters_delete on public.quarters for delete to authenticated using (app.can_admin(company_id));

-- Anonymous users get nothing
revoke all on all tables in schema public from anon;
