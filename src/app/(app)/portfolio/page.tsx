import type { Metadata } from "next";
import { comparableAcross, portfolioComparables, PORTFOLIO_METRICS } from "@/lib/analytics/portfolio";
import { fmt } from "@/lib/analytics/format";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarClock, Flag, Mail } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { attentionOf, healthOf, loadCompanySnapshots, northStarProgress } from "@/lib/data/snapshot";
import { REPORT_META, REPORT_STATE } from "@/lib/domain/reporting";
import { weekStartOf } from "@/lib/domain/weekly-scorecard";
import { ScorecardStatusPill } from "@/components/scorecard/scorecard-table";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatMoney, formatPct, relativeDays } from "@/lib/domain/format";
import { BAND_META } from "@/lib/domain/health";
import { quarterLabel } from "@/lib/domain/quarters";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { loadIntegrationHome } from "@/lib/data/integration";
import { HealthBadge, MilestoneMeter, money } from "@/components/integration/ui";
import { Badge } from "@/components/ui/badge";
import { CompanyMark } from "@/components/os/logo";
import { PriorityBadge, StatusBar, StatusDot } from "@/components/os/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Portfolio" };

const LEVEL = { none: "No concerns", monitor: "Monitor", support: "Support", intervene: "Intervene" } as const;

export default async function PortfolioPage() {
  const viewer = await requireViewer();
  if (!viewer.isOmniStaff) redirect("/");
  const supabase = await createClient();
  const omniCompanies = viewer.companies.filter((c) => c.role === "omni");
  const snaps = await loadCompanySnapshots(supabase, omniCompanies.map((c) => c.companyId));
  const ids = snaps.map((s) => s.company.id);
  const [{ data: notes }, { data: cases }] = await Promise.all([
    ids.length ? supabase.from("omni_notes").select("*").in("company_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("investment_cases").select("*").in("company_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const rows = snaps.map((s) => ({ s, health: healthOf(s), note: (notes ?? []).find((n) => n.company_id === s.company.id), ic: (cases ?? []).find((c) => c.company_id === s.company.id) })).sort((a, b) => a.health.score - b.health.score);

  const tot = (k: "revenue" | "ebitda", f: "actual" | "plan") => snaps.reduce((sum, s) => sum + (s.financials[k]?.[f] ?? 0), 0);
  const escalations = snaps.flatMap((s) => s.openIssues.filter((i) => i.escalated_to_omni).map((i) => ({ i, s })));
  const currency = snaps[0]?.company.currency ?? "GBP";
  const logoOf = new Map(viewer.companies.map((c) => [c.companyId, c.branding.logoUrl]));
  const thisWeek = weekStartOf(new Date());
  // The most recent approved Monday scorecard for each company (in-app delivery to Omni).
  const scorecards = snaps.map((s) => ({ s, latest: s.sentScorecards.find((w) => w.approved_at) ?? null }));
  // Integrations across the portfolio (Omni sees each company's integrations it is assigned to)
  const comparables = await portfolioComparables(supabase, snaps.map((s) => ({ id: s.company.id, name: s.company.name, slug: s.company.slug })));
  const integrations = (await Promise.all(snaps.map(async (s) => ({ s, home: await loadIntegrationHome(supabase, s.company.id) })))).flatMap(({ s, home }) => home.rows.filter((r) => !["completed", "cancelled"].includes(r.a.status)).map((r) => ({ s, r })));

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Omni Portfolio"
        title="Portfolio overview"
        description={`Execution across ${snaps.length} authorised portfolio compan${snaps.length === 1 ? "y" : "ies"}, ordered by who needs attention first. Monday scorecards from each CEO are shown first.`}
        actions={
          <Link href="/portfolio/compare" className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium shadow-xs hover:bg-accent">
            Compare companies <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      {!snaps.length ? (
        <EmptyState title="No portfolio companies assigned" description="A platform administrator can assign you to companies." />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
            <Tile label="Portfolio revenue YTD" value={formatMoney(tot("revenue", "actual"), currency)} sub={`${formatPct((tot("revenue", "actual") - tot("revenue", "plan")) / (tot("revenue", "plan") || 1), 1, true)} vs plan`} />
            <Tile label="Portfolio EBITDA YTD" value={formatMoney(tot("ebitda", "actual"), currency)} sub={`${formatPct((tot("ebitda", "actual") - tot("ebitda", "plan")) / (tot("ebitda", "plan") || 1), 1, true)} vs plan`} />
            <Tile label="Requiring intervention" value={String(rows.filter((r) => r.health.band === "intervene").length)} sub={`${rows.filter((r) => r.health.band === "watch").length} on watch`} />
            <Tile label="Escalated to Omni" value={String(escalations.length)} sub={`${snaps.reduce((n, s) => n + s.openIssues.filter((i) => i.priority === "critical").length, 0)} critical issues open`} />
          </div>

          <Card className="mb-5" data-testid="portfolio-scorecards">
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground" /> Monday KPI scorecards
              </CardTitle>
              <span className="text-xs text-muted-foreground">Approved by each CEO · off-track KPIs and their corrective actions</span>
            </CardHeader>
            <div className="divide-y">
              {scorecards.map(({ s, latest }) => {
                const off = latest?.rows.filter((r) => r.status === "off_track") ?? [];
                const current = latest?.week_start === thisWeek;
                return (
                  <div key={s.company.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[220px_1fr]">
                    <Link href={`/c/${s.company.slug}/weekly-scorecard`} className="flex items-start gap-2.5 hover:underline">
                      <CompanyMark name={s.company.name} color={s.company.brand_color} logoUrl={logoOf.get(s.company.id)} size="md" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">{s.company.name}</span>
                        <span className={cn("block text-xs", current ? "text-muted-foreground" : "text-risk-ink")}>
                          {latest ? `${current ? "This week" : `Week of ${formatDate(latest.week_start, { year: false })}`} · approved ${formatDate(latest.approved_at, { year: false })}` : "No scorecard received"}
                          {latest && !current && " · this week not yet received"}
                        </span>
                        {latest && (
                          <span className="mt-1 flex gap-1 text-[11px] text-muted-foreground">
                            {latest.rows.filter((r) => r.status === "on_track").length} on · {latest.rows.filter((r) => r.status === "at_risk").length} at risk · {off.length} off · {latest.rows.filter((r) => r.status === "not_reported").length} not reported
                          </span>
                        )}
                      </span>
                    </Link>
                    <ul className="space-y-1.5 text-[13px]">
                      {off.map((r) => (
                        <li key={r.metricId} className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-3">
                          <span className="flex shrink-0 items-center gap-2 sm:w-64">
                            <ScorecardStatusPill status={r.status} />
                            <span className="truncate font-medium">{r.kpi}</span>
                          </span>
                          <span className="text-xs text-muted-foreground tabular sm:w-32">
                            {r.actual} vs {r.target}
                          </span>
                          <span className="min-w-0 flex-1">
                            {r.actionRequired ? (
                              <span className="font-medium text-off-ink">Action required — no corrective action agreed.</span>
                            ) : (
                              r.actions.map((a) => (
                                <span key={a.id} className="block">
                                  {a.title} <span className="text-muted-foreground">— {a.owner}, {a.dueLabel}</span>
                                </span>
                              ))
                            )}
                          </span>
                        </li>
                      ))}
                      {latest && !off.length && <li className="text-muted-foreground">No KPIs off track.</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-2">
            {rows.map(({ s, health, note, ic }) => {
              const rev = s.financials.revenue;
              const eb = s.financials.ebitda;
              const ps = s.priorityStatus;
              const band = BAND_META[health.band];
              const nsp = northStarProgress(s);
              const attention = attentionOf(s);
              const orgOverdue = s.orgActions.filter((o) => o.target_date && o.target_date < s.now.toISOString().slice(0, 10)).length;
              return (
                <Card key={s.company.id} className="overflow-hidden">
                  <Link href={`/c/${s.company.slug}`} className="flex items-center gap-3 border-b px-4 py-3 hover:bg-accent/40">
                    <CompanyMark name={s.company.name} color={s.company.brand_color} logoUrl={logoOf.get(s.company.id)} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.company.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.company.sector} · {s.company.headquarters} · Omni since {formatDate(s.company.acquired_on)}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={band.tone}>{band.label}</Badge>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Execution score {health.score}</p>
                    </div>
                  </Link>
                  <div className="grid grid-cols-2 divide-x border-b sm:grid-cols-4">
                    <Metric label="Revenue YTD" value={formatMoney(rev?.actual, currency)} delta={rev?.variancePct ?? null} />
                    <Metric label="EBITDA YTD" value={formatMoney(eb?.actual, currency)} delta={eb?.variancePct ?? null} />
                    <div className="px-4 py-3">
                      <p className="text-[11px] text-muted-foreground">Priorities {s.activeQuarter ? quarterLabel(s.activeQuarter) : ""}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular">
                        <span className="text-on-ink">{ps.on_track + ps.done}</span> / <span className="text-risk-ink">{ps.at_risk}</span> / <span className="text-off-ink">{ps.off_track}</span>
                      </p>
                      <StatusBar counts={{ on: ps.on_track, done: ps.done, risk: ps.at_risk, off: ps.off_track }} className="mt-1" />
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-[11px] text-muted-foreground">KPIs on target</p>
                      <p className="mt-0.5 text-sm font-semibold tabular">
                        {s.kpi.on_track}/{s.kpi.total}
                      </p>
                      <StatusBar counts={{ on: s.kpi.on_track, risk: s.kpi.at_risk, off: s.kpi.off_track, none: s.kpi.no_data }} className="mt-1" />
                    </div>
                  </div>
                  <div className="grid gap-4 border-b px-4 py-3 sm:grid-cols-[200px_1fr]">
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">North Star{nsp.targetYear ? ` · FY${nsp.targetYear}` : ""}</p>
                      {nsp.revenue !== null || nsp.ebitda !== null ? (
                        <div className="space-y-1.5 text-[11.5px] text-muted-foreground">
                          <div>
                            Revenue journey {nsp.revenue !== null ? `${Math.round(nsp.revenue * 100)}%` : "—"}
                            <Progress value={(nsp.revenue ?? 0) * 100} tone="brand" className="mt-0.5 h-1" />
                          </div>
                          <div>
                            EBITDA journey {nsp.ebitda !== null ? `${Math.round(nsp.ebitda * 100)}%` : "—"}
                            <Progress value={(nsp.ebitda ?? 0) * 100} tone="brand" className="mt-0.5 h-1" />
                          </div>
                        </div>
                      ) : (
                        <p className="text-[12.5px] text-muted-foreground">{s.northStar?.vision ? "Less than 12 months of results" : "North Star not yet agreed"}</p>
                      )}
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Current 90-day priorities</p>
                      <ul className="space-y-1">
                        {s.priorities.map((p) => (
                          <li key={p.id} className="flex min-w-0 items-center gap-2 text-[13px]">
                            <StatusDot status={p.status} />
                            <span className="min-w-0 truncate">{p.title}</span>
                          </li>
                        ))}
                        {!s.priorities.length && <li className="text-[13px] text-muted-foreground">No priorities agreed yet.</li>}
                      </ul>
                    </div>
                  </div>
                  <div className="grid gap-4 px-4 py-3 sm:grid-cols-[1fr_200px]">
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Matters needing Omni support</p>
                      <ul className="space-y-1.5">
                        {s.escalatedIssues.slice(0, 3).map((i) => (
                          <li key={i.id}>
                            <Link href={`/c/${s.company.slug}/execution/issue/${i.id}`} className="flex items-start gap-2 text-[13px] hover:underline">
                              <AlertTriangle className={cn("mt-0.5 size-3.5 shrink-0", i.priority === "critical" ? "text-off-ink" : "text-risk-ink")} />
                              <span className="line-clamp-1">{i.title}</span>
                            </Link>
                          </li>
                        ))}
                        {!s.escalatedIssues.length && <li className="text-[13px] text-muted-foreground">No critical or escalated issues.</li>}
                      </ul>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {attention.items.length} item{attention.items.length === 1 ? "" : "s"} need attention this week · KPI exceptions: {s.exceptions.filter((e) => e.status === "off_track").slice(0, 3).map((e) => e.metric.name).join(", ") || "none"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.reporting.map((r) => (
                          <Badge key={`${r.kind}${r.periodStart}`} variant={REPORT_STATE[r.state].variant} title={`${REPORT_META[r.kind].label} · ${r.periodLabel}`}>
                            {REPORT_META[r.kind].short} {r.periodLabel}: {REPORT_STATE[r.state].label.toLowerCase()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[12.5px]">
                      <dt className="text-muted-foreground">Overdue actions</dt>
                      <dd className={cn("text-right tabular", s.overdueActions.length > 2 && "font-medium text-off-ink")}>
                        {s.overdueActions.length}/{s.openActions.length}
                      </dd>
                      <dt className="text-muted-foreground">Weekly cadence</dt>
                      <dd className={cn("text-right tabular", s.meetingsLast4Weeks < 4 && "text-risk-ink")}>{s.meetingsLast4Weeks}/4</dd>
                      <dt className="text-muted-foreground">Org. actions</dt>
                      <dd className={cn("text-right tabular", orgOverdue > 0 && "text-risk-ink")}>
                        {s.orgActions.length}
                        {orgOverdue ? ` · ${orgOverdue} late` : ""}
                      </dd>
                      <dt className="text-muted-foreground">Last offsite</dt>
                      <dd className="text-right">{s.lastOffsite ? formatDate(s.lastOffsite.scheduled_at, { year: false }) : "—"}</dd>
                      <dt className="text-muted-foreground">Next offsite</dt>
                      <dd className={cn("text-right", !s.nextOffsite && "text-risk-ink")}>{s.nextOffsite ? formatDate(s.nextOffsite.scheduled_at, { year: false }) : "Not set"}</dd>
                      {ic?.target_moic && (
                        <>
                          <dt className="text-muted-foreground">Target MOIC</dt>
                          <dd className="text-right tabular">{Number(ic.target_moic).toFixed(1)}x</dd>
                        </>
                      )}
                    </dl>
                  </div>
                  {note && (
                    <div className="flex items-start gap-2 border-t bg-muted/30 px-4 py-2.5 text-[12.5px]">
                      <Flag className={cn("mt-0.5 size-3.5 shrink-0", note.intervention_level === "intervene" ? "text-off-ink" : "text-brand-ink")} />
                      <p className="line-clamp-2">
                        <span className="font-medium">Omni: {LEVEL[note.intervention_level as keyof typeof LEVEL]}.</span> <span className="text-muted-foreground">{note.body}</span>
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {comparables.length > 0 && (
            <Card className="mt-5" data-testid="portfolio-intelligence">
              <CardHeader>
                <CardTitle>Comparable financial and retention metrics</CardTitle>
                <span className="text-xs text-muted-foreground">Governed data only; compared only where definitions match</span>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] whitespace-nowrap tabular">
                  <thead className="border-b text-[11px] text-muted-foreground">
                    <tr><th className="px-4 py-2 text-left font-medium">Company</th>{PORTFOLIO_METRICS.map((m) => <th key={m.key} className="px-2 text-right font-medium">{m.label}</th>)}<th className="px-4 text-left font-medium">Data</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {comparables.map((r) => (
                      <tr key={r.companyId}>
                        <td className="px-4 py-2 font-medium"><Link href={`/c/${r.slug}/revenue`} className="hover:underline">{r.name}</Link></td>
                        {PORTFOLIO_METRICS.map((m) => {
                          const c = r.cells[m.key];
                          if (!c) return <td key={m.key} className="px-2 text-right text-muted-foreground">—</td>;
                          // where companies measure this differently, show each figure under its own definition, unranked
                          if (!comparableAcross(comparables, m.key)) return <td key={m.key} className="px-2 text-right text-muted-foreground italic" title={`${c.label} (${c.group ?? "company-specific"}) — a different methodology from the other companies, so not compared`}>{fmt(c.value, m.unit)}<span className="block text-[10.5px] not-italic">{c.label}, not comparable</span></td>;
                          return <td key={m.key} className="px-2 text-right">{fmt(c.value, m.unit)}</td>;
                        })}
                        <td className="px-4 text-xs text-muted-foreground">{r.synthetic ? "Synthetic" : "Governed"} · {r.period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 pb-3 text-xs text-muted-foreground">Companies without a governed data source are not shown. Retention for services businesses (contract value retention) is not compared with software GRR/NRR.</p>
            </Card>
          )}

          {integrations.length > 0 && (
            <Card className="mt-5" data-testid="portfolio-integrations">
              <CardHeader>
                <CardTitle>Integrations across the portfolio</CardTitle>
                <span className="text-xs text-muted-foreground">Verified milestones and verified synergies only</span>
              </CardHeader>
              <div className="divide-y">
                {integrations.map(({ s, r }) => (
                  <Link key={r.a.id} href={`/c/${s.company.slug}/integrations/${r.a.id}`} className="grid items-center gap-3 px-4 py-2.5 hover:bg-accent/40 md:grid-cols-[1fr_200px_160px_110px]">
                    <span className="flex min-w-0 items-center gap-3"><CompanyMark name={s.company.name} color={s.company.brand_color} logoUrl={logoOf.get(s.company.id)} /><span className="truncate text-[13px]"><span className="font-medium">{r.a.name}</span> <span className="text-muted-foreground">· {s.company.name}</span></span></span>
                    {r.activities ? <MilestoneMeter sum={r.sum} /> : <span className="text-xs text-muted-foreground">Planning</span>}
                    <span className="text-xs text-muted-foreground tabular">{r.totals.target ? `${money(r.totals.realised)} of ${money(r.totals.target)} synergies` : "No synergy targets yet"}</span>
                    <span className="md:text-right">{r.a.status === "active" ? <HealthBadge health={r.sum.health} /> : <span className="text-xs text-muted-foreground">{r.a.status.replace(/_/g, " ")}</span>}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <div className="mt-5 grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Escalated to Omni</CardTitle>
                <span className="text-xs text-muted-foreground">{escalations.length} open</span>
              </CardHeader>
              <div className="divide-y">
                {escalations.map(({ i, s }) => (
                  <Link key={i.id} href={`/c/${s.company.slug}/execution/issue/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                    <CompanyMark name={s.company.name} color={s.company.brand_color} logoUrl={logoOf.get(s.company.id)} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{i.title}</span>
                    <PriorityBadge priority={i.priority} />
                    <span className="w-24 text-right text-xs text-muted-foreground">{relativeDays(i.created_at)}</span>
                  </Link>
                ))}
                {!escalations.length && <p className="px-4 py-3 text-sm text-muted-foreground">Nothing escalated.</p>}
              </div>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <CalendarClock className="size-3.5 text-muted-foreground" /> Upcoming meetings, Boards and offsites
                </CardTitle>
              </CardHeader>
              <div className="divide-y">
                {snaps
                  .flatMap((s) => [s.nextMeeting, s.nextBoard, s.nextOffsite].filter((m, i, a) => m && a.findIndex((x) => x?.id === m.id) === i).map((m) => ({ s, m: m! })))
                  .sort((a, b) => a.m.scheduled_at.localeCompare(b.m.scheduled_at))
                  .map(({ s, m }) => (
                    <Link key={m.id} href={`/c/${s.company.slug}/meetings/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                      <CompanyMark name={s.company.name} color={s.company.brand_color} logoUrl={logoOf.get(s.company.id)} />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{m.title}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(m.scheduled_at, { year: false })}</span>
                    </Link>
                  ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular">{value}</p>
      <p className="text-[11.5px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: number | null }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular">{value}</p>
      <p className={cn("text-[11.5px] tabular", delta === null ? "text-muted-foreground" : delta >= 0 ? "text-on-ink" : delta > -0.05 ? "text-risk-ink" : "text-off-ink")}>{formatPct(delta, 1, true)} vs plan</p>
    </div>
  );
}
