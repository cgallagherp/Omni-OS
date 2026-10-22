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

## Not yet built / next steps
- Integrations that populate `metric_values` (`source = 'integration'`) — data model is ready; no connectors yet.
- Notifications (email/Slack) for overdue actions and escalations.
- Annual planning workflow for a new fiscal year (annual goals for FY+1 are created manually in the Flight Plan today).
- Realtime multi-user presence in live meetings (each participant's view refreshes on their own actions; others refresh on navigation).
- Production deployment (Vercel + Supabase cloud) — see README.
