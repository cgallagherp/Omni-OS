import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CircleAlert, Gavel, Play } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate, formatMetric, formatMoney, formatPct, relativeDays } from "@/lib/domain/format";
import { exceptionReason } from "@/lib/domain/metric-view";
import { quarterLabel, quarterProgress } from "@/lib/domain/quarters";
import { MEETING_TYPE_LABEL } from "@/lib/domain/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CompanyMark } from "@/components/os/logo";
import { Owner } from "@/components/os/avatar";
import { MetricCard, TrendIcon, targetLabel } from "@/components/os/metric-card";
import { PriorityBadge, StatusBadge, StatusBar, StatusDot } from "@/components/os/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Blueprint" };

const toneFor = (s: string) => (s === "on_track" ? "on" : s === "at_risk" ? "risk" : s === "off_track" || s === "missed" ? "off" : s === "done" ? "done" : "default") as "on" | "risk" | "off" | "done" | "default";

export default async function BlueprintPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const s = await loadCompanySnapshot(ctx.supabase, ctx.company.companyId);
  if (!s) return null;
  const base = `/c/${slug}`;
  const cur = s.company.currency;
  const ns = s.northStar;
  const q = s.activeQuarter;
  const qp = q ? quarterProgress(q) : null;

  // Last-twelve-months run-rate for the North Star financial targets
  const ltm = (key: string) => {
    const v = s.metrics.find((m) => m.metric.comparable_key === key);
    if (!v) return null;
    const pts = v.points.filter((p) => p.value !== null).slice(-12);
    return pts.length === 12 ? pts.reduce((a, p) => a + (p.value ?? 0), 0) : null;
  };
  const ltmRevenue = ltm("revenue");
  const ltmEbitda = ltm("ebitda");
  const journey = (base: number | null | undefined, now: number | null, target: number | null | undefined) =>
    base != null && now != null && target != null && target !== base ? Math.max(0, Math.min(1, (now - base) / (target - base))) : null;

  const keyMetrics = s.metrics.filter((m) => m.metric.is_key);
  const crew = s.crewById;
  const goalsByMove = new Map<string, number>();
  for (const g of s.annualGoals) goalsByMove.set(g.winning_move_id, (goalsByMove.get(g.winning_move_id) ?? 0) + 1);
  const topExceptions = s.exceptions.filter((e) => e.status === "off_track" || e.status === "at_risk").slice(0, 4);
  const pStatus = s.priorityStatus;

  return (
    <div className="fade-in space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CompanyMark name={s.company.name} color={s.company.brand_color} size="lg" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{s.company.name}</h1>
            <p className="text-[13px] text-muted-foreground">
              {s.company.sector} · FY{s.fiscalYear}
              {q && qp && (
                <>
                  {" "}· {quarterLabel(q)} · week {qp.week} of {qp.total}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {s.nextMeeting && (
            <Button asChild variant={s.nextMeeting.status === "in_progress" ? "brand" : "outline"} size="sm">
              <Link href={`${base}/meetings/${s.nextMeeting.id}`}>
                {s.nextMeeting.status === "in_progress" ? <Play /> : <CalendarClock />}
                {s.nextMeeting.status === "in_progress" ? "Rejoin live meeting" : `${MEETING_TYPE_LABEL[s.nextMeeting.type]} · ${relativeDays(s.nextMeeting.scheduled_at)}`}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Health strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 xl:grid-cols-6">
        <HealthTile
          label="Revenue YTD"
          value={formatMoney(s.financials.revenue?.actual, cur)}
          sub={s.financials.revenue ? `${formatPct(s.financials.revenue.variancePct, 1, true)} vs plan ${formatMoney(s.financials.revenue.plan, cur)}` : "No revenue metric"}
          tone={varianceTone(s.financials.revenue?.variancePct)}
        />
        <HealthTile
          label="EBITDA YTD"
          value={formatMoney(s.financials.ebitda?.actual, cur)}
          sub={s.financials.ebitda ? `${formatPct(s.financials.ebitda.variancePct, 1, true)} vs plan ${formatMoney(s.financials.ebitda.plan, cur)}` : "No EBITDA metric"}
          tone={varianceTone(s.financials.ebitda?.variancePct)}
        />
        <HealthTile
          label="90-day commitments"
          value={`${pStatus.on_track + pStatus.done}/${s.priorities.length}`}
          sub={`${pStatus.at_risk} at risk · ${pStatus.off_track} off track`}
          tone={pStatus.off_track > 0 ? "off" : pStatus.at_risk > 0 ? "risk" : "on"}
          bar={{ on: pStatus.on_track, done: pStatus.done, risk: pStatus.at_risk, off: pStatus.off_track }}
        />
        <HealthTile
          label="KPIs on target"
          value={`${s.kpi.on_track}/${s.kpi.total}`}
          sub={`${s.kpi.at_risk} at risk · ${s.kpi.off_track} off track`}
          tone={s.kpi.off_track > 2 ? "off" : s.kpi.off_track > 0 || s.kpi.at_risk > 0 ? "risk" : "on"}
          bar={{ on: s.kpi.on_track, risk: s.kpi.at_risk, off: s.kpi.off_track, none: s.kpi.no_data }}
        />
        <HealthTile
          label="Overdue actions"
          value={String(s.overdueActions.length)}
          sub={`${s.openActions.length} open in total`}
          tone={s.overdueActions.length > 3 ? "off" : s.overdueActions.length > 0 ? "risk" : "on"}
          href={`${base}/execution?view=actions&filter=overdue`}
        />
        <HealthTile
          label="Open issues"
          value={String(s.openIssues.length)}
          sub={`${s.openIssues.filter((i) => i.priority === "critical").length} critical · ${s.openIssues.filter((i) => i.escalated_to_omni).length} escalated`}
          tone={s.openIssues.some((i) => i.priority === "critical") ? "off" : s.openIssues.length ? "risk" : "on"}
          href={`${base}/execution?view=issues`}
        />
      </div>

      {/* Attention */}
      {topExceptions.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-risk/40 bg-risk-bg/50 px-3.5 py-2.5 sm:flex-row sm:items-center">
          <div className="flex shrink-0 items-center gap-2 text-[13px] font-medium">
            <AlertTriangle className="size-4 text-risk" /> Needs attention
          </div>
          <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1">
            {topExceptions.map((e) => (
              <Link key={e.metric.id} href={`${base}/scoreboard/${e.metric.id}`} className="inline-flex items-center gap-1.5 text-[13px] hover:underline">
                <StatusDot status={e.status} />
                <span className="font-medium">{e.metric.name}</span>
                <span className="text-muted-foreground tabular">
                  {formatMetric(e.latest?.value, e.metric.unit, { decimals: e.metric.decimals, currency: cur })} vs {targetLabel(e.metric, e.latest?.target ?? e.metric.target_value, cur)}
                </span>
                {e.deteriorating && <TrendIcon trend="declining" />}
              </Link>
            ))}
          </div>
          {s.nextMeeting && (
            <span className="shrink-0 text-xs text-muted-foreground">On the agenda for {formatDate(s.nextMeeting.scheduled_at, { year: false })}</span>
          )}
        </div>
      )}

      {/* North Star */}
      {ns && (
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[1.4fr_1fr]">
            <div className="border-b p-5 lg:border-r lg:border-b-0">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-brand uppercase">North Star</p>
                <Link href={`${base}/north-star`} className="text-xs text-muted-foreground hover:text-foreground">
                  Strategy <ArrowRight className="inline size-3" />
                </Link>
              </div>
              <p className="mt-2 text-[15px] leading-relaxed font-medium text-balance">{ns.vision}</p>
              <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{ns.three_year_destination}</p>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <Destination label={`Revenue FY${ns.target_year}`} target={formatMoney(ns.target_revenue, cur)} now={ltmRevenue !== null ? `${formatMoney(ltmRevenue, cur)} LTM` : null} pct={journey(ns.baseline_revenue, ltmRevenue, ns.target_revenue)} />
                <Destination label={`EBITDA FY${ns.target_year}`} target={formatMoney(ns.target_ebitda, cur)} now={ltmEbitda !== null ? `${formatMoney(ltmEbitda, cur)} LTM` : null} pct={journey(ns.baseline_ebitda, ltmEbitda, ns.target_ebitda)} />
                <Destination label="Exit enterprise value" target={formatMoney(ns.target_ev, cur)} now={null} pct={null} />
              </div>
            </div>
            <div className="p-5">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Winning Moves</p>
              <ul className="mt-2.5 space-y-2.5">
                {s.winningMoves.map((w, i) => (
                  <li key={w.id}>
                    <Link href={`${base}/flight-plan/winning_move/${w.id}`} className="group block">
                      <div className="flex items-center gap-2">
                        <span className="w-4 text-xs text-muted-foreground tabular">{i + 1}</span>
                        <span className="flex-1 truncate text-[13px] font-medium group-hover:underline">{w.title}</span>
                        <StatusDot status={w.status} />
                      </div>
                      <div className="mt-1 flex items-center gap-2 pl-6">
                        <Progress value={w.progress} tone={toneFor(w.status)} className="h-1" />
                        <span className="w-8 text-right text-[11px] text-muted-foreground tabular">{w.progress}%</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Scoreboard */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Scoreboard</h2>
          <Link href={`${base}/scoreboard`} className="text-xs text-muted-foreground hover:text-foreground">
            All {s.metrics.length} KPIs <ArrowRight className="inline size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {keyMetrics.map((v) => (
            <MetricCard key={v.metric.id} view={v} href={`${base}/scoreboard/${v.metric.id}`} currency={cur} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        {/* 90-day commitments */}
        <Card>
          <CardHeader>
            <CardTitle>
              90-Day Commitments {q && <span className="font-normal text-muted-foreground">· {quarterLabel(q)}</span>}
            </CardTitle>
            {qp && <span className="text-xs text-muted-foreground">{qp.daysLeft} days left</span>}
          </CardHeader>
          <div className="divide-y">
            {s.priorities.map((p) => {
              const goal = s.annualGoals.find((g) => g.id === p.annual_goal_id);
              return (
                <Link key={p.id} href={`${base}/flight-plan/quarterly_priority/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{p.title}</p>
                    {goal && <p className="truncate text-xs text-muted-foreground">→ {goal.title}</p>}
                  </div>
                  <Owner person={crew.get(p.owner_id)} className="hidden w-24 sm:inline-flex" />
                  <div className="hidden w-24 items-center gap-2 md:flex">
                    <Progress value={p.progress} tone={toneFor(p.status)} className="h-1" />
                    <span className="w-7 text-right text-[11px] text-muted-foreground tabular">{p.progress}%</span>
                  </div>
                  <StatusBadge status={p.status} className="w-[74px] justify-center" />
                </Link>
              );
            })}
            {s.priorities.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No priorities in the active quarter.</p>}
          </div>
        </Card>

        {/* Annual goals */}
        <Card>
          <CardHeader>
            <CardTitle>Annual Goals · FY{s.fiscalYear}</CardTitle>
            <Link href={`${base}/flight-plan`} className="text-xs text-muted-foreground hover:text-foreground">
              Flight Plan <ArrowRight className="inline size-3" />
            </Link>
          </CardHeader>
          <div className="divide-y">
            {s.annualGoals.map((g) => (
              <Link key={g.id} href={`${base}/flight-plan/annual_goal/${g.id}`} className="block px-4 py-2.5 hover:bg-accent/50">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[13px] font-medium">{g.title}</span>
                  <StatusDot status={g.status} />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress value={g.progress} tone={toneFor(g.status)} className="h-1" />
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular">
                    {g.unit && g.current_value !== null ? `${formatMetric(Number(g.current_value), g.unit, { currency: cur })} / ${formatMetric(Number(g.target_value), g.unit, { currency: cur })}` : `${g.progress}%`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Issues */}
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <CircleAlert className="size-3.5 text-muted-foreground" /> Issues
            </CardTitle>
            <Link href={`${base}/execution?view=issues`} className="text-xs text-muted-foreground hover:text-foreground">
              {s.openIssues.length} open <ArrowRight className="inline size-3" />
            </Link>
          </CardHeader>
          <div className="divide-y">
            {s.openIssues.slice(0, 5).map((i) => (
              <Link key={i.id} href={`${base}/execution/issue/${i.id}`} className="block px-4 py-2.5 hover:bg-accent/50">
                <p className="line-clamp-2 text-[13px] leading-snug font-medium">{i.title}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <PriorityBadge priority={i.priority} />
                  {i.escalated_to_omni && <Badge variant="brand">Escalated to Omni</Badge>}
                  <Owner person={crew.get(i.owner_id)} className="ml-auto" />
                </div>
              </Link>
            ))}
            {s.openIssues.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No open issues.</p>}
          </div>
        </Card>

        {/* Decisions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Gavel className="size-3.5 text-muted-foreground" /> Recent decisions
            </CardTitle>
            <Link href={`${base}/execution?view=decisions`} className="text-xs text-muted-foreground hover:text-foreground">
              Log <ArrowRight className="inline size-3" />
            </Link>
          </CardHeader>
          <div className="divide-y">
            {s.recentDecisions.slice(0, 5).map((d) => (
              <div key={d.id} className="px-4 py-2.5">
                <p className="line-clamp-2 text-[13px] leading-snug">{d.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(d.decided_on)} · {crew.get(d.owner_id)?.full_name}
                </p>
              </div>
            ))}
            {s.recentDecisions.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No decisions recorded yet.</p>}
          </div>
        </Card>

        {/* Execution */}
        <Card>
          <CardHeader>
            <CardTitle>Execution</CardTitle>
            <Link href={`${base}/execution?view=actions`} className="text-xs text-muted-foreground hover:text-foreground">
              {s.openActions.length} open actions <ArrowRight className="inline size-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            <div className="divide-y">
              {[...s.overdueActions, ...s.openActions.filter((a) => !s.overdueActions.includes(a))].slice(0, 5).map((a) => {
                const overdue = s.overdueActions.includes(a);
                return (
                  <div key={a.id} className="flex items-center gap-2 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate text-[13px]">{a.title}</span>
                    <Owner person={crew.get(a.owner_id)} showName={false} />
                    <span className={cn("w-20 shrink-0 text-right text-[11.5px] tabular", overdue ? "font-medium text-off" : "text-muted-foreground")}>
                      {overdue ? relativeDays(a.due_date) : formatDate(a.due_date, { year: false })}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="border-t px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Management rhythm</p>
              <dl className="grid grid-cols-2 gap-y-1.5 text-[12.5px]">
                <dt className="text-muted-foreground">Last weekly</dt>
                <dd className="text-right">{s.lastWeekly ? formatDate(s.lastWeekly.scheduled_at, { year: false }) : "—"}</dd>
                <dt className="text-muted-foreground">Last review</dt>
                <dd className="text-right">{s.lastReview ? `${formatDate(s.lastReview.scheduled_at, { year: false })}` : "—"}</dd>
                <dt className="text-muted-foreground">Weekly cadence (4 wks)</dt>
                <dd className={cn("text-right tabular", s.meetingsLast4Weeks < 4 && "text-risk")}>{s.meetingsLast4Weeks}/4 held</dd>
                <dt className="text-muted-foreground">Next quarterly reset</dt>
                <dd className="text-right">{s.nextQuarterly ? formatDate(s.nextQuarterly.scheduled_at) : "—"}</dd>
              </dl>
            </div>
          </CardContent>
        </Card>
      </div>

      {s.exceptions.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {s.exceptions.length} KPI exceptions this period:{" "}
          {s.exceptions
            .slice(0, 6)
            .map((e) => `${e.metric.name} (${exceptionReason(e).toLowerCase()})`)
            .join(", ")}
          {s.exceptions.length > 6 ? "…" : ""}
        </p>
      )}
    </div>
  );
}

function varianceTone(v: number | null | undefined): "on" | "risk" | "off" | "default" {
  if (v === null || v === undefined) return "default";
  if (v >= 0) return "on";
  if (v > -0.05) return "risk";
  return "off";
}

function HealthTile({ label, value, sub, tone, bar, href }: { label: string; value: string; sub: string; tone: "on" | "risk" | "off" | "default"; bar?: Partial<Record<"on" | "risk" | "off" | "done" | "none", number>>; href?: string }) {
  const accent = { on: "bg-on", risk: "bg-risk", off: "bg-off", default: "bg-muted-foreground/40" }[tone];
  const body = (
    <div className="relative h-full bg-card px-4 py-3 transition-colors hover:bg-accent/40">
      <span className={cn("absolute top-3.5 left-0 h-4 w-[3px] rounded-r", accent)} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular">{value}</p>
      {bar ? <StatusBar counts={bar} className="mt-1.5 mb-1" /> : null}
      <p className="truncate text-[11.5px] text-muted-foreground">{sub}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Destination({ label, target, now, pct }: { label: string; target: string; now: string | null; pct: number | null }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tracking-tight tabular">{target}</p>
      {pct !== null ? (
        <>
          <Progress value={pct * 100} tone="brand" className="mt-1 h-1" />
          <p className="mt-1 text-[11px] text-muted-foreground">{now} · {Math.round(pct * 100)}% of the journey</p>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">{now ?? "Target at exit"}</p>
      )}
    </div>
  );
}
