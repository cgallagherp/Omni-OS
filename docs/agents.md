# Agentic execution layer

Five agents work inside the operating system — not beside it. They read the same North Star, Flight Plan, Crew and Mission Control records as people do, act only within the authority management delegates, and leave an auditable record of what they found, what they did, what needs a decision, and what happened as a result.

| Agent | Remit | Workflow (`src/lib/agents/workflows`) | Trigger |
|---|---|---|---|
| Execution | Follow-through on agreed commitments | `execution.overdue_action`: detect → context and dependencies → follow up the owner → capture the reply → propose a revised date (approval) → escalate an unresolved blocker → monitor to completion | Any open action passing its due date (change signal + every 15 min) |
| CEO | Strategic performance and orchestration | `ceo.kpi_deviation`: read the KPI against the North Star and Flight Plan → findings, hypotheses, missing evidence → commission the Commercial Agent for commercial KPIs → propose an issue + agreed corrective action (approval) → apply → monitor recovery weekly | Key or scorecard KPI off track two reported periods running (28-day cooldown per KPI) |
| Commercial | Pipeline, conversion, retention from the company's own CRM | `commercial.pipeline_review`: read CRM → stalled/slipped deals, segment, conversion, cycle, source → create follow-up tasks in the CRM (within authority) → measure task completion and re-engagement | Weekly when a CRM is connected; or commissioned by the CEO Agent |
| M&A | Advance the approved acquisition thesis | `ma.sourcing`: search authorised sources → dedupe against the pipeline including rejected companies → transparent fit score (unknown financials stay unknown) → add the shortlist → prepare approaches for approval → hand approved drafts to the deal lead | Weekly per approved thesis |
| M&A Integration | Post-acquisition integration from the company's own knowledge | `integration.generate_playbook` / `generate_plan` (drafts for management approval) · `integration.activity_watch`: overdue, dependency-at-risk, approval and unverified-completion cases → follow up → capture the reply → propose a date change and Mission Control escalation (approval) → track corrective actions to verified completion · `integration.synergy` · `integration.weekly_status` · `integration.review` (playbook change proposals) | Queued by a person (generation, review); change signals on activities, actions and synergy results; daily/weekly/monthly schedules. See `docs/integration.md` |

People can also ask for any of these from the Agent Control Centre ("Ask to investigate"); dedupe keys match the automatic triggers so a manual request never duplicates a case in hand.

## How it fits together

```
 change signals (triggers on actions, metric_values, priorities, issues, agent_messages, agent_approvals)
        │                        schedules (detectors)
        ▼                               ▼
  processSignals ──► wake waiting runs   runDetectors ──► openInvestigation (dedupe key)
                                                              │
                        claim_agent_runs (FOR UPDATE SKIP LOCKED, leases)
                                                              ▼
                     executeRun: step → checkpoint → step …  (agent_runs.step/state)
                              │ tools (registry-checked, validated, ledgered)
                              ▼
        RLS-scoped reads as the agent principal · security-definer functions for every write
```

* **Agent principal.** Each company has one agent identity (`profiles.is_agent`, membership role `agent`). The worker mints a short-lived JWT for it, so every agent query goes through the same RLS as a user: one company, no Omni-only data, no service role. The role is excluded from `app.can_write`, so agents are read-only on management records. Nobody can grant or take the agent role (`membership_guard`, `profile_guard`).
* **Writes go through the database's authority check.** `agent_apply_approval`, `agent_create_action`, `agent_crm_create_task`, `agent_add_ma_target`, `agent_set_ma_stage`, `agent_mark_executed` and the `agent_message_guard` trigger each re-check `app.agent_mode(company, agent, category)` or a specific approved proposal at the moment of execution. The model/playbook cannot construct a query that bypasses this — it only calls registered tools, and the tools only call these functions.
* **Durable engine.** `agent_runs` is a Postgres queue. A run is a step machine; state is checkpointed after every step; waits set `run_after`; a crashed worker's lease expires and the run resumes from its last step. Side effects go through `rt.once(key, …)` (`agent_side_effects`): a completed effect is never repeated, an interrupted one is reconciled (or marked *uncertain* for a person to check, never blindly retried). Retries back off exponentially; `max_attempts` then *failed*, visible in the Control Centre.
* **Ledger.** `agent_events` is append-only: trigger, context, finding, tool call, proposal, approval, message, response, escalation, delegation, outcome, monitoring, error, config. Findings carry source references back to the records. No hidden reasoning is stored or shown — each case gives the decision summary, the evidence and the tool results.
* **Investigations are intervention records**: trigger, baseline, findings, proposal, approval, actions, dates, expected outcome, measured outcome, status, next review. Outcomes separate *activity* (messages, tasks) from *results* (completed, recovered), and recovery is recorded, not attributed.

## Authority

| Level | Meaning | Categories |
|---|---|---|
| 1 Observe · 2 Investigate | Read, research, record findings | `record_findings` |
| 3 Recommend | Proposals for management | (every proposal) |
| 4 Act internally | Within configured limits | `internal_followup`, `internal_task`, `escalation`, `crm_enrich`, `pipeline_update` |
| 5 Approval required | Always a specific approval | `propose_issue`, `commitment_change`, `material_crm_change`, `external_communication` — and `commercial_terms`, which is off and cannot be enabled |

* New companies start with every agent **off** and every Level 4 category at *approval*. Level 5 can never be set to automatic (`agent_config_guard` refuses it; the UI does not offer it).
* An approval authorises exactly one proposal. The payload is hashed at creation (`payload_hash`) and cannot be edited; only the configured approver role can decide (`app.can_decide`); the approver's role is re-checked when the agent executes (`app.can_decide_as`); preconditions (e.g. the action's current due date and status) are re-checked and a changed record makes the proposal *stale*, not applied.
* Only company administrators (and Omni) configure agents; every change is audited with a before/after diff. An administrator can configure only their own company's agents, and an agent's reach is fixed by its principal — one company's records, never Omni-only data — so configuration can narrow an agent but never give it more scope than the company's own administrators have. Connections in a configuration must belong to the same company.
* External approaches are **never sent by an agent**. Approval hands the approved draft to the accountable person as a Mission Control action; they send it themselves.
* Agents never change an agreed priority, deadline or owner without an approved proposal, never commit a company to a transaction, never alter commercial terms, never generate assessments of named individuals (owner breakdowns are pipeline facts only).
* Content from CRMs, sources, documents and emails is data. Agents run deterministic playbooks; nothing retrieved can change their tools, authority or recipients. No external AI provider is called by the agents today (`allow_external_ai` is stored per agent for when drafting is added, and defaults to off).

## Connections

Configured per company in **Agents → Configuration** (admins). Credentials are AES-256-GCM encrypted with `AGENTS_ENCRYPTION_KEY` before they reach the database; `integration_secrets` has no read policy, and only the worker decrypts them. Each agent may use only connections explicitly allowed in its configuration. Access to a system's data never implies authority to change it.

| Provider | Status |
|---|---|
| Omni OS inbox | Built in; the default internal channel. Recipients reply in **Agent requests**. |
| Email (Resend), Microsoft Outlook (Graph) | Implemented; **not exercised** (no credentials here). Sandbox mode records what would be sent. |
| Sandbox CRM | Fictional Clinara data in Omni OS, for evaluation. |
| HubSpot | Official CRM v3 API (deal search, task create, task batch read); **untested** against a live portal. Sandbox mode never writes. |
| Sandbox market-intelligence dataset | Fictional Kestrel data. |
| Companies House | Official public-data API (advanced search); **untested** without a key. Holds no revenue/EBITDA, so financials stay unknown. |
| Microsoft Teams, Salesforce | Listed for configuration; no connector yet. |

No scraping, no private interfaces.

## Running it

```bash
npm run agents:worker     # long-running; a tick every AGENT_TICK_SECONDS (default 30)
npm run agents:tick       # one tick and exit (cron-friendly)
npm run agents:eval       # scenario checks + operating-quality report per company
```

The worker uses the service role only to claim runs, mint agent tokens and decrypt credentials; all company reads and writes are made as the agent principal. Deploy it as a separate long-running process (or a scheduled `agents:tick`) next to the web app; it is safe to run several — claims use `SKIP LOCKED` and leases.

## Where it shows up

* **Agent Control Centre** (`/c/[slug]/agents`, leadership only): overview, agent detail with outcome measures, investigations (the four questions + timeline, `?tools=1` for tool calls), approval queue (approve / request changes / reject, with exactly what will happen), searchable activity, configuration and connections.
* **Agent requests** (`/c/[slug]/inbox`): follow-ups and escalations addressed to the signed-in person.
* **Mission Control**: an *Agents* panel on the hub; "investigation underway" on KPI pages; "Agent following up" on overdue actions; agent evidence in meeting preparation and live meetings; an agent summary in the quarterly offsite (Stage 7).
* **Monday scorecard**: unchanged. Agent proposals never appear on it; only corrective actions management has approved (which are ordinary actions) do.

## Tests

* `tests/integration/agents-execution.test.ts` — Execution end to end (detect, follow up, reply, propose, approve, apply, monitor, resolve), approval gating, tenant isolation, authority caps, append-only ledger, crash-after-send recovery and lease expiry; CEO (KPI → proposal → scorecard unchanged until approval → apply → recovery recorded); Commercial (analysis, CEO delegation joins the case, exactly the approved tasks created once, follow-through measured); M&A (dedupe, rejected/excluded/out-of-region, unknown financials, approaches blocked until approval, hand-off to the deal lead, rejection respected).
* `tests/unit/agents.test.ts` — authority caps and the pure analysis modules.
* `tests/e2e/z-agents.spec.ts` — inbox reply and approval queue in a browser with a real worker.
* M&A Integration Agent: `tests/integration/integration-agent.test.ts`, `tests/unit/integration.test.ts`, `tests/e2e/z-integration.spec.ts` (see `docs/integration.md`).

## Financial variance (Revenue & Cost Intelligence)

The CEO Agent's `ceo.financial_variance` workflow is triggered by the `financialVariance` detector (high/critical exceptions from `src/lib/analytics/exceptions.ts`, at most two a day per company) or by **Investigate** on an exception. Revenue questions are delegated to the Commercial Agent's `commercial.retention_review` (segment attribution, contraction and churn customers, CRM context; may propose internal CRM renewal tasks for approval); cost questions use `analytics.cost_drivers`. The outcome is one proposed Mission Control issue with up to three corrective actions carrying `analytics_ref`, then weekly monitoring until the exception clears. Agents read governed data only within `agent_configs.data_domains`; they never cancel contracts, change suppliers, cut headcount, commit spend or contact customers. See `docs/intelligence.md`.

## Known limitations

* Agent workflows are deterministic; the only LLM use is the Integration Agent's playbook/plan/review drafting (Claude, opt-in per company, falling back to a labelled rule-based extractor) whose output is schema-validated and citation-checked before management sees it. Messages and proposals are templated from the evidence.
* Email/Outlook, HubSpot and Companies House connectors are implemented against official APIs but untested without credentials. OAuth flows are not built: admins paste an access token. Token refresh is not handled.
* Delegation joins an existing specialist case; a case has one parent.
* The CEO Agent's materiality rule (two consecutive off-track periods, or more than 10% adverse) and the Commercial staleness threshold (21 days) are fixed, not configurable.
* Worker scheduling granularity is the tick interval; detectors run every 15 minutes per company or when a change signal arrives.
