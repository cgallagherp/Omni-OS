# Omni OS

The Omni Operating System as software: a multi-company operating platform for Omni portfolio companies (North Star, Flight Plan, Scoreboard, Rhythm, Crew, Quarterly Reset) and a portfolio view for Omni's investment and operating teams.

> **Demonstration data:** the seed creates two fictional companies (Clinara — B2B vertical SaaS; Kestrel Compliance Services — tech-enabled services). They are flagged `is_demo` and every screen showing them carries a banner.

## Prerequisites
- Node 20+ (tested on 22), npm
- Docker (for local Supabase)

## Run locally
```bash
npm install
cp .env.example .env.local          # then paste keys from `npx supabase status`
npx supabase start -x realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor,postgres-meta
npm run db:reset                    # migrations + demo seed
npm run dev                         # http://localhost:3000
```
Sign in with any demo account (password `OmniDemo!2026`) — the login page lists them in demo mode:

| Account | Role | Sees |
|---|---|---|
| priya@omni.demo | Omni operating partner | Both companies + portfolio, confidential notes |
| tom@omni.demo | Omni investment director | Clinara only (explicit assignment) |
| sam@omni.demo | Platform administrator | Everything + administration |
| daniel@clinara.demo / sarah@kestrel.demo | Company admin (CEO) | Own company |
| marcus@clinara.demo, aisha@…, nadia@kestrel.demo … | Executive | Own company |
| helen@clinara.demo | Read-only observer (chair) | Own company, no edits |

## Tests
```bash
npm run lint && npm run typecheck
npm test                     # unit + tenant-isolation integration tests (reseeds local DB)
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e   # full workflow in a browser (reseeds)
```

## Deploying (Vercel + Supabase)
1. Create a Supabase project; run `npx supabase link` then `npx supabase db push` to apply `supabase/migrations`.
2. In Vercel set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `NEXT_PUBLIC_DEMO_MODE=false` for production, optional `ANTHROPIC_API_KEY`.
3. Do **not** seed demo data into production. (`npm run db:seed` refuses non-local URLs unless `SEED_ALLOW_REMOTE=true`.)

Deployment has not been performed from this environment (no Vercel/Supabase cloud credentials). See `docs/decisions.md`.

## Docs
- `docs/product-spec.md` — what the product does
- `docs/architecture.md` — routes, data model, security model
- `docs/implementation-plan.md` — milestones and status
- `docs/decisions.md` — decision log and known limitations
