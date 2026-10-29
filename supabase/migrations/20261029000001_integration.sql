-- M&A Integration: company knowledge → AI-generated master playbooks (versioned, approved by
-- management) → acquisition-specific plans → execution records the M&A Integration Agent
-- monitors, synergy tracking, post-integration reviews and playbook change proposals.
--
-- Drafts (playbooks, plans) are validated JSON documents edited by management. Approval is a
-- security-definer function: it freezes the playbook version, or materialises the plan into
-- the execution tables. Agents can only save drafts into rows a person asked them to generate.

-- ---------------------------------------------------------------------------
-- Agent identity: the M&A Integration Agent joins the existing registry
-- ---------------------------------------------------------------------------
alter table public.agent_configs drop constraint if exists agent_configs_agent_key_check;
alter table public.agent_configs add constraint agent_configs_agent_key_check check (agent_key in ('ceo', 'commercial', 'ma', 'execution', 'integration'));
alter table public.agent_investigations drop constraint if exists agent_investigations_agent_key_check;
alter table public.agent_investigations add constraint agent_investigations_agent_key_check check (agent_key in ('ceo', 'commercial', 'ma', 'execution', 'integration'));
alter table public.agent_approvals drop constraint if exists agent_approvals_action_type_check;
alter table public.agent_approvals add constraint agent_approvals_action_type_check check (action_type in (
  'send_followup', 'send_escalation', 'change_action_due_date', 'change_action_status', 'create_issue', 'create_corrective_action',
  'create_action', 'crm_create_tasks', 'add_ma_targets', 'send_external_message', 'change_integration_activity'));
alter table public.integration_connections drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections add constraint integration_connections_provider_check check (provider in (
  'omni_inbox', 'email_resend', 'microsoft_teams', 'microsoft_outlook', 'hubspot', 'salesforce', 'crm_sandbox', 'companies_house',
  'ma_sandbox', 'ma_internal_list', 'sharepoint', 'onedrive', 'google_drive'));

-- ---------------------------------------------------------------------------
-- Knowledge library: documents management selects for analysis
-- ---------------------------------------------------------------------------
create table public.acquisitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(name) between 2 and 200),
  ma_target_id uuid,
  status text not null default 'planning' check (status in ('planning', 'plan_in_review', 'ready', 'active', 'completed', 'on_hold', 'cancelled')),
  completion_date date,
  rationale text not null default '',
  objectives text not null default '',
  operating_model text not null default '',
  integration_model text not null default '',
  expected_synergies text not null default '',
  key_risks text not null default '',
  diligence_findings text not null default '',
  commitments text not null default '',
  systems_info text not null default '',
  org_info text not null default '',
  sponsor_crew_id uuid,
  leader_crew_id uuid,
  playbook_id uuid,
  recommended_playbook_id uuid,
  recommendation jsonb,
  agent_paused boolean not null default false,
  handover jsonb,
  handover_approved_by uuid references public.profiles (id),
  annual_goal_id uuid,
  quarterly_priority_id uuid,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, ma_target_id) references public.ma_targets (company_id, id) on delete set null (ma_target_id),
  foreign key (company_id, sponsor_crew_id) references public.crew_members (company_id, id) on delete set null (sponsor_crew_id),
  foreign key (company_id, leader_crew_id) references public.crew_members (company_id, id) on delete set null (leader_crew_id),
  foreign key (company_id, annual_goal_id) references public.annual_goals (company_id, id) on delete set null (annual_goal_id),
  foreign key (company_id, quarterly_priority_id) references public.quarterly_priorities (company_id, id) on delete set null (quarterly_priority_id)
);
create unique index acquisitions_one_per_target on public.acquisitions (company_id, ma_target_id) where ma_target_id is not null and status <> 'cancelled';

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  acquisition_id uuid,                -- null = company-wide integration knowledge
  title text not null check (length(title) between 1 and 300),
  filename text,
  mime text,
  doc_type text not null default 'other' check (doc_type in ('playbook', 'integration_plan', 'checklist', 'diligence', 'ic_paper', 'board_paper',
    'meeting_notes', 'sop', 'post_acquisition_review', 'lessons_learned', 'contract', 'strategy', 'other')),
  origin text not null default 'upload' check (origin in ('upload', 'sharepoint', 'onedrive', 'google_drive', 'seed')),
  connection_id uuid,
  external_ref text,
  size_bytes int,
  sha256 text,
  status text not null default 'ready' check (status in ('ready', 'failed', 'unsupported')),
  error text,
  text_content text,
  page_count int,
  char_count int,
  restricted boolean not null default false,  -- confidential transaction material: administrators only
  uploaded_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, acquisition_id) references public.acquisitions (company_id, id) on delete cascade,
  foreign key (company_id, connection_id) references public.integration_connections (company_id, id) on delete set null (connection_id)
);
create unique index knowledge_sources_dedupe on public.knowledge_sources (company_id, coalesce(acquisition_id, '00000000-0000-0000-0000-000000000000'::uuid), sha256) where sha256 is not null;

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  source_id uuid not null,
  ordinal int not null,
  heading text,
  text text not null,
  page int,
  char_start int not null default 0,
  char_end int not null default 0,
  tsv tsvector generated always as (to_tsvector('english', coalesce(heading, '') || ' ' || text)) stored,
  unique (company_id, id),
  unique (source_id, ordinal),
  foreign key (company_id, source_id) references public.knowledge_sources (company_id, id) on delete cascade
);
create index knowledge_chunks_tsv on public.knowledge_chunks using gin (tsv);
create index knowledge_chunks_source on public.knowledge_chunks (company_id, source_id);

-- ---------------------------------------------------------------------------
-- Master playbooks: versioned, approved templates (content = validated JSON)
-- ---------------------------------------------------------------------------
create table public.integration_playbooks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  lineage_id uuid not null,
  version int not null default 1,
  name text not null check (length(name) between 2 and 200),
  applies_when text not null default '',
  acquisition_types text[] not null default '{}',
  status text not null default 'draft' check (status in ('generating', 'draft', 'approved', 'superseded', 'archived', 'failed')),
  content jsonb not null default '{}'::jsonb,
  source_ids uuid[] not null default '{}',
  generator text not null default 'manual' check (generator in ('claude', 'rules', 'manual', 'revision')),
  model text,
  generation_note text,
  based_on_id uuid,
  change_summary text,
  created_by uuid references public.profiles (id) default auth.uid(),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  approval_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, lineage_id, version),
  foreign key (company_id, based_on_id) references public.integration_playbooks (company_id, id)
);
create unique index integration_playbooks_one_open_draft on public.integration_playbooks (company_id, lineage_id) where status in ('generating', 'draft');

alter table public.acquisitions
  add foreign key (company_id, playbook_id) references public.integration_playbooks (company_id, id),
  add foreign key (company_id, recommended_playbook_id) references public.integration_playbooks (company_id, id) on delete set null (recommended_playbook_id);

-- ---------------------------------------------------------------------------
-- Acquisition-specific plans: draft JSON, materialised into execution tables on approval
-- ---------------------------------------------------------------------------
create table public.integration_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  acquisition_id uuid not null,
  version int not null default 1,
  playbook_id uuid not null,
  status text not null default 'draft' check (status in ('generating', 'draft', 'approved', 'superseded', 'failed')),
  content jsonb not null default '{}'::jsonb,
  generator text not null default 'manual' check (generator in ('claude', 'rules', 'manual')),
  model text,
  generation_note text,
  created_by uuid references public.profiles (id) default auth.uid(),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  approval_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, acquisition_id, version),
  foreign key (company_id, acquisition_id) references public.acquisitions (company_id, id) on delete cascade,
  foreign key (company_id, playbook_id) references public.integration_playbooks (company_id, id)
);
create unique index integration_plans_one_open on public.integration_plans (company_id, acquisition_id) where status in ('generating', 'draft');

create table public.integration_workstreams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  acquisition_id uuid not null,
  plan_id uuid not null,
  key text not null,
  name text not null,
  objective text not null default '',
  accountable_function text not null default '',
  owner_crew_id uuid,
  origin text not null default 'playbook' check (origin in ('playbook', 'acquisition', 'recommended')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (plan_id, key),
  foreign key (company_id, acquisition_id) references public.acquisitions (company_id, id) on delete cascade,
  foreign key (company_id, plan_id) references public.integration_plans (company_id, id) on delete cascade,
  foreign key (company_id, owner_crew_id) references public.crew_members (company_id, id) on delete set null (owner_crew_id)
);

create table public.integration_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  acquisition_id uuid not null,
  plan_id uuid not null,
  workstream_id uuid not null,
  key text not null,
  title text not null check (length(title) between 2 and 300),
  description text not null default '',
  accountable_function text not null default '',
  owner_crew_id uuid,
  start_date date,
  due_date date,
  baseline_due_date date,             -- as approved; variance is measured against it
  milestone boolean not null default false,
  critical boolean not null default false,
  completion_criteria text not null default '',
  evidence_required text not null default '',
  approval_required text,             -- who must approve before / at completion
  approval_status text not null default 'not_required' check (approval_status in ('not_required', 'pending', 'approved')),
  approved_by uuid references public.profiles (id),
  human_only boolean not null default false,   -- consequential: people execute it, the agent never does
  human_only_reason text,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'done', 'not_needed')),
  blocked_reason text,
  completed_at timestamptz,
  criteria_met boolean,               -- null = not yet verified; done ≠ criteria met
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  evidence_note text,
  origin text not null default 'playbook' check (origin in ('playbook', 'acquisition', 'recommended')),
  deviation_note text,
  basis text,
  citations jsonb not null default '[]'::jsonb,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (plan_id, key),
  foreign key (company_id, acquisition_id) references public.acquisitions (company_id, id) on delete cascade,
  foreign key (company_id, plan_id) references public.integration_plans (company_id, id) on delete cascade,
  foreign key (company_id, workstream_id) references public.integration_workstreams (company_id, id) on delete cascade,
  foreign key (company_id, owner_crew_id) references public.crew_members (company_id, id) on delete set null (owner_crew_id)
);
create index integration_activities_due on public.integration_activities (company_id, acquisition_id, status, due_date);

create table public.integration_dependencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  acquisition_id uuid not null,
  from_activity_id uuid not null,   -- prerequisite
  to_activity_id uuid not null,     -- depends on the prerequisite
  note text,
  unique (company_id, id),
  unique (from_activity_id, to_activity_id),
  check (from_activity_id <> to_activity_id),
  foreign key (company_id, acquisition_id) references public.acquisitions (company_id, id) on delete cascade,
  foreign key (company_id, from_activity_id) references public.integration_activities (company_id, id) on delete cascade,
  foreign key (company_id, to_activity_id) references public.integration_activities (company_id, id) on delete cascade
);

create table public.integration_synergies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  acquisition_id uuid not null,
  key text not null,
  category text not null check (category in ('revenue', 'cross_sell', 'cost', 'procurement', 'operational', 'product', 'technology', 'capability', 'other')),
  description text not null,
  unit text not null default 'currency' check (unit in ('currency', 'number', 'percent')),
  baseline numeric not null default 0,
  target numeric not null,
  measurement text not null default 'annual_run_rate' check (measurement in ('annual_run_rate', 'cumulative', 'monthly')),
  owner_crew_id uuid,
  supporting_activity_ids uuid[] not null default '{}',
  evidence_source text not null default '',
  metric_id uuid,
  start_date date,
  expected_realisation_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (acquisition_id, key),
  foreign key (company_id, acquisition_id) references public.acquisitions (company_id, id) on delete cascade,
  foreign key (company_id, owner_crew_id) references public.crew_members (company_id, id) on delete set null (owner_crew_id),
  foreign key (company_id, metric_id) references public.metrics (company_id, id) on delete set null (metric_id)
);

create table public.synergy_actuals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  synergy_id uuid not null,
  period_start date not null,
  value numeric not null,
  kind text not null default 'actual' check (kind in ('actual', 'forecast')),
  verified boolean not null default false,  -- only verified actuals count as realised
  source text not null default '',
  note text,
  entered_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (synergy_id, period_start, kind),
  foreign key (company_id, synergy_id) references public.integration_synergies (company_id, id) on delete cascade
);

-- Post-integration reviews and evidence-backed playbook change proposals
create table public.integration_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  acquisition_id uuid not null,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  content jsonb not null default '{}'::jsonb,
  generator text,
  model text,
  generation_note text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, acquisition_id) references public.acquisitions (company_id, id) on delete cascade
);

create table public.playbook_change_proposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  playbook_id uuid not null,
  review_id uuid,
  title text not null,
  what_happened text not null,
  evidence jsonb not null default '[]'::jsonb,
  change jsonb not null,          -- structured operation applied to a new draft version on acceptance
  expected_benefit text not null default '',
  applies_to text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  resulting_playbook_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, playbook_id) references public.integration_playbooks (company_id, id),
  foreign key (company_id, review_id) references public.integration_reviews (company_id, id) on delete set null (review_id),
  foreign key (company_id, resulting_playbook_id) references public.integration_playbooks (company_id, id)
);

-- Mission Control records an integration escalated (shared with the Execution Agent)
alter table public.actions add column acquisition_id uuid, add column integration_activity_id uuid,
  add foreign key (company_id, acquisition_id) references public.acquisitions (company_id, id) on delete set null (acquisition_id),
  add foreign key (company_id, integration_activity_id) references public.integration_activities (company_id, id) on delete set null (integration_activity_id);
alter table public.issues add column acquisition_id uuid,
  add foreign key (company_id, acquisition_id) references public.acquisitions (company_id, id) on delete set null (acquisition_id);

-- ---------------------------------------------------------------------------
-- Triggers: timestamps, tenant immutability, audit, change signals
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['acquisitions','knowledge_sources','integration_playbooks','integration_plans','integration_workstreams','integration_activities',
                           'integration_synergies','synergy_actuals','integration_reviews','playbook_change_proposals'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['acquisitions','knowledge_sources','knowledge_chunks','integration_playbooks','integration_plans','integration_workstreams',
                           'integration_activities','integration_dependencies','integration_synergies','synergy_actuals','integration_reviews','playbook_change_proposals'] loop
    execute format('create trigger company_id_immutable before update on public.%I for each row execute function app.company_id_immutable()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['acquisitions','integration_playbooks','integration_plans','integration_workstreams','integration_activities',
                           'integration_dependencies','integration_synergies','synergy_actuals','playbook_change_proposals'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
  end loop;
  foreach t in array array['integration_activities','synergy_actuals','acquisitions'] loop
    execute format('create trigger agent_signal after insert or update on public.%I for each row execute function app.agent_signal()', t);
  end loop;
end $$;

-- Knowledge source metadata (not the text) is audited
create trigger audit after insert or delete on public.knowledge_sources for each row execute function app.audit();

-- Approved playbook versions are frozen; drafts change only while they are drafts.
create or replace function app.playbook_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('approved', 'superseded', 'archived') then
    if (new.content, new.name, new.applies_when, new.acquisition_types, new.version, new.lineage_id)
       is distinct from (old.content, old.name, old.applies_when, old.acquisition_types, old.version, old.lineage_id) then
      raise exception 'an approved playbook version cannot be edited; create a new draft version' using errcode = '42501';
    end if;
    if not (old.status = new.status or (old.status = 'approved' and new.status in ('superseded', 'archived'))) then
      raise exception 'invalid playbook status change % → %', old.status, new.status using errcode = '42501';
    end if;
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' and current_setting('app.approving', true) is distinct from 'on' then
    raise exception 'playbooks are approved only through approve_playbook()' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger playbook_guard before update on public.integration_playbooks for each row execute function app.playbook_guard();

create or replace function app.plan_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('approved', 'superseded') and new.content is distinct from old.content then
    raise exception 'an approved plan is executed through its activities, not edited as a draft' using errcode = '42501';
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' and current_setting('app.approving', true) is distinct from 'on' then
    raise exception 'plans are approved only through approve_integration_plan()' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger plan_guard before update on public.integration_plans for each row execute function app.plan_guard();

-- Completion criteria are verified by people, never by the agent; status changes stamp dates.
create or replace function app.activity_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.is_agent_for(new.company_id) and current_setting('app.approving', true) is distinct from 'on' then
    if (new.status, new.criteria_met, new.verified_by, new.due_date, new.owner_crew_id, new.approval_status, new.title, new.completion_criteria)
       is distinct from (old.status, old.criteria_met, old.verified_by, old.due_date, old.owner_crew_id, old.approval_status, old.title, old.completion_criteria) then
      raise exception 'agents cannot change an activity''s status, dates, owner, approvals or completion criteria' using errcode = '42501';
    end if;
  end if;
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if new.criteria_met is distinct from old.criteria_met then
    new.verified_by := auth.uid();
    new.verified_at := case when new.criteria_met is null then null else now() end;
  end if;
  if new.approval_status = 'approved' and old.approval_status is distinct from 'approved' then
    new.approved_by := auth.uid();
  end if;
  return new;
end $$;
create trigger activity_guard before update on public.integration_activities for each row execute function app.activity_guard();

-- ---------------------------------------------------------------------------
-- RLS: integration work is visible to leadership, Omni and the company's agent.
-- Restricted (confidential transaction) documents: administrators and the agent only.
-- ---------------------------------------------------------------------------
create or replace function app.can_read_knowledge(cid uuid, is_restricted boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when is_restricted then app.can_admin(cid) or app.is_agent_for(cid) else app.can_see_agents(cid) end;
$$;

create policy knowledge_sources_select on public.knowledge_sources for select to authenticated using (app.can_read_knowledge(company_id, restricted));
create policy knowledge_sources_insert on public.knowledge_sources for insert to authenticated
  with check (app.is_leadership_or_omni(company_id) and (not restricted or app.can_admin(company_id)));
create policy knowledge_sources_update on public.knowledge_sources for update to authenticated
  using (app.is_leadership_or_omni(company_id) and (not restricted or app.can_admin(company_id)))
  with check (app.is_leadership_or_omni(company_id) and (not restricted or app.can_admin(company_id)));
create policy knowledge_sources_delete on public.knowledge_sources for delete to authenticated using (app.can_admin(company_id));

create policy knowledge_chunks_select on public.knowledge_chunks for select to authenticated using (
  exists (select 1 from public.knowledge_sources s where s.id = source_id and s.company_id = knowledge_chunks.company_id and app.can_read_knowledge(s.company_id, s.restricted)));
create policy knowledge_chunks_insert on public.knowledge_chunks for insert to authenticated with check (
  exists (select 1 from public.knowledge_sources s where s.id = source_id and s.company_id = knowledge_chunks.company_id
          and app.is_leadership_or_omni(s.company_id) and (not s.restricted or app.can_admin(s.company_id))));
create policy knowledge_chunks_delete on public.knowledge_chunks for delete to authenticated using (app.can_admin(company_id));

do $$
declare t text;
begin
  foreach t in array array['acquisitions','integration_playbooks','integration_plans','integration_workstreams','integration_activities',
                           'integration_dependencies','integration_synergies','synergy_actuals','integration_reviews','playbook_change_proposals'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.can_see_agents(company_id))', t || '_select', t);
  end loop;
  -- leadership runs integrations day to day
  foreach t in array array['integration_workstreams','integration_activities','integration_dependencies','integration_synergies','synergy_actuals'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (app.is_leadership_or_omni(company_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.is_leadership_or_omni(company_id)) with check (app.is_leadership_or_omni(company_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.is_leadership_or_omni(company_id))', t || '_delete', t);
  end loop;
end $$;
-- the agent may annotate activities (evidence notes); the guard stops it changing commitments
create policy integration_activities_agent_update on public.integration_activities for update to authenticated
  using (app.is_agent_for(company_id)) with check (app.is_agent_for(company_id));

create policy acquisitions_insert on public.acquisitions for insert to authenticated with check (app.is_leadership_or_omni(company_id));
create policy acquisitions_update on public.acquisitions for update to authenticated using (app.is_leadership_or_omni(company_id)) with check (app.is_leadership_or_omni(company_id));
create policy acquisitions_delete on public.acquisitions for delete to authenticated using (app.can_admin(company_id));

-- playbooks and plans: leadership drafts and edits; approval goes through the functions below
create policy integration_playbooks_insert on public.integration_playbooks for insert to authenticated
  with check (app.is_leadership_or_omni(company_id) and status in ('generating', 'draft'));
create policy integration_playbooks_update on public.integration_playbooks for update to authenticated
  using (app.is_leadership_or_omni(company_id)) with check (app.is_leadership_or_omni(company_id));
create policy integration_plans_insert on public.integration_plans for insert to authenticated
  with check (app.is_leadership_or_omni(company_id) and status in ('generating', 'draft'));
create policy integration_plans_update on public.integration_plans for update to authenticated
  using (app.is_leadership_or_omni(company_id)) with check (app.is_leadership_or_omni(company_id));
create policy integration_reviews_insert on public.integration_reviews for insert to authenticated with check (app.is_leadership_or_omni(company_id) and status = 'generating');
create policy playbook_change_proposals_update on public.playbook_change_proposals for update to authenticated
  using (app.can_admin(company_id)) with check (app.can_admin(company_id));

-- ---------------------------------------------------------------------------
-- Management approval (people): freeze a playbook version / materialise a plan
-- ---------------------------------------------------------------------------
create or replace function public.approve_playbook(p_playbook uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pb public.integration_playbooks%rowtype;
begin
  select * into pb from public.integration_playbooks where id = p_playbook for update;
  if not found then raise exception 'playbook not found' using errcode = 'P0002'; end if;
  if not app.can_admin(pb.company_id) then raise exception 'only the CEO or a company administrator can approve a playbook' using errcode = '42501'; end if;
  if pb.status <> 'draft' then raise exception 'only a draft can be approved (this version is %)', pb.status using errcode = '42501'; end if;
  if jsonb_array_length(coalesce(pb.content->'workstreams', '[]')) = 0 then raise exception 'a playbook needs at least one workstream' using errcode = '23514'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(pb.content->'conflicts', '[]')) c where coalesce(c->>'resolution', '') = '') then
    raise exception 'resolve every conflicting requirement before approval' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(pb.content->'workstreams', '[]')) w, jsonb_array_elements(coalesce(w->'activities', '[]')) a
             where a->>'basis' = 'recommended' and coalesce(a->>'decision', 'pending') = 'pending') then
    raise exception 'accept or reject every AI-suggested activity before approval' using errcode = '23514';
  end if;
  perform set_config('app.approving', 'on', true);
  update public.integration_playbooks set status = 'superseded'
    where company_id = pb.company_id and lineage_id = pb.lineage_id and status = 'approved';
  update public.integration_playbooks set status = 'approved', approved_by = auth.uid(), approved_at = now(), approval_note = p_note where id = pb.id;
  perform set_config('app.approving', 'off', true);
end $$;

-- Materialise the approved plan into workstreams, activities, dependencies and synergies.
create or replace function public.approve_integration_plan(p_plan uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pl public.integration_plans%rowtype;
  acq public.acquisitions%rowtype;
  w jsonb;
  a jsonb;
  s jsonb;
  d text;
  ws_id uuid;
  n int := 0;
  m int;
  anchor date;
  start_off int;
  due_off int;
begin
  select * into pl from public.integration_plans where id = p_plan for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if not app.can_admin(pl.company_id) then raise exception 'only the CEO or a company administrator can approve an integration plan' using errcode = '42501'; end if;
  if pl.status <> 'draft' then raise exception 'only a draft plan can be approved' using errcode = '42501'; end if;
  select * into acq from public.acquisitions where id = pl.acquisition_id for update;
  if acq.status not in ('planning', 'plan_in_review') then raise exception 'this acquisition already has an approved plan' using errcode = '42501'; end if;
  if acq.completion_date is null then raise exception 'set the completion date before approving the plan' using errcode = '23514'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(pl.content->'workstreams', '[]')) w2, jsonb_array_elements(coalesce(w2->'activities', '[]')) a2
             where a2->>'origin' = 'recommended' and coalesce(a2->>'decision', 'pending') = 'pending') then
    raise exception 'accept or reject every suggested improvement before approval' using errcode = '23514';
  end if;
  anchor := acq.completion_date;

  for w in select * from jsonb_array_elements(coalesce(pl.content->'workstreams', '[]')) loop
    if coalesce(w->>'included', 'true') = 'false' then continue; end if;
    n := n + 1;
    insert into public.integration_workstreams (company_id, acquisition_id, plan_id, key, name, objective, accountable_function, owner_crew_id, origin, sort)
    values (pl.company_id, acq.id, pl.id, w->>'key', w->>'name', coalesce(w->>'objective', ''), coalesce(w->>'accountable_function', ''),
            nullif(w->>'owner_crew_id', '')::uuid, coalesce(w->>'origin', 'playbook'), n)
    returning id into ws_id;
    m := 0;
    for a in select * from jsonb_array_elements(coalesce(w->'activities', '[]')) loop
      if a->>'origin' = 'recommended' and coalesce(a->>'decision', 'pending') <> 'accepted' then continue; end if;
      if coalesce(a->>'included', 'true') = 'false' then continue; end if;
      m := m + 1;
      start_off := coalesce((a->>'start_offset_days')::int, (a->>'due_offset_days')::int);
      due_off := (a->>'due_offset_days')::int;
      insert into public.integration_activities (company_id, acquisition_id, plan_id, workstream_id, key, title, description, accountable_function, owner_crew_id,
        start_date, due_date, baseline_due_date, milestone, critical, completion_criteria, evidence_required, approval_required, approval_status,
        human_only, human_only_reason, origin, deviation_note, basis, citations, sort)
      values (pl.company_id, acq.id, pl.id, ws_id, a->>'key', a->>'title', coalesce(a->>'description', ''), coalesce(a->>'accountable_function', ''),
        nullif(a->>'owner_crew_id', '')::uuid, anchor + start_off, anchor + due_off, anchor + due_off,
        coalesce((a->>'milestone')::boolean, false), coalesce((a->>'critical')::boolean, false), coalesce(a->>'completion_criteria', ''),
        coalesce(a->>'evidence_required', ''), nullif(a->>'approval_required', ''), case when nullif(a->>'approval_required', '') is null then 'not_required' else 'pending' end,
        coalesce((a->>'human_only')::boolean, false), nullif(a->>'human_only_reason', ''), coalesce(a->>'origin', 'playbook'), nullif(a->>'deviation_note', ''),
        a->>'basis', coalesce(a->'citations', '[]'), m);
    end loop;
  end loop;
  -- dependencies by key (both ends must have been included)
  for w in select * from jsonb_array_elements(coalesce(pl.content->'workstreams', '[]')) loop
    for a in select * from jsonb_array_elements(coalesce(w->'activities', '[]')) loop
      for d in select * from jsonb_array_elements_text(coalesce(a->'depends_on', '[]')) loop
        insert into public.integration_dependencies (company_id, acquisition_id, from_activity_id, to_activity_id)
        select pl.company_id, acq.id, f.id, t.id
        from public.integration_activities f, public.integration_activities t
        where f.plan_id = pl.id and t.plan_id = pl.id and f.key = d and t.key = a->>'key'
        on conflict do nothing;
      end loop;
    end loop;
  end loop;
  for s in select * from jsonb_array_elements(coalesce(pl.content->'synergies', '[]')) loop
    insert into public.integration_synergies (company_id, acquisition_id, key, category, description, unit, baseline, target, measurement, owner_crew_id,
      supporting_activity_ids, evidence_source, metric_id, start_date, expected_realisation_date)
    values (pl.company_id, acq.id, s->>'key', s->>'category', s->>'description', coalesce(s->>'unit', 'currency'), coalesce((s->>'baseline')::numeric, 0),
      (s->>'target')::numeric, coalesce(s->>'measurement', 'annual_run_rate'), nullif(s->>'owner_crew_id', '')::uuid,
      coalesce((select array_agg(ia.id) from public.integration_activities ia
                where ia.plan_id = pl.id and ia.key in (select jsonb_array_elements_text(coalesce(s->'supporting_activity_keys', '[]')))), '{}'),
      coalesce(s->>'evidence_source', ''), nullif(s->>'metric_id', '')::uuid, anchor, anchor + coalesce((s->>'realisation_offset_days')::int, 365));
  end loop;

  perform set_config('app.approving', 'on', true);
  update public.integration_plans set status = 'superseded' where acquisition_id = acq.id and status = 'approved';
  update public.integration_plans set status = 'approved', approved_by = auth.uid(), approved_at = now(), approval_note = p_note where id = pl.id;
  perform set_config('app.approving', 'off', true);
  update public.acquisitions set status = case when acq.completion_date <= current_date then 'active' else 'ready' end, playbook_id = pl.playbook_id where id = acq.id;
end $$;

-- ---------------------------------------------------------------------------
-- Agent drafting: only into a row a person asked it to generate, only while generating
-- ---------------------------------------------------------------------------
create or replace function public.agent_save_draft(p_kind text, p_id uuid, p_content jsonb, p_meta jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  st text;
  ok boolean := (p_meta->>'failed') is distinct from 'true';
begin
  if p_kind = 'playbook' then
    select company_id, status into cid, st from public.integration_playbooks where id = p_id for update;
  elsif p_kind = 'plan' then
    select company_id, status into cid, st from public.integration_plans where id = p_id for update;
  elsif p_kind = 'review' then
    select company_id, status into cid, st from public.integration_reviews where id = p_id for update;
  else
    raise exception 'unknown draft kind %', p_kind using errcode = '22023';
  end if;
  if cid is null then raise exception 'draft not found' using errcode = 'P0002'; end if;
  perform app.require_agent(cid);
  if app.agent_mode(cid, 'integration', 'record_findings') = 'off' then raise exception 'the M&A Integration Agent is switched off' using errcode = '42501'; end if;
  if st <> 'generating' then raise exception 'this draft is no longer being generated (status %)', st using errcode = '42501'; end if;
  if p_kind = 'playbook' then
    update public.integration_playbooks set content = case when ok then p_content else content end, status = case when ok then 'draft' else 'failed' end,
      generator = coalesce(p_meta->>'generator', generator), model = p_meta->>'model', generation_note = p_meta->>'note',
      name = coalesce(nullif(p_meta->>'name', ''), name), applies_when = coalesce(p_meta->>'applies_when', applies_when),
      acquisition_types = coalesce((select array_agg(x) from jsonb_array_elements_text(p_meta->'acquisition_types') x), acquisition_types)
    where id = p_id;
  elsif p_kind = 'plan' then
    update public.integration_plans set content = case when ok then p_content else content end, status = case when ok then 'draft' else 'failed' end,
      generator = coalesce(p_meta->>'generator', generator), model = p_meta->>'model', generation_note = p_meta->>'note' where id = p_id;
    update public.acquisitions set status = 'plan_in_review' where id = (select acquisition_id from public.integration_plans where id = p_id) and status = 'planning' and ok;
  else
    update public.integration_reviews set content = case when ok then p_content else content end, status = case when ok then 'ready' else 'failed' end,
      generator = p_meta->>'generator', model = p_meta->>'model', generation_note = p_meta->>'note' where id = p_id;
  end if;
end $$;

-- Change proposals: the agent proposes; only management accepts, into a new draft version.
create or replace function public.agent_propose_playbook_change(p_review uuid, p_playbook uuid, p_title text, p_what text, p_evidence jsonb,
  p_change jsonb, p_benefit text, p_applies text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  new_id uuid;
begin
  select company_id into cid from public.integration_playbooks where id = p_playbook and status = 'approved';
  if cid is null then raise exception 'changes can only be proposed against an approved playbook' using errcode = '42501'; end if;
  perform app.require_agent(cid);
  if not exists (select 1 from public.integration_reviews r where r.id = p_review and r.company_id = cid) then
    raise exception 'review not found' using errcode = 'P0002';
  end if;
  insert into public.playbook_change_proposals (company_id, playbook_id, review_id, title, what_happened, evidence, change, expected_benefit, applies_to)
  values (cid, p_playbook, p_review, p_title, p_what, coalesce(p_evidence, '[]'), p_change, coalesce(p_benefit, ''), coalesce(p_applies, ''))
  returning id into new_id;
  return new_id;
end $$;

-- Activation: a ready plan becomes active once the transaction has completed.
create or replace function public.agent_activate_integrations(p_company uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform app.require_agent(p_company);
  update public.acquisitions set status = 'active' where company_id = p_company and status = 'ready' and completion_date <= current_date;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Approvals: Mission Control records created from integration escalations carry their
-- acquisition; revised integration dates are applied only after approval.
-- ---------------------------------------------------------------------------
create or replace function public.agent_apply_approval(p_approval uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.agent_approvals%rowtype;
  p jsonb;
  act public.actions%rowtype;
  ia public.integration_activities%rowtype;
  new_id uuid;
  issue_id uuid;
  res jsonb;
  acq uuid;
  iact uuid;
begin
  select * into a from public.agent_approvals where id = p_approval for update;
  if not found then raise exception 'proposal not found' using errcode = 'P0001'; end if;
  perform app.require_agent(a.company_id);
  if a.status = 'executed' then return a.result; end if;              -- idempotent
  if a.status <> 'approved' then raise exception 'proposal is %', a.status using errcode = '42501'; end if;
  if a.payload_hash <> md5(a.payload::text) then raise exception 'proposal integrity check failed' using errcode = '42501'; end if;
  if not app.can_decide_as(a.company_id, a.approver_role, a.decided_by) then
    raise exception 'the approver no longer holds the required role' using errcode = '42501';
  end if;
  p := a.payload;
  acq := nullif(p->>'acquisition_id', '')::uuid;
  iact := nullif(p->>'integration_activity_id', '')::uuid;
  if acq is not null and not exists (select 1 from public.acquisitions x where x.id = acq and x.company_id = a.company_id) then
    raise exception 'acquisition not in this company' using errcode = '42501';
  end if;

  if a.action_type in ('change_action_due_date', 'change_action_status') then
    select * into act from public.actions where id = (p->>'action_id')::uuid and company_id = a.company_id for update;
    if not found then
      update public.agent_approvals set status = 'stale', result = '{"reason":"action no longer exists"}' where id = a.id;
      return '{"stale": true}';
    end if;
    if act.status::text <> coalesce(p->>'expected_status', act.status::text)
       or act.due_date is distinct from nullif(p->>'expected_due_date', '')::date and p ? 'expected_due_date' then
      update public.agent_approvals set status = 'stale', result = jsonb_build_object('reason', 'the action changed after the proposal was raised', 'status', act.status, 'due_date', act.due_date) where id = a.id;
      return '{"stale": true}';
    end if;
    if a.action_type = 'change_action_due_date' then
      update public.actions set due_date = (p->>'new_due_date')::date where id = act.id;
    else
      update public.actions set status = (p->>'new_status')::public.action_status where id = act.id;
    end if;
    res := jsonb_build_object('action_id', act.id);

  elsif a.action_type = 'change_integration_activity' then
    select * into ia from public.integration_activities where id = (p->>'activity_id')::uuid and company_id = a.company_id for update;
    if not found or ia.status in ('done', 'not_needed') or ia.due_date is distinct from nullif(p->>'expected_due_date', '')::date then
      update public.agent_approvals set status = 'stale', result = jsonb_build_object('reason', 'the activity changed after the proposal was raised') where id = a.id;
      return '{"stale": true}';
    end if;
    -- applied as the approver's decision (the agent cannot change commitments on its own)
    perform set_config('app.approving', 'on', true);
    update public.integration_activities set due_date = (p->>'new_due_date')::date where id = ia.id;
    perform set_config('app.approving', 'off', true);
    res := jsonb_build_object('activity_id', ia.id, 'due_date', p->>'new_due_date');

  elsif a.action_type in ('create_issue', 'create_corrective_action') then
    if a.action_type = 'create_issue' or (p ? 'issue') then
      insert into public.issues (company_id, title, description, priority, status, owner_id, metric_id, quarterly_priority_id, acquisition_id)
      values (a.company_id, coalesce(p#>>'{issue,title}', p->>'title'), coalesce(p#>>'{issue,description}', p->>'description'),
              coalesce(p#>>'{issue,priority}', p->>'priority', 'medium')::public.issue_priority, 'open',
              coalesce(p#>>'{issue,owner_id}', p->>'owner_id')::uuid, nullif(coalesce(p#>>'{issue,metric_id}', p->>'metric_id'), '')::uuid,
              nullif(coalesce(p#>>'{issue,quarterly_priority_id}', p->>'quarterly_priority_id'), '')::uuid, acq)
      returning id into issue_id;
    end if;
    if a.action_type = 'create_corrective_action' then
      if jsonb_typeof(p->'actions') = 'array' then
        -- several agreed corrective actions
        with ins as (
          insert into public.actions (company_id, title, description, owner_id, due_date, status, metric_id, issue_id, created_by, acquisition_id, integration_activity_id)
          select a.company_id, x->>'title', x->>'description', (x->>'owner_id')::uuid, (x->>'due_date')::date, 'open',
                 nullif(x->>'metric_id', '')::uuid, issue_id, a.decided_by, acq, coalesce(nullif(x->>'integration_activity_id', '')::uuid, iact)
          from jsonb_array_elements(p->'actions') x
          returning public.actions.id)
        select jsonb_agg(ins.id) into res from ins;
        res := jsonb_build_object('issue_id', issue_id, 'action_ids', res);
      else
        insert into public.actions (company_id, title, description, owner_id, due_date, status, metric_id, issue_id, created_by, acquisition_id, integration_activity_id)
        values (a.company_id, p#>>'{action,title}', p#>>'{action,description}', (p#>>'{action,owner_id}')::uuid,
                (p#>>'{action,due_date}')::date, 'open', nullif(p#>>'{action,metric_id}', '')::uuid, issue_id, a.decided_by, acq,
                coalesce(nullif(p#>>'{action,integration_activity_id}', '')::uuid, iact))
        returning id into new_id;
        res := jsonb_build_object('issue_id', issue_id, 'action_id', new_id);
      end if;
    else
      res := jsonb_build_object('issue_id', issue_id);
    end if;

  elsif a.action_type = 'create_action' then
    insert into public.actions (company_id, title, description, owner_id, due_date, status, quarterly_priority_id, metric_id, created_by, acquisition_id, integration_activity_id)
    values (a.company_id, p->>'title', p->>'description', (p->>'owner_id')::uuid, (p->>'due_date')::date, 'open',
            nullif(p->>'quarterly_priority_id', '')::uuid, nullif(p->>'metric_id', '')::uuid, a.decided_by, acq, iact)
    returning id into new_id;
    res := jsonb_build_object('action_id', new_id);

  elsif a.action_type = 'send_external_message' and p ? 'handoff_action' then
    insert into public.actions (company_id, title, description, owner_id, due_date, status, created_by)
    values (a.company_id, p#>>'{handoff_action,title}', p#>>'{handoff_action,description}', (p#>>'{handoff_action,owner_id}')::uuid,
            (p#>>'{handoff_action,due_date}')::date, 'open', a.decided_by)
    returning id into new_id;
    res := jsonb_build_object('action_id', new_id);

  else
    res := jsonb_build_object('authorised', true);
    return res;
  end if;

  update public.agent_approvals set status = 'executed', result = res where id = a.id;
  return res;
end $$;

-- Level 4 internal tasks for an integration: a Mission Control action linked to the activity
create or replace function public.agent_create_action(p_company uuid, p_agent text, p_title text, p_description text, p_owner uuid, p_due date,
  p_priority uuid default null, p_metric uuid default null, p_approval uuid default null, p_acquisition uuid default null, p_activity uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  mode text;
  new_id uuid;
begin
  perform app.require_agent(p_company);
  mode := app.agent_mode(p_company, p_agent, 'internal_task');
  if mode = 'off' then raise exception 'internal tasks are switched off for this agent' using errcode = '42501'; end if;
  if mode = 'approval' and not exists (select 1 from public.agent_approvals a where a.id = p_approval and a.company_id = p_company and a.status = 'approved' and a.action_type = 'create_action') then
    raise exception 'creating internal tasks requires an approved proposal' using errcode = '42501';
  end if;
  insert into public.actions (company_id, title, description, owner_id, due_date, status, quarterly_priority_id, metric_id, acquisition_id, integration_activity_id)
  values (p_company, p_title, p_description, p_owner, p_due, 'open', p_priority, p_metric, p_acquisition, p_activity)
  returning id into new_id;
  return new_id;
end $$;
drop function if exists public.agent_create_action(uuid, text, text, text, uuid, date, uuid, uuid, uuid);

-- Connected document stores: the encrypted credential is returned only to administrators
-- (who browse and import) and the company's agent; it is decrypted server-side.
create or replace function public.connection_ciphertext(p_connection uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid;
  c text;
begin
  select company_id into cid from public.integration_connections where id = p_connection;
  if cid is null or not (app.can_admin(cid) or app.is_agent_for(cid)) then raise exception 'not permitted' using errcode = '42501'; end if;
  select s.ciphertext into c from public.integration_secrets s where s.connection_id = p_connection and s.company_id = cid;
  return c;
end $$;

grant execute on function public.approve_playbook(uuid, text), public.approve_integration_plan(uuid, text),
  public.agent_save_draft(text, uuid, jsonb, jsonb), public.agent_propose_playbook_change(uuid, uuid, text, text, jsonb, jsonb, text, text),
  public.agent_activate_integrations(uuid), public.agent_apply_approval(uuid),
  public.agent_create_action(uuid, text, text, text, uuid, date, uuid, uuid, uuid, uuid, uuid), public.connection_ciphertext(uuid) to authenticated;
grant execute on all functions in schema app to authenticated, service_role;
revoke all on all tables in schema public from anon;
