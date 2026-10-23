import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarClock, Gavel, ListChecks, ListPlus, Pencil } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formOptions } from "@/lib/data/options";
import { loadActivity } from "@/lib/data/activity";
import { formatDate, formatMetric, relativeDays } from "@/lib/domain/format";
import { saveAction } from "@/lib/actions/flight-plan";
import { saveDecision, saveIssue } from "@/lib/actions/execution";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Owner } from "@/components/os/avatar";
import { PriorityBadge, StatusBadge } from "@/components/os/status";
import { Activity } from "@/components/os/activity";
import { ActionDialog, DecisionDialog, IssueDialog } from "@/components/os/entity-forms";
import { ActionCheckbox } from "@/components/execution/action-checkbox";
import { IssueControls } from "@/components/execution/issue-controls";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Issue" };

export default async function IssuePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const { data: issue } = await ctx.supabase.from("issues").select("*").eq("company_id", cid).eq("id", id).maybeSingle();
  if (!issue) notFound();
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) notFound();
  const options = await formOptions(ctx.supabase, snap);
  const [{ data: decisions }, { data: actions }, { data: agenda }, { data: priority }, { data: goal }] = await Promise.all([
    ctx.supabase.from("decisions").select("*").eq("company_id", cid).eq("issue_id", id).order("decided_on"),
    ctx.supabase.from("actions").select("*").eq("company_id", cid).eq("issue_id", id).order("created_at"),
    ctx.supabase.from("meeting_agenda_items").select("meeting_id, notes, meetings!inner(id, title, scheduled_at, status)").eq("company_id", cid).eq("entity_id", id),
    issue.quarterly_priority_id ? ctx.supabase.from("quarterly_priorities").select("id, title, status, annual_goal_id").eq("id", issue.quarterly_priority_id).maybeSingle() : Promise.resolve({ data: null }),
    issue.annual_goal_id ? ctx.supabase.from("annual_goals").select("id, title, status, winning_move_id").eq("id", issue.annual_goal_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const metric = issue.metric_id ? snap.metrics.find((v) => v.metric.id === issue.metric_id) : null;
  const goalId = goal?.id ?? priority?.annual_goal_id;
  const goalRow = goalId ? snap.annualGoals.find((g) => g.id === goalId) : null;
  const move = goalRow ? snap.winningMoves.find((w) => w.id === goalRow.winning_move_id) : null;
  const today = new Date().toISOString().slice(0, 10);
  const meetingsSeen = new Map<string, { id: string; title: string; scheduled_at: string; notes: string | null }>();
  for (const a of agenda ?? []) {
    const m = a.meetings as unknown as { id: string; title: string; scheduled_at: string };
    meetingsSeen.set(m.id, { ...m, notes: a.notes });
  }
  const activity = await loadActivity(ctx.supabase, cid, { tables: ["issues"], ids: [id], commentType: "issue", commentId: id });

  return (
    <div className="fade-in">
      <Link href={`/c/${slug}/execution?view=issues`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Issues
      </Link>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={issue.priority} />
            <Badge variant={issue.status === "resolved" ? "on" : issue.status === "in_discussion" ? "done" : "outline"}>{issue.status === "in_discussion" ? "In discussion" : issue.status === "resolved" ? "Resolved" : "Open"}</Badge>
            {issue.escalated_to_omni && <Badge variant="brand">Escalated to Omni</Badge>}
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-balance">{issue.title}</h1>
          {issue.description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{issue.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">Owner <Owner person={snap.crewById.get(issue.owner_id)} /></span>
            {issue.raised_by_id && <span>Raised by {snap.crewById.get(issue.raised_by_id)?.full_name}</span>}
            <span>{formatDate(issue.created_at)} ({relativeDays(issue.created_at)})</span>
          </div>
        </div>
        {ctx.can.write && (
          <div className="flex flex-col items-end gap-2">
            <IssueControls companyId={cid} id={id} status={issue.status} escalated={issue.escalated_to_omni} />
            <IssueDialog
              title="Edit issue"
              submitLabel="Save"
              trigger={<Button variant="ghost" size="sm"><Pencil /> Edit</Button>}
              action={saveIssue.bind(null, cid, id)}
              crew={options.crew}
              priorities={options.priorities}
              metrics={options.metrics}
              goals={options.goals}
              defaults={{ ...issue }}
            />
          </div>
        )}
      </div>

      {issue.status === "resolved" && issue.resolution && (
        <div className="mb-5 rounded-lg border border-on/30 bg-on-bg/50 px-4 py-3 text-sm">
          <span className="font-medium">Resolution ({formatDate(issue.resolved_at)}):</span> {issue.resolution}
        </div>
      )}

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Strategic context</CardTitle>
              <span className="text-xs text-muted-foreground">What this issue threatens</span>
            </CardHeader>
            <div className="divide-y text-sm">
              {metric && (
                <Link href={`/c/${slug}/scoreboard/${metric.metric.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50">
                  <BarChart3 className="size-4 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-xs text-muted-foreground">KPI</span>
                    {metric.metric.name}
                  </span>
                  <span className="font-semibold tabular">{formatMetric(metric.latest?.value, metric.metric.unit, { decimals: metric.metric.decimals, currency: snap.company.currency })}</span>
                  <StatusBadge status={metric.status} />
                </Link>
              )}
              {priority && (
                <Link href={`/c/${slug}/flight-plan/quarterly_priority/${priority.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50">
                  <ListChecks className="size-4 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-xs text-muted-foreground">90-day priority</span>
                    {priority.title}
                  </span>
                  <StatusBadge status={priority.status} />
                </Link>
              )}
              {goalRow && (
                <Link href={`/c/${slug}/flight-plan/annual_goal/${goalRow.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50">
                  <span className="size-4" />
                  <span className="flex-1">
                    <span className="block text-xs text-muted-foreground">12-month objective</span>
                    {goalRow.title}
                  </span>
                  <StatusBadge status={goalRow.status} />
                </Link>
              )}
              {move && (
                <Link href={`/c/${slug}/flight-plan/winning_move/${move.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50">
                  <span className="size-4" />
                  <span className="flex-1">
                    <span className="block text-xs text-muted-foreground">Three-Year Outcome</span>
                    {move.title}
                  </span>
                  <StatusBadge status={move.status} />
                </Link>
              )}
              {!metric && !priority && !goalRow && <p className="px-4 py-3 text-muted-foreground">Not linked to a KPI or objective. Edit the issue to link it.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Gavel className="size-3.5 text-done-ink" /> Decisions
              </CardTitle>
              {ctx.can.write && issue.status !== "resolved" && (
                <DecisionDialog trigger={<Button variant="ghost" size="xs"><Gavel /> Record</Button>} action={saveDecision.bind(null, cid, null)} crew={options.crew} issues={options.issues} defaults={{ issue_id: id, owner_id: issue.owner_id }} />
              )}
            </CardHeader>
            <div className="divide-y">
              {(decisions ?? []).map((d) => (
                <div key={d.id} className="px-4 py-2.5">
                  <p className="text-sm font-medium">{d.title}</p>
                  {d.rationale && <p className="mt-0.5 text-sm text-muted-foreground">{d.rationale}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(d.decided_on)} · {snap.crewById.get(d.owner_id)?.full_name}
                  </p>
                </div>
              ))}
              {!decisions?.length && <p className="px-4 py-3 text-sm text-muted-foreground">No decisions yet.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <ListPlus className="size-3.5 text-brand-ink" /> Actions
              </CardTitle>
              {ctx.can.write && (
                <ActionDialog trigger={<Button variant="ghost" size="xs"><ListPlus /> Assign</Button>} action={saveAction.bind(null, cid, null)} crew={options.crew} priorities={options.priorities} defaults={{ issue_id: id, owner_id: issue.owner_id, quarterly_priority_id: issue.quarterly_priority_id, decision_id: decisions?.at(-1)?.id }} />
              )}
            </CardHeader>
            <div className="divide-y">
              {(actions ?? []).map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2">
                  <ActionCheckbox companyId={cid} id={a.id} status={a.status} canWrite={ctx.can.write} />
                  <span className={cn("min-w-0 flex-1 text-[13px]", a.status !== "open" && "text-muted-foreground line-through")}>{a.title}</span>
                  <Owner person={snap.crewById.get(a.owner_id)} />
                  <span className={cn("w-24 text-right text-xs", a.status === "open" && a.due_date && a.due_date < today ? "font-medium text-off-ink" : "text-muted-foreground")}>{formatDate(a.due_date, { year: false })}</span>
                </div>
              ))}
              {!actions?.length && <p className="px-4 py-3 text-sm text-muted-foreground">No actions yet.</p>}
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5 text-muted-foreground" /> Meetings
              </CardTitle>
            </CardHeader>
            <div className="divide-y text-sm">
              {[...meetingsSeen.values()]
                .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
                .map((m) => (
                  <Link key={m.id} href={`/c/${slug}/meetings/${m.id}`} className="block px-4 py-2.5 hover:bg-accent/50">
                    <p className="font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(m.scheduled_at)}</p>
                    {m.notes && <p className="mt-1 text-xs whitespace-pre-line">{m.notes}</p>}
                  </Link>
                ))}
              {!meetingsSeen.size && <p className="px-4 py-3 text-muted-foreground">Not yet discussed in a meeting. Open issues appear on the next weekly agenda automatically.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Updates & history</CardTitle>
            </CardHeader>
            <CardContent>
              <Activity entries={activity} companyId={cid} entityType="issue" entityId={id} canWrite={ctx.can.write} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
