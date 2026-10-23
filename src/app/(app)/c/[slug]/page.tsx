import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleAlert, Flag, Gauge, Mail, Play, Users } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { attentionOf, loadCompanySnapshot, onboardingActive } from "@/lib/data/snapshot";
import { formatDate, formatMetric, formatMoney, formatPct, relativeDays } from "@/lib/domain/format";
import { quarterLabel, quarterProgress } from "@/lib/domain/quarters";
import { MEETING_TYPE_LABEL } from "@/lib/domain/status";
import { REPORT_META } from "@/lib/domain/reporting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CompanyLogo, CompanyMark } from "@/components/os/logo";
import { Owner } from "@/components/os/avatar";
import { MetricCard } from "@/components/os/metric-card";
import { StatusBadge, StatusBar, StatusDot } from "@/components/os/status";
import { cn } from "@/lib/utils";
import { OmniPanel } from "@/components/portfolio/omni-panel";

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
  const attention = attentionOf(s);
  const inOnboarding = onboardingActive(s);
  const onboardingDone = s.onboarding.filter((m) => m.status === "done").length;
  const daysSinceCompletion = s.company.acquired_on ? Math.floor((s.now.getTime() - Date.parse(`${s.company.acquired_on}T00:00:00Z`)) / 86400000) : null;

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
  const pStatus = s.priorityStatus;
  const leaders = s.crew.filter((c) => c.is_leadership);
  const openSeats = s.crew.filter((c) => c.is_open_seat);
  const thisWeek = s.sentScorecards.find((w) => w.week_start === s.weekStart);
  const nextReports = s.reporting.filter((r) => r.state === "due" || r.state === "draft" || r.state === "overdue").slice(0, 3);
  const milestonesFor = (id: string) => s.priorityMilestones.filter((m) => m.priority_id === id);
  const logoUrl = ctx.company.branding.logoUrl;

  return (
    <div className="fade-in space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {logoUrl ? <CompanyLogo name={s.company.name} logoUrl={logoUrl} className="h-10 max-w-[180px]" /> : <CompanyMark name={s.company.name} color={ctx.company.brandColor} size="lg" />}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              {s.company.name} <span className="font-normal text-muted-foreground">· Blueprint</span>
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {s.company.sector} · FY{s.fiscalYear}
              {q && qp && (
                <>
                  {" "}· {quarterLabel(q)} · week {qp.week} of {qp.total}
                </>
              )}
              {inOnboarding && daysSinceCompletion !== null && <> · day {daysSinceCompletion} of the first 100</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`${base}/weekly-scorecard`}>
              <Mail /> Monday scorecard
            </Link>
          </Button>
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

      {/* Mission Control: attention vs routine */}
      <Card className={cn(attention.items.length ? "border-risk/50" : "border-on/40")} data-testid="attention">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            {attention.items.length ? <AlertTriangle className="size-4 text-risk-ink" /> : <CheckCircle2 className="size-4 text-on-ink" />}
            {attention.items.length ? `Needs attention this week · ${attention.items.length}` : "Nothing needs attention this week"}
          </CardTitle>
          <Link href={`${base}/mission-control`} className="text-xs text-muted-foreground hover:text-foreground">
            Mission Control <ArrowRight className="inline size-3" />
          </Link>
        </CardHeader>
        {attention.items.length > 0 && (
          <div className="grid divide-y md:grid-cols-2 md:divide-y-0 [&>*]:min-w-0">
            {[0, 1].map((col) => (
              <div key={col} className="divide-y md:border-r md:last:border-r-0">
                {attention.items
                  .slice(0, 8)
                  .filter((_, idx) => idx % 2 === col)
                  .map((a, idx) => (
                    <Link key={idx} href={`${base}${a.href}`} className="flex items-start gap-2.5 px-4 py-2 hover:bg-accent/50">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.severity === "off" ? "bg-off" : "bg-risk")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{a.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
                      </span>
                      {a.ownerId && <Owner person={crew.get(a.ownerId)} showName={false} />}
                    </Link>
                  ))}
              </div>
            ))}
          </div>
        )}
        <div className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Routine:</span> {attention.routine.kpisOnTrack} of {attention.routine.kpisTotal} scorecard KPIs on track · {attention.routine.prioritiesOnTrack} of {attention.routine.prioritiesTotal} priorities on track · {attention.routine.issuesRoutine} other open issues
          {attention.items.length > 8 && <> · {attention.items.length - 8} more in Mission Control</>}
        </div>
      </Card>

      {inOnboarding && (
        <Link href={`${base}/onboarding`} className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 hover:bg-accent/40 sm:flex-row sm:items-center">
          <span className="flex items-center gap-2 text-[13px] font-medium">
            <Flag className="size-4 text-brand-ink" /> First 100 days
          </span>
          <Progress value={(onboardingDone / s.onboarding.length) * 100} tone="brand" className="sm:max-w-xs" />
          <span className="text-xs text-muted-foreground">
            {onboardingDone} of {s.onboarding.length} milestones complete · next: {s.onboarding.find((m) => m.status !== "done")?.title}
          </span>
        </Link>
      )}

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
          label="90-Day Priorities"
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

      {/* North Star */}
      {ns ? (
        <Card className="overflow-hidden">
          <div className="grid [&>*]:min-w-0 lg:grid-cols-[1.4fr_1fr]">
            <div className="border-b p-5 lg:border-r lg:border-b-0">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-ink uppercase">North Star</p>
                <Link href={`${base}/north-star`} className="text-xs text-muted-foreground hover:text-foreground">
                  Vision, Mission, Values <ArrowRight className="inline size-3" />
                </Link>
              </div>
              <p className="mt-2 text-[15px] leading-relaxed font-medium text-balance">{ns.vision || <span className="text-muted-foreground italic">Vision not yet agreed</span>}</p>
              {ns.target_end_state && <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{ns.target_end_state}</p>}
              <div className="mt-4 grid grid-cols-3 gap-4">
                <Destination label={`Revenue FY${ns.target_year}`} target={formatMoney(ns.target_revenue, cur)} now={ltmRevenue !== null ? `${formatMoney(ltmRevenue, cur)} LTM` : null} pct={journey(ns.baseline_revenue, ltmRevenue, ns.target_revenue)} />
                <Destination label={`EBITDA FY${ns.target_year}`} target={formatMoney(ns.target_ebitda, cur)} now={ltmEbitda !== null ? `${formatMoney(ltmEbitda, cur)} LTM` : null} pct={journey(ns.baseline_ebitda, ltmEbitda, ns.target_ebitda)} />
                <Destination label="Exit enterprise value" target={formatMoney(ns.target_ev, cur)} now={null} pct={null} />
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Flight Plan · Three-Year Outcomes</p>
                <Link href={`${base}/flight-plan`} className="text-xs text-muted-foreground hover:text-foreground">
                  Flight Plan <ArrowRight className="inline size-3" />
                </Link>
              </div>
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
                {!s.winningMoves.length && <li className="text-sm text-muted-foreground">No three-year outcomes yet.</li>}
              </ul>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-5 text-sm text-muted-foreground">
          The North Star has not been defined yet. <Link className="font-medium text-brand-ink hover:underline" href={`${base}/north-star`}>Define it</Link>
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

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.5fr_1fr]">
        {/* 90-day priorities */}
        <Card>
          <CardHeader>
            <CardTitle>
              90-Day Priorities {q && <span className="font-normal text-muted-foreground">· {quarterLabel(q)}</span>}
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
                    <p className="truncate text-xs text-muted-foreground">
                      {milestonesFor(p.id).length > 0 && <>{milestonesFor(p.id).filter((m) => m.done).length}/{milestonesFor(p.id).length} milestones · </>}
                      {goal ? `→ ${goal.title}` : "Not linked to an objective"}
                    </p>
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
            {s.priorities.length > 3 && <p className="px-4 py-2 text-xs text-risk-ink">{s.priorities.length} priorities this quarter — Omni guidance is about three.</p>}
          </div>
        </Card>

        {/* 12-month objectives */}
        <Card>
          <CardHeader>
            <CardTitle>12-Month Objectives · FY{s.fiscalYear}</CardTitle>
            <Link href={`${base}/flight-plan`} className="text-xs text-muted-foreground hover:text-foreground">
              Flight Plan <ArrowRight className="inline size-3" />
            </Link>
          </CardHeader>
          <div className="divide-y">
            {!s.annualGoals.length && <p className="px-4 py-6 text-sm text-muted-foreground">No 12-month objectives for FY{s.fiscalYear} yet.</p>}
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

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-3">
        {/* Crew summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Users className="size-3.5 text-muted-foreground" /> Crew
            </CardTitle>
            <Link href={`${base}/crew`} className="text-xs text-muted-foreground hover:text-foreground">
              Accountability chart <ArrowRight className="inline size-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Leadership team" value={leaders.length - leaders.filter((l) => l.is_open_seat).length} />
              <Stat label="Open seats" value={openSeats.length} tone={openSeats.length ? "risk" : undefined} />
              <Stat label="Org. actions open" value={s.orgActions.length} />
            </dl>
            <div className="divide-y rounded-md border">
              {s.orgActions.slice(0, 3).map((o) => (
                <div key={o.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px]">{o.title}</span>
                  <span className={cn("shrink-0 text-[11.5px] tabular", o.target_date && o.target_date < s.now.toISOString().slice(0, 10) ? "font-medium text-off-ink" : "text-muted-foreground")}>
                    {o.target_date ? formatDate(o.target_date, { year: false }) : "—"}
                  </span>
                </div>
              ))}
              {!s.orgActions.length && <p className="px-3 py-2 text-sm text-muted-foreground">No open organisational actions.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Mission Control */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Gauge className="size-3.5 text-muted-foreground" /> Mission Control
            </CardTitle>
            <Link href={`${base}/execution`} className="text-xs text-muted-foreground hover:text-foreground">
              Issues & actions <ArrowRight className="inline size-3" />
            </Link>
          </CardHeader>
          <div className="divide-y">
            {s.openIssues.slice(0, 3).map((i) => (
              <Link key={i.id} href={`${base}/execution/issue/${i.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-accent/50">
                <CircleAlert className={cn("size-3.5 shrink-0", i.priority === "critical" ? "text-off-ink" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{i.title}</span>
                <Owner person={crew.get(i.owner_id)} showName={false} />
              </Link>
            ))}
            {s.openIssues.length === 0 && <p className="px-4 py-2.5 text-sm text-muted-foreground">No open issues.</p>}
          </div>
          <div className="border-t px-4 py-3">
            <dl className="grid grid-cols-2 gap-y-1.5 text-[12.5px]">
              <dt className="text-muted-foreground">Open issues</dt>
              <dd className="text-right tabular">{s.openIssues.length}</dd>
              <dt className="text-muted-foreground">Open actions</dt>
              <dd className="text-right tabular">
                {s.openActions.length}
                {s.overdueActions.length > 0 && <span className="text-off-ink"> · {s.overdueActions.length} overdue</span>}
              </dd>
              <dt className="text-muted-foreground">Decisions (last 10)</dt>
              <dd className="text-right tabular">{s.recentDecisions.length}</dd>
              <dt className="text-muted-foreground">Weekly ELT (4 wks)</dt>
              <dd className={cn("text-right tabular", s.meetingsLast4Weeks < 4 && "text-risk-ink")}>{s.meetingsLast4Weeks}/4 held</dd>
            </dl>
          </div>
        </Card>

        {/* Next steps */}
        <Card data-testid="next-steps">
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
            <Link href={`${base}/calendar`} className="text-xs text-muted-foreground hover:text-foreground">
              Calendar <ArrowRight className="inline size-3" />
            </Link>
          </CardHeader>
          <ul className="divide-y text-[13px]">
            <NextStep
              href={`${base}/weekly-scorecard`}
              label="Monday scorecard"
              when={thisWeek?.approved_at ? `Approved ${formatDate(thisWeek.approved_at, { year: false })}` : `Week of ${formatDate(s.weekStart, { year: false })} — awaiting CEO approval`}
              tone={thisWeek?.approved_at ? "on" : "risk"}
            />
            {s.nextMeeting && <NextStep href={`${base}/meetings/${s.nextMeeting.id}`} label={MEETING_TYPE_LABEL[s.nextMeeting.type]} when={`${formatDate(s.nextMeeting.scheduled_at, { year: false })} · ${relativeDays(s.nextMeeting.scheduled_at)}`} />}
            {nextReports.map((r) => (
              <NextStep key={`${r.kind}${r.periodStart}`} href={`${base}/reporting`} label={`${REPORT_META[r.kind].short} · ${r.periodLabel}`} when={`${r.state === "overdue" ? "Overdue — was due" : "Due"} ${formatDate(r.due, { year: false })}`} tone={r.state === "overdue" ? "off" : undefined} />
            ))}
            {s.nextBoard && s.nextBoard.id !== s.nextMeeting?.id && <NextStep href={`${base}/meetings/${s.nextBoard.id}`} label={MEETING_TYPE_LABEL[s.nextBoard.type]} when={formatDate(s.nextBoard.scheduled_at, { year: false })} />}
            <NextStep
              href={`${base}/quarterly-reset`}
              label="Quarterly offsite"
              when={s.nextOffsite ? `${formatDate(s.nextOffsite.scheduled_at)} · ${relativeDays(s.nextOffsite.scheduled_at)}` : "Not scheduled"}
              tone={s.nextOffsite ? undefined : "risk"}
            />
          </ul>
        </Card>
      </div>

      {ctx.can.omni && <OmniPanel supabase={ctx.supabase} companyId={ctx.company.companyId} currency={cur} />}

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

function Stat({ label, value, tone }: { label: string; value: number; tone?: "risk" }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-2">
      <dd className={cn("text-lg font-semibold tabular", tone === "risk" && "text-risk-ink")}>{value}</dd>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}

function NextStep({ href, label, when, tone }: { href: string; label: string; when: string; tone?: "on" | "risk" | "off" }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-2 px-4 py-2 hover:bg-accent/50">
        <span className={cn("size-1.5 shrink-0 rounded-full", tone === "on" ? "bg-on" : tone === "risk" ? "bg-risk" : tone === "off" ? "bg-off" : "bg-muted-foreground/40")} aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className={cn("shrink-0 text-[11.5px] text-muted-foreground", tone === "off" && "text-off-ink")}>{when}</span>
      </Link>
    </li>
  );
}
