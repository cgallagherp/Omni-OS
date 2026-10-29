# Implementation plan & status

Legend: ✅ implemented and covered by automated tests · 🟡 implemented, verified manually in the browser · ⬜ not implemented

## Milestone 1 — working vertical slice ✅
| Item | Status |
|---|---|
| Supabase schema, RLS, composite tenant FKs, audit + version triggers | ✅ 22-table cross-tenant read tests, modified-identifier writes, privilege escalation |
| Demo seed: Clinara & Kestrel — 21 months of KPI history, meetings, issues, decisions, actions, crew, resets | ✅ (runs before every test suite) |
| Login (Supabase Auth) & company switching | ✅ E2E |
| Omni portfolio overview + comparison | ✅ E2E |
| Blueprint dashboard | ✅ E2E |
| Editable strategy: North Star (versioned) | ✅ E2E |
| Flight Plan: hierarchy, roadmap, detail pages, inline status/progress, dependencies, updates, audit | 🟡 |
| Scoreboard: grid entry ✅ E2E · KPI definitions ✅ E2E · CSV import ✅ E2E · CSV export ✅ E2E (tenant-scoped) · detail with chart/audit 🟡 | |
| Weekly meeting: agenda, live interface, issues/decisions/actions, summary, carry-over | ✅ E2E |

## Milestone 2 — remaining modules
| Item | Status |
|---|---|
| Crew: accountability chart, directory, ownership matrix, person pages, hires/capability/development | 🟡 |
| Quarterly Reset (review → carry forward → reflect → propose → approve; history retained) | ✅ E2E |
| Company settings (profile, Winning Move limit, members & roles, invitations) | 🟡 (Winning Move limit enforced by trigger) |
| Platform administration: Omni assignment matrix, template-based onboarding | ✅ E2E (onboarding) · 🟡 (assignment toggles) |
| Board pack (print / PDF) | 🟡 |
| AI assistant: 8 analyses with cited sources (rule-based, always on) | 🟡 |
| AI narrative drafting via Claude | 🟡 code complete; **not exercised** — no `ANTHROPIC_API_KEY` in this environment |
| Responsive layouts | 🟡 every page checked for horizontal overflow at 390px |

## Milestone 3 — v4 operating system update ✅
| Item | Status |
|---|---|
| Pillars renamed (Mission Control), Flight Plan cascade terminology, grouped navigation | ✅ |
| Omni identity (logo, palette, Rubik) and per-company Appearance & Branding with live preview | ✅ RLS + E2E tested |
| North Star: Vision → Mission → Values and the deck's destination/buyer fields | ✅ |
| 90-day priorities: success criteria, milestones, on/at/off status, ~3 guidance, DB hard limit | ✅ |
| Crew: agreed organisational actions only; no individual assessments | ✅ |
| Mission Control hub and Blueprint attention vs routine | ✅ |
| Monday KPI scorecard: generate → CEO approve → Omni (in-app + email outbox), history | ✅ email provider not configured here |
| Weekly ELT agenda in four parts, corrective actions against KPIs, searchable history | ✅ |
| Reporting: flash, monthly Board check-in, quarterly Board pack, deadlines, compliance | ✅ |
| 8-stage quarterly offsite with annual reset, results, comparison, company update | ✅ E2E tested |
| Listening, First 100 days, Calendar & governance | ✅ |
| Portfolio: Monday scorecards first, North Star progress, reporting compliance, offsites | ✅ |

## Milestone 5 — M&A Integration Agent ✅
| Item | Status |
|---|---|
| Knowledge: upload (PDF/Word/PPT/Excel/MD) and SharePoint/OneDrive/Google Drive import of selected files; extraction and chunks | ✅ connectors untested without credentials |
| Generate Playbook with AI: structured, cited, established/inferred/recommended; conflicts and gaps; full editor; versions and approval | ✅ Claude path tested with a recorded response; rule-based fallback used here |
| Multiple playbooks with "when to use" rules and a recommendation per acquisition | ✅ |
| Acquisitions, M&A hand-over, Generate Integration Plan with explained deviations; plan approval materialises it | ✅ |
| Autonomous monitoring: overdue, dependencies, critical path, approvals, evidence; follow-ups with hours/cooldowns; approved date changes and Mission Control escalations | ✅ E2E tested |
| Synergies (verified actuals only), CEO Agent assessment, weekly status, learning loop with change proposals | ✅ |

## Milestone 6 — Revenue & Cost Intelligence ✅
| Item | Status |
|---|---|
| Governed-layer schema, domain RLS, versioned definitions, adapter layer (synthetic + warehouse stub), data contracts | ✅ |
| Revenue: overview, ARR bridge with drill-down, GRR/NRR, cohorts, segments, customers, reconciliation & data quality, definitions | ✅ E2E tested |
| Cost: overview, trends, analysis to transactions, suppliers, GP/EBITDA bridges, aggregated people, data quality, definitions | ✅ E2E tested |
| Mission Control links, CEO/Commercial agent workflows, portfolio comparison, access settings | ✅ |
| Snowflake/dbt warehouse adapter | Not built — contracts in `docs/intelligence-data-contracts.md` |

## Not yet built / next steps
- Integrations that populate `metric_values` (`source = 'integration'`) — data model is ready; no connectors yet.
- Notifications (email/Slack) for overdue actions and escalations.
- Budget import: the annual reset records budget assumptions; the phased budget is still entered as KPI targets (or by CSV).
- Bank holidays in reporting deadlines.
- A per-company CEO company-wide update is drafted and saved but not distributed (no all-staff channel integration).
- Realtime multi-user presence in live meetings (each participant's view refreshes on their own actions; others refresh on navigation).
- Production deployment (Vercel + Supabase cloud) — see README.
