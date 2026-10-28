-- Omni OS agentic execution layer.
--
-- Agents act through a dedicated non-human principal per company (profiles.is_agent,
-- membership role 'agent'). The worker signs short-lived JWTs for that principal, so
-- every agent read and write is subject to the same Row Level Security as people:
-- an agent for company A cannot see or touch company B.
--
-- The agent role is read-only on management records. It can write only its own
-- records (investigations, runs, events, proposals, messages). Changes to
-- management commitments and Mission Control records happen only through the
-- security-definer functions at the end of this file, which re-check — in the
-- database — the company's authority configuration or a specific approved proposal.

-- ---------------------------------------------------------------------------
-- Agent principal
-- ---------------------------------------------------------------------------
alter table public.profiles add column is_agent boolean not null default false;

create or replace function app.is_agent_for(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_memberships m
                 join public.profiles p on p.id = m.user_id
                 where m.company_id = cid and m.user_id = auth.uid() and m.role = 'agent' and p.is_agent);
$$;

-- People who supervise agents: company leadership and assigned Omni staff (not observers)
create or replace function app.can_see_agents(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_leadership_or_omni(cid) or app.is_agent_for(cid);
$$;

-- The 'agent' role may only be held by agent profiles, and only provisioned by the platform.
create or replace function app.membership_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.company_role;
  target uuid;
  target_is_agent boolean;
begin
  r := case when tg_op = 'DELETE' then old.role else new.role end;
  target := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  if tg_op = 'UPDATE' and old.role in ('omni', 'agent') then
    r := old.role;
  end if;
  if r = 'omni' then
    if auth.uid() is not null and not app.is_platform_admin() then
      raise exception 'only platform administrators can manage Omni access' using errcode = '42501';
    end if;
    if tg_op <> 'DELETE' and not exists (select 1 from public.profiles p where p.id = target and p.platform_role is not null) then
      raise exception 'omni role requires an Omni staff profile' using errcode = '23514';
    end if;
  end if;
  select coalesce(p.is_agent, false) into target_is_agent from public.profiles p where p.id = target;
  if r = 'agent' or (tg_op = 'UPDATE' and new.role = 'agent') then
    if auth.uid() is not null and not app.is_platform_admin() then
      raise exception 'agent principals are provisioned by the platform' using errcode = '42501';
    end if;
    if tg_op <> 'DELETE' and not target_is_agent then
      raise exception 'the agent role requires an agent profile' using errcode = '23514';
    end if;
  elsif tg_op <> 'DELETE' and target_is_agent then
    raise exception 'agent profiles can only hold the agent role' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function app.profile_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.platform_role is distinct from old.platform_role and auth.uid() is not null and not app.is_platform_admin() then
    raise exception 'cannot change platform role' using errcode = '42501';
  end if;
  if new.is_agent is distinct from old.is_agent and auth.uid() is not null then
    raise exception 'cannot change agent flag' using errcode = '42501';
  end if;
  if new.id <> old.id or (new.email <> old.email and auth.uid() is not null) then
    raise exception 'cannot change identity fields' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Configuration and authority
-- ---------------------------------------------------------------------------
-- Action categories and the most autonomy each may ever be given. Categories capped
-- at 'approval' (Level 5) can never run without a specific approval.
create or replace function app.agent_category_cap(cat text) returns text
language sql immutable as $$
  select case cat
    when 'record_findings' then 'auto'
    when 'internal_followup' then 'auto'
    when 'internal_task' then 'auto'
    when 'escalation' then 'auto'
    when 'crm_enrich' then 'auto'
    when 'pipeline_update' then 'auto'
    when 'propose_issue' then 'approval'
    when 'commitment_change' then 'approval'
    when 'material_crm_change' then 'approval'
    when 'external_communication' then 'approval'
    when 'commercial_terms' then 'off'
    else null end;
$$;

create table public.agent_configs (
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_key text not null check (agent_key in ('ceo', 'commercial', 'ma', 'execution')),
  enabled boolean not null default false,
  -- per category: off | approval | auto. Missing categories default to 'approval'.
  category_modes jsonb not null default '{}'::jsonb,
  -- per category: ceo | company_admin | leadership | omni (who may approve)
  approvers jsonb not null default '{}'::jsonb,
  schedules jsonb not null default '{}'::jsonb,
  escalation jsonb not null default '{"reminder_after_days": 2, "max_reminders": 1, "escalate_after_days": 5, "escalate_to": "manager"}'::jsonb,
  limits jsonb not null default '{"max_runs_per_day": 50, "max_actions_per_day": 20, "max_messages_per_day": 20, "monthly_ai_budget_gbp": 0}'::jsonb,
  notifications jsonb not null default '{"approvals": "in_app", "escalations": "in_app"}'::jsonb,
  allowed_connections text[] not null default '{}',
  instructions text not null default '',
  allow_external_ai boolean not null default false,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (company_id, agent_key)
);

-- Agent configuration can never exceed category caps; approvers must be a deciding role.
create or replace function app.agent_config_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  v text;
  cap text;
begin
  for k, v in select * from jsonb_each_text(new.category_modes) loop
    cap := app.agent_category_cap(k);
    if cap is null then
      raise exception 'unknown action category %', k using errcode = '23514';
    end if;
    if v not in ('off', 'approval', 'auto') then
      raise exception 'invalid mode % for %', v, k using errcode = '23514';
    end if;
    if (cap = 'approval' and v = 'auto') or (cap = 'off' and v <> 'off') then
      raise exception '% cannot be set to %: maximum is %', k, v, cap using errcode = '42501';
    end if;
  end loop;
  for k, v in select * from jsonb_each_text(new.approvers) loop
    if app.agent_category_cap(k) is null or v not in ('ceo', 'company_admin', 'leadership', 'omni') then
      raise exception 'invalid approver % for %', v, k using errcode = '23514';
    end if;
  end loop;
  -- connections must belong to this company
  if exists (select 1 from unnest(new.allowed_connections) c
             where not exists (select 1 from public.integration_connections ic where ic.company_id = new.company_id and ic.id::text = c)) then
    raise exception 'unknown connection for this company' using errcode = '23503';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

-- Mode for a category ('off' when the agent is disabled), never above the category cap
create or replace function app.agent_mode(cid uuid, agent text, cat text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.agent_configs%rowtype;
  cap text;
  m text;
begin
  cap := app.agent_category_cap(cat);
  if cap is null or cap = 'off' then return 'off'; end if;
  select * into c from public.agent_configs where company_id = cid and agent_key = agent;
  if not found or not c.enabled then return 'off'; end if;
  m := coalesce(c.category_modes ->> cat, 'approval');
  if cap = 'approval' and m = 'auto' then return 'approval'; end if;
  return m;
end $$;

-- ---------------------------------------------------------------------------
-- Integrations (per company; credentials stored separately and never readable via the API)
-- ---------------------------------------------------------------------------
create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  provider text not null check (provider in ('omni_inbox', 'email_resend', 'microsoft_teams', 'microsoft_outlook', 'hubspot', 'salesforce', 'crm_sandbox', 'companies_house', 'ma_sandbox', 'ma_internal_list')),
  display_name text not null,
  mode text not null default 'sandbox' check (mode in ('sandbox', 'live')),
  status text not null default 'connected' check (status in ('connected', 'needs_authorisation', 'disconnected', 'error')),
  scopes text[] not null default '{}',
  config jsonb not null default '{}'::jsonb,
  connected_by uuid references public.profiles (id),
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, provider)
);

create table public.integration_secrets (
  connection_id uuid primary key,
  company_id uuid not null,
  ciphertext text not null,
  updated_at timestamptz not null default now(),
  foreign key (company_id, connection_id) references public.integration_connections (company_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Investigations (persistent cases / intervention records), runs, ledger
-- ---------------------------------------------------------------------------
create table public.agent_investigations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_key text not null check (agent_key in ('ceo', 'commercial', 'ma', 'execution')),
  workflow text not null,
  title text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'awaiting_approval', 'awaiting_response', 'monitoring', 'escalated', 'resolved', 'closed', 'failed')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  subject_type text,
  subject_id uuid,
  dedupe_key text not null,
  trigger jsonb not null default '{}'::jsonb,
  baseline jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  summary text,
  expected_outcome text,
  outcome jsonb,
  next_review_at timestamptz,
  parent_id uuid,
  requested_by uuid references public.profiles (id),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_by uuid references public.profiles (id),
  close_note text,
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, parent_id) references public.agent_investigations (company_id, id) on delete set null (parent_id)
);
-- One live investigation per subject: no repeated investigations without new evidence
create unique index agent_investigations_dedupe on public.agent_investigations (company_id, dedupe_key)
  where status not in ('resolved', 'closed', 'failed');
create index agent_investigations_subject on public.agent_investigations (company_id, subject_type, subject_id);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  investigation_id uuid not null,
  agent_key text not null,
  workflow text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled')),
  step text not null default 'start',
  state jsonb not null default '{}'::jsonb,
  wait_reason text,
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_after timestamptz not null default now(),
  lease_owner text,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (company_id, id),
  foreign key (company_id, investigation_id) references public.agent_investigations (company_id, id) on delete cascade
);
create index agent_runs_due on public.agent_runs (run_after) where status in ('queued', 'waiting');
create unique index agent_runs_one_live on public.agent_runs (investigation_id) where status in ('queued', 'running', 'waiting');

-- Append-only evidence and activity ledger
create table public.agent_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  investigation_id uuid,
  run_id uuid,
  agent_key text,
  kind text not null check (kind in ('trigger', 'context', 'evidence', 'finding', 'step', 'tool_call', 'proposal', 'approval', 'message', 'response', 'escalation', 'outcome', 'monitoring', 'delegation', 'error', 'config', 'note')),
  summary text not null,
  data jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  actor_id uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (company_id, investigation_id) references public.agent_investigations (company_id, id) on delete cascade
);
create index agent_events_inv on public.agent_events (investigation_id, id);
create index agent_events_company on public.agent_events (company_id, id desc);

-- Proposed actions awaiting a specific management decision
create table public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  investigation_id uuid not null,
  agent_key text not null,
  category text not null,
  action_type text not null check (action_type in ('send_followup', 'send_escalation', 'change_action_due_date', 'change_action_status', 'create_issue', 'create_corrective_action', 'create_action', 'crm_create_tasks', 'add_ma_targets', 'send_external_message')),
  title text not null,
  rationale text not null,
  payload jsonb not null,
  payload_hash text not null default '',
  evidence jsonb not null default '[]'::jsonb,
  affected jsonb not null default '[]'::jsonb,
  implications text,
  reversible boolean not null default true,
  approver_role text not null default 'ceo' check (approver_role in ('ceo', 'company_admin', 'leadership', 'omni')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'changes_requested', 'executed', 'stale', 'failed', 'withdrawn')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  executed_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, investigation_id) references public.agent_investigations (company_id, id) on delete cascade
);
create index agent_approvals_pending on public.agent_approvals (company_id, status);

-- Who may decide a proposal of this approver role in this company
create or replace function app.can_decide(cid uuid, approver text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_memberships m
                 where m.company_id = cid and m.user_id = auth.uid()
                   and case approver
                         when 'ceo' then m.role in ('ceo', 'company_admin')
                         when 'company_admin' then m.role in ('ceo', 'company_admin')
                         when 'leadership' then m.role in ('ceo', 'company_admin', 'executive', 'omni')
                         when 'omni' then m.role = 'omni'
                         else false end);
$$;

-- Proposals are immutable once raised; decisions are only by the configured approver;
-- execution status is only set by the agent (after re-checking) or the apply function.
create or replace function app.agent_approval_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.payload_hash := md5(new.payload::text);
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    if app.agent_category_cap(new.category) is null then
      raise exception 'unknown category' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.payload is distinct from old.payload or new.payload_hash <> old.payload_hash or new.category <> old.category
     or new.action_type <> old.action_type or new.approver_role <> old.approver_role or new.investigation_id <> old.investigation_id then
    raise exception 'a proposal cannot be changed once raised; raise a new one' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status in ('approved', 'rejected', 'changes_requested') then
      if auth.uid() is null or not app.can_decide(new.company_id, new.approver_role) then
        raise exception 'only the configured approver can decide this proposal' using errcode = '42501';
      end if;
      new.decided_by := auth.uid();
      new.decided_at := now();
    elsif old.status = 'pending' and new.status = 'withdrawn' then
      if not app.is_agent_for(new.company_id) and not app.can_admin(new.company_id) then
        raise exception 'not allowed' using errcode = '42501';
      end if;
    elsif old.status = 'approved' and new.status in ('executed', 'stale', 'failed') then
      if not app.is_agent_for(new.company_id) and auth.uid() is not null then
        raise exception 'only the agent records execution' using errcode = '42501';
      end if;
      new.executed_at := coalesce(new.executed_at, now());
    else
      raise exception 'invalid proposal transition % → %', old.status, new.status using errcode = '42501';
    end if;
  elsif new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at then
    raise exception 'decision fields are set by the database' using errcode = '42501';
  end if;
  return new;
end $$;

-- Internal communications sent by agents (Omni OS inbox, or delivered via a connected channel)
create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  investigation_id uuid not null,
  agent_key text not null,
  approval_id uuid,
  kind text not null check (kind in ('followup', 'reminder', 'escalation', 'notice')),
  to_crew_id uuid not null,
  to_user_id uuid references public.profiles (id),
  channel text not null default 'omni_inbox',
  subject text not null,
  body text not null,
  context jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'delivered' check (delivery_status in ('delivered', 'sent', 'sandbox', 'failed')),
  delivery_detail text,
  read_at timestamptz,
  response_kind text check (response_kind in ('done', 'new_date', 'blocked', 'update')),
  response_text text,
  response_date date,
  responded_at timestamptz,
  responded_by uuid references public.profiles (id),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, idempotency_key),
  foreign key (company_id, investigation_id) references public.agent_investigations (company_id, id) on delete cascade,
  foreign key (company_id, to_crew_id) references public.crew_members (company_id, id) on delete cascade,
  foreign key (company_id, approval_id) references public.agent_approvals (company_id, id)
);
create index agent_messages_to on public.agent_messages (to_user_id, responded_at);

-- Messages: agents may only send what their authority allows. Recipients may only record a response.
create or replace function app.agent_message_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cat text;
  mode text;
begin
  if tg_op = 'INSERT' then
    if not app.is_agent_for(new.company_id) and auth.uid() is not null then
      raise exception 'only agents send agent messages' using errcode = '42501';
    end if;
    cat := case when new.kind = 'escalation' then 'escalation' else 'internal_followup' end;
    mode := app.agent_mode(new.company_id, new.agent_key, cat);
    if mode = 'off' then
      raise exception '% is switched off for this agent', cat using errcode = '42501';
    end if;
    if mode = 'approval' and not exists (
      select 1 from public.agent_approvals a where a.id = new.approval_id and a.company_id = new.company_id
        and a.status = 'approved' and a.action_type in ('send_followup', 'send_escalation')) then
      raise exception '% requires an approved proposal', cat using errcode = '42501';
    end if;
    return new;
  end if;
  -- updates
  if app.is_agent_for(new.company_id) then
    if (new.response_kind, new.response_text, new.response_date, new.responded_at, new.responded_by)
       is distinct from (old.response_kind, old.response_text, old.response_date, old.responded_at, old.responded_by) then
      raise exception 'agents cannot write responses' using errcode = '42501';
    end if;
  elsif auth.uid() is not null then
    if auth.uid() is distinct from old.to_user_id then
      raise exception 'only the recipient can respond' using errcode = '42501';
    end if;
    if (new.subject, new.body, new.kind, new.to_crew_id, new.to_user_id, new.idempotency_key, new.delivery_status, new.context)
       is distinct from (old.subject, old.body, old.kind, old.to_crew_id, old.to_user_id, old.idempotency_key, old.delivery_status, old.context) then
      raise exception 'only the response can be changed' using errcode = '42501';
    end if;
    new.responded_by := case when new.response_kind is not null then auth.uid() else old.responded_by end;
  end if;
  return new;
end $$;

-- Idempotency ledger for side effects (external messages, CRM writes, created records)
create table public.agent_side_effects (
  company_id uuid not null references public.companies (id) on delete cascade,
  idempotency_key text not null,
  tool text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'uncertain')),
  result jsonb,
  run_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (company_id, idempotency_key)
);

-- Usage and cost controls
create table public.agent_usage (
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_key text not null,
  day date not null,
  runs int not null default 0,
  steps int not null default 0,
  tool_calls int not null default 0,
  actions int not null default 0,
  messages int not null default 0,
  ai_input_tokens int not null default 0,
  ai_output_tokens int not null default 0,
  primary key (company_id, agent_key, day)
);

-- Change signals for event-driven triggering (written by triggers, read by the worker)
create table public.agent_signals (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index agent_signals_pending on public.agent_signals (id) where processed_at is null;

create or replace function app.agent_signal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  j jsonb;
begin
  j := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  insert into public.agent_signals (company_id, kind, entity_type, entity_id)
  values ((j->>'company_id')::uuid, lower(tg_op), tg_table_name, (case when tg_table_name = 'metric_values' then j->>'metric_id' else j->>'id' end)::uuid);
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Commercial: sandbox CRM (a stand-in for HubSpot/Salesforce until a company connects its own)
-- ---------------------------------------------------------------------------
create table public.crm_sandbox_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  external_id text not null,
  name text not null,
  segment text,
  owner_name text,
  arr numeric,
  health text check (health in ('green', 'amber', 'red')),
  renewal_date date,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, external_id)
);

create table public.crm_sandbox_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  external_id text not null,
  account_id uuid,
  name text not null,
  stage text not null,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  amount numeric not null default 0,
  segment text,
  source text,
  owner_name text,
  created_on date not null,
  close_date date,
  closed_on date,
  last_activity_on date,
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, external_id),
  foreign key (company_id, account_id) references public.crm_sandbox_accounts (company_id, id) on delete set null (account_id)
);

create table public.crm_sandbox_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  opportunity_id uuid,
  subject text not null,
  notes text,
  owner_name text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'completed')),
  created_by_agent boolean not null default false,
  idempotency_key text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (company_id, id),
  unique (company_id, idempotency_key),
  foreign key (company_id, opportunity_id) references public.crm_sandbox_opportunities (company_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- M&A: approved thesis, target pipeline, sandbox market dataset
-- ---------------------------------------------------------------------------
create table public.ma_theses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  rationale text not null default '',
  sectors text[] not null default '{}',
  keywords text[] not null default '{}',
  geographies text[] not null default '{}',
  min_revenue numeric,
  max_revenue numeric,
  min_ebitda numeric,
  max_ev numeric,
  ownership_preferences text[] not null default '{}',
  exclusions text[] not null default '{}',
  integration_requirements text not null default '',
  fit_threshold int not null default 60 check (fit_threshold between 0 and 100),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create table public.ma_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  thesis_id uuid,
  name text not null,
  normalized_name text not null,
  registration_number text,
  source text not null,
  source_ref text,
  website text,
  sector text,
  geography text,
  description text,
  ownership text,
  revenue numeric,
  ebitda numeric,
  employees int,
  financials_source text,
  fit_score int,
  fit_breakdown jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  stage text not null default 'identified' check (stage in ('identified', 'researching', 'shortlisted', 'approach_prepared', 'approached', 'in_discussion', 'diligence', 'rejected', 'closed')),
  rejection_reason text,
  owner_crew_id uuid,
  added_by_agent boolean not null default false,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, normalized_name),
  foreign key (company_id, thesis_id) references public.ma_theses (company_id, id) on delete set null (thesis_id),
  foreign key (company_id, owner_crew_id) references public.crew_members (company_id, id) on delete set null (owner_crew_id)
);

create table public.ma_sandbox_companies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  registration_number text,
  website text,
  sector text,
  geography text,
  description text,
  ownership text,
  revenue numeric,
  ebitda numeric,
  employees int,
  financials_year int,
  source_note text not null default 'Sandbox market-intelligence dataset (fictional)',
  unique (company_id, id)
);

-- ---------------------------------------------------------------------------
-- Common triggers and RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['agent_configs','integration_connections','agent_investigations','agent_runs','agent_approvals','crm_sandbox_opportunities','ma_theses','ma_targets'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['agent_configs','integration_connections','integration_secrets','agent_investigations','agent_runs','agent_events','agent_approvals','agent_messages','agent_side_effects','agent_usage','agent_signals','crm_sandbox_accounts','crm_sandbox_opportunities','crm_sandbox_tasks','ma_theses','ma_targets','ma_sandbox_companies'] loop
    execute format('create trigger company_id_immutable before update on public.%I for each row execute function app.company_id_immutable()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- configuration, connections, decisions and pipelines are audited
  foreach t in array array['agent_configs','integration_connections','agent_approvals','ma_theses','ma_targets'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
  end loop;
  -- change signals for event-driven agents
  foreach t in array array['actions','metric_values','quarterly_priorities','issues'] loop
    execute format('create trigger agent_signal after insert or update on public.%I for each row execute function app.agent_signal()', t);
  end loop;
  -- replies and approval decisions wake the waiting investigation
  foreach t in array array['agent_messages','agent_approvals'] loop
    execute format('create trigger agent_signal after update on public.%I for each row execute function app.agent_signal()', t);
  end loop;
end $$;

create trigger agent_config_guard before insert or update on public.agent_configs for each row execute function app.agent_config_guard();
create trigger agent_approval_guard before insert or update on public.agent_approvals for each row execute function app.agent_approval_guard();
create trigger agent_message_guard before insert or update on public.agent_messages for each row execute function app.agent_message_guard();

-- configuration: leadership reads; only administrators change it
create policy agent_configs_select on public.agent_configs for select to authenticated using (app.can_see_agents(company_id));
create policy agent_configs_insert on public.agent_configs for insert to authenticated with check (app.can_admin(company_id));
create policy agent_configs_update on public.agent_configs for update to authenticated using (app.can_admin(company_id)) with check (app.can_admin(company_id));

create policy integration_connections_select on public.integration_connections for select to authenticated using (app.can_see_agents(company_id));
create policy integration_connections_write on public.integration_connections for all to authenticated using (app.can_admin(company_id)) with check (app.can_admin(company_id));
-- secrets: administrators may set them; nobody can read them through the API
create policy integration_secrets_insert on public.integration_secrets for insert to authenticated with check (app.can_admin(company_id));
create policy integration_secrets_update on public.integration_secrets for update to authenticated using (app.can_admin(company_id)) with check (app.can_admin(company_id));
create policy integration_secrets_delete on public.integration_secrets for delete to authenticated using (app.can_admin(company_id));

-- investigations: agents create and progress them; leadership can request, close and read them
create policy agent_investigations_select on public.agent_investigations for select to authenticated using (app.can_see_agents(company_id));
create policy agent_investigations_insert on public.agent_investigations for insert to authenticated with check (app.is_agent_for(company_id) or app.can_write(company_id));
create policy agent_investigations_update on public.agent_investigations for update to authenticated using (app.is_agent_for(company_id) or app.can_write(company_id)) with check (app.is_agent_for(company_id) or app.can_write(company_id));

create policy agent_runs_select on public.agent_runs for select to authenticated using (app.can_see_agents(company_id));
create policy agent_runs_insert on public.agent_runs for insert to authenticated with check (app.is_agent_for(company_id) or app.can_write(company_id));
create policy agent_runs_update on public.agent_runs for update to authenticated using (app.is_agent_for(company_id) or app.can_admin(company_id)) with check (app.is_agent_for(company_id) or app.can_admin(company_id));

-- the ledger is append-only (no update or delete policies)
create policy agent_events_select on public.agent_events for select to authenticated using (app.can_see_agents(company_id));
create policy agent_events_insert on public.agent_events for insert to authenticated with check ((app.is_agent_for(company_id) or app.can_write(company_id)) and actor_id is not distinct from auth.uid());

create policy agent_approvals_select on public.agent_approvals for select to authenticated using (app.can_see_agents(company_id));
create policy agent_approvals_insert on public.agent_approvals for insert to authenticated with check (app.is_agent_for(company_id));
create policy agent_approvals_update on public.agent_approvals for update to authenticated using (app.can_see_agents(company_id)) with check (app.can_see_agents(company_id));

-- messages: agents and leadership see them; recipients see their own
create policy agent_messages_select on public.agent_messages for select to authenticated using (app.can_see_agents(company_id) or to_user_id = auth.uid());
create policy agent_messages_insert on public.agent_messages for insert to authenticated with check (app.is_agent_for(company_id));
create policy agent_messages_update on public.agent_messages for update to authenticated using (app.is_agent_for(company_id) or to_user_id = auth.uid()) with check (app.is_agent_for(company_id) or to_user_id = auth.uid());

create policy agent_side_effects_select on public.agent_side_effects for select to authenticated using (app.can_see_agents(company_id));
create policy agent_side_effects_write on public.agent_side_effects for all to authenticated using (app.is_agent_for(company_id)) with check (app.is_agent_for(company_id));

create policy agent_usage_select on public.agent_usage for select to authenticated using (app.can_see_agents(company_id));
create policy agent_usage_write on public.agent_usage for all to authenticated using (app.is_agent_for(company_id)) with check (app.is_agent_for(company_id));
-- agent_signals: no API access (worker only)

-- sandbox CRM: the company works it like a CRM; agents read it and add tasks
create policy crm_sandbox_accounts_select on public.crm_sandbox_accounts for select to authenticated using (app.has_company_access(company_id));
create policy crm_sandbox_accounts_write on public.crm_sandbox_accounts for all to authenticated using (app.can_write(company_id)) with check (app.can_write(company_id));
create policy crm_sandbox_opportunities_select on public.crm_sandbox_opportunities for select to authenticated using (app.has_company_access(company_id));
create policy crm_sandbox_opportunities_write on public.crm_sandbox_opportunities for all to authenticated using (app.can_write(company_id)) with check (app.can_write(company_id));
create policy crm_sandbox_tasks_select on public.crm_sandbox_tasks for select to authenticated using (app.has_company_access(company_id));
create policy crm_sandbox_tasks_write on public.crm_sandbox_tasks for all to authenticated using (app.can_write(company_id)) with check (app.can_write(company_id));
-- agent inserts go through app.agent_crm_create_task (authority-checked)

-- M&A: leadership and agents; thesis approval is an administrator decision
create policy ma_theses_select on public.ma_theses for select to authenticated using (app.can_see_agents(company_id));
create policy ma_theses_write on public.ma_theses for all to authenticated using (app.can_admin(company_id)) with check (app.can_admin(company_id));
create policy ma_targets_select on public.ma_targets for select to authenticated using (app.can_see_agents(company_id));
create policy ma_targets_write on public.ma_targets for all to authenticated using (app.can_write(company_id)) with check (app.can_write(company_id));
create policy ma_sandbox_select on public.ma_sandbox_companies for select to authenticated using (app.can_see_agents(company_id));
create policy ma_sandbox_write on public.ma_sandbox_companies for all to authenticated using (app.can_admin(company_id)) with check (app.can_admin(company_id));

-- ---------------------------------------------------------------------------
-- Controlled tools: the only way agents change Mission Control, the CRM or the
-- acquisition pipeline. Each re-checks authority in the database.
-- ---------------------------------------------------------------------------
create or replace function app.require_agent(cid uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_agent_for(cid) then
    raise exception 'only the company''s agent can call this tool' using errcode = '42501';
  end if;
end $$;

-- Executes one approved proposal. Preconditions recorded in the payload are re-checked;
-- if circumstances changed the proposal becomes 'stale' instead of executing.
create or replace function public.agent_apply_approval(p_approval uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.agent_approvals%rowtype;
  p jsonb;
  act public.actions%rowtype;
  new_id uuid;
  issue_id uuid;
  res jsonb;
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

  elsif a.action_type in ('create_issue', 'create_corrective_action') then
    if a.action_type = 'create_issue' or (p ? 'issue') then
      insert into public.issues (company_id, title, description, priority, status, owner_id, metric_id, quarterly_priority_id)
      values (a.company_id, coalesce(p#>>'{issue,title}', p->>'title'), coalesce(p#>>'{issue,description}', p->>'description'),
              coalesce(p#>>'{issue,priority}', p->>'priority', 'medium')::public.issue_priority, 'open',
              coalesce(p#>>'{issue,owner_id}', p->>'owner_id')::uuid, nullif(coalesce(p#>>'{issue,metric_id}', p->>'metric_id'), '')::uuid,
              nullif(coalesce(p#>>'{issue,quarterly_priority_id}', p->>'quarterly_priority_id'), '')::uuid)
      returning id into issue_id;
    end if;
    if a.action_type = 'create_corrective_action' then
      insert into public.actions (company_id, title, description, owner_id, due_date, status, metric_id, issue_id, created_by)
      values (a.company_id, p#>>'{action,title}', p#>>'{action,description}', (p#>>'{action,owner_id}')::uuid,
              (p#>>'{action,due_date}')::date, 'open', nullif(p#>>'{action,metric_id}', '')::uuid, issue_id, a.decided_by)
      returning id into new_id;
    end if;
    res := jsonb_build_object('issue_id', issue_id, 'action_id', new_id);

  elsif a.action_type = 'create_action' then
    insert into public.actions (company_id, title, description, owner_id, due_date, status, quarterly_priority_id, metric_id, created_by)
    values (a.company_id, p->>'title', p->>'description', (p->>'owner_id')::uuid, (p->>'due_date')::date, 'open',
            nullif(p->>'quarterly_priority_id', '')::uuid, nullif(p->>'metric_id', '')::uuid, a.decided_by)
    returning id into new_id;
    res := jsonb_build_object('action_id', new_id);

  elsif a.action_type = 'send_external_message' and p ? 'handoff_action' then
    -- External approaches are never sent by an agent: approval hands the approved draft to
    -- the accountable person as a Mission Control action, and they send it themselves.
    insert into public.actions (company_id, title, description, owner_id, due_date, status, created_by)
    values (a.company_id, p#>>'{handoff_action,title}', p#>>'{handoff_action,description}', (p#>>'{handoff_action,owner_id}')::uuid,
            (p#>>'{handoff_action,due_date}')::date, 'open', a.decided_by)
    returning id into new_id;
    res := jsonb_build_object('action_id', new_id);

  else
    -- send_followup, send_escalation, crm_create_tasks, add_ma_targets, send_external_message:
    -- the agent performs these through their own tools after this authorisation check.
    res := jsonb_build_object('authorised', true);
    return res;
  end if;

  update public.agent_approvals set status = 'executed', result = res where id = a.id;
  return res;
end $$;

-- Was the decision made by someone who (still) holds the approver role?
create or replace function app.can_decide_as(cid uuid, approver text, uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_memberships m
                 where m.company_id = cid and m.user_id = uid
                   and case approver
                         when 'ceo' then m.role in ('ceo', 'company_admin')
                         when 'company_admin' then m.role in ('ceo', 'company_admin')
                         when 'leadership' then m.role in ('ceo', 'company_admin', 'executive', 'omni')
                         when 'omni' then m.role = 'omni'
                         else false end);
$$;

-- Mark an authorised (non-record) proposal as executed once the agent has performed it
create or replace function public.agent_mark_executed(p_approval uuid, p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.agent_approvals%rowtype;
begin
  select * into a from public.agent_approvals where id = p_approval for update;
  perform app.require_agent(a.company_id);
  if a.status = 'executed' then return; end if;
  if a.status <> 'approved' then raise exception 'proposal is %', a.status using errcode = '42501'; end if;
  update public.agent_approvals set status = 'executed', result = p_result where id = a.id;
end $$;

-- Level 4: create an internal Mission Control action when the category is set to auto
-- (or with a specific approved proposal).
create or replace function public.agent_create_action(p_company uuid, p_agent text, p_title text, p_description text, p_owner uuid, p_due date,
  p_priority uuid default null, p_metric uuid default null, p_approval uuid default null) returns uuid
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
  insert into public.actions (company_id, title, description, owner_id, due_date, status, quarterly_priority_id, metric_id)
  values (p_company, p_title, p_description, p_owner, p_due, 'open', p_priority, p_metric)
  returning id into new_id;
  return new_id;
end $$;

-- Level 4 (CRM): create a follow-up task in the sandbox CRM
create or replace function public.agent_crm_create_task(p_company uuid, p_agent text, p_opportunity uuid, p_subject text, p_notes text,
  p_owner text, p_due date, p_key text, p_approval uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  mode text;
  new_id uuid;
begin
  perform app.require_agent(p_company);
  mode := app.agent_mode(p_company, p_agent, 'internal_task');
  if mode = 'off' then raise exception 'CRM tasks are switched off for this agent' using errcode = '42501'; end if;
  if mode = 'approval' and not exists (select 1 from public.agent_approvals a where a.id = p_approval and a.company_id = p_company and a.status = 'approved' and a.action_type = 'crm_create_tasks') then
    raise exception 'creating CRM tasks requires an approved proposal' using errcode = '42501';
  end if;
  insert into public.crm_sandbox_tasks (company_id, opportunity_id, subject, notes, owner_name, due_date, created_by_agent, idempotency_key)
  values (p_company, p_opportunity, p_subject, p_notes, p_owner, p_due, true, p_key)
  on conflict (company_id, idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into new_id;
  return new_id;
end $$;

-- Level 4 (M&A): add a researched target to the pipeline
create or replace function public.agent_add_ma_target(p_company uuid, p_target jsonb, p_approval uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  mode text;
  new_id uuid;
begin
  perform app.require_agent(p_company);
  mode := app.agent_mode(p_company, 'ma', 'pipeline_update');
  if mode = 'off' then raise exception 'pipeline updates are switched off' using errcode = '42501'; end if;
  if mode = 'approval' and not exists (select 1 from public.agent_approvals a where a.id = p_approval and a.company_id = p_company and a.status = 'approved' and a.action_type = 'add_ma_targets') then
    raise exception 'adding targets requires an approved proposal' using errcode = '42501';
  end if;
  insert into public.ma_targets (company_id, thesis_id, name, normalized_name, registration_number, source, source_ref, website, sector, geography,
                                 description, ownership, revenue, ebitda, employees, financials_source, fit_score, fit_breakdown, evidence, stage, added_by_agent)
  values (p_company, nullif(p_target->>'thesis_id', '')::uuid, p_target->>'name', p_target->>'normalized_name', p_target->>'registration_number',
          p_target->>'source', p_target->>'source_ref', p_target->>'website', p_target->>'sector', p_target->>'geography', p_target->>'description',
          p_target->>'ownership', nullif(p_target->>'revenue', '')::numeric, nullif(p_target->>'ebitda', '')::numeric, nullif(p_target->>'employees', '')::int,
          p_target->>'financials_source', (p_target->>'fit_score')::int, coalesce(p_target->'fit_breakdown', '[]'), coalesce(p_target->'evidence', '[]'),
          coalesce(p_target->>'stage', 'shortlisted'), true)
  on conflict (company_id, normalized_name) do update set fit_score = excluded.fit_score, fit_breakdown = excluded.fit_breakdown,
          evidence = excluded.evidence, last_activity_at = now()
  returning id into new_id;
  return new_id;
end $$;

-- Agents update the stage of their own pipeline records (e.g. approach prepared)
create or replace function public.agent_set_ma_stage(p_company uuid, p_target uuid, p_stage text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_agent(p_company);
  if app.agent_mode(p_company, 'ma', 'pipeline_update') = 'off' then raise exception 'pipeline updates are switched off' using errcode = '42501'; end if;
  if p_stage not in ('researching', 'shortlisted', 'approach_prepared') then raise exception 'agents cannot move targets to %', p_stage using errcode = '42501'; end if;
  update public.ma_targets set stage = p_stage, last_activity_at = now() where id = p_target and company_id = p_company;
end $$;

-- Worker queue: claim due runs (service role only)
create or replace function public.claim_agent_runs(p_worker text, p_limit int, p_lease_seconds int default 120, p_companies uuid[] default null) returns setof public.agent_runs
language sql security definer set search_path = '' as $$
  update public.agent_runs r set status = 'running', lease_owner = p_worker, lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = r.attempts + 1, updated_at = now()
  where r.id in (
    select id from public.agent_runs
    where ((status in ('queued', 'waiting') and run_after <= now())
       or (status = 'running' and lease_until < now()))          -- crashed worker: resume
      and (p_companies is null or company_id = any (p_companies)) -- a worker dedicated to some companies
    order by run_after
    limit p_limit
    for update skip locked)
  returning r.*;
$$;
revoke all on function public.claim_agent_runs(text, int, int, uuid[]) from public, authenticated, anon;
grant execute on function public.claim_agent_runs(text, int, int, uuid[]) to service_role;

grant execute on all functions in schema app to authenticated, service_role;
grant execute on function public.agent_apply_approval(uuid), public.agent_mark_executed(uuid, jsonb),
  public.agent_create_action(uuid, text, text, text, uuid, date, uuid, uuid, uuid),
  public.agent_crm_create_task(uuid, text, uuid, text, text, text, date, text, uuid),
  public.agent_add_ma_target(uuid, jsonb, uuid), public.agent_set_ma_stage(uuid, uuid, text) to authenticated;

revoke all on all tables in schema public from anon;
