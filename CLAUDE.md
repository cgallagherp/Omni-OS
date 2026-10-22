# Omni OS — project instructions

Omni OS turns the Omni Operating System (North Star · Flight Plan · Crew · Rhythm) into a multi-tenant SaaS for private-equity portfolio companies and Omni's investment/operating team. Principle: **Begin with the buyer. Focus on less. Execute every week.**

Read `docs/architecture.md` before structural changes and `docs/decisions.md` for why things are the way they are. See also `AGENTS.md` (Next.js 16 notes — this is *not* the Next.js in most training data; check `node_modules/next/dist/docs/`).

## Stack
Next.js 16 App Router (Turbopack, `src/proxy.ts` not middleware) · React 19 · TypeScript · Tailwind v4 · shadcn-style components hand-written in `src/components/ui` (registry is blocked by network policy) · Radix (`radix-ui`) · Recharts · Supabase (Postgres 17, Auth, PostgREST) · zod · Vitest · Playwright.

## Commands
- `npx supabase start -x realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor,postgres-meta` — local Supabase (needs Docker)
- `npm run db:reset` — apply migrations + seed demo data · `npm run db:seed` — reseed only · `npm run db:types` — regenerate `src/lib/supabase/database.types.ts`
- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
- `npm test` — unit + RLS integration tests (reseeds the local DB) · `SKIP_DB=1 npx vitest run tests/unit` — unit only
- `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` — end-to-end workflow (reseeds)

## Non-negotiable rules
1. **Tenant isolation is enforced in the database.** Every company table has `company_id`, RLS policies using `app.has_company_access / app.can_write / app.can_admin / app.is_omni_for`, and composite FKs `(company_id, x_id)` so records can't reference another tenant. New tables must follow the same pattern (add to the loops in `20261022000002_security.sql` or a new migration) and get a test in `tests/integration/tenant-isolation.test.ts`.
2. **Never use the service-role client in request paths** except platform-admin provisioning after an explicit `requireCompanyPermission`/platform-admin check. Pages and actions use `createClient()` from `src/lib/supabase/server.ts` (user session → RLS).
3. **Server actions** live in `src/lib/actions/*`, start with `requireCompanyPermission(companyId, level)`, validate with zod, scope writes with `updateScoped/insertScoped/deleteScoped`, return `ActionResult`, and call `revalidateCompany`.
4. **One connected system.** Derived state (KPI status, exceptions, agenda, health) comes from pure functions in `src/lib/domain/*` (unit-tested) fed by `loadCompanySnapshot(s)` in `src/lib/data/snapshot.ts`. Don't duplicate status logic in components.
5. **No fake functionality.** Every button must work against persisted data. Demo data is flagged `companies.is_demo` and shown with a banner; the seed refuses non-local targets unless `SEED_ALLOW_REMOTE=true`.
6. Audit: significant tables have the `app.audit()` trigger; the North Star is versioned by trigger. Don't bypass with service role in app code.
7. Design: Rubik, restrained neutrals, brand accent `--brand` (from `NEXT_PUBLIC_BRAND_PRIMARY`, placeholder until official values). Status colours via `on/risk/off/done/none` tokens. Dense, Linear-like layouts; no decorative gradients.

## Layout
`src/app/(app)/c/[slug]/…` company modules · `src/app/(app)/portfolio` Omni views · `src/lib/{auth,domain,data,actions}` · `supabase/migrations` · `scripts/seed` · `tests/{unit,integration,e2e}`.
