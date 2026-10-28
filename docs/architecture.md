# Architecture

## Overview
```
Browser ──► Next.js (App Router, server components + server actions)
              │  src/proxy.ts refreshes the Supabase session, redirects anonymous users
              │  pages/actions use the *user's* session client → PostgREST → Postgres RLS
              ▼
          Supabase: Auth (GoTrue) · PostgREST · Postgres 17 (RLS, triggers, audit)
```
There is no separate API server. Reads happen in server components via `loadCompanySnapshot(s)`; writes happen in server actions. Both run as the signed-in user, so **Row Level Security is the security boundary**; server-side permission checks (`requireCompanyPermission`) are defence in depth and give friendly errors.

## Routes
| Route | Purpose |
|---|---|
| `/login` | Supabase email/password sign-in (demo personas in demo mode) |
| `/` | Redirect: Omni staff → `/portfolio`, company users → their company |
| `/portfolio` | Omni portfolio (always Omni-branded): Monday scorecards, company cards ordered by execution health, escalations, upcoming Boards/offsites |
| `/portfolio/compare` | Execution score breakdown and comparable-KPI matrix |
| `/c/[slug]` | **Blueprint** — attention vs routine, North Star, Flight Plan, scoreboard, Crew summary, Mission Control, Next steps (+ Omni-only panel) |
| `/c/[slug]/north-star` | Vision → Mission → Values, destination, buyer story, conditions, versions, roadmap, trajectory |
| `/c/[slug]/flight-plan` | Three-Year Outcomes → 12-Month Objectives → 90-Day Priorities (`?view=roadmap` for timeline) |
| `/c/[slug]/flight-plan/[type]/[id]` | Plan item detail; priorities show success criteria, milestones and offsite result |
| `/c/[slug]/crew`, `/crew/[id]` | Accountability chart, ELT and ownership, agreed organisational actions |
| `/c/[slug]/mission-control` | "What needs attention this week?" — Priorities → Owners → Scorecard → Issues → Decisions → Actions |
| `/c/[slug]/weekly-scorecard` | Monday KPI scorecard: live draft, CEO approval and send, history, delivery log |
| `/c/[slug]/scoreboard` (+ `[metricId]`, `export`) | All KPIs: grid, inline entry, CSV import/export, detail |
| `/c/[slug]/meetings` (+ `[id]`) | Meetings & Rhythm: cadence, searchable history (`?q=`), agenda preview → live meeting → record |
| `/c/[slug]/execution` (+ `issue/[id]`) | Issues, actions, decision log |
| `/c/[slug]/reporting` (+ `[kind]/[period]`) | Flash, monthly Board check-in, quarterly Board pack: deadlines, compliance, commentary, publish, print |
| `/c/[slug]/quarterly-reset` | 8-stage quarterly offsite (and annual reset); approval via `approve_quarterly_reset()` |
| `/c/[slug]/listening` | Employee and customer listening rounds and their actions |
| `/c/[slug]/calendar` | Rolling 12-month calendar and investor governance tracker |
| `/c/[slug]/onboarding` | First 100 days: operating cycle, timetable, milestones |
| `/c/[slug]/assistant` | Operating analyst with source references; optional Claude narrative |
| `/c/[slug]/settings` (+ `branding`) | Company profile and Flight Plan limits, access; Appearance & Branding |
| `/brand/logo/[companyId]` | Company logo, read with the user's session (RLS); private cache, versioned URL |
| `/admin` | Platform admin: Omni assignment matrix, template-based onboarding |

`/c/[slug]/layout.tsx` resolves access before any company page streams, so unauthorised slugs return a real 404.

## Data model (all company tables carry `company_id`)
```
companies ─┬─ company_memberships (user, role: omni | ceo | company_admin | executive | observer)
           ├─ company_branding (1:1; colours, logo bytes ≤1 MB raster; Omni defaults when absent)
           ├─ crew_members (people & seats; reports_to → accountability chart; may link to a login)
           ├─ north_stars (1:1; VMV, destination, buyer story) ─ north_star_versions (trigger)
           ├─ success_conditions, milestones
           ├─ winning_moves (Three-Year Outcomes) ─ annual_goals (12-Month Objectives)
           │     ─ quarterly_priorities (90-Day Priorities; success_criteria, outcome) ─ priority_milestones
           │                              quarters ┘
           ├─ metrics (in_weekly_scorecard) ─ metric_values · metric_links
           ├─ meetings (weekly | board_monthly | board_quarterly | quarterly | annual | monthly)
           │     ─ meeting_attendees, meeting_agenda_items (snapshotted agenda)
           ├─ issues ─ decisions ─ actions (→ metric = corrective action, listening_round, priority, meeting)
           ├─ weekly_scorecards (approved rows + recipients) · email_outbox
           ├─ board_reports (flash | monthly_board | quarterly_board; content + frozen snapshot)
           ├─ listening_rounds (aggregate results only) · onboarding_milestones · governance_items
           ├─ org_actions (critical_role | hire | structure | capability → priority / objective)
           ├─ quarterly_resets (offsite: stage notes, scorecard keep/drop, strategic issues, company update)
           ├─ dependencies, comments
           ├─ investment_cases, omni_notes           ← Omni-only
           └─ audit_log                               ← trigger-only (logo bytes stripped)
profiles (1:1 auth.users; platform_role: platform_admin | omni_team | null)
```
UI terminology maps onto the original table names (`winning_moves` = Three-Year Outcomes, `annual_goals` = 12-Month Objectives, `quarterly_priorities` = 90-Day Priorities) so history and foreign keys are unchanged. Every owner is a `crew_members` row — exactly one accountable owner, `NOT NULL`. Relationships use composite foreign keys `(company_id, id)`.

## Permission model
| Level | Who | Can |
|---|---|---|
| read | any membership; platform admin | read company data |
| write | executive, ceo, company_admin, omni | plan, KPIs, meetings, issues, listening, milestones… |
| admin | ceo, company_admin, omni | North Star, settings, branding, publish reports, approve offsite |
| approve scorecard | ceo, company_admin | approve and send the Monday scorecard |
| leadership | omni, ceo, company_admin, executive | see Monday scorecards and their delivery log (Chair/observers cannot) |
| omni | omni role + Omni staff profile | investment case, Omni notes |
| platform admin | `profiles.platform_role = platform_admin` | all companies, administration |

SQL helpers (`app.has_company_access / can_write / can_admin / is_omni_for / is_leadership_or_omni / can_approve_scorecard`) back the RLS policies. Triggers: `company_id` immutable; only platform admins grant the `omni` role; users can't change their own platform role; Three-Year Outcome limit (`settings.max_three_year_outcomes`) and 90-Day Priority hard limit (`settings.max_priorities`, stopped priorities excluded) enforced in the database; `settings.priority_target` (default 3) drives the UI guidance.

## Branding
`company_branding` stores three optional hex colours and an optional PNG/JPEG/WEBP logo (validated by magic bytes, ≤1 MB, no SVG). `getViewer()` loads colours and a versioned logo URL (never the bytes). `AppShell` derives tokens with `deriveBrandTokens()` (`src/lib/domain/brand.ts`: fill, readable foreground, hover, accessible text "ink", tint, border, chart series, focus ring) for the company in the URL, or Omni's defaults on `/portfolio` and `/admin`, and applies them to the shell and `<html>` (so portalled menus match). Switching company is a client navigation — no reload. Status colours (`on/risk/off/done/none`) are fixed tokens with separate accessible `*-ink` text shades.

## Derived logic (pure, unit-tested — `src/lib/domain`)
- `metrics.ts`, `metric-view.ts` — KPI status, periods, YTD vs phased budget, trends, "not reported", exceptions.
- `weekly-scorecard.ts` — the Monday scorecard rows and email HTML.
- `attention.ts` — "what needs attention this week" vs routine (Blueprint, Mission Control, portfolio).
- `reporting.ts` — report deadlines (working days, Board dates, fiscal quarters), schedule and compliance.
- `agenda.ts` — weekly agenda (four parts) and carry-over flags.
- `operating-system.ts` — operating cycle, 100-day template, governance template, deadlines.
- `brand.ts`, `logo-image.ts` — colour derivation and contrast; logo validation.
- `health.ts` — transparent execution score for portfolio ranking.

## Email
`src/lib/email.ts` sends through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set. Every send is recorded in `email_outbox` with its status; without a provider the status is `not_configured` and recipients see the approved scorecard in Omni OS.

## AI assistant
`src/lib/data/insights.ts` builds a **brief** from the RLS-scoped snapshot: facts (each with source ids that link to records) and rule-based suggestions, labelled separately. With `ANTHROPIC_API_KEY` set, `src/lib/actions/assistant.ts` sends only that brief to Claude (`claude-opus-5-5` by default, `ANTHROPIC_MODEL` to override; server-side refusal fallback enabled) with instructions to cite `[S#]` for every fact and keep recommendations in a separate section. Omni-only tables are never read by the brief, so tenant and confidentiality boundaries carry through.

## Agents
See `docs/agents.md`. `src/lib/agents/*`: registry (agents, tools, action categories and caps), runtime (step machine, tools, idempotent side effects, proposals), engine (signals, detectors, queue claiming, retries), workflows, pure analysis modules (`analysis/*`, unit-tested), connectors (channels, CRM, market sources, encrypted secrets). Tables: `agent_configs`, `integration_connections`, `integration_secrets`, `agent_investigations`, `agent_runs`, `agent_events`, `agent_approvals`, `agent_messages`, `agent_side_effects`, `agent_usage`, `agent_signals`, `crm_sandbox_*`, `ma_theses`, `ma_targets`, `ma_sandbox_companies` — all company-scoped with RLS (`app.can_see_agents` = leadership, Omni or the agent principal). The worker (`scripts/agents/worker.ts`) is a separate process.

## Service role usage
Only `provisionUser()` in `src/lib/actions/admin.ts` (creating/inviting auth users) after a platform-admin or company-admin check. Everything else — including branding, logos and the Monday scorecard — uses the user's session. The agent worker (an offline process, not a request path) uses it only to claim runs, create the per-company agent principal, mint its token and decrypt connection credentials; all agent reads and writes run as the agent principal under RLS.

## Integrations
`metric_values.source` (`manual | csv | integration | seed`) and `metrics.source` let connectors write the same model the UI and CSV import use.
