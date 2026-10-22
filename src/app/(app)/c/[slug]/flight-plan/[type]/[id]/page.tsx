import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Compass, Flag, Gavel, ListChecks, Pencil, Plus, Target, AlertTriangle, BarChart3 } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formOptions } from "@/lib/data/options";
import { loadActivity } from "@/lib/data/activity";
import { formatDate, formatMetric, relativeDays } from "@/lib/domain/format";
import { quarterLabel } from "@/lib/domain/quarters";
import { saveAction, saveAnnualGoal, savePriority, saveWinningMove, addDependency } from "@/lib/actions/flight-plan";
import { saveIssue } from "@/lib/actions/execution";
import type { AnnualGoal, Issue, QuarterlyPriority, WinningMove } from "@/lib/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Owner } from "@/components/os/avatar";
import { PriorityBadge, StatusDot } from "@/components/os/status";
import { Sparkline } from "@/components/os/sparkline";
import { Activity } from "@/components/os/activity";
import { ActionDialog, AnnualGoalDialog, IssueDialog, PriorityDialog, WinningMoveDialog } from "@/components/os/entity-forms";
import { InlineProgress, InlineStatus } from "@/components/flight-plan/inline-status";
import { ActionCheckbox } from "@/components/execution/action-checkbox";
import { DependencyForm, RemoveDependencyButton } from "@/components/flight-plan/dependencies";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Flight Plan item" };

const TYPES = ["winning_move", "annual_goal", "quarterly_priority"] as const;
type ItemType = (typeof TYPES)[number];
const TABLE = { winning_move: "winning_moves", annual_goal: "annual_goals", quarterly_priority: "quarterly_priorities" } as const;
const LABEL = { winning_move: "Winning Move", annual_goal: "Annual goal", quarterly_priority: "Quarterly priority", action: "Action" } as const;

export default async function ItemPage({ params }: { params: Promise<{ slug: string; type: string; id: string }> }) {
  const { slug, type: rawType, id } = await params;
  if (!TYPES.includes(rawType as ItemType)) notFound();
  const type = rawType as ItemType;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) notFound();

  const { data: item } = await ctx.supabase.from(TABLE[type]).select("*").eq("company_id", cid).eq("id", id).maybeSingle();
  if (!item) notFound();
  const options = await formOptions(ctx.supabase, snap);
  const cur = snap.company.currency;
  const today = new Date().toISOString().slice(0, 10);

  // Hierarchy
  let move: WinningMove | null = null;
  let goal: AnnualGoal | null = null;
  let priority: QuarterlyPriority | null = null;
  if (type === "winning_move") move = item as WinningMove;
  if (type === "annual_goal") goal = item as AnnualGoal;
  if (type === "quarterly_priority") priority = item as QuarterlyPriority;
  if (priority) goal = (await ctx.supabase.from("annual_goals").select("*").eq("id", priority.annual_goal_id).single()).data;
  if (goal && !move) move = (await ctx.supabase.from("winning_moves").select("*").eq("id", goal.winning_move_id).single()).data;

  const [goalsRes, prioritiesRes, actionsRes, issuesRes, depsRes, quartersRes, milestonesRes] = await Promise.all([
    type === "winning_move" ? ctx.supabase.from("annual_goals").select("*").eq("company_id", cid).eq("winning_move_id", id).order("fiscal_year", { ascending: false }).order("sort_order") : Promise.resolve({ data: [] as AnnualGoal[] }),
    type === "annual_goal" ? ctx.supabase.from("quarterly_priorities").select("*").eq("company_id", cid).eq("annual_goal_id", id).order("start_date", { ascending: false }) : Promise.resolve({ data: [] as QuarterlyPriority[] }),
    type === "quarterly_priority" ? ctx.supabase.from("actions").select("*").eq("company_id", cid).eq("quarterly_priority_id", id).order("due_date") : Promise.resolve({ data: [] }),
    type === "winning_move"
      ? Promise.resolve({ data: [] as Issue[] })
      : ctx.supabase.from("issues").select("*").eq("company_id", cid).eq(type === "quarterly_priority" ? "quarterly_priority_id" : "annual_goal_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("dependencies").select("*").eq("company_id", cid).or(`from_id.eq.${id},to_id.eq.${id}`),
    ctx.supabase.from("quarters").select("*").eq("company_id", cid),
    type === "winning_move" ? ctx.supabase.from("milestones").select("*").eq("company_id", cid).eq("winning_move_id", id).order("target_date") : Promise.resolve({ data: [] }),
  ]);
  const issues = issuesRes.data ?? [];
  const issueIds = issues.map((i) => i.id);
  const { data: decisions } = issueIds.length ? await ctx.supabase.from("decisions").select("*").in("issue_id", issueIds).order("decided_on", { ascending: false }) : { data: [] };
  const quarterById = new Map((quartersRes.data ?? []).map((q) => [q.id, q]));

  // Linked KPIs (direct, plus via children for goals/moves)
  const linkKey = type === "winning_move" ? "winning_move_id" : type === "annual_goal" ? "annual_goal_id" : "quarterly_priority_id";
  const metricIds = new Set(snap.metricLinks.filter((l) => l[linkKey] === id).map((l) => l.metric_id));
  const metrics = snap.metrics.filter((v) => metricIds.has(v.metric.id));

  // Dependencies: resolve titles
  const titleOf = (t: string, i: string) =>
    t === "winning_move" ? snap.winningMoves.find((x) => x.id === i)?.title : t === "annual_goal" ? snap.annualGoals.find((x) => x.id === i)?.title : t === "quarterly_priority" ? snap.priorities.find((x) => x.id === i)?.title : snap.openActions.find((x) => x.id === i)?.title;
  const deps = (depsRes.data ?? []).map((d) => {
    const outgoing = d.from_id === id;
    const otherType = outgoing ? d.to_type : d.from_type;
    const otherId = outgoing ? d.to_id : d.from_id;
    return { id: d.id, outgoing, type: otherType, otherId, title: titleOf(otherType, otherId) ?? "Item from a previous period", note: d.note };
  });
  const depTargets = [
    ...snap.winningMoves.map((w) => ({ value: `winning_move:${w.id}`, label: `Winning Move · ${w.title}` })),
    ...snap.annualGoals.map((g) => ({ value: `annual_goal:${g.id}`, label: `Goal · ${g.title}` })),
    ...snap.priorities.map((p) => ({ value: `quarterly_priority:${p.id}`, label: `Priority · ${p.title}` })),
  ].filter((o) => !o.value.endsWith(id));

  const activity = await loadActivity(ctx.supabase, cid, { tables: [TABLE[type]], ids: [id], commentType: type, commentId: id });
  const tone = item.status === "on_track" ? "on" : item.status === "at_risk" ? "risk" : item.status === "off_track" || item.status === "missed" ? "off" : item.status === "done" ? "done" : "default";
  const overdue = item.due_date && item.due_date < today && item.status !== "done";

  return (
    <div className="fade-in">
      {/* Chain of accountability */}
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground" aria-label="Strategy chain">
        <Link href={`/c/${slug}/north-star`} className="inline-flex items-center gap-1 hover:text-foreground">
          <Compass className="size-3.5 text-brand" /> North Star
        </Link>
        {move && (
          <>
            <ChevronRight className="size-3.5" />
            <Link href={`/c/${slug}/flight-plan/winning_move/${move.id}`} className={cn("inline-flex max-w-[240px] items-center gap-1 truncate hover:text-foreground", type === "winning_move" && "text-foreground")}>
              <Target className="size-3.5" /> {move.title}
            </Link>
          </>
        )}
        {goal && (
          <>
            <ChevronRight className="size-3.5" />
            <Link href={`/c/${slug}/flight-plan/annual_goal/${goal.id}`} className={cn("inline-flex max-w-[240px] items-center gap-1 truncate hover:text-foreground", type === "annual_goal" && "text-foreground")}>
              <Flag className="size-3.5" /> {goal.title}
            </Link>
          </>
        )}
        {priority && (
          <>
            <ChevronRight className="size-3.5" />
            <span className="inline-flex max-w-[260px] items-center gap-1 truncate text-foreground">
              <ListChecks className="size-3.5" /> {priority.title}
            </span>
          </>
        )}
      </nav>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{LABEL[type]}</Badge>
            {priority && quarterById.get(priority.quarter_id) && <Badge variant="outline">{quarterLabel(quarterById.get(priority.quarter_id)!)}</Badge>}
            {goal && type === "annual_goal" && <Badge variant="outline">FY{goal.fiscal_year}</Badge>}
            {priority?.carried_from_id && <Badge variant="risk">Carried over from last quarter</Badge>}
            {overdue && <Badge variant="off">Overdue</Badge>}
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-balance">{item.title}</h1>
          {item.description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{item.description}</p>}
        </div>
        {ctx.can.write && (
          <div className="flex shrink-0 gap-2">
            {type === "winning_move" && (
              <WinningMoveDialog title="Edit Winning Move" trigger={<Button variant="outline" size="sm"><Pencil /> Edit</Button>} action={saveWinningMove.bind(null, cid, id)} crew={options.crew} defaults={item as WinningMove} />
            )}
            {type === "annual_goal" && (
              <AnnualGoalDialog
                title="Edit annual goal"
                trigger={<Button variant="outline" size="sm"><Pencil /> Edit</Button>}
                action={saveAnnualGoal.bind(null, cid, id)}
                crew={options.crew}
                moves={options.moves}
                fiscalYear={snap.fiscalYear}
                defaults={{ ...(item as AnnualGoal), baseline_value: numOrNull((item as AnnualGoal).baseline_value), target_value: numOrNull((item as AnnualGoal).target_value), current_value: numOrNull((item as AnnualGoal).current_value) }}
              />
            )}
            {type === "quarterly_priority" && (
              <PriorityDialog
                title="Edit priority"
                trigger={<Button variant="outline" size="sm"><Pencil /> Edit</Button>}
                action={savePriority.bind(null, cid, id)}
                crew={options.crew}
                goals={options.goals}
                quarters={[...options.quarters, ...(options.quarters.some((q) => q.id === priority!.quarter_id) ? [] : [{ id: priority!.quarter_id, title: quarterLabel(quarterById.get(priority!.quarter_id)!) }])]}
                defaults={item as QuarterlyPriority}
              />
            )}
            {type !== "winning_move" && (
              <IssueDialog
                trigger={<Button variant="outline" size="sm"><AlertTriangle /> Raise issue</Button>}
                action={saveIssue.bind(null, cid, null)}
                crew={options.crew}
                priorities={options.priorities}
                metrics={options.metrics}
                goals={options.goals}
                defaults={{ owner_id: item.owner_id, quarterly_priority_id: priority?.id, annual_goal_id: type === "annual_goal" ? id : null }}
              />
            )}
          </div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-5">
        <Cell label="Owner">
          <Owner person={snap.crewById.get(item.owner_id)} className="[&>span:last-child]:text-sm" />
        </Cell>
        <Cell label="Status">
          <InlineStatus companyId={cid} entity={type} id={id} status={item.status} canWrite={ctx.can.write} className="-ml-1.5" />
        </Cell>
        <Cell label="Progress">
          <div className="flex items-center gap-2">
            <Progress value={item.progress} tone={tone} className="h-1.5 w-20" />
            <InlineProgress companyId={cid} entity={type} id={id} progress={item.progress} canWrite={ctx.can.write} />
          </div>
        </Cell>
        <Cell label="Timeline">
          <span className="text-sm">
            {formatDate(item.start_date, { year: false })} → {formatDate(item.due_date)}
          </span>
        </Cell>
        <Cell label="Measurable outcome">
          <span className="line-clamp-2 text-sm">
            {item.measurable_outcome ?? "—"}
            {type === "annual_goal" && goal?.unit && goal.target_value !== null && (
              <span className="block text-xs text-muted-foreground tabular">
                {formatMetric(numOrNull(goal.current_value), goal.unit, { currency: cur })} of {formatMetric(Number(goal.target_value), goal.unit, { currency: cur })}
              </span>
            )}
          </span>
        </Cell>
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {type === "winning_move" && (
            <Card>
              <CardHeader>
                <CardTitle>Annual goals</CardTitle>
                {ctx.can.write && (
                  <AnnualGoalDialog trigger={<Button variant="ghost" size="xs"><Plus /> Add</Button>} action={saveAnnualGoal.bind(null, cid, null)} crew={options.crew} moves={options.moves} fiscalYear={snap.fiscalYear} defaults={{ winning_move_id: id, owner_id: item.owner_id }} />
                )}
              </CardHeader>
              <ChildList slug={slug} type="annual_goal" rows={(goalsRes.data ?? []).map((g) => ({ ...g, tag: `FY${g.fiscal_year}` }))} snapCrew={snap.crewById} />
            </Card>
          )}
          {type === "annual_goal" && (
            <Card>
              <CardHeader>
                <CardTitle>Quarterly priorities</CardTitle>
                {ctx.can.write && (
                  <PriorityDialog trigger={<Button variant="ghost" size="xs"><Plus /> Add</Button>} action={savePriority.bind(null, cid, null)} crew={options.crew} goals={options.goals} quarters={options.quarters} defaults={{ annual_goal_id: id, owner_id: item.owner_id, start_date: snap.activeQuarter?.start_date, due_date: snap.activeQuarter?.end_date }} />
                )}
              </CardHeader>
              <ChildList slug={slug} type="quarterly_priority" rows={(prioritiesRes.data ?? []).map((p) => ({ ...p, tag: quarterById.get(p.quarter_id) ? quarterLabel(quarterById.get(p.quarter_id)!) : "" }))} snapCrew={snap.crewById} />
            </Card>
          )}
          {type === "quarterly_priority" && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
                {ctx.can.write && (
                  <ActionDialog trigger={<Button variant="ghost" size="xs"><Plus /> Assign</Button>} action={saveAction.bind(null, cid, null)} crew={options.crew} priorities={options.priorities} issues={options.issues} defaults={{ quarterly_priority_id: id, owner_id: item.owner_id }} />
                )}
              </CardHeader>
              <div className="divide-y">
                {(actionsRes.data ?? []).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2">
                    <ActionCheckbox companyId={cid} id={a.id} status={a.status} canWrite={ctx.can.write} />
                    <span className={cn("min-w-0 flex-1 text-[13px]", a.status !== "open" && "text-muted-foreground line-through")}>{a.title}</span>
                    <Owner person={snap.crewById.get(a.owner_id)} />
                    <span className={cn("w-24 text-right text-xs tabular", a.status === "open" && a.due_date && a.due_date < today ? "font-medium text-off" : "text-muted-foreground")}>
                      {a.status === "open" && a.due_date && a.due_date < today ? relativeDays(a.due_date) : formatDate(a.due_date, { year: false })}
                    </span>
                  </div>
                ))}
                {!actionsRes.data?.length && <p className="px-4 py-3 text-sm text-muted-foreground">No actions yet.</p>}
              </div>
            </Card>
          )}

          {type === "winning_move" && (milestonesRes.data ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Milestones</CardTitle>
              </CardHeader>
              <div className="divide-y">
                {(milestonesRes.data ?? []).map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <StatusDot status={m.status} />
                    <span className="flex-1">{m.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(m.target_date)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <BarChart3 className="size-3.5 text-muted-foreground" /> Linked KPIs
              </CardTitle>
            </CardHeader>
            <div className="divide-y">
              {metrics.map((v) => (
                <Link key={v.metric.id} href={`/c/${slug}/scoreboard/${v.metric.id}`} className="grid grid-cols-[1fr_120px_auto] items-center gap-3 px-4 py-2.5 hover:bg-accent/50">
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    <StatusDot status={v.status} /> {v.metric.name}
                  </span>
                  <Sparkline values={v.points.slice(-10).map((p) => p.value)} target={v.metric.direction === "range" ? null : v.metric.target_value} tone={v.status === "off_track" ? "off" : v.status === "at_risk" ? "risk" : "on"} />
                  <span className="w-20 text-right text-sm font-semibold tabular">{formatMetric(v.latest?.value, v.metric.unit, { decimals: v.metric.decimals, currency: cur })}</span>
                </Link>
              ))}
              {!metrics.length && <p className="px-4 py-3 text-sm text-muted-foreground">No KPIs linked. Link KPIs from the Scoreboard.</p>}
            </div>
          </Card>

          {type !== "winning_move" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 text-muted-foreground" /> Issues & decisions
                </CardTitle>
              </CardHeader>
              <div className="divide-y">
                {issues.map((i) => (
                  <div key={i.id} className="px-4 py-2.5">
                    <Link href={`/c/${slug}/execution/issue/${i.id}`} className="text-[13px] font-medium hover:underline">
                      {i.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <PriorityBadge priority={i.priority} />
                      <Badge variant={i.status === "resolved" ? "on" : "outline"}>{i.status.replace("_", " ")}</Badge>
                    </div>
                    {(decisions ?? [])
                      .filter((d) => d.issue_id === i.id)
                      .map((d) => (
                        <p key={d.id} className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                          <Gavel className="mt-0.5 size-3 shrink-0 text-done" /> {d.title} · {formatDate(d.decided_on)}
                        </p>
                      ))}
                  </div>
                ))}
                {!issues.length && <p className="px-4 py-3 text-sm text-muted-foreground">No issues raised against this item.</p>}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Dependencies</CardTitle>
            </CardHeader>
            <div className="divide-y text-sm">
              {deps.map((d) => (
                <div key={d.id} className="flex items-start gap-2 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{d.outgoing ? "Depends on" : "Required by"} · {LABEL[d.type as keyof typeof LABEL]}</p>
                    <Link href={d.type === "action" ? `/c/${slug}/execution?view=actions` : `/c/${slug}/flight-plan/${d.type}/${d.otherId}`} className="font-medium hover:underline">
                      {d.title}
                    </Link>
                  </div>
                  {ctx.can.write && <RemoveDependencyButton companyId={cid} id={d.id} />}
                </div>
              ))}
              {!deps.length && <p className="px-4 py-3 text-muted-foreground">No dependencies recorded.</p>}
            </div>
            {ctx.can.write && (
              <div className="border-t p-3">
                <DependencyForm action={addDependency.bind(null, cid, type, id)} targets={depTargets} />
              </div>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Updates & history</CardTitle>
            </CardHeader>
            <CardContent>
              <Activity entries={activity} companyId={cid} entityType={type} entityId={id} canWrite={ctx.can.write} allowStatus />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function numOrNull(v: number | string | null) {
  return v === null ? null : Number(v);
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function ChildList({ slug, type, rows, snapCrew }: { slug: string; type: "annual_goal" | "quarterly_priority"; rows: Array<{ id: string; title: string; status: AnnualGoal["status"]; progress: number; owner_id: string; tag: string }>; snapCrew: Map<string, { full_name: string; avatar_color: string | null; is_open_seat: boolean }> }) {
  if (!rows.length) return <p className="px-4 py-3 text-sm text-muted-foreground">Nothing here yet.</p>;
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <Link key={r.id} href={`/c/${slug}/flight-plan/${type}/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50">
          <StatusDot status={r.status} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.title}</span>
          {r.tag && <Badge variant="outline">{r.tag}</Badge>}
          <Owner person={snapCrew.get(r.owner_id)} />
          <span className="w-10 text-right text-xs text-muted-foreground tabular">{r.progress}%</span>
        </Link>
      ))}
    </div>
  );
}
