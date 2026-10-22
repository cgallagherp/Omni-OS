-- Omni OS core schema
-- Every company-level table carries company_id. Tenant consistency between
-- related records is enforced with composite foreign keys (company_id, id),
-- so a record in one company can never reference a record in another.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.platform_role as enum ('platform_admin', 'omni_team');
create type public.company_role as enum ('omni', 'company_admin', 'executive', 'observer');
create type public.rag_status as enum ('on_track', 'at_risk', 'off_track', 'done', 'missed', 'not_started');
create type public.metric_frequency as enum ('weekly', 'monthly');
create type public.metric_direction as enum ('higher_is_better', 'lower_is_better', 'range');
create type public.metric_unit as enum ('currency', 'percent', 'number', 'days', 'ratio', 'score');
create type public.metric_category as enum ('financial', 'commercial', 'operational', 'customer', 'people');
create type public.quarter_status as enum ('planning', 'active', 'closed');
create type public.action_status as enum ('open', 'done', 'cancelled');
create type public.issue_status as enum ('open', 'in_discussion', 'resolved');
create type public.issue_priority as enum ('critical', 'high', 'medium', 'low');
create type public.meeting_type as enum ('weekly', 'monthly', 'quarterly', 'annual');
create type public.meeting_status as enum ('scheduled', 'in_progress', 'completed');
create type public.gap_type as enum ('hire', 'capability', 'development');
create type public.gap_status as enum ('open', 'in_progress', 'closed');

-- ---------------------------------------------------------------------------
-- Tenancy & identity
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,48}$'),
  name text not null,
  legal_name text,
  sector text,
  description text,
  headquarters text,
  brand_color text not null default '#3F3F46',
  currency text not null default 'GBP',
  fiscal_year_start_month int not null default 1 check (fiscal_year_start_month between 1 and 12),
  acquired_on date,
  is_demo boolean not null default false,
  settings jsonb not null default '{"max_winning_moves": 5}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  title text,
  avatar_color text,
  platform_role public.platform_role,
  created_at timestamptz not null default now()
);

create table public.company_memberships (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.company_role not null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index on public.company_memberships (user_id);

-- ---------------------------------------------------------------------------
-- Crew: people & accountability. Owners of every important outcome are crew
-- members (who may or may not have a login), so open seats can own nothing
-- and gaps are visible.
-- ---------------------------------------------------------------------------
create table public.crew_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  title text not null,
  email text,
  seat text,                      -- accountability seat, e.g. "Revenue"
  responsibilities text[] not null default '{}',
  reports_to uuid,
  is_leadership boolean not null default true,
  is_open_seat boolean not null default false,
  avatar_color text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, reports_to) references public.crew_members (company_id, id) on delete set null (reports_to)
);
create index on public.crew_members (company_id);
create unique index crew_members_company_user on public.crew_members (company_id, user_id) where user_id is not null;

create table public.org_gaps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type public.gap_type not null,
  title text not null,
  description text,
  priority public.issue_priority not null default 'medium',
  status public.gap_status not null default 'open',
  owner_id uuid not null,
  crew_member_id uuid,           -- the person being developed, for development items
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, owner_id) references public.crew_members (company_id, id),
  foreign key (company_id, crew_member_id) references public.crew_members (company_id, id) on delete set null (crew_member_id)
);

-- ---------------------------------------------------------------------------
-- North Star
-- ---------------------------------------------------------------------------
create table public.north_stars (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  purpose text not null default '',
  vision text not null default '',
  five_year_ambition text not null default '',
  three_year_destination text not null default '',
  investment_thesis text not null default '',
  exit_equity_story text not null default '',
  buyer_proposition text not null default '',
  target_year int,
  target_revenue numeric,
  target_ebitda numeric,
  target_ev numeric,
  baseline_revenue numeric,
  baseline_ebitda numeric,
  assumptions jsonb not null default '[]'::jsonb,  -- string[]
  version int not null default 1,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create table public.north_star_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  north_star_id uuid not null,
  version int not null,
  snapshot jsonb not null,
  change_summary text,
  changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (company_id, north_star_id) references public.north_stars (company_id, id) on delete cascade,
  unique (north_star_id, version)
);

create table public.success_conditions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text,
  status public.rag_status not null default 'on_track',
  owner_id uuid,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, owner_id) references public.crew_members (company_id, id) on delete set null (owner_id)
);

-- ---------------------------------------------------------------------------
-- Flight Plan: Winning Moves -> Annual Goals -> Quarterly Priorities -> Actions
-- ---------------------------------------------------------------------------
create table public.winning_moves (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text,
  measurable_outcome text,
  owner_id uuid not null,
  status public.rag_status not null default 'on_track',
  progress int not null default 0 check (progress between 0 and 100),
  start_date date,
  due_date date,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, owner_id) references public.crew_members (company_id, id)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  winning_move_id uuid,
  title text not null,
  description text,
  target_date date not null,
  status public.rag_status not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, winning_move_id) references public.winning_moves (company_id, id) on delete set null (winning_move_id)
);

create table public.annual_goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  winning_move_id uuid not null,
  fiscal_year int not null,
  title text not null,
  description text,
  measurable_outcome text,
  unit public.metric_unit,
  baseline_value numeric,
  target_value numeric,
  current_value numeric,
  owner_id uuid not null,
  status public.rag_status not null default 'on_track',
  progress int not null default 0 check (progress between 0 and 100),
  start_date date,
  due_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, winning_move_id) references public.winning_moves (company_id, id),
  foreign key (company_id, owner_id) references public.crew_members (company_id, id)
);
create index on public.annual_goals (company_id, fiscal_year);

create table public.quarters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  year int not null,
  quarter int not null check (quarter between 1 and 4),
  start_date date not null,
  end_date date not null,
  status public.quarter_status not null default 'planning',
  theme text,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, year, quarter)
);
-- at most one active quarter per company
create unique index quarters_one_active on public.quarters (company_id) where status = 'active';

create table public.quarterly_priorities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  quarter_id uuid not null,
  annual_goal_id uuid not null,
  title text not null,
  description text,
  measurable_outcome text,
  owner_id uuid not null,
  status public.rag_status not null default 'on_track',
  progress int not null default 0 check (progress between 0 and 100),
  start_date date,
  due_date date,
  carried_from_id uuid,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, quarter_id) references public.quarters (company_id, id) on delete cascade,
  foreign key (company_id, annual_goal_id) references public.annual_goals (company_id, id),
  foreign key (company_id, owner_id) references public.crew_members (company_id, id),
  foreign key (company_id, carried_from_id) references public.quarterly_priorities (company_id, id) on delete set null (carried_from_id)
);
create index on public.quarterly_priorities (company_id, quarter_id);

-- Generic dependency edges between Flight Plan items
create table public.dependencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  from_type text not null check (from_type in ('winning_move','annual_goal','quarterly_priority','action')),
  from_id uuid not null,
  to_type text not null check (to_type in ('winning_move','annual_goal','quarterly_priority','action')),
  to_id uuid not null,
  note text,
  created_at timestamptz not null default now(),
  unique (from_type, from_id, to_type, to_id)
);

-- ---------------------------------------------------------------------------
-- Scoreboard
-- ---------------------------------------------------------------------------
create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text,
  category public.metric_category not null,
  unit public.metric_unit not null default 'number',
  decimals int not null default 0 check (decimals between 0 and 4),
  frequency public.metric_frequency not null default 'monthly',
  direction public.metric_direction not null default 'higher_is_better',
  target_value numeric,
  target_min numeric,
  target_max numeric,
  tolerance_pct numeric not null default 10 check (tolerance_pct >= 0),
  -- 'flow' metrics sum over a period (revenue); 'stock' metrics take the latest value (headcount)
  aggregation text not null default 'stock' check (aggregation in ('flow','stock')),
  owner_id uuid not null,
  comparable_key text,             -- optional cross-portfolio key, e.g. 'revenue', 'ebitda', 'nrr'
  is_key boolean not null default false,   -- shown on the Blueprint scoreboard
  sort_order int not null default 0,
  archived boolean not null default false,
  source text not null default 'manual' check (source in ('manual','csv','integration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, owner_id) references public.crew_members (company_id, id),
  check (direction <> 'range' or (target_min is not null and target_max is not null and target_min <= target_max))
);
create index on public.metrics (company_id);

create table public.metric_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  metric_id uuid not null,
  period_start date not null,
  value numeric,
  target numeric,                  -- per-period target (e.g. phased budget); falls back to metric target
  note text,
  source text not null default 'manual' check (source in ('manual','csv','integration','seed')),
  entered_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (metric_id, period_start),
  foreign key (company_id, metric_id) references public.metrics (company_id, id) on delete cascade
);
create index on public.metric_values (company_id, metric_id, period_start desc);

-- Links between metrics and strategic objectives
create table public.metric_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  metric_id uuid not null,
  winning_move_id uuid,
  annual_goal_id uuid,
  quarterly_priority_id uuid,
  created_at timestamptz not null default now(),
  foreign key (company_id, metric_id) references public.metrics (company_id, id) on delete cascade,
  foreign key (company_id, winning_move_id) references public.winning_moves (company_id, id) on delete cascade,
  foreign key (company_id, annual_goal_id) references public.annual_goals (company_id, id) on delete cascade,
  foreign key (company_id, quarterly_priority_id) references public.quarterly_priorities (company_id, id) on delete cascade,
  check (num_nonnulls(winning_move_id, annual_goal_id, quarterly_priority_id) = 1)
);
create index on public.metric_links (company_id, metric_id);

-- ---------------------------------------------------------------------------
-- Rhythm: meetings, issues, decisions, actions
-- ---------------------------------------------------------------------------
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type public.meeting_type not null,
  title text not null,
  scheduled_at timestamptz not null,
  started_at timestamptz,
  ended_at timestamptz,
  status public.meeting_status not null default 'scheduled',
  facilitator_id uuid,
  summary text,
  notes text,
  rating int check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, facilitator_id) references public.crew_members (company_id, id) on delete set null (facilitator_id)
);
create index on public.meetings (company_id, scheduled_at desc);

create table public.meeting_attendees (
  meeting_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  crew_member_id uuid not null,
  present boolean not null default true,
  primary key (meeting_id, crew_member_id),
  foreign key (company_id, meeting_id) references public.meetings (company_id, id) on delete cascade,
  foreign key (company_id, crew_member_id) references public.crew_members (company_id, id) on delete cascade
);

-- Agenda items are snapshotted when a meeting starts so history is permanent.
create table public.meeting_agenda_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  meeting_id uuid not null,
  section text not null check (section in ('kpi_exceptions','priorities','previous_actions','issues','discussion','new_actions')),
  entity_type text check (entity_type in ('metric','quarterly_priority','action','issue')),
  entity_id uuid,
  title text not null,
  snapshot jsonb not null default '{}'::jsonb,
  carried_over boolean not null default false,
  reviewed boolean not null default false,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, meeting_id) references public.meetings (company_id, id) on delete cascade
);
create index on public.meeting_agenda_items (meeting_id);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text,
  priority public.issue_priority not null default 'medium',
  status public.issue_status not null default 'open',
  owner_id uuid not null,
  raised_by_id uuid,
  metric_id uuid,
  quarterly_priority_id uuid,
  annual_goal_id uuid,
  raised_in_meeting_id uuid,
  resolved_in_meeting_id uuid,
  escalated_to_omni boolean not null default false,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, owner_id) references public.crew_members (company_id, id),
  foreign key (company_id, raised_by_id) references public.crew_members (company_id, id) on delete set null (raised_by_id),
  foreign key (company_id, metric_id) references public.metrics (company_id, id) on delete set null (metric_id),
  foreign key (company_id, quarterly_priority_id) references public.quarterly_priorities (company_id, id) on delete set null (quarterly_priority_id),
  foreign key (company_id, annual_goal_id) references public.annual_goals (company_id, id) on delete set null (annual_goal_id),
  foreign key (company_id, raised_in_meeting_id) references public.meetings (company_id, id) on delete set null (raised_in_meeting_id),
  foreign key (company_id, resolved_in_meeting_id) references public.meetings (company_id, id) on delete set null (resolved_in_meeting_id)
);
create index on public.issues (company_id, status);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  rationale text,
  decided_on date not null default current_date,
  owner_id uuid not null,
  issue_id uuid,
  meeting_id uuid,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, owner_id) references public.crew_members (company_id, id),
  foreign key (company_id, issue_id) references public.issues (company_id, id) on delete set null (issue_id),
  foreign key (company_id, meeting_id) references public.meetings (company_id, id) on delete set null (meeting_id)
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text,
  owner_id uuid not null,
  due_date date,
  status public.action_status not null default 'open',
  quarterly_priority_id uuid,
  issue_id uuid,
  decision_id uuid,
  meeting_id uuid,                -- meeting in which the action was created
  completed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, owner_id) references public.crew_members (company_id, id),
  foreign key (company_id, quarterly_priority_id) references public.quarterly_priorities (company_id, id) on delete set null (quarterly_priority_id),
  foreign key (company_id, issue_id) references public.issues (company_id, id) on delete set null (issue_id),
  foreign key (company_id, decision_id) references public.decisions (company_id, id) on delete set null (decision_id),
  foreign key (company_id, meeting_id) references public.meetings (company_id, id) on delete set null (meeting_id)
);
create index on public.actions (company_id, status, due_date);

-- ---------------------------------------------------------------------------
-- Quarterly reset
-- ---------------------------------------------------------------------------
create table public.quarterly_resets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  from_quarter_id uuid not null,
  to_quarter_id uuid not null,
  status text not null default 'draft' check (status in ('draft','approved')),
  wins text,
  misses text,
  lessons text,
  constraints_notes text,
  summary_snapshot jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, from_quarter_id),
  foreign key (company_id, from_quarter_id) references public.quarters (company_id, id),
  foreign key (company_id, to_quarter_id) references public.quarters (company_id, id)
);

-- ---------------------------------------------------------------------------
-- Comments / updates (polymorphic, company scoped)
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  entity_type text not null check (entity_type in ('winning_move','annual_goal','quarterly_priority','action','issue','decision','metric','meeting','north_star')),
  entity_id uuid not null,
  kind text not null default 'comment' check (kind in ('comment','update')),
  body text not null check (length(body) between 1 and 5000),
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.comments (company_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Omni-only confidential records (never visible to company users)
-- ---------------------------------------------------------------------------
create table public.investment_cases (
  company_id uuid primary key references public.companies (id) on delete cascade,
  entry_date date,
  entry_ev numeric,
  entry_multiple numeric,
  target_exit_date date,
  target_exit_ev numeric,
  target_moic numeric,
  target_irr numeric,
  internal_thesis text,
  key_risks text,
  updated_at timestamptz not null default now()
);

create table public.omni_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  intervention_level text not null default 'monitor' check (intervention_level in ('none','monitor','support','intervene')),
  created_at timestamptz not null default now()
);
create index on public.omni_notes (company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit log (written only by triggers)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies (id) on delete cascade,
  actor_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null check (action in ('insert','update','delete')),
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (company_id, entity_type, entity_id, created_at desc);
