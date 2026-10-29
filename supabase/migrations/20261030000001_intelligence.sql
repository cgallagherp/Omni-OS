-- Revenue & Cost Intelligence.
--
-- Omni OS is the interface, not the warehouse. The tables below mirror the *output
-- contracts* of the future governed data layer (Snowflake + dbt): customer ARR snapshots,
-- classified ARR movements, cohort membership, general-ledger aggregates, departmental
-- people aggregates, data-quality results and reconciliation status. They are read-only to
-- the application: only the data pipeline (today the synthetic seed, later a governed sync
-- or a direct warehouse adapter) writes them. Every row carries company_id; reads are
-- gated by company *and* data domain (revenue, cost, people, transactions).

-- ---------------------------------------------------------------------------
-- Data domains
-- ---------------------------------------------------------------------------
-- Executives receive domains explicitly (e.g. the CRO: revenue; the CFO: everything).
create table public.an_grants (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  domain text not null check (domain in ('revenue', 'cost', 'people', 'transactions')),
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id, domain)
);

-- Agents read only the domains management gives each of them.
alter table public.agent_configs add column data_domains text[] not null default '{}'
  check (data_domains <@ array['revenue', 'cost', 'people', 'transactions']::text[]);

-- The worker signs each agent's token with an agent_key claim, so the database knows
-- which agent is asking, not only that it is "the agents" of this company.
create or replace function app.agent_key() returns text
language sql stable as $$ select nullif(coalesce(auth.jwt() ->> 'agent_key', ''), '') $$;

-- KPI bindings, links from Mission Control to the exception that raised them
alter table public.metrics add column analytics_metric_key text;
alter table public.issues add column analytics_ref jsonb;
alter table public.actions add column analytics_ref jsonb;
create index issues_analytics_metric on public.issues (company_id, (analytics_ref ->> 'metric_key')) where analytics_ref is not null;
create index actions_analytics_metric on public.actions (company_id, (analytics_ref ->> 'metric_key')) where analytics_ref is not null;

-- ---------------------------------------------------------------------------
-- Source, datasets, definitions, dimensions
-- ---------------------------------------------------------------------------
create table public.an_sources (
  company_id uuid primary key references public.companies (id) on delete cascade,
  adapter text not null check (adapter in ('synthetic', 'warehouse')),
  label text not null,
  is_synthetic boolean not null,
  business_model text not null default 'recurring_software' check (business_model in ('recurring_software', 'recurring_services', 'services')),
  config jsonb not null default '{}'::jsonb,   -- warehouse: account / database / schema names, never credentials
  currency text not null default 'GBP',
  connected_at timestamptz not null default now(),
  check (adapter <> 'synthetic' or is_synthetic)
);

create table public.an_datasets (
  company_id uuid not null references public.companies (id) on delete cascade,
  key text not null,
  domain text not null check (domain in ('revenue', 'cost', 'people', 'transactions', 'shared')),
  label text not null,
  source_system text not null,
  model text not null,                 -- the dbt model this dataset will come from
  calc_version text not null,
  refreshed_at timestamptz not null,
  coverage_start date,
  coverage_end date,
  row_count bigint not null default 0,
  status text not null default 'current' check (status in ('current', 'stale', 'failed')),
  primary key (company_id, key)
);

-- Governed, versioned metric contracts. A change is a new version; the old one is kept.
create table public.an_metric_definitions (
  company_id uuid not null references public.companies (id) on delete cascade,
  key text not null,
  version int not null default 1,
  name text not null,
  domain text not null check (domain in ('revenue', 'cost', 'people')),
  unit text not null check (unit in ('currency', 'percent', 'ratio', 'count', 'fte', 'currency_per_fte')),
  definition text not null,
  formula text not null,
  grain text not null,
  periods text[] not null default '{month,quarter,ytd,ltm,year}',
  policy jsonb not null default '{}'::jsonb,
  comparability_group text,            -- only metrics in the same group are compared across the portfolio
  source_dataset text not null,
  direction text not null default 'higher_is_better' check (direction in ('higher_is_better', 'lower_is_better', 'neutral')),
  status text not null default 'active' check (status in ('active', 'superseded')),
  effective_from date not null default current_date,
  change_note text not null default 'Initial definition',
  changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (company_id, key, version)
);
create unique index an_metric_definitions_active on public.an_metric_definitions (company_id, key) where status = 'active';

-- Company-specific dimensions (labels and allowed values) for filters and segmentation
create table public.an_dimensions (
  company_id uuid not null references public.companies (id) on delete cascade,
  domain text not null check (domain in ('revenue', 'cost')),
  key text not null,
  label text not null,
  values jsonb not null default '[]'::jsonb,   -- [{key, label}]
  sort_order int not null default 0,
  primary key (company_id, domain, key)
);

-- Targets and budgets for analytical metrics (phased by month)
create table public.an_targets (
  company_id uuid not null references public.companies (id) on delete cascade,
  domain text not null check (domain in ('revenue', 'cost', 'people')),
  metric_key text not null,
  month date not null,
  scenario text not null check (scenario in ('budget', 'forecast', 'target')),
  value numeric not null,
  primary key (company_id, metric_key, month, scenario)
);

-- ---------------------------------------------------------------------------
-- Revenue contracts
-- ---------------------------------------------------------------------------
create table public.ri_products (
  company_id uuid not null references public.companies (id) on delete cascade,
  key text not null,
  name text not null,
  business_unit text not null,
  family text,
  primary key (company_id, key)
);

create table public.ri_customers (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  external_id text not null,            -- billing/finance customer id
  crm_id text,                          -- null = not matched to the CRM (a data-quality finding)
  name text not null,
  segment text,
  sector text,
  geography text,
  size_band text,
  business_unit text,
  contract_type text,
  origin text not null default 'organic',      -- organic | acquired
  origin_label text,                            -- e.g. the acquisition the customer came with
  acquired_on date,
  disposed_on date,
  first_arr_month date,
  account_owner text,
  attributes jsonb not null default '{}'::jsonb,
  primary key (company_id, id),
  unique (company_id, external_id)
);
create index on public.ri_customers (company_id, sector);

-- Month-end contractual ARR at customer × product grain (dbt: fct_arr_monthly)
create table public.ri_arr_monthly (
  company_id uuid not null,
  month date not null check (extract(day from month) = 1),
  customer_id uuid not null,
  product_key text not null,
  arr numeric(16, 2) not null check (arr >= 0),
  currency text not null default 'GBP',
  change_reason text,                   -- source-system reason code for the change vs the prior month
  source_ref text,
  primary key (company_id, month, customer_id, product_key),
  foreign key (company_id, customer_id) references public.ri_customers (company_id, id) on delete cascade,
  foreign key (company_id, product_key) references public.ri_products (company_id, key) on delete cascade
);
create index on public.ri_arr_monthly (company_id, customer_id, month);

-- Classified movements (dbt: fct_arr_movements). Signed: increases positive.
create table public.ri_movements (
  company_id uuid not null,
  month date not null,
  customer_id uuid not null,
  product_key text not null,
  type text not null check (type in ('new', 'expansion', 'contraction', 'churn', 'reactivation', 'acquired', 'disposed',
                                     'migration', 'transfer', 'correction', 'reclassification', 'unclassified')),
  amount numeric(16, 2) not null,
  rule_key text not null,
  calc_version text not null,
  primary key (company_id, month, customer_id, product_key),
  foreign key (company_id, customer_id) references public.ri_customers (company_id, id) on delete cascade
);
create index on public.ri_movements (company_id, month, type);
create index on public.ri_movements (company_id, customer_id);

create table public.ri_contracts (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,
  product_key text not null,
  contract_ref text not null,
  start_date date,
  end_date date,
  renewal_date date,                    -- null = not recorded in the source system; never inferred
  term_months int,
  annual_value numeric(16, 2),
  status text not null check (status in ('active', 'renewing', 'ended', 'cancelled')),
  source_system text not null,
  primary key (company_id, id),
  foreign key (company_id, customer_id) references public.ri_customers (company_id, id) on delete cascade
);
create index on public.ri_contracts (company_id, customer_id);

-- Cohort membership is assigned once, with the customer's attributes frozen at assignment.
create table public.ri_cohorts (
  company_id uuid not null,
  customer_id uuid not null,
  cohort_month date not null,
  origin text not null,
  segment text,
  sector text,
  geography text,
  size_band text,
  business_unit text,
  contract_type text,
  primary_product text,
  assigned_at timestamptz not null default now(),
  restatement_id uuid,
  primary key (company_id, customer_id),
  foreign key (company_id, customer_id) references public.ri_customers (company_id, id) on delete cascade
);
create index on public.ri_cohorts (company_id, cohort_month);

-- Three revenue measures with their own definitions; ARR is not assumed to equal revenue.
create table public.ri_finance_recon (
  company_id uuid not null references public.companies (id) on delete cascade,
  month date not null,
  contractual_arr numeric(16, 2) not null,
  invoiced_recurring_annualised numeric(16, 2),
  recognised_recurring_revenue numeric(16, 2),   -- the month's recognised recurring revenue
  recognised_total_revenue numeric(16, 2),
  explained_difference numeric(16, 2) not null default 0,
  explanation text,
  status text not null check (status in ('reconciled', 'explained', 'unexplained', 'pending')),
  primary key (company_id, month)
);

-- ---------------------------------------------------------------------------
-- Cost contracts
-- ---------------------------------------------------------------------------
create table public.ci_accounts (
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null,
  name text not null,
  section text not null check (section in ('revenue', 'cogs', 'opex', 'below_ebitda')),
  pl_line text not null,               -- e.g. recurring_revenue, hosting, direct_labour, people, sales_marketing
  behaviour text check (behaviour in ('fixed', 'variable', 'semi_variable')),  -- null = not defined by the company
  controllable boolean,
  primary key (company_id, code)
);

create table public.ci_cost_centres (
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null,
  name text not null,
  department text not null,
  function text not null,
  business_unit text,
  location text,
  owner_crew_id uuid,
  primary key (company_id, code),
  foreign key (company_id, owner_crew_id) references public.crew_members (company_id, id) on delete set null (owner_crew_id)
);

create table public.ci_suppliers (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  category text not null,
  origin text not null default 'organic',
  contract_end date,
  primary key (company_id, id)
);

-- Monthly GL aggregates (dbt: fct_gl_monthly). Natural signs: revenue and costs positive.
create table public.ci_ledger (
  id bigint generated always as identity,
  company_id uuid not null references public.companies (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  scenario text not null check (scenario in ('actual', 'budget', 'forecast')),
  account_code text not null,
  cost_centre_code text not null,
  supplier_id uuid,
  product_key text,
  business_unit text,
  origin text not null default 'organic',
  amount numeric(16, 2) not null,
  primary key (company_id, id),
  foreign key (company_id, account_code) references public.ci_accounts (company_id, code) on delete cascade,
  foreign key (company_id, cost_centre_code) references public.ci_cost_centres (company_id, code) on delete cascade,
  foreign key (company_id, supplier_id) references public.ci_suppliers (company_id, id) on delete cascade
);
create index on public.ci_ledger (company_id, scenario, month);

-- Transaction-level detail for drill-down (finance system extract; read only)
create table public.ci_transactions (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  posted_on date not null,
  month date not null,
  account_code text not null,
  cost_centre_code text not null,
  supplier_id uuid,
  reference text not null,
  description text not null,
  amount numeric(16, 2) not null,
  source_system text not null,
  primary key (company_id, id),
  foreign key (company_id, account_code) references public.ci_accounts (company_id, code) on delete cascade,
  foreign key (company_id, supplier_id) references public.ci_suppliers (company_id, id) on delete cascade
);
create index on public.ci_transactions (company_id, month, account_code);

-- Departmental people aggregates only — no individual payroll or assessments.
create table public.ci_people (
  company_id uuid not null references public.companies (id) on delete cascade,
  month date not null,
  scenario text not null check (scenario in ('actual', 'budget')),
  department text not null,
  headcount int not null,
  fte numeric(8, 1) not null,
  employment_cost numeric(16, 2) not null,
  hires int not null default 0,
  leavers int not null default 0,
  open_roles int not null default 0,
  primary key (company_id, month, scenario, department)
);

-- ---------------------------------------------------------------------------
-- Data quality, reconciliation, closes and restatements
-- ---------------------------------------------------------------------------
create table public.an_dq_results (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  domain text not null check (domain in ('revenue', 'cost', 'people')),
  check_key text not null,
  title text not null,
  severity text not null check (severity in ('info', 'warning', 'error')),
  status text not null check (status in ('pass', 'warn', 'fail')),
  month date,
  affected_count int not null default 0,
  amount numeric(16, 2),
  sample jsonb not null default '[]'::jsonb,
  source_system text not null,
  owner_function text not null,
  remediation text not null,
  detected_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table public.an_period_status (
  company_id uuid not null references public.companies (id) on delete cascade,
  domain text not null check (domain in ('revenue', 'cost', 'people')),
  month date not null,
  status text not null check (status in ('validated', 'provisional', 'incomplete')),
  reason text,
  validated_by text,
  validated_at timestamptz,
  primary key (company_id, domain, month)
);

-- As-reported headline figures, frozen when a period is validated
create table public.an_period_closes (
  company_id uuid not null references public.companies (id) on delete cascade,
  domain text not null check (domain in ('revenue', 'cost')),
  month date not null,
  version int not null default 1,
  metrics jsonb not null,
  calc_version text not null,
  closed_at timestamptz not null default now(),
  primary key (company_id, domain, month, version)
);

create table public.an_restatements (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  domain text not null check (domain in ('revenue', 'cost')),
  month date,
  subject text not null,
  reason text not null,
  previous jsonb not null default '{}'::jsonb,
  current jsonb not null default '{}'::jsonb,
  approved_by text not null,
  restated_at timestamptz not null default now(),
  primary key (company_id, id)
);

-- ---------------------------------------------------------------------------
-- Saved views and export log
-- ---------------------------------------------------------------------------
create table public.an_saved_views (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  module text not null check (module in ('revenue', 'cost')),
  name text not null check (length(name) between 1 and 80),
  path text not null check (path ~ '^/c/[a-z0-9-]+/(revenue|cost)(/[a-z-]+)*$'),
  params text not null default '' check (length(params) <= 2000),
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table public.an_exports (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  dataset text not null,
  domain text not null,
  params text not null default '',
  row_count int not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
create or replace function app.can_read_domain(cid uuid, dom text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when app.is_platform_admin() then true
    -- an agent: only the domains management gave this particular agent
    when app.is_agent_for(cid) then exists (
      select 1 from public.agent_configs c
      where c.company_id = cid and c.agent_key = app.agent_key() and c.enabled and dom = any (c.data_domains))
    else exists (
      select 1 from public.company_memberships m
      where m.company_id = cid and m.user_id = auth.uid()
        and (m.role in ('ceo', 'company_admin')
             or (m.role = 'omni' and app.is_omni_staff() and dom in ('revenue', 'cost', 'people'))
             or (m.role in ('executive', 'omni', 'observer') and exists (
                   select 1 from public.an_grants g where g.company_id = cid and g.user_id = auth.uid() and g.domain = dom))))
  end;
$$;

create or replace function app.can_read_intelligence(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_read_domain(cid, 'revenue') or app.can_read_domain(cid, 'cost') or app.can_read_domain(cid, 'people');
$$;

-- Cohort membership can only change through an_restate_cohort, which records why.
create or replace function app.cohort_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.restating', true), '') <> 'on' then
    raise exception 'cohort membership is fixed once assigned; use an explicit restatement' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger cohort_guard before update on public.ri_cohorts for each row execute function app.cohort_guard();

-- Frozen closes are never edited; a restatement adds a new version.
create or replace function app.immutable_row() returns trigger
language plpgsql as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = '42501';
end $$;
create trigger an_period_closes_immutable before update on public.an_period_closes for each row execute function app.immutable_row();
create trigger an_restatements_immutable before update on public.an_restatements for each row execute function app.immutable_row();

create or replace function public.an_restate_cohort(p_company uuid, p_customer uuid, p_cohort_month date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  old public.ri_cohorts%rowtype;
  rid uuid;
begin
  if not app.can_admin(p_company) then raise exception 'only an administrator can restate cohort membership' using errcode = '42501'; end if;
  if length(coalesce(p_reason, '')) < 10 then raise exception 'give the reason for the restatement' using errcode = '23514'; end if;
  select * into old from public.ri_cohorts where company_id = p_company and customer_id = p_customer for update;
  if not found then raise exception 'customer has no cohort' using errcode = 'P0002'; end if;
  insert into public.an_restatements (company_id, domain, month, subject, reason, previous, current, approved_by)
  values (p_company, 'revenue', p_cohort_month, 'cohort:' || p_customer, p_reason,
          jsonb_build_object('cohort_month', old.cohort_month), jsonb_build_object('cohort_month', p_cohort_month),
          coalesce((select full_name from public.profiles where id = auth.uid()), 'administrator'))
  returning id into rid;
  perform set_config('app.restating', 'on', true);
  update public.ri_cohorts set cohort_month = p_cohort_month, restatement_id = rid where company_id = p_company and customer_id = p_customer;
  perform set_config('app.restating', 'off', true);
  return rid;
end $$;

-- A new version of a metric definition (administrators only); the previous one is kept.
create or replace function public.an_new_definition_version(p_company uuid, p_key text, p_policy jsonb, p_definition text, p_note text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  cur public.an_metric_definitions%rowtype;
begin
  if not app.can_admin(p_company) then raise exception 'only an administrator can change a metric definition' using errcode = '42501'; end if;
  if length(coalesce(p_note, '')) < 10 then raise exception 'record why the definition is changing' using errcode = '23514'; end if;
  select * into cur from public.an_metric_definitions where company_id = p_company and key = p_key and status = 'active' for update;
  if not found then raise exception 'unknown metric' using errcode = 'P0002'; end if;
  update public.an_metric_definitions set status = 'superseded' where company_id = p_company and key = p_key and version = cur.version;
  insert into public.an_metric_definitions (company_id, key, version, name, domain, unit, definition, formula, grain, periods, policy, comparability_group,
                                            source_dataset, direction, status, effective_from, change_note, changed_by)
  values (p_company, p_key, cur.version + 1, cur.name, cur.domain, cur.unit, coalesce(nullif(p_definition, ''), cur.definition), cur.formula, cur.grain, cur.periods,
          coalesce(p_policy, cur.policy), cur.comparability_group, cur.source_dataset, cur.direction, 'active', current_date, p_note, auth.uid());
  return cur.version + 1;
end $$;

-- Mission Control records created from an approved agent proposal keep the link to the
-- analytical exception that produced them.
create or replace function app.link_analytics_ref() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'executed' and old.status is distinct from 'executed' and new.payload ? 'analytics_ref' and new.result is not null then
    if new.result ? 'issue_id' and new.result ->> 'issue_id' is not null then
      update public.issues set analytics_ref = new.payload -> 'analytics_ref' where company_id = new.company_id and id = (new.result ->> 'issue_id')::uuid;
    end if;
    if jsonb_typeof(new.result -> 'action_ids') = 'array' then
      update public.actions set analytics_ref = new.payload -> 'analytics_ref'
      where company_id = new.company_id and id in (select (x #>> '{}')::uuid from jsonb_array_elements(new.result -> 'action_ids') x);
    elsif new.result ? 'action_id' and new.result ->> 'action_id' is not null then
      update public.actions set analytics_ref = new.payload -> 'analytics_ref' where company_id = new.company_id and id = (new.result ->> 'action_id')::uuid;
    end if;
  end if;
  return new;
end $$;
create trigger link_analytics_ref after update on public.agent_approvals for each row execute function app.link_analytics_ref();

-- RLS ------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['an_grants','an_sources','an_datasets','an_metric_definitions','an_dimensions','an_targets','ri_products','ri_customers',
                           'ri_arr_monthly','ri_movements','ri_contracts','ri_cohorts','ri_finance_recon','ci_accounts','ci_cost_centres','ci_suppliers',
                           'ci_ledger','ci_transactions','ci_people','an_dq_results','an_period_status','an_period_closes','an_restatements',
                           'an_saved_views','an_exports'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['an_grants','an_sources','an_datasets','an_metric_definitions','an_dimensions','an_targets','ri_products','ri_customers',
                           'ri_contracts','ri_cohorts','ri_finance_recon','ci_accounts','ci_cost_centres','ci_suppliers','an_dq_results','an_period_status',
                           'an_saved_views'] loop
    execute format('create trigger company_id_immutable before update on public.%I for each row execute function app.company_id_immutable()', t);
  end loop;
  -- revenue domain
  foreach t in array array['ri_products','ri_customers','ri_arr_monthly','ri_movements','ri_contracts','ri_cohorts','ri_finance_recon'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.can_read_domain(company_id, ''revenue''))', t || '_select', t);
  end loop;
  -- cost domain
  foreach t in array array['ci_accounts','ci_cost_centres','ci_suppliers','ci_ledger'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.can_read_domain(company_id, ''cost''))', t || '_select', t);
  end loop;
  -- per-row domain
  foreach t in array array['an_targets','an_dq_results','an_period_status','an_period_closes','an_restatements'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.can_read_domain(company_id, domain))', t || '_select', t);
  end loop;
  -- shared metadata: anyone who can read some analytics
  foreach t in array array['an_sources','an_datasets','an_metric_definitions','an_dimensions'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.can_read_intelligence(company_id))', t || '_select', t);
  end loop;
end $$;

create policy ci_transactions_select on public.ci_transactions for select to authenticated
  using (app.can_read_domain(company_id, 'cost') and app.can_read_domain(company_id, 'transactions'));
create policy ci_people_select on public.ci_people for select to authenticated using (app.can_read_domain(company_id, 'people'));

create policy an_grants_select on public.an_grants for select to authenticated using (user_id = auth.uid() or app.can_admin(company_id) or app.can_approve_scorecard(company_id));
create policy an_grants_insert on public.an_grants for insert to authenticated with check (app.can_admin(company_id) or app.can_approve_scorecard(company_id));
create policy an_grants_delete on public.an_grants for delete to authenticated using (app.can_admin(company_id) or app.can_approve_scorecard(company_id));

create policy an_saved_views_select on public.an_saved_views for select to authenticated
  using (app.can_read_intelligence(company_id) and (user_id = auth.uid() or shared));
create policy an_saved_views_insert on public.an_saved_views for insert to authenticated
  with check (user_id = auth.uid() and app.can_read_domain(company_id, module));
create policy an_saved_views_delete on public.an_saved_views for delete to authenticated using (user_id = auth.uid());

create policy an_exports_select on public.an_exports for select to authenticated using (user_id = auth.uid() or app.can_admin(company_id));
create policy an_exports_insert on public.an_exports for insert to authenticated
  with check (user_id = auth.uid() and app.can_read_domain(company_id, domain));
-- Governed data tables have no insert/update/delete policies: the application cannot write them.

create trigger audit after insert or update or delete on public.an_grants for each row execute function app.audit();
create trigger audit after insert or update or delete on public.an_metric_definitions for each row execute function app.audit();

-- ---------------------------------------------------------------------------
-- Governed query interface. Each function authorises the caller once for the company and
-- data domain (app.can_read_domain), then reads as definer: per-row RLS over tens of
-- thousands of ARR rows would be needlessly slow. Without access they return nothing.
-- In production the equivalent queries run against the dbt marts; the application
-- consumes the same result shapes either way.
-- ---------------------------------------------------------------------------
create or replace function public.an_arr(f jsonb, k text) returns text[]
language sql immutable as $$ select case when f ? k then array(select jsonb_array_elements_text(f -> k)) end $$;

create or replace function public.ri_match(c public.ri_customers, f jsonb, p_ref date) returns boolean
language sql stable as $$
  select (not f ? 'segment' or c.segment = any (public.an_arr(f, 'segment')))
     and (not f ? 'sector' or c.sector = any (public.an_arr(f, 'sector')))
     and (not f ? 'geography' or c.geography = any (public.an_arr(f, 'geography')))
     and (not f ? 'size_band' or c.size_band = any (public.an_arr(f, 'size_band')))
     and (not f ? 'business_unit' or c.business_unit = any (public.an_arr(f, 'business_unit')))
     and (not f ? 'contract_type' or c.contract_type = any (public.an_arr(f, 'contract_type')))
     and (not f ? 'origin' or c.origin = any (public.an_arr(f, 'origin')))
     and (not f ? 'customer' or c.id::text = any (public.an_arr(f, 'customer')))
     and (not f ? 'tenure' or jsonb_array_length(f -> 'tenure') <> 1
          or ((f -> 'tenure' ->> 0) = 'new') = (c.first_arr_month is not null and c.first_arr_month > p_ref))
     and (not f ? 'attr' or not exists (
          select 1 from jsonb_each(f -> 'attr') e
          where not coalesce((c.attributes ->> e.key) = any (array(select jsonb_array_elements_text(e.value))), false)));
$$;

create or replace function public.ri_group_key(c public.ri_customers, g text) returns text
language sql stable as $$
  select case g
    when 'segment' then coalesce(c.segment, '(none)')
    when 'sector' then coalesce(c.sector, '(none)')
    when 'geography' then coalesce(c.geography, '(none)')
    when 'size_band' then coalesce(c.size_band, '(none)')
    when 'business_unit' then coalesce(c.business_unit, '(none)')
    when 'contract_type' then coalesce(c.contract_type, '(none)')
    when 'origin' then c.origin
    when 'customer' then c.id::text
    when 'cohort_year' then coalesce(extract(year from c.first_arr_month)::text, '(none)')
    else case when g like 'attr:%' then coalesce(c.attributes ->> substr(g, 6), '(none)') else 'all' end
  end;
$$;

-- Product grain applies whenever products are grouped or filtered; otherwise expansion,
-- contraction and product migrations are netted per customer and month.
create or replace function public.ri_movement_totals(p_company uuid, p_from date, p_to date, p_filters jsonb default '{}', p_group text default null)
returns table (grp text, month date, type text, amount numeric, customers bigint)
language sql stable security definer set search_path = public as $$
  with cfg as (select (p_group = 'product' or p_filters ? 'product') as pg, public.an_arr(p_filters, 'product') as prods),
  base as (
    select case when p_group = 'product' then m.product_key else public.ri_group_key(c, p_group) end as grp,
           m.month, m.customer_id, m.type, m.amount
    from public.ri_movements m
    join public.ri_customers c on c.company_id = m.company_id and c.id = m.customer_id, cfg
    where m.company_id = p_company and m.month > p_from and m.month <= p_to and (select app.can_read_domain(p_company, 'revenue'))
      and public.ri_match(c, p_filters, p_from)
      and (cfg.prods is null or m.product_key = any (cfg.prods))
  ),
  per as (
    select b.grp, b.month, b.customer_id,
           case when not cfg.pg and b.type in ('expansion', 'contraction', 'migration') then 'flex' else b.type end as t, sum(b.amount) as amt
    from base b, cfg group by 1, 2, 3, 4
  )
  select grp, month,
         case when t = 'flex' then case when amt >= 0 then 'expansion' else 'contraction' end else t end,
         sum(amt), count(distinct customer_id)
  from per where not (t = 'flex' and amt = 0)
  group by 1, 2, 3;
$$;

create or replace function public.ri_arr_at(p_company uuid, p_months date[], p_filters jsonb default '{}', p_group text default null, p_ref date default null)
returns table (grp text, month date, arr numeric, customers bigint)
language sql stable security definer set search_path = public as $$
  select case when p_group = 'product' then s.product_key else public.ri_group_key(c, p_group) end, s.month, sum(s.arr),
         count(distinct s.customer_id) filter (where s.arr > 0)
  from public.ri_arr_monthly s
  join public.ri_customers c on c.company_id = s.company_id and c.id = s.customer_id
  where s.company_id = p_company and s.month = any (p_months) and (select app.can_read_domain(p_company, 'revenue'))
    and public.ri_match(c, p_filters, coalesce(p_ref, p_months[1]))
    and (not p_filters ? 'product' or s.product_key = any (public.an_arr(p_filters, 'product')))
  group by 1, 2;
$$;

-- Retention inputs for the cohort of customers (or customer × products) holding ARR at
-- p_start. New customers in the window are excluded by construction; acquired customers
-- join the base only once owned for p_acquired_wait months; disposed customers leave it.
create or replace function public.ri_retention(p_company uuid, p_start date, p_end date, p_filters jsonb default '{}', p_group text default null,
                                               p_acquired_wait int default 12)
returns table (grp text, opening_arr numeric, opening_logos bigint, expansion numeric, contraction numeric, churn numeric, reactivation numeric,
               transfer numeric, migration numeric, adjustment numeric, end_arr numeric, end_logos bigint)
language sql stable security definer set search_path = public as $$
  with cfg as (select (p_group = 'product' or p_filters ? 'product') as pg, public.an_arr(p_filters, 'product') as prods),
  cust as (
    select c.id, public.ri_group_key(c, p_group) as g from public.ri_customers c
    where c.company_id = p_company and (select app.can_read_domain(p_company, 'revenue')) and public.ri_match(c, p_filters, p_start)
      and (c.acquired_on is null or c.acquired_on <= (p_start - make_interval(months => p_acquired_wait))::date)
      and not (c.disposed_on is not null and c.disposed_on > p_start and c.disposed_on <= p_end)
  ),
  open as (
    select s.customer_id, case when cfg.pg then s.product_key else '*' end as ek,
           case when p_group = 'product' then s.product_key else cu.g end as grp, sum(s.arr) as arr
    from public.ri_arr_monthly s join cust cu on cu.id = s.customer_id, cfg
    where s.company_id = p_company and s.month = p_start and s.arr > 0 and (cfg.prods is null or s.product_key = any (cfg.prods))
    group by 1, 2, 3
  ),
  mv as (
    select o.grp, m.customer_id, o.ek, m.month,
           case when not cfg.pg and m.type in ('expansion', 'contraction', 'migration') then 'flex' else m.type end as t, sum(m.amount) as amt
    from public.ri_movements m join open o on o.customer_id = m.customer_id and (o.ek = '*' or o.ek = m.product_key), cfg
    where m.company_id = p_company and m.month > p_start and m.month <= p_end
    group by 1, 2, 3, 4, 5
  ),
  mv2 as (select grp, case when t = 'flex' then case when amt >= 0 then 'expansion' else 'contraction' end else t end as t, amt from mv),
  agg_m as (
    select grp,
           coalesce(sum(amt) filter (where t = 'expansion'), 0) as expansion,
           coalesce(sum(amt) filter (where t = 'contraction'), 0) as contraction,
           coalesce(sum(amt) filter (where t = 'churn'), 0) as churn,
           coalesce(sum(amt) filter (where t = 'reactivation'), 0) as reactivation,
           coalesce(sum(amt) filter (where t = 'transfer'), 0) as transfer,
           coalesce(sum(amt) filter (where t = 'migration'), 0) as migration,
           coalesce(sum(amt) filter (where t not in ('expansion', 'contraction', 'churn', 'reactivation', 'transfer', 'migration')), 0) as adjustment
    from mv2 group by 1
  ),
  ends as (
    select o.grp, o.customer_id, coalesce(sum(s.arr), 0) as arr
    from open o left join public.ri_arr_monthly s
      on s.company_id = p_company and s.month = p_end and s.customer_id = o.customer_id and (o.ek = '*' or s.product_key = o.ek)
    group by 1, 2
  ),
  agg_o as (select grp, sum(arr) as arr, count(distinct customer_id) as logos from open group by 1),
  agg_e as (select grp, sum(arr) as arr, count(*) filter (where arr > 0) as logos from ends group by 1)
  select o.grp, o.arr, o.logos, coalesce(m.expansion, 0), coalesce(m.contraction, 0), coalesce(m.churn, 0), coalesce(m.reactivation, 0),
         coalesce(m.transfer, 0), coalesce(m.migration, 0), coalesce(m.adjustment, 0), coalesce(e.arr, 0), coalesce(e.logos, 0)
  from agg_o o left join agg_m m using (grp) left join agg_e e using (grp);
$$;

-- Cohort matrix. Each customer's age is measured from its own cohort month; a cell only
-- includes members that have reached that age (reported so partial cells can be shown).
create or replace function public.ri_cohort_matrix(p_company uuid, p_last date, p_cohort text default 'quarter', p_dimension text default null,
                                                   p_filters jsonb default '{}', p_age text default 'quarter')
returns table (cohort text, age int, members bigint, initial_arr numeric, arr numeric, active bigint)
language sql stable security definer set search_path = public as $$
  with step as (select case p_age when 'month' then 1 when 'year' then 12 else 3 end as s),
  mem as (
    select k.customer_id, k.cohort_month,
           case
             when p_dimension = 'segment' then coalesce(k.segment, '(none)')
             when p_dimension = 'sector' then coalesce(k.sector, '(none)')
             when p_dimension = 'geography' then coalesce(k.geography, '(none)')
             when p_dimension = 'size_band' then coalesce(k.size_band, '(none)')
             when p_dimension = 'business_unit' then coalesce(k.business_unit, '(none)')
             when p_dimension = 'contract_type' then coalesce(k.contract_type, '(none)')
             when p_dimension = 'origin' then k.origin
             when p_dimension = 'product' then coalesce(k.primary_product, '(none)')
             when p_cohort = 'year' then to_char(k.cohort_month, 'YYYY')
             when p_cohort = 'month' then to_char(k.cohort_month, 'YYYY-MM')
             else to_char(k.cohort_month, 'YYYY') || '-Q' || extract(quarter from k.cohort_month)::text
           end as ck
    from public.ri_cohorts k
    where k.company_id = p_company and k.cohort_month <= p_last and (select app.can_read_domain(p_company, 'revenue'))
      and (not p_filters ? 'segment' or k.segment = any (public.an_arr(p_filters, 'segment')))
      and (not p_filters ? 'sector' or k.sector = any (public.an_arr(p_filters, 'sector')))
      and (not p_filters ? 'geography' or k.geography = any (public.an_arr(p_filters, 'geography')))
      and (not p_filters ? 'size_band' or k.size_band = any (public.an_arr(p_filters, 'size_band')))
      and (not p_filters ? 'business_unit' or k.business_unit = any (public.an_arr(p_filters, 'business_unit')))
      and (not p_filters ? 'contract_type' or k.contract_type = any (public.an_arr(p_filters, 'contract_type')))
      and (not p_filters ? 'origin' or k.origin = any (public.an_arr(p_filters, 'origin')))
      and (not p_filters ? 'product' or k.primary_product = any (public.an_arr(p_filters, 'product')))
  ),
  grid as (
    select m.ck, m.customer_id, g.age, (m.cohort_month + make_interval(months => g.age * step.s))::date as at
    from mem m, step,
         lateral generate_series(0, ((extract(year from age(p_last, m.cohort_month)) * 12 + extract(month from age(p_last, m.cohort_month)))::int / step.s)) g(age)
  ),
  arr as (
    select g.ck, g.age, g.customer_id, coalesce(sum(s.arr), 0) as a
    from grid g left join public.ri_arr_monthly s on s.company_id = p_company and s.customer_id = g.customer_id and s.month = g.at
    group by 1, 2, 3
  ),
  init as (select customer_id, a from arr where age = 0)
  select arr.ck, arr.age, count(*), sum(i.a), sum(arr.a), count(*) filter (where arr.a > 0)
  from arr join init i using (customer_id)
  where i.a > 0
  group by 1, 2;
$$;

-- Paginated customer list with ARR at two dates.
create or replace function public.ri_customer_list(p_company uuid, p_month date, p_compare date, p_filters jsonb default '{}', p_search text default null,
                                                   p_sort text default 'arr', p_limit int default 50, p_offset int default 0)
returns table (id uuid, name text, segment text, sector text, business_unit text, origin text, account_owner text, crm_id text,
               arr numeric, arr_compare numeric, total bigint)
language sql stable security definer set search_path = public as $$
  with cur as (
    select s.customer_id, sum(s.arr) filter (where s.month = p_month) as arr, sum(s.arr) filter (where s.month = p_compare) as arr_compare
    from public.ri_arr_monthly s
    where s.company_id = p_company and s.month in (p_month, p_compare) and (select app.can_read_domain(p_company, 'revenue'))
      and (not p_filters ? 'product' or s.product_key = any (public.an_arr(p_filters, 'product')))
    group by 1
  ),
  rows as (
    select c.id, c.name, c.segment, c.sector, c.business_unit, c.origin, c.account_owner, c.crm_id,
           coalesce(cur.arr, 0) as arr, coalesce(cur.arr_compare, 0) as arr_compare
    from public.ri_customers c join cur on cur.customer_id = c.id
    where c.company_id = p_company and public.ri_match(c, p_filters, p_compare)
      and (p_search is null or c.name ilike '%' || p_search || '%' or c.external_id ilike p_search || '%')
      and (coalesce(cur.arr, 0) > 0 or coalesce(cur.arr_compare, 0) > 0)
  )
  select r.*, count(*) over () from rows r
  order by case when p_sort = 'change' then r.arr - r.arr_compare end asc nulls last,
           case when p_sort = 'name' then r.name end asc,
           r.arr desc, r.name
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

-- Customers behind one movement type (the drill-down from a bridge bar). Amounts are the
-- same netted figures the bridge sums, so the list always adds up to the bar.
create or replace function public.ri_movement_customers(p_company uuid, p_from date, p_to date, p_type text, p_filters jsonb default '{}',
                                                        p_limit int default 50, p_offset int default 0)
returns table (id uuid, name text, segment text, sector text, business_unit text, account_owner text, amount numeric, months bigint, total bigint, total_amount numeric)
language sql stable security definer set search_path = public as $$
  with t as (
    select grp::uuid as cid, sum(amount) as amount, count(*) as months
    from public.ri_movement_totals(p_company, p_from, p_to, p_filters, 'customer')
    where type = p_type group by 1
  )
  select c.id, c.name, c.segment, c.sector, c.business_unit, c.account_owner, t.amount, t.months, count(*) over (), sum(t.amount) over ()
  from t join public.ri_customers c on c.company_id = p_company and c.id = t.cid
  order by abs(t.amount) desc, c.name
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

-- GL aggregates by scenario, month, P&L section/line and an optional dimension.
create or replace function public.ci_ledger_totals(p_company uuid, p_from date, p_to date, p_scenarios text[], p_group text default null,
                                                   p_filters jsonb default '{}')
returns table (grp text, month date, scenario text, section text, line text, amount numeric)
language sql stable security definer set search_path = public as $$
  select case p_group
           when 'department' then cc.department
           when 'function' then cc.function
           when 'cost_centre' then cc.code
           when 'account' then a.code
           when 'supplier' then coalesce(l.supplier_id::text, '(none)')
           when 'business_unit' then coalesce(l.business_unit, '(none)')
           when 'product' then coalesce(l.product_key, '(unallocated)')
           when 'location' then coalesce(cc.location, '(none)')
           when 'origin' then l.origin
           when 'behaviour' then coalesce(a.behaviour, '(not defined)')
           when 'controllable' then case a.controllable when true then 'controllable' when false then 'non_controllable' else '(not defined)' end
           else 'all'
         end,
         l.month, l.scenario, a.section, a.pl_line, sum(l.amount)
  from public.ci_ledger l
  join public.ci_accounts a on a.company_id = l.company_id and a.code = l.account_code
  join public.ci_cost_centres cc on cc.company_id = l.company_id and cc.code = l.cost_centre_code
  where l.company_id = p_company and l.month between p_from and p_to and l.scenario = any (p_scenarios)
    and (select app.can_read_domain(p_company, 'cost'))
    and (not p_filters ? 'department' or cc.department = any (public.an_arr(p_filters, 'department')))
    and (not p_filters ? 'function' or cc.function = any (public.an_arr(p_filters, 'function')))
    and (not p_filters ? 'cost_centre' or cc.code = any (public.an_arr(p_filters, 'cost_centre')))
    and (not p_filters ? 'account' or a.code = any (public.an_arr(p_filters, 'account')))
    and (not p_filters ? 'supplier' or l.supplier_id::text = any (public.an_arr(p_filters, 'supplier')))
    and (not p_filters ? 'business_unit' or l.business_unit = any (public.an_arr(p_filters, 'business_unit')))
    and (not p_filters ? 'product' or l.product_key = any (public.an_arr(p_filters, 'product')))
    and (not p_filters ? 'location' or cc.location = any (public.an_arr(p_filters, 'location')))
    and (not p_filters ? 'origin' or l.origin = any (public.an_arr(p_filters, 'origin')))
    and (not p_filters ? 'line' or a.pl_line = any (public.an_arr(p_filters, 'line')))
    and (not p_filters ? 'section' or a.section = any (public.an_arr(p_filters, 'section')))
  group by 1, 2, 3, 4, 5;
$$;

grant execute on function public.ri_movement_totals, public.ri_arr_at, public.ri_retention, public.ri_cohort_matrix, public.ri_customer_list,
  public.ri_movement_customers, public.ci_ledger_totals, public.an_restate_cohort, public.an_new_definition_version to authenticated;
grant execute on all functions in schema app to authenticated, service_role;

-- Which data domains the caller may read for a company (for the interface only; every
-- query is independently checked by RLS).
create or replace function public.an_my_domains(p_company uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array(select d from unnest(array['revenue', 'cost', 'people', 'transactions']) d where app.can_read_domain(p_company, d));
$$;
grant execute on function public.an_my_domains to authenticated;
