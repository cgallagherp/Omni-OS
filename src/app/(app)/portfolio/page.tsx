import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarClock, Flag } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { healthOf, loadCompanySnapshots } from "@/lib/data/snapshot";
import { formatDate, formatMoney, formatPct, relativeDays } from "@/lib/domain/format";
import { BAND_META } from "@/lib/domain/health";
import { quarterLabel } from "@/lib/domain/quarters";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompanyMark } from "@/components/os/logo";
import { PriorityBadge, StatusBar } from "@/components/os/status";
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

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Omni Portfolio"
        title="Portfolio overview"
        description={`Execution across ${snaps.length} authorised portfolio compan${snaps.length === 1 ? "y" : "ies"}, ordered by who needs attention first.`}
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

          <div className="grid gap-5 xl:grid-cols-2">
            {rows.map(({ s, health, note, ic }) => {
              const rev = s.financials.revenue;
              const eb = s.financials.ebitda;
              const ps = s.priorityStatus;
              const band = BAND_META[health.band];
              return (
                <Card key={s.company.id} className="overflow-hidden">
                  <Link href={`/c/${s.company.slug}`} className="flex items-center gap-3 border-b px-4 py-3 hover:bg-accent/40">
                    <CompanyMark name={s.company.name} color={s.company.brand_color} size="md" />
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
                        <span className="text-on">{ps.on_track + ps.done}</span> / <span className="text-risk">{ps.at_risk}</span> / <span className="text-off">{ps.off_track}</span>
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
                  <div className="grid gap-4 px-4 py-3 sm:grid-cols-[1fr_200px]">
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Requires escalation</p>
                      <ul className="space-y-1.5">
                        {s.escalatedIssues.slice(0, 3).map((i) => (
                          <li key={i.id}>
                            <Link href={`/c/${s.company.slug}/execution/issue/${i.id}`} className="flex items-start gap-2 text-[13px] hover:underline">
                              <AlertTriangle className={cn("mt-0.5 size-3.5 shrink-0", i.priority === "critical" ? "text-off" : "text-risk")} />
                              <span className="line-clamp-1">{i.title}</span>
                            </Link>
                          </li>
                        ))}
                        {!s.escalatedIssues.length && <li className="text-[13px] text-muted-foreground">No critical or escalated issues.</li>}
                      </ul>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Top KPI exceptions: {s.exceptions.filter((e) => e.status === "off_track").slice(0, 3).map((e) => e.metric.name).join(", ") || "none"}
                      </p>
                    </div>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[12.5px]">
                      <dt className="text-muted-foreground">Overdue actions</dt>
                      <dd className={cn("text-right tabular", s.overdueActions.length > 2 && "font-medium text-off")}>
                        {s.overdueActions.length}/{s.openActions.length}
                      </dd>
                      <dt className="text-muted-foreground">Weekly cadence</dt>
                      <dd className={cn("text-right tabular", s.meetingsLast4Weeks < 4 && "text-risk")}>{s.meetingsLast4Weeks}/4</dd>
                      <dt className="text-muted-foreground">Last review</dt>
                      <dd className="text-right">{s.lastReview ? relativeDays(s.lastReview.scheduled_at) : "—"}</dd>
                      <dt className="text-muted-foreground">Next quarterly</dt>
                      <dd className="text-right">{s.nextQuarterly ? formatDate(s.nextQuarterly.scheduled_at, { year: false }) : "—"}</dd>
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
                      <Flag className={cn("mt-0.5 size-3.5 shrink-0", note.intervention_level === "intervene" ? "text-off" : "text-brand")} />
                      <p className="line-clamp-2">
                        <span className="font-medium">Omni: {LEVEL[note.intervention_level as keyof typeof LEVEL]}.</span> <span className="text-muted-foreground">{note.body}</span>
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Escalated to Omni</CardTitle>
                <span className="text-xs text-muted-foreground">{escalations.length} open</span>
              </CardHeader>
              <div className="divide-y">
                {escalations.map(({ i, s }) => (
                  <Link key={i.id} href={`/c/${s.company.slug}/execution/issue/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                    <CompanyMark name={s.company.name} color={s.company.brand_color} />
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
                  <CalendarClock className="size-3.5 text-muted-foreground" /> Upcoming management meetings
                </CardTitle>
              </CardHeader>
              <div className="divide-y">
                {snaps
                  .flatMap((s) => (s.nextMeeting ? [{ s, m: s.nextMeeting }] : []))
                  .sort((a, b) => a.m.scheduled_at.localeCompare(b.m.scheduled_at))
                  .map(({ s, m }) => (
                    <Link key={m.id} href={`/c/${s.company.slug}/meetings/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                      <CompanyMark name={s.company.name} color={s.company.brand_color} />
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
      <p className={cn("text-[11.5px] tabular", delta === null ? "text-muted-foreground" : delta >= 0 ? "text-on" : delta > -0.05 ? "text-risk" : "text-off")}>{formatPct(delta, 1, true)} vs plan</p>
    </div>
  );
}
