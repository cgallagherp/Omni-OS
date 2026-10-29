# Intelligence data contracts (Snowflake / dbt → Omni OS)

These are the contracts the governed warehouse must satisfy so that `WarehouseSource` can replace the synthetic adapter without changing any module, agent or test. The synthetic tables in Postgres implement exactly these shapes (`supabase/migrations/20261030000001_intelligence.sql`, `src/lib/analytics/contracts.ts`).

Conventions:

- One schema per company, or a `company_id` column on every model.
- Months are the first day of the month (`date`).
- Amounts are `numeric(18,2)` in the reporting currency.
- Every model records `calc_version` and `refreshed_at`.

## 1. Source entities (operational systems → staging)

| Source | Entity | Used for |
| --- | --- | --- |
| Billing / subscription | subscriptions, subscription lines, amendments (with reason codes), invoices | ARR snapshots, movements, invoiced recurring |
| CRM | accounts, opportunities, owners | customer attributes, `crm_id`, renewal pipeline |
| Contract repository | contracts (start, end, renewal date, term, annual value) | contracts, renewal dates — null when not recorded, never inferred |
| ERP / GL | journal lines, chart of accounts, cost centres, suppliers | ledger, transactions |
| Budget / forecast | plan by account × cost centre × month | ledger scenarios, targets |
| HRIS (aggregated) | headcount, FTE, employment cost, hires, leavers, open roles by department × month | people — aggregated only, no individual rows |

## 2. Models, grain and keys

| dbt model | Omni table | Grain / primary key | Required columns |
| --- | --- | --- | --- |
| `dim_product` | `ri_products` | company × product_key | name, business_unit, family |
| `dim_customer` | `ri_customers` | company × customer id (stable UUID or surrogate) | external_id, crm_id, name, segment, sector, geography, size_band, business_unit, contract_type, origin (`organic`/`acquired`), origin_label, acquired_on, disposed_on, first_arr_month, account_owner, attributes (json) |
| `fct_arr_monthly` | `ri_arr_monthly` | company × month × customer × product | arr, currency, change_reason (billing reason code or null), source_ref |
| `fct_arr_movements` | `ri_movements` | company × month × customer × product × type | type (see §3), amount (signed), rule_key, calc_version |
| `fct_contracts` | `ri_contracts` | contract_ref | customer_id, product_key, start_date, end_date, renewal_date, term_months, annual_value, status, source_system |
| `dim_cohort` | `ri_cohorts` | company × customer | cohort_month (first month with ARR > 0, assigned once), attributes at assignment |
| `fct_revenue_reconciliation` | `ri_finance_recon` | company × month | contractual_arr, invoiced_recurring_annualised, recognised_recurring_revenue, recognised_total_revenue, explained_difference, explanation, status |
| `dim_account` | `ci_accounts` | company × account code | name, section (`revenue`/`cogs`/`opex`/`below_ebitda`), pl_line, behaviour (`fixed`/`variable`/`semi`), controllable |
| `dim_cost_centre` | `ci_cost_centres` | company × code | name, department, function, business_unit, location |
| `dim_supplier` | `ci_suppliers` | supplier id | name, category, origin, contract_end |
| `fct_gl_monthly` | `ci_ledger` | company × month × scenario × account × cost centre × supplier × product × BU × origin | amount (costs positive, revenue positive) |
| `fct_gl_transactions` | `ci_transactions` | transaction id | posted_on, month, account_code, cost_centre_code, supplier_id, reference, description, amount, source_system |
| `fct_headcount_monthly` | `ci_people` | company × month × scenario × department | headcount, fte, employment_cost, hires, leavers, open_roles |
| `fct_targets` | `an_targets` | company × domain × metric × month × scenario | value |
| `meta_datasets` | `an_datasets` | company × dataset key | domain, label, source_system, model, calc_version, refreshed_at, coverage_start, coverage_end, row_count, status |
| `meta_period_status` | `an_period_status` | company × domain × month | status (`validated`/`provisional`/`incomplete`), reason, validated_by |
| `meta_dq_results` | `an_dq_results` | company × domain × check × month | see §5 |
| `meta_period_closes` | `an_period_closes` | company × domain × month × version | metrics (json), calc_version — append-only |
| `meta_restatements` | `an_restatements` | id | domain, month, subject, reason, previous, current, approved_by — append-only |

## 3. Definitions and classification rules

Metric definitions live in `an_metric_definitions` (key, version, definition, formula, grain, policy, comparability group, source dataset). The defaults are in `src/lib/analytics/definitions.ts`. dbt must use the active version and stamp `calc_version`.

**Movement types** are new, expansion, contraction, churn, reactivation, acquired, disposed, transfer, migration, correction, reclassification and unclassified.

Classification is applied in order. The first matching rule wins.

1. A billing reason code maps directly:

   | Reason code | Movement type |
   | --- | --- |
   | `migration` | migration |
   | `transfer` | transfer |
   | `correction` | correction |
   | `reclassification` | reclassification |
   | `acquisition` | acquired |
   | `disposal` | disposed |

   Any other non-null code is classified as **unclassified**. The period is marked incomplete and the ARR is not reallocated.
2. With no reason code, compare the customer's total ARR across all products with the previous month:
   - from 0 to more than 0: **new**, or **reactivation** if the customer had ARR in any earlier month;
   - from more than 0 to 0: **churn**;
   - any other change: **expansion** or **contraction** by product line.
3. At customer grain, expansion, contraction and migration are netted per customer × month. Product grain is used only when products are grouped or filtered.

**Retention** is calculated over the window `start → end`, for the cohort of customers holding ARR at `start`.

| Measure | Formula |
| --- | --- |
| GRR | (O + contraction + churn [+ transfer if `count_as_churn`]) / O |
| NRR | (O + expansion + contraction + churn [+ reactivation if `include_in_nrr`] [+ transfer if `count_as_churn`]) / O |

The cohort excludes:

- customers that are new in the window;
- acquired customers with `acquired_on` later than `start − acquired_wait_months`;
- customers disposed of within the window.

Corrections and reclassifications are never retention movements.

The policy (`retentionPolicy` in `contracts.ts`) sets `window_months` (default 12), `acquired_wait_months` (12), `reactivation`, `transfers` and `adjustments`.

**Cost:** gross profit = revenue − COGS. EBITDA = gross profit − opex. A variance is favourable when actual cost is below the comparison (or actual income above it). Budget and forecast use the same account and cost-centre grain as actuals.

## 4. Reconciliation rules (tests in dbt and in Omni OS)

- **ARR bridge:** for every month and every filter, opening + Σ movements = closing, to the penny. A failure is reported, never adjusted.
- **Movements vs snapshots:** Σ movements for (customer, month) = ARR(month) − ARR(month − 1).
- **ARR vs invoiced vs recognised:** the differences are explained in `ri_finance_recon.explained_difference` and `explanation`. An unexplained difference sets the period status to provisional.
- **GL:** ledger actuals per month equal the trial balance. Transactions summed by account × cost centre × month equal the ledger.
- **People vs ledger:** employment cost in `ci_people` agrees with the people accounts in the ledger, within tolerance.
- **Cohorts:** a cohort month never changes except through a recorded restatement.

## 5. Data-quality checks (`an_dq_results`)

Each check row records domain, check_key, title, severity, status (`pass`/`warn`/`fail`), month, affected_count, amount, sample, source_system, owner_function and remediation.

The required check keys are:

| Check key | What it checks |
| --- | --- |
| `bridge_reconciles` | the ARR bridge reconciles |
| `unclassified_movements` | movements with an unknown reason code |
| `arr_vs_invoiced` | contractual ARR agrees with invoiced recurring revenue |
| `missing_crm_id` | customers without a CRM id |
| `missing_renewal_date` | contracts without a renewal date |
| `duplicate_customers` | duplicate customer records |
| `inconsistent_sector` | customers whose sector is inconsistent |
| `accounts_mapped` | every account is mapped to a P&L line |
| `budget_coverage` | budget covers the period |
| `people_ledger_agreement` | people cost agrees with the ledger |
| `latest_month_close` | the latest month has been closed |
| `restatement` | restatements recorded |

## 6. Refresh

- dbt runs after the nightly billing, CRM and ERP loads, and writes `meta_datasets.refreshed_at`.
- Month-end close freezes a version in `meta_period_closes`.
- A later change to a closed month needs a restatement row. Omni OS shows *validated* only for months whose status is validated.
- On sync, the adapter reads the models through a read-only Snowflake role scoped to the company. Credentials sit server-side in `an_sources.config` (a secret reference) and are never in the browser.

## 7. Query interface the adapter must provide

`AnalyticsSource` (`src/lib/analytics/source.ts`) is the contract.

Each method below must return the same rows as the reference SQL functions (`ri_movement_totals`, `ri_arr_at`, `ri_retention`, `ri_cohort_matrix`, `ri_customer_list`, `ri_movement_customers`, `ci_ledger_totals`):

| Method | Purpose |
| --- | --- |
| `arrAt(months, filters, group)` | ARR at given months |
| `movements(from, to, filters, group)` | movement totals over a range |
| `retention(start, end, filters, group, wait)` | retention inputs |
| `cohorts(last, cohort, dimension, filters, age)` | cohort matrix |
| `customers(...)` | customer list |
| `movementCustomers(...)` | the customers behind a movement |
| `customer(id)` | customer detail |
| `cohortMembers(...)` | members of a cohort cell |
| `reconciliation()` | reconciliation rows |
| `dataQuality()` | data-quality results |
| `restatements()` | restatements |
| `closes()` | period closes |
| `ledger(from, to, scenarios, group, filters)` | ledger totals |
| `accounts()`, `costCentres()`, `suppliers()` | cost dimensions |
| `people(from, to)` | aggregated people data |
| `transactions(...)` | transactions |
| `definitions()`, `definitionHistory(key)` | metric definitions and their versions |
| `dimensions()`, `datasets()`, `periodStatus()`, `targets()`, `domains()` | metadata |

Filters are whitelisted dimension keys (`f_<dim>`; `attr:<key>` for custom attributes). They are never free SQL.

## 8. Permissions

- The Snowflake role is read-only and scoped to one company.
- Omni OS applies its own domain checks before calling the adapter (`an_my_domains`) and records exports. An agent's adapter is constructed with the agent's domains.
- People data arrives already aggregated by department, and transactions are exposed only to the `transactions` domain.

## 9. Acceptance tests for a warehouse cut-over

1. Run `tests/integration/intelligence.test.ts` with the warehouse adapter. The SQL vs reference checks (bridge per type, GRR and NRR) must pass to 1e-10.
2. On the same month range, the bridge, GRR, NRR, gross margin and EBITDA must equal the previously synthetic, or the client's own validated, figures.
3. No data-quality check of severity `error` may be in status `fail` for any month shown as validated.
4. The cross-tenant and domain-permission tests must pass unchanged.
5. `/c/[slug]/revenue/quality` must show the warehouse source with `is_synthetic = false`, and the "Synthetic" labels must disappear.
