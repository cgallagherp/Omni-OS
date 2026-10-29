# Revenue & Cost Intelligence

Two native Omni OS modules in the **Intelligence** navigation group. They are analytics inside the operating system, not a new pillar: they explain *why* revenue, retention, cost and margin moved, and they feed Mission Control and the agents. Rhythm and the Monday scorecard are unchanged.

```
operational systems (billing, CRM, ERP, HRIS) → Snowflake → dbt models → Omni OS adapter → modules, Mission Control, agents
```

Snowflake and dbt are not connected yet. Each company has an `an_sources` row that names its adapter:

- `synthetic`: governed-layer tables (`an_*`, `ri_*`, `ci_*`) in Postgres, loaded by the seed. This stands in for the dbt sync. Every figure carries a "Synthetic" label, and synthetic data is never labelled *Validated*.
- `warehouse`: `WarehouseSource`. Every method throws `SourceUnavailable`, so no data is invented. Implementing it against the contracts in [`intelligence-data-contracts.md`](intelligence-data-contracts.md) is the only change needed to go live. The UI, agents and Mission Control call only the `AnalyticsSource` interface (`src/lib/analytics/source.ts`).

## Implementation checklist

| Area | Status |
| --- | --- |
| Governed-layer schema, read-only to the application, tenant-isolated, domain-scoped RLS | Done (`20261030000001_intelligence.sql`) |
| Versioned metric definitions, with service-business overrides and comparability groups | Done (`definitions.ts`, `an_metric_definitions`, `an_new_definition_version`) |
| Deterministic reference calculations in integer pence | Done (`calc/revenue.ts`, `calc/cost.ts`) |
| SQL query interface (security definer, one domain check per call) that matches the reference exactly | Done; integration-tested |
| Synthetic adapter and warehouse adapter stub | Done |
| Synthetic company Civicline (public-sector SaaS, 48 months) and Ashworth services profile | Done (`scripts/seed/intelligence`) |
| Revenue overview, ARR bridge, retention, cohorts, segments, customers, quality, definitions | Done |
| Cost overview, trends, analysis to transaction level, suppliers, GP/EBITDA bridges, people (aggregated), quality, definitions | Done |
| Provenance on every metric, data status, synthetic labelling, export with audit log, saved views, chart/table toggle | Done |
| Exceptions engine shared by the UI, Mission Control and the CEO Agent | Done (`exceptions.ts`) |
| Mission Control links in both directions (`analytics_ref` on issues and actions) | Done |
| CEO Agent financial-variance workflow; Commercial Agent retention review; agent data domains | Done |
| Portfolio comparison only where definitions match | Done |
| Domain grants and agent domains in Settings | Done |
| Unit, integration and e2e tests | Done (`tests/unit/intelligence.test.ts`, `tests/integration/intelligence.test.ts`, `tests/e2e/z-intelligence.spec.ts`) |

## Modules

**Revenue Intelligence** (`/c/[slug]/revenue`):

- **Overview:** ARR, organic growth, GRR, NRR, new, expansion, contraction, churn, reactivation, acquired and revenue vs budget, with trends.
- **ARR bridge:** a waterfall over month, quarter, YTD, LTM or financial year. Every bar drills to the customers behind it, with segment and history tables, a reconciliation panel and CSV export.
- **Retention:** GRR and NRR over 1-, 3- or 12-month windows, by product, BU, segment, size band, sector, cohort and any `attr:` dimension.
- **Cohorts:** revenue and logo retention heatmaps by quarter or year, with fixed membership. Each cell drills to its members.
- **Segments**, **customers** and **customer detail:** contracts, CRM account and opportunities, movements, and linked Mission Control records. A missing date shows as "Not recorded"; dates are never inferred.
- **Data quality:** contractual ARR vs invoiced vs recognised revenue, explained differences, period status, closes and restatements.
- **Definitions:** each definition's versions and the retention policy form. Administrators get a new version; nothing is overwritten.

**Cost Intelligence** (`/c/[slug]/cost`):

- **Overview:** costs, GP, GM, EBITDA and margins vs budget, forecast and prior period; fixed vs variable; cost growth vs revenue growth; exceptions.
- **Trends.**
- **Analysis:** by P&L line, department, cost centre, account, supplier, product, BU or origin. Drills to a 24-month trend, then a second dimension, then transactions (transactions need the `transactions` domain).
- **Suppliers:** concentration and increases.
- **Bridges:** GP by line, or volume/mix/rate when exact; EBITDA with acquisitions and disposals separated.
- **People:** department aggregates only, with revenue per FTE.
- **Data quality** and **definitions.**

Every page has period controls, whitelisted filters, provenance, a data-status badge and export.

## Rules the code enforces

1. **One source of truth.** Pages, agents, Mission Control and the portfolio all go through `AnalyticsSource` and the services in `revenue-service.ts` and `cost-service.ts`. Status and exception logic lives once, in `exceptions.ts`.
2. **Reconciliation is exact or visibly failed.** Opening + movements = closing in pence. An unknown reason code is shown as *unclassified* and marks the period incomplete; it is never reallocated. Nothing is adjusted silently.
3. **Movement classification** is by rule:
   - A reason code from billing decides the type: migration, transfer, correction, reclassification, acquisition or disposal.
   - Otherwise the customer's total decides: from zero to positive is new, or reactivation if the customer had ARR before; to zero is churn; any other change is expansion or contraction.
   - At customer grain, expansion, contraction and product migration are netted per customer-month. Product grain applies when products are grouped or filtered.
4. **Retention** is movement-based over the opening cohort.
   - `GRR = (O + contraction + churn [+ transfers if count_as_churn]) / O`, capped at 100% by construction.
   - `NRR = (O + expansion + contraction + churn [+ reactivation]) / O`.
   - New customers are excluded. Acquired customers join after `acquired_wait_months`. Customers disposed of in the window are excluded. Corrections never count as retention movements.
5. **Cohorts** are assigned once (`ri_cohorts`). A trigger blocks updates unless the change goes through `an_restate_cohort`, which records the reason, the previous value and the new value in the immutable `an_restatements`.
6. **Cost bridges never double count.**
   - The GP bridge by line is always exact.
   - The volume/mix/rate bridge is available only when every product has revenue in both periods and every direct cost is allocated. Otherwise it says why it is unavailable.
   - Price effects are always unavailable, because price × volume data does not exist. No artificial price-volume-mix is produced.
   - The EBITDA bridge separates organic movements from acquisitions and disposals by ledger origin.
7. **Provenance** on every metric shows the definition and version, period, unit, source, refresh time, validation status, calculation version (`omni-ref-2026.10.1`) and a drill-down.
8. **People data is aggregated** by department and month: headcount, FTE, employment cost, hires, leavers and open roles. There are no individual records, pay or assessments (CLAUDE.md rule 8).

## Permissions

| Who | Domains |
| --- | --- |
| CEO, company admin, platform admin | revenue, cost, people, transactions |
| Assigned Omni staff | revenue, cost, people; transactions only if granted |
| Executives, observers | only what `an_grants` gives them (Settings → Revenue and Cost Intelligence access) |
| An agent | only its own `agent_configs.data_domains`, identified by the `agent_key` claim in its JWT |

RLS on every governed table checks the domain. The big tables use an init-plan (`company_id = any ((select app.domain_companies('revenue'))::uuid[])`), so the check runs once per statement. The query functions are `security definer` and check the domain once per call.

The application has no write policies on governed tables. Exports are allowed only for a readable domain, and each one is logged in `an_exports`. A CSV of synthetic data starts with a synthetic notice, and formulas are neutralised.

## Mission Control and agents

**Raising issues.** "Raise issue" on any exception creates an issue (and optionally an agreed corrective action) through `raiseAnalyticsIssue`. The issue carries `analytics_ref`: module, key, period, label, values and an `href` back to the evidence. The issue page and the action list show a link back. Mission Control lists high and critical financial exceptions, and shows "Issue raised →" once one exists.

**Scorecard.** The Monday scorecard is unchanged. KPIs bound with `metrics.analytics_metric_key` take values from the governed source, and `kpiExceptions` defers to the analytics exceptions for them, so nothing is double-raised.

**CEO Agent** (`ceo.financial_variance`):

1. Triggered daily by the `financialVariance` detector for high and critical exceptions, or by a person pressing **Investigate**.
2. Recomputes the exception and reads the strategic context.
3. Delegates revenue questions to the Commercial Agent (`commercial.retention_review`), which runs segment attribution, names the contraction and churn customers, and gives the CRM context. For cost questions it analyses cost drivers itself.
4. Proposes one Mission Control issue with up to three corrective actions (Level 4, needs approval). The `link_analytics_ref` trigger stamps the reference on the records when the proposal executes.
5. Monitors weekly until the exception clears or 120 days pass.

**Findings** are labelled confirmed, hypothesis or missing, with sources.

**What agents never do:** cancel contracts, change suppliers, cut headcount, commit spend, contact customers or change commercial terms. The Commercial Agent may only propose internal CRM renewal tasks, and those are approval-gated.

## Portfolio

`/portfolio` shows revenue growth, gross margin, EBITDA margin, EBITDA vs budget, GRR, NRR and revenue per FTE for companies with a governed source. A metric is compared only when every company reporting it shares the definition's `comparability_group`. Otherwise each value is shown in italics as "<definition>, not comparable". For example, Ashworth uses contract-value retention for a services business. The portfolio view is always Omni-branded.

## Demo

`npm run db:reset`, then sign in (password `OmniDemo!2026`) as:

- `hannah@civicline.demo`: CEO, every domain.
- `marcus.o@civicline.demo`: CFO, including transactions.
- `sophie@civicline.demo`: CRO, revenue only.
- `ruth@civicline.demo`: Chair and observer, no analytics.
- `priya@omni.demo`: Omni, across the portfolio.

The Civicline story:

- NRR has declined to about 100% over the last year, driven by police forces and housing associations; the CEO Agent raises an NRR-decline exception.
- Gross margin is about 76% against a 79.8% budget, because hosting is growing faster than ARR.
- The Evidence Vault acquisition is shown as inorganic.
- The Schools disposal is excluded from retention.

Run `npm run agents:tick` to have the CEO Agent open investigations and the Commercial Agent attribute the retention decline.

## Limitations (honest scope)

- **Data:** all data is synthetic. The warehouse adapter is a stub, and no Snowflake or dbt connection has been exercised.
- **Currency:** single currency (GBP), with no FX translation.
- **Calendar:** periods are calendar months with a fiscal-year start month. 4-4-5 calendars and bank holidays are not modelled.
- **Pricing:** price effects are unavailable until billing provides units and unit prices.
- **Generated names:** the synthetic place-name generator can produce names that match real places (for example "Margate"). Customers and suppliers are still fictional.
- **CRM:** CRM context comes from the sandbox CRM connection. HubSpot is supported through the existing connector but untested without credentials.
