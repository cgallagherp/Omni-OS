import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Flag, Plus } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formOptions } from "@/lib/data/options";
import { formatDate, formatMetric, formatMoney } from "@/lib/domain/format";
import { quarterLabel } from "@/lib/domain/quarters";
import { fiscalYearStart } from "@/lib/domain/metrics";
import { saveAnnualGoal, savePriority, saveWinningMove } from "@/lib/actions/flight-plan";
import { PageHeader } from "@/components/os/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Owner } from "@/components/os/avatar";
import { StatusDot } from "@/components/os/status";
import { AnnualGoalDialog, PriorityDialog, WinningMoveDialog } from "@/components/os/entity-forms";
import { InlineProgress, InlineStatus } from "@/components/flight-plan/inline-status";
import { Roadmap } from "@/components/flight-plan/roadmap";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Flight Plan" };

const tone = (s: string) => (s === "on_track" ? "on" : s === "at_risk" ? "risk" : s === "off_track" || s === "missed" ? "off" : s === "done" ? "done" : "default") as "on" | "risk" | "off" | "done" | "default";

export default async function FlightPlanPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const { slug } = await params;
  const { view } = await searchParams;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) return null;
  const options = await formOptions(ctx.supabase, snap);
  const [{ data: quarters }, { data: allPriorities }, { data: actions }, { data: milestones }] = await Promise.all([
    ctx.supabase.from("quarters").select("*").eq("company_id", cid).order("start_date"),
    ctx.supabase.from("quarterly_priorities").select("*").eq("company_id", cid).order("sort_order"),
    ctx.supabase.from("actions").select("id, quarterly_priority_id, status, due_date").eq("company_id", cid).not("quarterly_priority_id", "is", null),
    ctx.supabase.from("milestones").select("*").eq("company_id", cid).order("target_date"),
  ]);
  const fyQuarters = (quarters ?? []).filter((q) => q.year === snap.fiscalYear || q.status !== "closed");
  const visibleQuarterIds = new Set(fyQuarters.filter((q) => q.status !== "closed").map((q) => q.id));
  const quarterById = new Map((quarters ?? []).map((q) => [q.id, q]));
  const priorities = (allPriorities ?? []).filter((p) => visibleQuarterIds.has(p.quarter_id));
  const today = new Date().toISOString().slice(0, 10);
  const actionStats = (pid: string) => {
    const a = (actions ?? []).filter((x) => x.quarterly_priority_id === pid);
    return { open: a.filter((x) => x.status === "open").length, overdue: a.filter((x) => x.status === "open" && x.due_date && x.due_date < today).length };
  };
  const settings = (snap.company.settings ?? {}) as { max_three_year_outcomes?: number; priority_target?: number; max_priorities?: number };
  const max = settings.max_three_year_outcomes ?? 5;
  const priorityTarget = settings.priority_target ?? 3;
  const activePriorities = snap.priorities.filter((p) => p.outcome !== "stopped");
  const fyStartIso = fiscalYearStart(snap.now, snap.company.fiscal_year_start_month);
  const fyStart = new Date(`${fyStartIso}T00:00:00Z`);
  const fyEndIso = new Date(Date.UTC(fyStart.getUTCFullYear() + 1, fyStart.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const milestoneCount = (pid: string) => {
    const ms = snap.priorityMilestones.filter((m) => m.priority_id === pid);
    return ms.length ? `${ms.filter((m) => m.done).length}/${ms.length} milestones` : null;
  };
  const cur = snap.company.currency;
  const ns = snap.northStar;
  const mode = view === "roadmap" ? "roadmap" : "hierarchy";

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Flight Plan"
        title="How we get there"
        description="North Star → Three-Year Outcomes → 12-Month Objectives → 90-Day Priorities → Actions. Every priority connects to a 12-month objective and, through it, the North Star."
        actions={
          <>
            <div className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {(["hierarchy", "roadmap"] as const).map((v) => (
                <Link key={v} href={`/c/${slug}/flight-plan${v === "roadmap" ? "?view=roadmap" : ""}`} className={cn("inline-flex h-7 items-center rounded-md px-3 text-[13px] font-medium capitalize", mode === v ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {v === "hierarchy" ? "List" : "Roadmap"}
                </Link>
              ))}
            </div>
            {ctx.can.write && snap.winningMoves.length < max && (
              <WinningMoveDialog trigger={<Button size="sm"><Plus /> Three-Year Outcome</Button>} action={saveWinningMove.bind(null, cid, null)} crew={options.crew} />
            )}
          </>
        }
      />

      {ns && (
        <Link href={`/c/${slug}/north-star`} className="mb-4 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:border-foreground/20">
          <Compass className="size-5 text-brand-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">North Star · FY{ns.target_year}</p>
            <p className="truncate text-sm font-medium">{ns.vision}</p>
          </div>
          <div className="hidden gap-5 text-right text-sm sm:flex">
            <div>
              <p className="text-[11px] text-muted-foreground">Revenue</p>
              <p className="font-semibold tabular">{formatMoney(ns.target_revenue, cur)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">EBITDA</p>
              <p className="font-semibold tabular">{formatMoney(ns.target_ebitda, cur)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">EV</p>
              <p className="font-semibold tabular">{formatMoney(ns.target_ev, cur)}</p>
            </div>
          </div>
        </Link>
      )}

      {mode === "roadmap" ? (
        <Roadmap
          slug={slug}
          year={snap.fiscalYear}
          moves={snap.winningMoves}
          goals={snap.annualGoals}
          priorities={(allPriorities ?? []).filter((p) => quarterById.get(p.quarter_id)?.year === snap.fiscalYear)}
          milestones={(milestones ?? []).filter((m) => m.target_date.startsWith(String(snap.fiscalYear)))}
          crew={snap.crew}
        />
      ) : (
        <div className="space-y-4">
          {snap.activeQuarter && (
            <div
              className={cn(
                "flex flex-col gap-1 rounded-lg border px-4 py-2.5 text-[13px] sm:flex-row sm:items-center sm:gap-3",
                activePriorities.length > priorityTarget ? "border-risk/50 bg-risk-bg/50" : "bg-card",
              )}
              data-testid="priority-focus"
            >
              <span className="font-medium">
                {quarterLabel(snap.activeQuarter)}: {activePriorities.length} 90-day priorit{activePriorities.length === 1 ? "y" : "ies"}
              </span>
              <span className="text-muted-foreground">
                {activePriorities.length > priorityTarget
                  ? `Omni guidance is about ${priorityTarget}. More priorities dilute focus — consider stopping or combining some at the next offsite.`
                  : activePriorities.length === 0
                    ? "No priorities yet — agree about three, each with one owner, a defined outcome and measurable success criteria."
                    : `Focus on less: about ${priorityTarget}, each with one owner, a defined outcome, success criteria, milestones and a deadline.`}
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {snap.winningMoves.length} of {max} Three-Year Outcomes · FY{snap.fiscalYear} · showing priorities for {fyQuarters.filter((q) => q.status !== "closed").map((q) => quarterLabel(q)).join(", ")}
          </p>
          {snap.winningMoves.map((w, i) => {
            const goals = snap.annualGoals.filter((g) => g.winning_move_id === w.id);
            return (
              <Card key={w.id} className="overflow-hidden">
                <div className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background">{i + 1}</span>
                    <div className="min-w-0">
                      <Link href={`/c/${slug}/flight-plan/winning_move/${w.id}`} className="font-semibold hover:underline">
                        {w.title}
                      </Link>
                      {w.measurable_outcome && <p className="text-xs text-muted-foreground">{w.measurable_outcome}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-9 sm:pl-0">
                    <Owner person={snap.crewById.get(w.owner_id)} />
                    <div className="flex w-28 items-center gap-1.5">
                      <Progress value={w.progress} tone={tone(w.status)} className="h-1" />
                      <span className="text-[11px] text-muted-foreground tabular">{w.progress}%</span>
                    </div>
                    <InlineStatus companyId={cid} entity="winning_move" id={w.id} status={w.status} canWrite={ctx.can.write} />
                  </div>
                </div>
                <div className="divide-y">
                  {goals.map((g) => {
                    const ps = priorities.filter((p) => p.annual_goal_id === g.id);
                    return (
                      <div key={g.id} className="px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="flex min-w-0 flex-1 items-center gap-2 pl-0 sm:pl-9">
                            <Flag className="size-3.5 shrink-0 text-muted-foreground" />
                            <Link href={`/c/${slug}/flight-plan/annual_goal/${g.id}`} className="truncate text-[13.5px] font-medium hover:underline">
                              {g.title}
                            </Link>
                            {g.unit && g.target_value !== null && (
                              <span className="hidden shrink-0 text-xs text-muted-foreground tabular md:inline">
                                {formatMetric(g.current_value === null ? null : Number(g.current_value), g.unit, { currency: cur })} / {formatMetric(Number(g.target_value), g.unit, { currency: cur })}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 pl-5 sm:pl-0">
                            <Owner person={snap.crewById.get(g.owner_id)} />
                            <InlineProgress companyId={cid} entity="annual_goal" id={g.id} progress={g.progress} canWrite={ctx.can.write} />
                            <InlineStatus companyId={cid} entity="annual_goal" id={g.id} status={g.status} canWrite={ctx.can.write} />
                          </div>
                        </div>
                        <div className="mt-2 space-y-1 sm:pl-[60px]">
                          {ps.map((p) => {
                            const st = actionStats(p.id);
                            const q = quarterById.get(p.quarter_id);
                            return (
                              <div key={p.id} className="flex flex-col gap-1 rounded-md border bg-card px-3 py-2 sm:flex-row sm:items-center">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <StatusDot status={p.status} />
                                  <Link href={`/c/${slug}/flight-plan/quarterly_priority/${p.id}`} className="truncate text-[13px] hover:underline">
                                    {p.title}
                                  </Link>
                                  {q && q.status !== "active" && <Badge variant="outline">{quarterLabel(q)} draft</Badge>}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  {st.open > 0 && (
                                    <span className={cn(st.overdue && "text-off-ink")}>
                                      {st.open} action{st.open > 1 ? "s" : ""}
                                      {st.overdue ? ` · ${st.overdue} overdue` : ""}
                                    </span>
                                  )}
                                  {milestoneCount(p.id) && <span className="hidden md:inline">{milestoneCount(p.id)}</span>}
                                  <span className="hidden sm:inline">Due {formatDate(p.due_date, { year: false })}</span>
                                  <Owner person={snap.crewById.get(p.owner_id)} />
                                  <InlineProgress companyId={cid} entity="quarterly_priority" id={p.id} progress={p.progress} canWrite={ctx.can.write} />
                                  <InlineStatus companyId={cid} entity="quarterly_priority" id={p.id} status={p.status} canWrite={ctx.can.write} />
                                </div>
                              </div>
                            );
                          })}
                          {ctx.can.write && (
                            <PriorityDialog
                              trigger={
                                <button className="flex items-center gap-1 px-1 py-1 text-xs text-muted-foreground hover:text-foreground">
                                  <Plus className="size-3" /> Add priority
                                </button>
                              }
                              action={savePriority.bind(null, cid, null)}
                              crew={options.crew}
                              goals={options.goals}
                              quarters={options.quarters}
                              defaults={{ annual_goal_id: g.id, owner_id: g.owner_id, start_date: snap.activeQuarter?.start_date, due_date: snap.activeQuarter?.end_date }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {goals.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground sm:pl-[52px]">No 12-month objectives for FY{snap.fiscalYear} yet.</p>}
                  {ctx.can.write && (
                    <div className="px-4 py-2 sm:pl-[52px]">
                      <AnnualGoalDialog
                        trigger={
                          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <Plus className="size-3" /> Add 12-month objective
                          </button>
                        }
                        action={saveAnnualGoal.bind(null, cid, null)}
                        crew={options.crew}
                        moves={options.moves}
                        fiscalYear={snap.fiscalYear}
                        defaults={{ winning_move_id: w.id, owner_id: w.owner_id, start_date: fyStartIso, due_date: fyEndIso }}
                      />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
          {snap.winningMoves.length >= max && <p className="text-xs text-muted-foreground">The Three-Year Outcome limit ({max}) is reached — focus on less. Administrators can change the limit in Settings.</p>}
        </div>
      )}
    </div>
  );
}
