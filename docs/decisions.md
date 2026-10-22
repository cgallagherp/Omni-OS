# Decision log

| # | Decision | Why |
|---|---|---|
| 1 | No Omni Operating System / Growth Programme source documents were present in the repository (it was empty). Terminology follows the brief. | Brief is the authority until documents are supplied; revisit terminology when they are. |
| 2 | Local Supabase via the Supabase CLI + Docker. Some images were pulled from Docker Hub and re-tagged because the ghcr/ECR blob hosts are blocked by the sandbox network policy. | Real Auth, PostgREST and RLS locally instead of mocks. |
| 3 | shadcn/ui components are hand-written in `src/components/ui` following shadcn conventions (Radix + CVA + tailwind-merge). | The shadcn registry (ui.shadcn.com) is blocked by network policy; components are owned source code either way. |
| 4 | Reads/writes go through the user-session Supabase client (RLS) — no service role in request paths. | Database is the single security boundary; app checks are defence in depth. |
| 5 | Composite FKs `(company_id, id)` on every relationship. | Prevents cross-tenant references even by a user with write access to their own tenant ("modified identifiers"). |
| 6 | Owners reference `crew_members`, not logins. | Open seats and people without logins can appear on the accountability chart; one accountable owner per outcome is `NOT NULL`. |
| 7 | KPI targets: a metric-level default plus optional per-period target on `metric_values`. | Supports phased budgets (revenue/EBITDA vs plan) and simple fixed targets with one model. |
| 8 | Meeting agendas are generated live for preview and snapshotted at start. | Permanent meeting history reflects what was reviewed at the time; carry-over is derived from open state. |
| 9 | Execution health score is a transparent weighted composite shown with its components. | Omni needs to rank companies without forcing identical operational KPIs; explainability over sophistication. |
| 10 | Brand accent comes from `NEXT_PUBLIC_BRAND_PRIMARY` (placeholder `#F26A21`); logo is a placeholder mark. | No official Omni brand assets were supplied. |
| 11 | Next.js `cacheComponents` disabled. | Every page is per-user and permission-scoped; dynamic rendering is simpler and safer. |
| 12 | Deployment to Vercel/Supabase cloud not performed. | No credentials in this environment; README documents the steps. |
| 13 | The assistant is "analysis first, AI second": deterministic facts with source references are always available; Claude only narrates over that brief. | Guarantees traceability (every fact links to a record), works without an API key, and keeps the model away from data the user can't see. |
| 14 | Quarterly reset approval marks unfinished priorities as *missed*; carried-forward work is a new linked priority in the next quarter. | Preserves an honest record of each quarter's results while keeping continuity (`carried_from_id`). |
| 15 | Owners of new users: demo mode creates a temporary password shown once; otherwise Supabase sends an invite email. | No SMTP in the local sandbox; production path uses Supabase's invitation flow. |
| 16 | Meeting participants' screens refresh on their own actions (server actions + `router.refresh`), not via realtime. | Supabase Realtime was excluded locally; acceptable for a single facilitator driving the boardroom screen. |
