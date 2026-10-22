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
| `/portfolio` | Omni portfolio overview — company cards ordered by execution health, escalations, upcoming meetings |
| `/portfolio/compare` | Execution score breakdown and comparable-KPI matrix |
| `/c/[slug]` | **Blueprint** — single-page operating dashboard (+ Omni-only confidential panel) |
| `/c/[slug]/north-star` | Editable North Star, versions, conditions, assumptions, roadmap, financial trajectory |
| `/c/[slug]/flight-plan` | Hierarchy list (`?view=roadmap` for timeline) |
| `/c/[slug]/flight-plan/[type]/[id]` | Winning Move / Annual goal / Quarterly priority detail: chain, children, KPIs, issues, dependencies, updates, audit |
| `/c/[slug]/scoreboard` | Weekly/monthly KPI grid with inline entry, CSV import, export |
| `/c/[slug]/scoreboard/[metricId]` | KPI detail: chart, history, links, issues, audit |
| `/c/[slug]/scoreboard/export` | CSV export route (RLS-scoped) |
| `/c/[slug]/meetings` | Rhythm: upcoming, live, history, cadence |
| `/c/[slug]/meetings/[id]` | Agenda preview → live meeting → permanent summary |
| `/c/[slug]/execution` | Actions / issues / decision log |
| `/c/[slug]/execution/issue/[id]` | Issue detail: strategic context, decisions, actions, meetings |
| `/c/[slug]/crew`, `/quarterly-reset`, `/assistant`, `/settings`, `/admin` | See implementation plan for status |

## Data model (all company tables carry `company_id`)
```
companies ─┬─ company_memberships (user, role: omni | company_admin | executive | observer)
           ├─ crew_members (people & seats; reports_to → accountability chart; may link to a login)
           ├─ north_stars (1:1) ─ north_star_versions (trigger-written history)
           ├─ success_conditions, milestones
           ├─ winning_moves ─ annual_goals ─ quarterly_priorities ─ actions
           │                              quarters ┘
           ├─ metrics ─ metric_values (one row per reporting period; per-period target = budget)
           │         └ metric_links → winning_move | annual_goal | quarterly_priority
           ├─ meetings ─ meeting_attendees, meeting_agenda_items (snapshotted agenda)
           ├─ issues (→ metric, priority, goal, raised/resolved in meeting, escalated_to_omni)
           ├─ decisions (→ issue, meeting) ─ actions (→ decision, issue, priority, meeting)
           ├─ dependencies (polymorphic edges between plan items), comments (updates)
           ├─ org_gaps (hires, capability gaps, development), quarterly_resets
           ├─ investment_cases, omni_notes           ← Omni-only
           └─ audit_log                               ← trigger-only
profiles (1:1 auth.users; platform_role: platform_admin | omni_team | null)
```
Every owner is a `crew_members` row — exactly one accountable owner, enforced `NOT NULL`. Relationships use composite foreign keys `(company_id, id)` so a row can never point at another tenant's row.

## Permission model
| Level | Who | Can |
|---|---|---|
| read | any membership; platform admin | read company data |
| write | executive, company_admin, omni | create/update plan, KPIs, meetings, issues… |
| admin | company_admin, omni | North Star edits, archive, delete, settings |
| omni | omni role + Omni staff profile | investment case, Omni notes |
| platform admin | `profiles.platform_role = platform_admin` | all companies, administration |

SQL helpers (`app.*`, security definer, always about `auth.uid()`) back the RLS policies. Triggers: `company_id` immutable; only platform admins grant/revoke the `omni` role; users can't change their own platform role; Winning Move limit from `companies.settings.max_winning_moves`.

## Derived logic (pure, unit-tested — `src/lib/domain`)
- `metrics.ts` — status for higher/lower/range metrics with tolerance band; periods; YTD vs phased budget; trends.
- `metric-view.ts` — per-metric view: latest, status history, deterioration, "not reported", exception flag.
- `agenda.ts` — weekly/monthly agenda generation (KPI exceptions → priorities → previous actions → issues → decisions → new actions); carry-over flags.
- `health.ts` — transparent execution score for portfolio ranking.

## Integrations (future)
`metric_values.source` (`manual | csv | integration | seed`) and `metrics.source` let connectors write the same model the UI and CSV import use.
