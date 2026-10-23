-- Omni Operating System v4 (October 2026).
-- North Star (Vision, Mission, Values), Flight Plan cascade with ~3 priorities,
-- Crew as agreed organisational actions only (no individual assessments),
-- Mission Control outputs (Monday KPI scorecard, flash, Board check-in & pack),
-- listening, first-100-days onboarding, governance tracker and company branding.

-- ---------------------------------------------------------------------------
-- Roles: the portfolio company CEO administers the company workspace
-- ---------------------------------------------------------------------------
create or replace function app.can_write(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin()
      or exists (select 1 from public.company_memberships m
                 where m.company_id = cid and m.user_id = auth.uid()
                   and m.role in ('omni', 'ceo', 'company_admin', 'executive'));
$$;

create or replace function app.can_admin(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin()
      or exists (select 1 from public.company_memberships m
                 where m.company_id = cid and m.user_id = auth.uid()
                   and m.role in ('omni', 'ceo', 'company_admin'));
$$;

-- Company leadership + assigned Omni staff (excludes observers): Monday scorecard audience
create or replace function app.is_leadership_or_omni(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin()
      or exists (select 1 from public.company_memberships m
                 where m.company_id = cid and m.user_id = auth.uid()
                   and m.role in ('omni', 'ceo', 'company_admin', 'executive'));
$$;

-- The CEO (or a company administrator acting for them) approves the Monday scorecard
create or replace function app.can_approve_scorecard(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_memberships m
                 where m.company_id = cid and m.user_id = auth.uid()
                   and m.role in ('ceo', 'company_admin'));
$$;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- North Star: Vision, Mission, Values, then the commercially measurable destination
-- ---------------------------------------------------------------------------
alter table public.north_stars rename column purpose to mission;
alter table public.north_stars rename column three_year_destination to target_end_state;
alter table public.north_stars rename column five_year_ambition to financial_ambition;
alter table public.north_stars drop column investment_thesis; -- Omni's thesis lives in investment_cases (Omni-only)
alter table public.north_stars
  add column values jsonb not null default '[]'::jsonb,            -- [{name, description}]
  add column strategic_positioning text not null default '',
  add column market_opportunity text not null default '',
  add column strategic_value text not null default '',             -- what would make it strategically distinctive / valuable
  add column potential_buyers jsonb not null default '[]'::jsonb;  -- string[]

-- ---------------------------------------------------------------------------
-- Flight Plan: 90-day priorities with success criteria, milestones and outcomes
-- ---------------------------------------------------------------------------
alter table public.quarterly_priorities
  add column success_criteria text,
  add column outcome public.priority_outcome,
  add column outcome_note text;

update public.quarterly_priorities p
   set outcome = case p.status when 'done' then 'achieved'::public.priority_outcome when 'missed' then 'missed'::public.priority_outcome end
  from public.quarters q
 where q.id = p.quarter_id and q.status = 'closed' and p.status in ('done', 'missed');

create table public.priority_milestones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  priority_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, priority_id) references public.quarterly_priorities (company_id, id) on delete cascade
);
create index on public.priority_milestones (priority_id);

-- Focus on less: about three priorities a quarter. A hard ceiling is configurable per company.
update public.companies
   set settings = settings || jsonb_build_object(
     'max_three_year_outcomes', coalesce((settings->>'max_winning_moves')::int, 5),
     'priority_target', 3,
     'max_priorities', 5);

create or replace function app.enforce_priority_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lim int;
  cnt int;
begin
  select coalesce((c.settings->>'max_priorities')::int, 5) into lim from public.companies c where c.id = new.company_id;
  select count(*) into cnt from public.quarterly_priorities p
   where p.quarter_id = new.quarter_id and p.id <> new.id and coalesce(p.outcome::text, '') <> 'stopped';
  if cnt >= lim then
    raise exception 'This quarter already has % priorities. Focus on less — about three — or ask an administrator to raise the limit.', lim
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger priority_limit before insert or update of quarter_id on public.quarterly_priorities
  for each row execute function app.enforce_priority_limit();

create or replace function app.enforce_winning_move_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lim int;
  cnt int;
begin
  if new.archived then
    return new;
  end if;
  select coalesce((c.settings->>'max_three_year_outcomes')::int, (c.settings->>'max_winning_moves')::int, 5) into lim
    from public.companies c where c.id = new.company_id;
  select count(*) into cnt from public.winning_moves w
   where w.company_id = new.company_id and not w.archived and w.id <> new.id;
  if cnt >= lim then
    raise exception 'Three-year outcome limit reached (% maximum). Archive one or ask an administrator to change the limit.', lim
      using errcode = '23514';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Crew: agreed organisational actions only. Individual development records are
-- removed: Omni OS is a shared management system, not an assessment platform.
-- ---------------------------------------------------------------------------
alter table public.org_gaps rename to org_actions;
alter table public.org_actions drop constraint if exists org_gaps_company_id_crew_member_id_fkey;
alter table public.org_actions drop column crew_member_id;
alter table public.org_actions
  alter column type type public.org_action_type
  using (case type::text when 'development' then 'capability' else type::text end)::public.org_action_type;
drop type public.gap_type;
alter table public.org_actions
  add column quarterly_priority_id uuid,
  add column annual_goal_id uuid,
  add foreign key (company_id, quarterly_priority_id) references public.quarterly_priorities (company_id, id) on delete set null (quarterly_priority_id),
  add foreign key (company_id, annual_goal_id) references public.annual_goals (company_id, id) on delete set null (annual_goal_id);

-- ---------------------------------------------------------------------------
-- Mission Control: corrective actions linked to KPIs; the Monday scorecard set
-- ---------------------------------------------------------------------------
alter table public.metrics add column in_weekly_scorecard boolean not null default false;
alter table public.actions
  add column metric_id uuid,
  add foreign key (company_id, metric_id) references public.metrics (company_id, id) on delete set null (metric_id);
create index on public.actions (company_id, metric_id) where metric_id is not null;

-- Approved Monday KPI scorecards (immutable snapshot of what Omni received)
create table public.weekly_scorecards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  week_start date not null,
  rows jsonb not null,
  recipients jsonb not null default '[]'::jsonb,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, week_start)
);

-- Outbound email (rendered from records). Delivered by the configured provider, if any.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('weekly_scorecard', 'company_update')),
  subject text not null,
  html text not null,
  recipients jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'not_configured')),
  error text,
  ref_id uuid,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Flash report, monthly Board check-in and quarterly Board pack: three distinct outputs
create table public.board_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.report_kind not null,
  period_start date not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  content jsonb not null default '{}'::jsonb,   -- management-written sections
  snapshot jsonb,                                -- data frozen at publication
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, kind, period_start)
);

-- ---------------------------------------------------------------------------
-- Employee and customer listening: headline results and agreed actions only
-- (no raw or identifiable responses)
-- ---------------------------------------------------------------------------
create table public.listening_rounds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.listening_kind not null,
  held_on date not null,
  method text,
  responses int check (responses >= 0),
  engagement numeric,
  enps numeric,
  leadership_confidence numeric,
  strategy_confidence numeric,
  clarity_accountability numeric,
  nps numeric,
  satisfaction numeric,
  retention numeric,
  churn numeric,
  themes jsonb not null default '[]'::jsonb,
  issues text,
  summary text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
alter table public.actions
  add column listening_round_id uuid,
  add foreign key (company_id, listening_round_id) references public.listening_rounds (company_id, id) on delete set null (listening_round_id);

-- ---------------------------------------------------------------------------
-- First 100 days
-- ---------------------------------------------------------------------------
create table public.onboarding_milestones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  step int not null check (step between 1 and 7),
  title text not null,
  description text,
  deliverable text,
  lead text,
  owner_id uuid,
  start_week int not null check (start_week between 0 and 16),
  end_week int not null check (end_week between 0 and 16),
  due_date date,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  completed_at timestamptz,
  link_path text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, owner_id) references public.crew_members (company_id, id) on delete set null (owner_id)
);

-- ---------------------------------------------------------------------------
-- Investor governance requirements (dates and owners; the investment agreement governs)
-- ---------------------------------------------------------------------------
create table public.governance_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  requirement text,
  owner_label text,
  cadence_label text,
  cadence_months int check (cadence_months between 1 and 24),
  next_due date,
  last_completed_on date,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

-- ---------------------------------------------------------------------------
-- Quarterly offsite (8 stages) and annual strategy reset
-- ---------------------------------------------------------------------------
alter table public.quarterly_resets
  add column is_annual boolean not null default false,
  add column north_star_confirmed boolean not null default false,
  add column stage_notes jsonb not null default '{}'::jsonb,
  add column strategic_questions jsonb not null default '[]'::jsonb,
  add column scorecard_review jsonb not null default '{}'::jsonb,   -- {metric_id: "keep" | "drop"}
  add column company_update text;

create or replace function public.approve_quarterly_reset(p_reset_id uuid, p_snapshot jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.quarterly_resets%rowtype;
  unclassified int;
begin
  select * into r from public.quarterly_resets where id = p_reset_id;
  if not found then
    raise exception 'Quarterly offsite not found' using errcode = 'P0001';
  end if;
  if not app.can_admin(r.company_id) then
    raise exception 'Only the CEO or a company administrator can approve the next 90 days' using errcode = '42501';
  end if;
  if r.status = 'approved' then
    raise exception 'This plan has already been approved' using errcode = 'P0001';
  end if;
  select count(*) into unclassified from public.quarterly_priorities where quarter_id = r.from_quarter_id and outcome is null;
  if unclassified > 0 then
    raise exception 'Classify every priority from the last 90 days (achieved, partly achieved, missed or stopped) before approving' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.quarterly_priorities where quarter_id = r.to_quarter_id) then
    raise exception 'Agree at least one priority for the next 90 days before approving' using errcode = 'P0001';
  end if;

  update public.quarters set status = 'closed' where id = r.from_quarter_id;
  update public.quarters set status = 'active', approved_at = now(), approved_by = auth.uid() where id = r.to_quarter_id;
  update public.quarterly_priorities set status = 'on_track' where quarter_id = r.to_quarter_id and status = 'not_started';
  -- Scorecard review: keep the measures that predict performance, drop the rest (history kept)
  update public.metrics m set archived = true
   where m.company_id = r.company_id and (r.scorecard_review ->> m.id::text) = 'drop';
  update public.quarterly_resets
     set status = 'approved', approved_at = now(), approved_by = auth.uid(), summary_snapshot = p_snapshot
   where id = p_reset_id;
end $$;
grant execute on function public.approve_quarterly_reset(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Company branding (stored per company; Omni defaults apply when absent)
-- ---------------------------------------------------------------------------
create table public.company_branding (
  company_id uuid primary key references public.companies (id) on delete cascade,
  primary_color text check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_data text check (logo_data is null or length(logo_data) <= 1500000), -- base64, ~1MB image
  logo_mime text check (logo_mime is null or logo_mime in ('image/png', 'image/jpeg', 'image/webp')),
  logo_width int,
  logo_height int,
  logo_updated_at timestamptz,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  check ((logo_data is null) = (logo_mime is null))
);

-- Audit: never copy logo bytes into the audit log
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
  if tg_op in ('INSERT', 'UPDATE') then n := to_jsonb(new) - 'logo_data'; end if;
  if tg_op in ('UPDATE', 'DELETE') then o := to_jsonb(old) - 'logo_data'; end if;
  if tg_op = 'INSERT' then
    cid := coalesce((n->>'company_id')::uuid, null);
    eid := nullif(n->>'id', '')::uuid;
    insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, changes)
    values (cid, auth.uid(), tg_table_name, eid, 'insert', n - 'created_at' - 'updated_at');
    return new;
  elsif tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at', 'created_at', 'version', 'last_change_summary') and (o->k) is distinct from (n->k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', o->k, 'to', n->k));
      end if;
    end loop;
    if (to_jsonb(old)->'logo_data') is distinct from (to_jsonb(new)->'logo_data') then
      diff := diff || jsonb_build_object('logo', jsonb_build_object('from', 'previous logo', 'to', 'new logo'));
    end if;
    if diff = '{}'::jsonb then
      return new;
    end if;
    cid := (n->>'company_id')::uuid;
    eid := nullif(n->>'id', '')::uuid;
    insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, changes)
    values (cid, auth.uid(), tg_table_name, eid, 'update', diff);
    return new;
  else
    cid := (o->>'company_id')::uuid;
    eid := nullif(o->>'id', '')::uuid;
    if not exists (select 1 from public.companies c where c.id = cid) then
      return old;
    end if;
    insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, changes)
    values (cid, auth.uid(), tg_table_name, eid, 'delete', o - 'created_at' - 'updated_at');
    return old;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers & RLS for new tables
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['priority_milestones','board_reports','listening_rounds','onboarding_milestones','governance_items','company_branding'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['priority_milestones','weekly_scorecards','email_outbox','board_reports','listening_rounds','onboarding_milestones','governance_items','company_branding'] loop
    execute format('create trigger company_id_immutable before update on public.%I for each row execute function app.company_id_immutable()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['priority_milestones','weekly_scorecards','board_reports','listening_rounds','onboarding_milestones','governance_items','company_branding'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
  end loop;
  -- standard tenant tables
  foreach t in array array['priority_milestones','board_reports','listening_rounds','onboarding_milestones','governance_items'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.has_company_access(company_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.can_write(company_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.can_write(company_id)) with check (app.can_write(company_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.can_write(company_id))', t || '_delete', t);
  end loop;
end $$;

-- Branding: everyone in the company sees it; only company admins / CEO / assigned Omni change it
create policy company_branding_select on public.company_branding for select to authenticated using (app.has_company_access(company_id));
create policy company_branding_insert on public.company_branding for insert to authenticated with check (app.can_admin(company_id));
create policy company_branding_update on public.company_branding for update to authenticated using (app.can_admin(company_id)) with check (app.can_admin(company_id));
create policy company_branding_delete on public.company_branding for delete to authenticated using (app.can_admin(company_id));

-- Monday scorecard: company leadership and assigned Omni recipients only; CEO approves
create policy weekly_scorecards_select on public.weekly_scorecards for select to authenticated using (app.is_leadership_or_omni(company_id));
create policy weekly_scorecards_insert on public.weekly_scorecards for insert to authenticated with check (app.can_approve_scorecard(company_id));
create policy weekly_scorecards_update on public.weekly_scorecards for update to authenticated using (app.can_approve_scorecard(company_id)) with check (app.can_approve_scorecard(company_id));

create policy email_outbox_select on public.email_outbox for select to authenticated using (app.is_leadership_or_omni(company_id));
create policy email_outbox_insert on public.email_outbox for insert to authenticated with check (app.can_admin(company_id) and created_by = auth.uid());

-- Board reports: deleting a published report is an admin operation
drop policy board_reports_delete on public.board_reports;
create policy board_reports_delete on public.board_reports for delete to authenticated using (app.can_admin(company_id) and status = 'draft');

revoke all on all tables in schema public from anon;
