# M&A Integration Agent

The M&A Integration Agent (`agent_key = integration`) takes over after an acquisition completes. It is separate from the M&A sourcing agent (`ma`), which works on targets *before* a deal. Its loop:

```
connect knowledge → generate master playbook → management approval → acquisition-specific plan → management approval
      → execute and monitor (milestones, dependencies, criteria, approvals, evidence) → synergies → review → playbook change proposals → approval
```

Everything is in the **Integrations** module (`/c/[slug]/integrations`, under *M&A* in the navigation, leadership only). It uses the company's branding, and all its data is tenant-scoped under the standard rules (CLAUDE.md rule 1).

## 1. Knowledge

The **Integrations → Knowledge** page holds source material. Uploads can be PDF, Word, PowerPoint, Excel, Markdown or text, up to 15 MB each. Files can also be imported from **SharePoint, OneDrive or Google Drive** through a connection set up in the Agent Control Centre.

Nothing is ingested automatically. A person picks the files or folders to import, and then picks again which documents feed each generation.

- **Extraction.** `src/lib/integration/extract.ts` uses `unpdf` for PDF and the document XML via `jszip` for Office files. It keeps headings, lists and table rows, then cuts the text into ~1,200-character chunks that remember their section heading (`knowledge_chunks`, with full-text search).
  - Legacy `.doc`/`.ppt`/`.xls` and images are refused with a reason.
  - Duplicates are detected by SHA-256 hash.
- **Access.** Each source has a type (playbook, previous plan, checklist, post-acquisition review, lessons learned, strategy…) and a *restricted* flag. Restricted material is readable only by company admins (`app.can_read_knowledge`). The agent never reads it unless an admin includes it in a run.
- **Untrusted content.** Document text is passed to the generator as numbered data passages. The system prompt (`UNTRUSTED` in `claude.ts`) tells it never to follow instructions found inside them. Its output is then checked by schema and grounding before anything is stored.

## 2. Master playbooks

**Generate Playbook with AI** queues an `integration.generate_playbook` case for the agent and opens the draft, which updates when the case finishes. The result is **structured data, not a document**, validated by `playbookContent` in `src/lib/integration/schema.ts`. It contains:

- philosophy, acquisition types and "when to use" rules
- workstreams, each holding activities with:
  - an accountable function
  - timing relative to completion (pre-completion, Day 1, days, weeks or months after, or ongoing — never forced into fixed phases)
  - milestone and critical-path flags
  - completion criteria and the evidence required
  - required approvals
  - dependencies
- risks, KPIs, synergy rules, lessons, **conflicts** and **gaps** (questions for management)

Each item has a **basis**, shown as a badge:

| Basis | Meaning |
|---|---|
| Established requirement | Written company policy, or consistent practice across at least three previous integrations |
| Inferred practice | Seen in previous integrations, but not written down or not consistent |
| AI recommendation | Not company practice. It needs an explicit accept or reject, and is never cited as evidence |

**Grounding** (`grounding.ts`). Every citation must point at a chunk that was actually supplied, and its quote must appear in that chunk. A normalised substring match counts, as does a match on 85% or more of the quote's tokens in order.

An item that fails this check is demoted to *AI recommendation*, and the number of rejected citations is shown on the draft. Every established or inferred item therefore links back to its source passage.

**Generators**

- **Claude** (`claude.ts`, `generate-playbook.ts`) runs only when the company has allowed external AI for the agent (`agent_configs.allow_external_ai`) *and* `ANTHROPIC_API_KEY` is set.
  - It uses the official SDK with structured output (`zodOutputFormat`), streaming, and the configured model.
  - Passages are numbered `P1…Pn`, and the model cites those ids.
  - A refusal or invalid output fails the case visibly and stores nothing.
- **Rule-based extractor** (`analyse-rules.ts`) is the fallback, and is labelled as such on the draft and in the case summary.
  - It reads document structure: workstream headings, timed list items, table rows.
  - It clusters equivalent activities across documents and derives the basis from the source types.
  - It detects timing conflicts between sources and with documented lessons.
  - It marks activities that ran late in more than one integration as critical.
  - It adds a small set of clearly labelled recommendations.

**Whatever the generator says**, the `humanOnly` rules flag the following as work only a person may do (`schema.ts`):

- employment decisions
- contract changes
- spending commitments
- supplier cancellations
- production data migrations or deletions
- regulated procedures
- legally binding commitments
- external disclosure

**Editing and approval** (`playbook-editor.tsx`). Management can edit everything on the draft:

- workstreams, activities, timing, dependencies, functions, approvals, criteria and evidence
- why each item is included
- accept or reject recommendations
- resolve conflicts, either by adopting a position or writing a resolution
- answer gaps

Drafts are saved with an optimistic-concurrency check. `approve_playbook` (an admin-only SECURITY DEFINER function) requires:

- at least one workstream
- every conflict resolved
- every recommendation decided

Approval freezes the version, records the approver and note, and supersedes the previous approved version in the same lineage. Approved versions are immutable (`playbook_guard`). **Revise** opens a new draft version, and the agent can only *propose* changes (§6).

A company can keep **several playbooks**, for example full integration versus a retained brand, each with "when to use" rules and acquisition types. For each acquisition, `recommendPlaybook` suggests one and states its reason.

## 3. Acquisitions and plans

An **acquisition** records:

- completion date, rationale, objectives, operating and integration model
- expected synergies, key risks and diligence findings
- commitments (earn-out, TSA, no redundancies…)
- systems and organisation notes
- sponsor and integration leader, chosen from the Crew

The M&A Agent's targets can be **handed over** from the M&A Agent page through an explicit action, which copies only the fields the person chooses. Confidential deal data is never copied automatically.

**Generate Integration Plan** (`generate-plan.ts`) adapts the approved playbook to the acquisition. Examples of what the rules change:

- **Retained brand or systems** removes the brand-merger and product/system migration work, and records why.
- **Diligence findings** (cyber, data quality, key-person risk, GDPR) add remediation activities with completion criteria.
- **Commitments** (earn-out, TSA, no redundancy) add protective activities and approvals.
- **Expected synergies** are parsed into synergy records.
  - Figures are read only from what was written; nothing is invented.
  - Each synergy is linked to the activities that deliver it, and cross-sell synergies bring in commercial work.
- **Owners** are matched from function to Crew title. Anything unmatched stays unassigned and is listed as missing information.

Every deviation from the playbook (*added*, *omitted*, *changed*) is listed with its reason. **Acquisition-specific items are kept separate from suggested improvements**: improvements are recommendations that need accepting.

The plan is a validated draft until **Approve plan** (`approve_integration_plan`, admin only). Approval:

- materialises workstreams, activities (with dates relative to completion), dependencies and synergies
- keeps a `baseline_due_date` for variance
- sets the acquisition to *active*

Nothing executes before that. Approving the acquisition or the plan does not authorise later consequential actions, which keep their own approvals.

## 4. Execution and monitoring

The **detectors** (`integrationWatch`, in `src/lib/agents/detectors.ts`) open at most one live case per activity, dedupe-keyed, when any of the following happens:

- an activity becomes overdue
- an unfinished prerequisite puts a dependent milestone at risk
- an approval is pending close to its date
- something is "marked done" but its completion criteria haven't been verified

The detectors run on change signals and on schedule, and skip integrations whose agent is **paused** (a per-integration toggle).

The `integration.activity_watch` workflow (`workflows/integration-monitor.ts`) runs these steps:

1. **Assess impact.** It works out the downstream critical path and how much of the dependents' dates and synergy value are at risk (`monitor.ts`).
2. **Follow up the owner** through the Omni OS inbox, or another authorised channel. It respects:
   - working hours (Europe/London)
   - a per-recipient cooldown, shortened for critical-path items
   - the configured lead time
3. **Capture the reply:**
   - *done* marks the activity done but not complete;
   - *new date* turns into a proposal;
   - *blocked* records the blocker;
   - *evidence* sets `criteria_met`.
4. **Propose** a date change (`change_integration_activity`) and, when the issue is material, an **escalation into Mission Control**. The escalation is a high-priority issue linked to the integration, with up to three agreed corrective actions (`create_corrective_action` with several actions).
   - Each proposal states the exact action, reason, evidence, affected records, consequences, approver and scope.
   - Approving one authorises that action only, and it is re-checked before it runs.
5. **Apply exactly what was approved.** `agent_apply_approval` changes the due date only if the activity still has the date the proposal was based on. The baseline is kept for variance.
6. **Track** the corrective actions and the activity until it is verifiably complete, then close the case with the outcome.

Rules enforced in the database:

- **Done is not complete.** Progress counts *verified* milestones: done and criteria met, or no criteria defined.
- **Field guard.** The `activity_guard` trigger stops the agent principal from changing status, dates, owner, approvals or criteria except through `agent_apply_approval`.
- **Human-only work.** Activities flagged human-only are never actioned by the agent. It only follows up.
- **Never permitted to the agent:** terminating employees, changing employment or customer contracts, committing spend outside delegated authority, cancelling supplier agreements, migrating or deleting production data, changing regulated procedures, making binding commitments, or disclosing transaction information externally. The categories it holds are listed in `registry.ts`, and Level 5 stays approval-gated.
- **Shared actions with the Execution Agent.** Corrective actions carry `acquisition_id` and `integration_activity_id`. While the Integration Agent is enabled, the Execution Agent skips those actions, so nobody is chased twice.
- **Mission Control shows exceptions only.** It gets an "Integrations needing attention" card (off track, critical path slipping, critical activities overdue) plus the escalated issues and actions. Routine integration work stays in the module.

Other workflows:

- `integration.weekly_status` posts a weekly status notice to the sponsor and leader.
- `ceo.integration_review` lets the CEO Agent assess an integration against the North Star and Flight Plan.

## 5. Synergies

Each synergy records:

- category, baseline, target and measurement (run rate or cumulative)
- the period and expected realisation date
- owner, supporting activities and evidence

Results are entered as **actual** or **forecast**, and actuals must be **verified** by a second person.

Rules (`assessSynergy`, `synergyTotals` in `src/lib/domain/integration.ts`):

- **Realised value counts verified actuals only.** Forecasts are shown separately and are never treated as realised.
- The expected value at a date follows a linear ramp to the target. Falling behind it makes the synergy at risk or off track.
- Totals count each synergy once, even if it appears under several activities.
- A shortfall opens an `integration.synergy` case. The case investigates supporting activities first and commissions the Commercial Agent for commercial synergies. Its findings are labelled *confirmed*, *hypothesis* or *missing*, with sources.

## 6. Learning

**Start review**, available on a completed integration or at any time, runs `integration.review` (`learning.ts`). It compares plan with actual: dates against the baseline, criteria, interventions and synergies. It then looks for recurring patterns across this integration and the company's own previous documents, such as an activity late again, a dependency missing, or a step needed before completion.

Its output is **playbook change proposals** (`playbook_change_proposals`). Each proposal:

- is a typed operation (`set_timing`, `set_critical`, `edit_criteria`, `add_dependency`, `set_applies_to`, `add_activity`)
- carries the evidence that supports it

Accepting a proposal applies it to a **new draft version** of the playbook, which still needs approval. Active integrations keep the plan they were approved with; nothing is modified silently. Reviews use only the company's own data, with no cross-company comparison.

## 7. Agent Control Centre

The agent is registered with its remit, tools, categories, schedules and outcomes, so the Control Centre shows its cases, ledger and outcomes like any other agent's. Configuration covers:

- enabled, and the mode per category
- approvers
- cooldown, lead days and working hours
- external AI allowed
- channel connections

**Ask to investigate** can start any of its workflows for an integration activity, synergy or acquisition. Cases show:

- the decision summary
- evidence with sources
- tool results
- proposals and outcomes

No hidden reasoning is stored or displayed.

## Data model

All the tables below carry `company_id`, composite FKs, RLS, `touch` and audit triggers, and an `agent_signal` where relevant. See `supabase/migrations/20261029000001_integration.sql`.

| Table | Purpose |
|---|---|
| `knowledge_sources`, `knowledge_chunks` | Selected material, extracted text, chunks with search |
| `integration_playbooks` | Lineage, version, status (draft / generating / approved / superseded / failed), `content` JSON, approval record |
| `acquisitions` | Acquisition inputs, status, `agent_paused`, playbook link |
| `integration_plans` | Versioned plan drafts and approvals (`content` JSON, deviations) |
| `integration_workstreams`, `integration_activities`, `integration_dependencies` | The approved plan, materialised |
| `integration_synergies`, `synergy_actuals` | Targets and results (actual / forecast, verified) |
| `integration_reviews`, `playbook_change_proposals` | Learning |

`actions` and `issues` gain `acquisition_id`, and `actions` gains `integration_activity_id`.

The security-definer functions are:

- `approve_playbook`
- `approve_integration_plan`
- `agent_save_draft` (agents can write a draft only into a row a person queued, while it is *generating*)
- `agent_propose_playbook_change`
- `agent_activate_integrations`
- `agent_apply_approval`, extended
- `agent_create_action`, extended

## Demo

The seed gives Clinara, a fictional B2B SaaS company, a fictional record of three previous acquisitions (DentalDesk 2023, OptiBook 2024, CareNotes 2025). It includes seven generated documents in `scripts/seed/integration-docs`: a written playbook, two previous plans, a checklist, a post-acquisition review, lessons learned and a board strategy paper.

Clinara's Integration Agent is enabled, with routine follow-ups set to automatic and everything else needing approval. The 13-step walkthrough is:

1. As daniel@clinara.demo, open **Integrations → Knowledge** and look at the seven sources.
2. Click **Generate Playbook with AI** and keep all sources selected.
3. With the worker running (`npm run agents:worker`), the draft fills in within one tick. It has 7 workstreams with sources, conflicts and questions.
4. Open an activity to see why it is included and the exact source passages.
5. Resolve the two conflicts, decide the recommendations, and **Save draft**.
6. **Approve playbook**. v1 becomes the authoritative template.
7. **Integrations → New acquisition**: create *Vetora* (completed ~50 days ago, full integration, "£1m annual cross-selling revenue by month 18", diligence finding "no MFA; duplicate clinic records").
8. **Generate Integration Plan**. Its deviations include cyber remediation, a data-quality criterion and cross-sell work linked to the synergy.
9. Decide the suggestions, then save and **Approve plan**.
10. The agent detects that *Customer data cleansing* is late and puts the CRM migration at risk, and follows up its owner.
11. As marcus@clinara.demo, open **Agent requests** and reply with a new completion date.
12. As Daniel, open Vetora's **Issues and decisions** tab and approve the date change and the escalation.
13. **Mission Control** shows the integration exception, the issue and three corrective actions. The Vetora timeline shows the slip against the baseline.

`tests/e2e/z-integration.spec.ts` runs these steps in a browser. `tests/integration/integration-agent.test.ts` covers the same loop plus synergies, review and learning, tenant isolation, approval enforcement, duplicate prevention and crash recovery. `tests/unit/integration.test.ts` covers extraction, grounding, the analyser, the Claude mapping (against a recorded response), plan adaptation, status and learning.

## Known limitations

- **No Anthropic API key was available in this environment.** Every generation here used the rule-based extractor. The Claude path is tested only through a recorded response (schema, citation mapping, demotion and refusal handling) and has not been run against the live API.
  - The rule-based extractor depends on document structure (headings, timed list items, tables) and is weaker on free prose.
- **The SharePoint/OneDrive (Microsoft Graph) and Google Drive connectors are untested without credentials.** They call the official list and download endpoints with an admin-supplied access token. OAuth and token refresh are not built.
- Scanned PDFs (images only) are not OCR'd. Legacy Office formats are refused.
- Owners are matched from function to Crew *title* by keyword. Unmatched work stays unassigned rather than guessed.
- Synergy parsing understands simple written targets ("£1m … by month 18"). Anything else becomes missing information for management.
- Working hours use one timezone (Europe/London) per company, and bank holidays are not modelled.
