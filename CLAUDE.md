# Omni OS — project instructions

Omni OS turns the Omni Operating System (North Star · Flight Plan · Crew · Mission Control — Rhythm is the cadence inside Mission Control) into a multi-tenant SaaS for private-equity portfolio companies and Omni's investment/operating team. Principle: **Begin with the buyer. Focus on less. Execute every week.**

Read `docs/architecture.md` before structural changes and `docs/decisions.md` for why things are the way they are. The Chair & CEO Briefing (v4) is the methodology source; UI terms map onto older table names (`winning_moves` = Three-Year Outcomes, `annual_goals` = 12-Month Objectives, `quarterly_priorities` = 90-Day Priorities). See also `AGENTS.md` (Next.js 16 notes — this is *not* the Next.js in most training data; check `node_modules/next/dist/docs/`).

## Stack
Next.js 16 App Router (Turbopack, `src/proxy.ts` not middleware) · React 19 · TypeScript · Tailwind v4 · shadcn-style components hand-written in `src/components/ui` (registry is blocked by network policy) · Radix (`radix-ui`) · Recharts · Supabase (Postgres 17, Auth, PostgREST) · zod · Vitest · Playwright.

## Commands
- `npx supabase start -x realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor,postgres-meta` — local Supabase (needs Docker)
- `npm run db:reset` — apply migrations + seed demo data · `npm run db:seed` — reseed only · `npm run db:types` — regenerate `src/lib/supabase/database.types.ts`
- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
- `npm test` — unit + RLS integration tests (reseeds the local DB) · `SKIP_DB=1 npx vitest run tests/unit` — unit only
- `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` — end-to-end workflow (reseeds)
- `npm run agents:tick` (one pass) / `npm run agents:worker` · `npm run agents:eval` — agent worker and evaluation. After editing a migration run `npx supabase db reset` before tests.

## Non-negotiable rules
1. **Tenant isolation is enforced in the database.** Every company table has `company_id`, RLS policies using `app.has_company_access / app.can_write / app.can_admin / app.is_omni_for`, and composite FKs `(company_id, x_id)` so records can't reference another tenant. New tables must follow the same pattern (add to the loops in `20261022000002_security.sql` or a new migration) and get a test in `tests/integration/tenant-isolation.test.ts`.
2. **Never use the service-role client in request paths** except platform-admin provisioning after an explicit `requireCompanyPermission`/platform-admin check. Pages and actions use `createClient()` from `src/lib/supabase/server.ts` (user session → RLS).
3. **Server actions** live in `src/lib/actions/*`, start with `requireCompanyPermission(companyId, level)`, validate with zod, scope writes with `updateScoped/insertScoped/deleteScoped`, return `ActionResult`, and call `revalidateCompany`.
4. **One connected system.** Derived state (KPI status, exceptions, agenda, health) comes from pure functions in `src/lib/domain/*` (unit-tested) fed by `loadCompanySnapshot(s)` in `src/lib/data/snapshot.ts`. Don't duplicate status logic in components.
5. **No fake functionality.** Every button must work against persisted data. Demo data is flagged `companies.is_demo` and shown with a banner; the seed refuses non-local targets unless `SEED_ALLOW_REMOTE=true`.
6. Audit: significant tables have the `app.audit()` trigger; the North Star is versioned by trigger. Don't bypass with service role in app code.
7. Design: Rubik, Omni palette (`src/lib/domain/brand.ts`, `globals.css`). Company branding comes from `company_branding` via `deriveBrandTokens()` — use `bg-brand`, `text-brand-ink` (accessible text), `bg-brand-subtle`, `hover:bg-brand-hover`; never hard-code a brand colour. Status colours are fixed `on/risk/off/done/none` tokens (text: `text-*-ink`) and must never take brand colours. `/portfolio` and `/admin` are always Omni-branded. Dense, Linear-like layouts; no decorative gradients.
8. No confidential individual assessments (performance, psychometrics, 360, coaching, succession, pay) — Crew records agreed organisational actions only.
9. The Monday scorecard is KPI | Actual | Target | Status | Agreed corrective action only — never add commentary. Missing results are "not reported", never on track.
10. **Agents** (`src/lib/agents`, `docs/agents.md`) act only as their company's agent principal (RLS, never the service role for company data). Every consequential write goes through a security-definer function that re-checks `app.agent_mode` or an approved proposal; Level 5 stays approval-gated; side effects go through `rt.once`; findings are confirmed / hypothesis / missing with sources. Agents never send external communications, change commitments or commercial terms, or assess named individuals on their own authority. New agent tables follow rule 1.
11. **M&A integration** (`src/lib/integration`, `docs/integration.md`): playbooks/plans are zod-validated drafts that only management approval (`approve_playbook`, `approve_integration_plan`) freezes or materialises; established/inferred items must carry verified citations; `humanOnly` work is never actioned by the agent; done ≠ complete (criteria verified); synergies count verified actuals only.
12. **Revenue & Cost Intelligence** (`src/lib/analytics`, `docs/intelligence.md`): read governed data only through `AnalyticsSource`; governed tables (`an_*`, `ri_*`, `ci_*`) are never written by the app; reference calcs in pence are the source of truth and SQL must match them; reconciliation failures and unclassified movements are shown, never adjusted; synthetic data is never labelled validated; domain permissions (`app.can_read_domain`) apply to people and agents; no PVM estimates; people data stays aggregated.
13. Next.js page files may only export page fields; shared constants go in `src/lib/domain`. Values exported from `"use client"` modules can't be used in server components.

## Layout
`src/app/(app)/c/[slug]/…` company modules (incl. `mission-control`, `weekly-scorecard`, `reporting`, `quarterly-reset`, `listening`, `calendar`, `onboarding`, `integrations`, `settings/branding`, `revenue`, `cost`) · `src/app/(app)/portfolio` Omni views · `src/lib/{auth,domain,data,actions}` · `supabase/migrations` · `scripts/seed` · `tests/{unit,integration,e2e}`.
