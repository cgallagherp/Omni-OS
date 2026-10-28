import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadAgentWork } from "@/lib/data/agents";
import { AgentQuarterSummary } from "@/components/agents/agent-notice";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formOptions } from "@/lib/data/options";
import { formatDate, formatMetric, formatMoney, formatPct } from "@/lib/domain/format";
import { quarterLabel, quarterProgress } from "@/lib/domain/quarters";
import { OUTCOME_LABEL } from "@/lib/domain/status";
import { savePriority, saveAnnualGoal } from "@/lib/actions/flight-plan";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Owner } from "@/components/os/avatar";
import { PriorityBadge, StatusBar, StatusDot } from "@/components/os/status";
import { AnnualGoalDialog, PriorityDialog } from "@/components/os/entity-forms";
import { OrgActionDialog } from "@/components/crew/forms";
import {
  ApproveButton,
  CarryForwardButton,
  CompanyUpdateForm,
  KeepDropToggle,
  OffsiteToggle,
  OutcomeForm,
  ReflectionsForm,
  StageNotes,
  StartResetButton,
  StrategicQuestions,
} from "@/components/reset/reset-controls";
import type { ListeningRound, QuarterlyPriority } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Quarterly offsite" };

const STAGES = [
  "Revisit the North Star",
  "Review the last 90 days",
  "Review the scorecard",
  "Employee listening",
  "Customer listening",
  "Crew",
  "Strategic issues",
  "Set the next 90 days",
];

const OUTCOME_TONE = { achieved: "on", partly_achieved: "risk", missed: "off", stopped: "outline" } as const;

export default async function QuarterlyOffsitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) return null;
  const q = snap.activeQuarter;
  const agentWork = await loadAgentWork(ctx.supabase, cid, { since: q ? `${q.start_date}T00:00:00Z` : undefined });
  const [{ data: resets }, { data: quarters }, { data: closedPriorities }] = await Promise.all([
    ctx.supabase.from("quarterly_resets").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
    ctx.supabase.from("quarters").select("*").eq("company_id", cid).order("start_date", { ascending: false }),
    ctx.supabase.from("quarterly_priorities").select("id, quarter_id, title, outcome, outcome_note, owner_id").eq("company_id", cid).not("outcome", "is", null),
  ]);
  const quarterById = new Map((quarters ?? []).map((x) => [x.id, x]));
  const draft = (resets ?? []).find((r) => r.status === "draft" && r.from_quarter_id === q?.id);
  const history = (resets ?? []).filter((r) => r.status === "approved");
  const options = await formOptions(ctx.supabase, snap);
  const cur = snap.company.currency;
  const priorityTarget = ((snap.company.settings ?? {}) as { priority_target?: number }).priority_target ?? 3;

  const header = (
    <PageHeader
      eyebrow="Quarterly offsite"
      title={q ? `Stop and reset: close ${quarterLabel(q)} and set the next 90 days` : "Quarterly offsite"}
      description="Eight stages: revisit the North Star, review the last 90 days and the scorecard, hear from employees and customers, look at the Crew, settle two or three strategic issues, then agree about three priorities for the next 90 days."
    />
  );

  const comparison = <Comparison history={history} quarterById={quarterById} priorities={closedPriorities ?? []} crewById={snap.crewById} />;

  if (!q) return <div className="fade-in">{header}<p className="text-sm text-muted-foreground">No active quarter.</p>{comparison}</div>;
  const qp = quarterProgress(q);

  if (!draft) {
    return (
      <div className="fade-in space-y-5">
        {header}
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-medium">
                {quarterLabel(q)} · week {qp.week} of {qp.total} · {qp.daysLeft} days left
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {snap.nextOffsite ? `Offsite scheduled for ${formatDate(snap.nextOffsite.scheduled_at)}. ` : ""}Starting the offsite prepares the next quarter as a draft. Current priorities stay live until the next 90 days are approved.
              </p>
              <Progress value={qp.pct * 100} tone="brand" className="mt-3 max-w-md" />
            </div>
            {ctx.can.write && <StartResetButton companyId={cid} label={`Start the ${quarterLabel(q)} offsite`} />}
          </CardContent>
        </Card>
        {comparison}
      </div>
    );
  }

  const next = quarterById.get(draft.to_quarter_id)!;
  const [{ data: nextPriorities }, { data: rounds }, { data: orgActions }, { data: nextGoals }] = await Promise.all([
    ctx.supabase.from("quarterly_priorities").select("*").eq("company_id", cid).eq("quarter_id", next.id).order("sort_order"),
    ctx.supabase.from("listening_rounds").select("*").eq("company_id", cid).order("held_on", { ascending: false }),
    ctx.supabase.from("org_actions").select("*").eq("company_id", cid).neq("status", "closed").order("priority"),
    ctx.supabase.from("annual_goals").select("id, title, owner_id, fiscal_year").eq("company_id", cid).eq("fiscal_year", snap.fiscalYear + 1),
  ]);
  const carried = new Set((nextPriorities ?? []).map((p) => p.carried_from_id).filter(Boolean));
  const locked = draft.status !== "draft";
  const canEdit = ctx.can.write && !locked;
  const notes = (draft.stage_notes ?? {}) as Record<string, string>;
  const review = (draft.scorecard_review ?? {}) as Record<string, "keep" | "drop">;
  const questions = (draft.strategic_questions ?? []) as Array<{ question: string; conclusion: string }>;
  const classified = snap.priorities.filter((p) => p.outcome).length;
  const inQuarter = (period: string) => period >= q.start_date && period <= q.end_date;
  const kpiRows = snap.metrics.map((v) => {
    const pts = v.points.filter((p) => inQuarter(p.period) && p.value !== null);
    return { v, pts, on: pts.filter((p) => p.status === "on_track").length, risk: pts.filter((p) => p.status === "at_risk").length, off: pts.filter((p) => p.status === "off_track").length };
  });
  const employee = (rounds ?? []).filter((r) => r.kind === "employee");
  const customer = (rounds ?? []).filter((r) => r.kind === "customer");
  const strategicCandidates = snap.openIssues.filter((i) => i.priority === "critical" || i.priority === "high");
  const stages = [...STAGES, ...(draft.is_annual ? ["Annual: objectives & budget"] : []), "Approve & communicate"];
  const companyUpdateDraft = [
    `Team — here is what we agreed at our ${quarterLabel(q)} offsite.`,
    "",
    snap.northStar?.vision ? `Where we are going: ${snap.northStar.vision}` : "",
    "",
    `Last 90 days: ${snap.priorities.filter((p) => p.outcome === "achieved").length} of ${snap.priorities.length} priorities achieved.`,
    ...snap.priorities.filter((p) => p.outcome).map((p) => `• ${p.title} — ${OUTCOME_LABEL[p.outcome!].toLowerCase()}`),
    "",
    `Our priorities for ${quarterLabel(next)}:`,
    ...(nextPriorities ?? []).map((p) => `• ${p.title} (${snap.crewById.get(p.owner_id)?.full_name ?? "owner tbc"})`),
    "",
    "What we heard from you and from customers, and what we are doing about it, will follow in the next all-hands.",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");

  return (
    <div className="fade-in">
      {header}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-2.5">
        <span className="text-[13px]">
          <span className="font-medium">{quarterLabel(q)} → {quarterLabel(next)}</span>
          {snap.nextOffsite && <span className="text-muted-foreground"> · offsite {formatDate(snap.nextOffsite.scheduled_at)}</span>}
        </span>
        <OffsiteToggle companyId={cid} resetId={draft.id} field="is_annual" checked={draft.is_annual} disabled={!canEdit} label="This is the annual strategy reset (adds 12-month objectives and budget)" />
      </div>
      <nav className="sticky top-0 z-10 -mx-4 mb-5 flex gap-1 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" aria-label="Offsite stages">
        {stages.map((s, i) => (
          <a key={s} href={`#stage-${i + 1}`} className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground">
            <span className="flex size-5 items-center justify-center rounded-full border text-[10px] tabular">{i + 1}</span>
            {s}
          </a>
        ))}
      </nav>

      <div className="space-y-5">
        <Stage n={1} title="Revisit the North Star" subtitle="Is the destination still right? Confirm it, or change it on the North Star page (changes are versioned).">
          <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-2 text-sm">
              <p className="font-medium">{snap.northStar?.vision || <span className="text-muted-foreground italic">Vision not yet agreed</span>}</p>
              {snap.northStar?.target_end_state && <p className="text-muted-foreground">{snap.northStar.target_end_state}</p>}
              <p className="text-xs text-muted-foreground">
                Targets FY{snap.northStar?.target_year}: revenue {formatMoney(snap.northStar?.target_revenue, cur)} · EBITDA {formatMoney(snap.northStar?.target_ebitda, cur)} ·{" "}
                <Link href={`/c/${slug}/north-star`} className="underline">open the North Star</Link>
              </p>
              <OffsiteToggle companyId={cid} resetId={draft.id} field="north_star_confirmed" checked={draft.north_star_confirmed} disabled={!canEdit} label="North Star confirmed for the next 90 days" />
            </div>
            <StageNotes companyId={cid} resetId={draft.id} stage="north_star" defaultValue={notes.north_star ?? ""} disabled={!canEdit} placeholder="What, if anything, should change about the destination?" />
          </div>
        </Stage>

        <Stage n={2} title={`Review the last 90 days · ${classified}/${snap.priorities.length} classified`} subtitle="Record each priority as achieved, partly achieved, missed or stopped, with a short rationale. Carry forward only what still matters.">
          <div className="divide-y">
            {snap.priorities.map((p) => (
              <div key={p.id} className="space-y-2 px-4 py-3" data-testid={`outcome-${p.id}`}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <Link href={`/c/${slug}/flight-plan/quarterly_priority/${p.id}`} className="min-w-0 flex-1 text-[13.5px] font-medium hover:underline">
                    {p.title}
                  </Link>
                  <Owner person={snap.crewById.get(p.owner_id)} />
                  <StatusDot status={p.status} />
                  {p.outcome && <Badge variant={OUTCOME_TONE[p.outcome]}>{OUTCOME_LABEL[p.outcome]}</Badge>}
                  {canEdit && (p.outcome === "partly_achieved" || p.outcome === "missed") && <CarryForwardButton companyId={cid} resetId={draft.id} priorityId={p.id} carried={carried.has(p.id)} />}
                  {carried.has(p.id) && !canEdit && <Badge variant="outline">Carried forward</Badge>}
                </div>
                {p.success_criteria && <p className="text-xs text-muted-foreground">Success criteria: {p.success_criteria}</p>}
                <OutcomeForm companyId={cid} resetId={draft.id} priorityId={p.id} outcome={p.outcome} note={p.outcome_note} disabled={!canEdit} />
              </div>
            ))}
            {!snap.priorities.length && <p className="px-4 py-3 text-sm text-muted-foreground">No priorities in {quarterLabel(q)}.</p>}
          </div>
          <div className="border-t p-4">
            <ReflectionsForm companyId={cid} resetId={draft.id} defaults={draft} disabled={!canEdit} />
          </div>
        </Stage>

        <Stage n={3} title="Review the scorecard" subtitle="Keep the measures that tell you how the business is really performing; drop the rest. Dropped KPIs are archived with their history when the plan is approved.">
          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {kpiRows.map(({ v, pts, on, risk, off }) => (
              <div key={v.metric.id} className={cn("bg-card px-4 py-2.5", review[v.metric.id] === "drop" && "opacity-60")}>
                <div className="flex items-center gap-2">
                  <StatusDot status={v.status} />
                  <Link href={`/c/${slug}/scoreboard/${v.metric.id}`} className="flex-1 truncate text-[13px] font-medium hover:underline">
                    {v.metric.name}
                  </Link>
                  <span className="text-xs font-medium tabular">{formatMetric(v.latest?.value, v.metric.unit, { decimals: v.metric.decimals, currency: cur })}</span>
                </div>
                <StatusBar counts={{ on, risk, off }} className="mt-1.5" />
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    {pts.length} period{pts.length === 1 ? "" : "s"} · {on} on · {risk} at risk · {off} off{v.metric.in_weekly_scorecard ? " · Monday scorecard" : ""}
                  </p>
                  <KeepDropToggle companyId={cid} resetId={draft.id} metricId={v.metric.id} decision={review[v.metric.id]} disabled={!canEdit} />
                </div>
              </div>
            ))}
          </div>
          <div className="border-t p-4">
            <StageNotes companyId={cid} resetId={draft.id} stage="scorecard" defaultValue={notes.scorecard ?? ""} disabled={!canEdit} placeholder="Measures to add or change next quarter" />
          </div>
        </Stage>

        <Stage n={4} title="Employee listening" subtitle="What people below the ELT are telling us. Aggregate results only — never individual responses.">
          <ListeningSummary round={employee[0]} previous={employee[1]} slug={slug} kind="employee" />
          <div className="border-t p-4">
            <StageNotes companyId={cid} resetId={draft.id} stage="employee" defaultValue={notes.employee ?? ""} disabled={!canEdit} placeholder="What we heard and what we will do about it" />
          </div>
        </Stage>

        <Stage n={5} title="Customer listening" subtitle="What customers are telling us: satisfaction, retention and themes.">
          <ListeningSummary round={customer[0]} previous={customer[1]} slug={slug} kind="customer" />
          <div className="border-t p-4">
            <StageNotes companyId={cid} resetId={draft.id} stage="customer" defaultValue={notes.customer ?? ""} disabled={!canEdit} placeholder="What we heard and what we will do about it" />
          </div>
        </Stage>

        <Stage
          n={6}
          title="Crew"
          subtitle="Can the organisation deliver the next 90 days? Agree organisational actions only."
          action={
            canEdit && (
              <OrgActionDialog companyId={cid} crew={options.crew} priorities={options.priorities} goals={options.goals} trigger={<Button size="sm" variant="outline"><Plus /> Organisational action</Button>} />
            )
          }
        >
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <ul className="space-y-1.5">
              {(orgActions ?? []).map((g) => (
                <li key={g.id} className="flex items-start gap-2 text-[13px]">
                  <PriorityBadge priority={g.priority} />
                  <span className="flex-1">{g.title}</span>
                  <span className="text-xs text-muted-foreground">{g.target_date ? formatDate(g.target_date, { year: false }) : ""}</span>
                </li>
              ))}
              {snap.crew.filter((c) => c.is_open_seat).map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[13px]">
                  <Badge variant="risk">Open seat</Badge> {c.full_name}
                </li>
              ))}
              {!orgActions?.length && !snap.crew.some((c) => c.is_open_seat) && <li className="text-sm text-muted-foreground">No open organisational actions.</li>}
            </ul>
            <div className="space-y-2">
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-px size-3.5 shrink-0" /> Record agreed organisational actions (e.g. “Hire a CRO by Q2”). Discussions about individuals stay outside Omni OS.
              </p>
              <StageNotes companyId={cid} resetId={draft.id} stage="crew" defaultValue={notes.crew ?? ""} disabled={!canEdit} placeholder="Organisational conclusions (structure, critical roles, capability)" />
            </div>
          </div>
        </Stage>

        <Stage n={7} title="Strategic issues" subtitle="Two or three issues that matter most to the North Star — discuss, decide, conclude.">
          <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
            <StrategicQuestions companyId={cid} resetId={draft.id} initial={questions} disabled={!canEdit} />
            <div className="space-y-4">
              {q && <AgentQuarterSummary slug={slug} work={agentWork} since={q.start_date} />}
              <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Open high-priority issues</p>
              <ul className="space-y-1.5">
                {strategicCandidates.map((i) => (
                  <li key={i.id} className="flex items-start gap-2 text-[13px]">
                    <PriorityBadge priority={i.priority} />
                    <Link href={`/c/${slug}/execution/issue/${i.id}`} className="hover:underline">
                      {i.title}
                    </Link>
                  </li>
                ))}
                {!strategicCandidates.length && <li className="text-sm text-muted-foreground">None open.</li>}
              </ul>
              </div>
            </div>
          </div>
        </Stage>

        <Stage
          n={8}
          title={`Set the next 90 days · ${quarterLabel(next)}`}
          subtitle={`About ${priorityTarget} priorities, each with one owner, a defined outcome, measurable success criteria, milestones and a deadline.`}
          action={
            canEdit && (
              <PriorityDialog
                trigger={<Button size="sm"><Plus /> Add priority</Button>}
                action={savePriority.bind(null, cid, null)}
                crew={options.crew}
                goals={options.goals}
                quarters={options.quarters.filter((o) => o.id === next.id)}
                defaults={{ quarter_id: next.id, start_date: next.start_date, due_date: next.end_date, status: "on_track" }}
              />
            )
          }
        >
          <NextPriorities priorities={nextPriorities ?? []} slug={slug} goals={snap.annualGoals} crewById={snap.crewById} />
          {(nextPriorities?.length ?? 0) > priorityTarget && <p className="border-t px-4 py-2 text-xs text-risk-ink">{nextPriorities!.length} priorities — Omni guidance is about {priorityTarget}. Consider stopping or combining some.</p>}
        </Stage>

        {draft.is_annual && (
          <Stage
            n={9}
            title={`Annual strategy reset · FY${snap.fiscalYear + 1}`}
            subtitle="North Star → Flight Plan → 12-month objectives → budget. Agree next year's objectives here; the budget follows from them."
            action={
              canEdit && (
                <AnnualGoalDialog
                  trigger={<Button size="sm" variant="outline"><Plus /> 12-month objective</Button>}
                  action={saveAnnualGoal.bind(null, cid, null)}
                  crew={options.crew}
                  moves={options.moves}
                  fiscalYear={snap.fiscalYear + 1}
                  defaults={{ fiscal_year: snap.fiscalYear + 1, status: "not_started" }}
                />
              )
            }
          >
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <ul className="space-y-1.5">
                {(nextGoals ?? []).map((g) => (
                  <li key={g.id} className="flex items-center gap-2 text-[13px]">
                    <Link href={`/c/${slug}/flight-plan/annual_goal/${g.id}`} className="flex-1 hover:underline">
                      {g.title}
                    </Link>
                    <Owner person={snap.crewById.get(g.owner_id)} />
                  </li>
                ))}
                {!nextGoals?.length && <li className="text-sm text-muted-foreground">No FY{snap.fiscalYear + 1} objectives yet.</li>}
              </ul>
              <StageNotes companyId={cid} resetId={draft.id} stage="annual" defaultValue={notes.annual ?? ""} disabled={!canEdit} placeholder="Budget assumptions and capital allocation agreed for next year" />
            </div>
          </Stage>
        )}

        <Stage n={draft.is_annual ? 10 : 9} title="Approve and communicate" subtitle="Approval closes the last 90 days with the results recorded above and makes the new plan active. Previous plans stay available and comparable.">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <dl className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Classified" value={`${classified}/${snap.priorities.length}`} warn={classified < snap.priorities.length} />
              <Stat label={`${quarterLabel(next)} priorities`} value={String(nextPriorities?.length ?? 0)} warn={!nextPriorities?.length} />
              <Stat label="Carried forward" value={String(carried.size)} />
              <Stat label="KPIs to drop" value={String(Object.values(review).filter((d) => d === "drop").length)} />
            </dl>
            {ctx.can.admin ? (
              <ApproveButton companyId={cid} resetId={draft.id} label={`Approve the ${quarterLabel(next)} plan`} />
            ) : (
              <p className="text-sm text-muted-foreground">The CEO or a company administrator approves the plan.</p>
            )}
          </div>
          <div className="border-t p-4">
            <p className="mb-2 text-[13px] font-medium">Company-wide update from the CEO</p>
            <CompanyUpdateForm companyId={cid} resetId={draft.id} defaultValue={draft.company_update} draft={companyUpdateDraft} disabled={!ctx.can.admin} />
          </div>
        </Stage>

        {comparison}
      </div>
    </div>
  );
}

function Stage({ n, title, subtitle, action, children }: { n: number; title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card id={`stage-${n}`} className="scroll-mt-16">
      <CardHeader className="items-start py-3">
        <div className="flex gap-3">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">{n}</span>
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {action}
      </CardHeader>
      {children}
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-lg font-semibold tabular", warn && "text-risk-ink")}>{value}</dd>
    </div>
  );
}

function ListeningSummary({ round, previous, slug, kind }: { round: ListeningRound | undefined; previous: ListeningRound | undefined; slug: string; kind: "employee" | "customer" }) {
  if (!round)
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        No {kind} listening recorded yet. <Link href={`/c/${slug}/listening`} className="underline">Record a listening round</Link>
      </p>
    );
  const delta = (a: number | null, b: number | null | undefined) => (a !== null && b !== null && b !== undefined ? a - b : null);
  const metrics: Array<[string, number | null, number | null, string]> =
    kind === "employee"
      ? [
          ["Engagement", round.engagement, delta(round.engagement, previous?.engagement), "%"],
          ["eNPS", round.enps, delta(round.enps, previous?.enps), ""],
          ["Confidence in leadership", round.leadership_confidence, delta(round.leadership_confidence, previous?.leadership_confidence), "%"],
          ["Clarity of accountability", round.clarity_accountability, delta(round.clarity_accountability, previous?.clarity_accountability), "%"],
        ]
      : [
          ["NPS", round.nps, delta(round.nps, previous?.nps), ""],
          ["Satisfaction", round.satisfaction, delta(round.satisfaction, previous?.satisfaction), "%"],
          ["Retention", round.retention, delta(round.retention, previous?.retention), "%"],
          ["Churn", round.churn, delta(round.churn, previous?.churn), "%"],
        ];
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr]">
      <div>
        <p className="text-xs text-muted-foreground">
          {formatDate(round.held_on)} · {round.method} · {round.responses ?? "—"} responses
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map(([label, v, d, unit]) => (
            <div key={label}>
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular">
                {v === null ? "—" : `${Number(v)}${unit}`}
                {d !== null && d !== 0 && <span className={cn("ml-1 text-xs", (label === "Churn" ? -d : d) > 0 ? "text-on-ink" : "text-off-ink")}>{formatPct(d / 100, 0, true).replace("%", unit ? "pt" : "")}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Themes</p>
        <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
          {((round.themes as string[]) ?? []).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {round.summary && <p className="mt-2 text-[13px] text-muted-foreground">{round.summary}</p>}
      </div>
    </div>
  );
}

function NextPriorities({ priorities, slug, goals, crewById }: { priorities: QuarterlyPriority[]; slug: string; goals: Array<{ id: string; title: string }>; crewById: Map<string, { full_name: string; avatar_color: string | null }> }) {
  return (
    <div className="divide-y">
      {priorities.map((p) => (
        <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <Link href={`/c/${slug}/flight-plan/quarterly_priority/${p.id}`} className="text-[13.5px] font-medium hover:underline">
              {p.title}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {p.measurable_outcome ? `${p.measurable_outcome} · ` : ""}→ {goals.find((g) => g.id === p.annual_goal_id)?.title ?? "12-month objective"}
            </p>
          </div>
          {p.carried_from_id && <Badge variant="risk">Carried over</Badge>}
          {!p.success_criteria && <Badge variant="outline">No success criteria</Badge>}
          <Owner person={crewById.get(p.owner_id) as never} />
          <span className="text-xs text-muted-foreground">{formatDate(p.due_date, { year: false })}</span>
        </div>
      ))}
      {!priorities.length && <p className="px-4 py-4 text-sm text-muted-foreground">No priorities agreed yet. Add new ones or carry forward from stage 2.</p>}
    </div>
  );
}

/** Previous plans: what each quarter committed to and how it ended, side by side. */
function Comparison({
  history,
  quarterById,
  priorities,
  crewById,
}: {
  history: Array<{ id: string; from_quarter_id: string; to_quarter_id: string; approved_at: string | null; wins: string | null; lessons: string | null; company_update: string | null; is_annual: boolean }>;
  quarterById: Map<string, { year: number; quarter: number }>;
  priorities: Array<{ id: string; quarter_id: string; title: string; outcome: string | null; outcome_note: string | null; owner_id: string }>;
  crewById: Map<string, { full_name: string }>;
}) {
  if (!history.length) return null;
  return (
    <Card data-testid="offsite-history">
      <CardHeader>
        <CardTitle>Previous offsites and plans</CardTitle>
        <span className="text-xs text-muted-foreground">Results by quarter</span>
      </CardHeader>
      <div className="divide-y">
        {history.map((r) => {
          const from = quarterById.get(r.from_quarter_id);
          const ps = priorities.filter((p) => p.quarter_id === r.from_quarter_id);
          const n = (o: string) => ps.filter((p) => p.outcome === o).length;
          return (
            <details key={r.id} className="px-4 py-3">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-medium">{from && quarterLabel(from)}</span>
                {r.is_annual && <Badge variant="brand">Annual reset</Badge>}
                <StatusBar counts={{ on: n("achieved"), risk: n("partly_achieved"), off: n("missed"), none: n("stopped") }} className="w-28" />
                <span className="text-xs text-muted-foreground">
                  {n("achieved")} achieved · {n("partly_achieved")} partly · {n("missed")} missed · {n("stopped")} stopped
                </span>
                <span className="ml-auto text-xs text-muted-foreground">Approved {formatDate(r.approved_at)}</span>
              </summary>
              <ul className="mt-2 divide-y rounded-md border text-[13px]">
                {ps.map((p) => (
                  <li key={p.id} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="flex-1 font-medium">{p.title}</span>
                    <span className="text-xs text-muted-foreground">{crewById.get(p.owner_id)?.full_name}</span>
                    {p.outcome && <Badge variant={OUTCOME_TONE[p.outcome as keyof typeof OUTCOME_TONE]}>{OUTCOME_LABEL[p.outcome as keyof typeof OUTCOME_LABEL]}</Badge>}
                    {p.outcome_note && <span className="text-xs text-muted-foreground sm:max-w-xs">{p.outcome_note}</span>}
                  </li>
                ))}
              </ul>
              {(r.wins || r.lessons) && (
                <dl className="mt-2 grid gap-2 text-[13px] sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">What went well</dt>
                    <dd>{r.wins}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Lessons</dt>
                    <dd>{r.lessons}</dd>
                  </div>
                </dl>
              )}
              {r.company_update && (
                <div className="mt-2 rounded-md bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Company-wide update</p>
                  <p className="mt-1 text-[13px] whitespace-pre-line">{r.company_update}</p>
                </div>
              )}
            </details>
          );
        })}
      </div>
    </Card>
  );
}
