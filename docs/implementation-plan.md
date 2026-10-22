# Implementation plan & status

Legend: ✅ implemented and tested · 🟡 implemented, partially tested · ⬜ not yet implemented

## Milestone 1 — working vertical slice ✅
| Item | Status |
|---|---|
| Supabase schema, RLS, composite tenant FKs, audit + version triggers | ✅ (22-table cross-tenant tests) |
| Demo seed: Clinara & Kestrel with 21 months of KPI history, meetings, issues, decisions, actions | ✅ |
| Login (Supabase Auth) & company switching | ✅ |
| Omni portfolio overview + comparison | ✅ (E2E) |
| Blueprint dashboard | ✅ (E2E) |
| North Star (editable, versioned), Flight Plan list + roadmap + detail pages | 🟡 (manually verified in browser) |
| Scoreboard: grid entry, KPI definitions, CSV import/export, detail with chart & audit | ✅ entry (E2E) · 🟡 CSV/definitions |
| Weekly meeting: agenda, live interface, issues/decisions/actions, summary, carry-over | ✅ (E2E) |

## Milestone 2 — remaining modules
| Item | Status |
|---|---|
| Crew: directory, accountability chart, ownership, gaps, hires, development | ⬜ |
| Quarterly Reset workflow (review → propose → approve, history retained) | ⬜ |
| Company settings (Winning Move limit, brand), platform administration | ⬜ |
| Company onboarding with Omni templates | ⬜ |
| Reporting & exports (board pack) | 🟡 KPI CSV export only |
| AI assistant | ⬜ |
| Mobile refinement | 🟡 responsive layouts, mobile nav sheet |
