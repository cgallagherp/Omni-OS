import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Gavel, ListPlus } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot, rankPriority } from "@/lib/data/snapshot";
import { formOptions } from "@/lib/data/options";
import { formatDate, relativeDays } from "@/lib/domain/format";
import { saveAction } from "@/lib/actions/flight-plan";
import { saveDecision, saveIssue } from "@/lib/actions/execution";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Owner } from "@/components/os/avatar";
import { PriorityBadge } from "@/components/os/status";
import { ActionDialog, DecisionDialog, IssueDialog } from "@/components/os/entity-forms";
import { ActionCheckbox } from "@/components/execution/action-checkbox";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Issues & Actions" };

type View = "actions" | "issues" | "decisions";

export default async function ExecutionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string; filter?: string; owner?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const view: View = sp.view === "issues" || sp.view === "decisions" ? sp.view : "actions";
  const filter = sp.filter ?? (view === "issues" ? "open" : view === "actions" ? "open" : "all");
  const owner = sp.owner;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) return null;
  const options = await formOptions(ctx.supabase, snap);
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: actions }, { data: issues }, { data: decisions }, { data: meetings }] = await Promise.all([
    ctx.supabase.from("actions").select("*").eq("company_id", cid).order("due_date", { ascending: true }),
    ctx.supabase.from("issues").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
    ctx.supabase.from("decisions").select("*").eq("company_id", cid).order("decided_on", { ascending: false }).order("created_at", { ascending: false }),
    ctx.supabase.from("meetings").select("id, title, scheduled_at").eq("company_id", cid),
  ]);
  const meetingById = new Map((meetings ?? []).map((m) => [m.id, m]));
  const priorityById = new Map(snap.priorities.map((p) => [p.id, p]));
  const issueById = new Map((issues ?? []).map((i) => [i.id, i]));
  const byOwner = <T extends { owner_id: string }>(rows: T[]) => (owner ? rows.filter((r) => r.owner_id === owner) : rows);

  const actionFilters = {
    open: (a: { status: string }) => a.status === "open",
    overdue: (a: { status: string; due_date: string | null }) => a.status === "open" && !!a.due_date && a.due_date < today,
    done: (a: { status: string }) => a.status === "done",
    all: () => true,
  } as Record<string, (a: { status: string; due_date: string | null }) => boolean>;
  const issueFilters = {
    open: (i: { status: string }) => i.status !== "resolved",
    escalated: (i: { status: string; escalated_to_omni: boolean }) => i.status !== "resolved" && i.escalated_to_omni,
    resolved: (i: { status: string }) => i.status === "resolved",
    all: () => true,
  } as Record<string, (i: { status: string; escalated_to_omni: boolean }) => boolean>;

  const shownActions = byOwner((actions ?? []).filter(actionFilters[filter] ?? actionFilters.open));
  const shownIssues = byOwner((issues ?? []).filter(issueFilters[filter] ?? issueFilters.open)).sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || rankPriority(a.priority) - rankPriority(b.priority));
  const shownDecisions = byOwner(decisions ?? []);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { view, filter, owner, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    return `/c/${slug}/execution?${q.toString()}`;
  };
  const filterSet = view === "actions" ? ["open", "overdue", "done", "all"] : view === "issues" ? ["open", "escalated", "resolved", "all"] : [];
  const count = {
    actions: (actions ?? []).filter((a) => a.status === "open").length,
    issues: (issues ?? []).filter((i) => i.status !== "resolved").length,
    decisions: (decisions ?? []).length,
  };

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Execution"
        title="Issues, decisions & actions"
        description="Material problems, the decisions taken and the commitments that follow — each with one accountable owner."
        actions={
          ctx.can.write && (
            <>
              <IssueDialog trigger={<Button variant="outline" size="sm"><AlertTriangle /> Raise issue</Button>} action={saveIssue.bind(null, cid, null)} crew={options.crew} priorities={options.priorities} metrics={options.metrics} goals={options.goals} />
              <DecisionDialog trigger={<Button variant="outline" size="sm"><Gavel /> Record decision</Button>} action={saveDecision.bind(null, cid, null)} crew={options.crew} issues={options.issues} />
              <ActionDialog trigger={<Button size="sm"><ListPlus /> Assign action</Button>} action={saveAction.bind(null, cid, null)} crew={options.crew} priorities={options.priorities} issues={options.issues} />
            </>
          )
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 border-b">
        {(["actions", "issues", "decisions"] as const).map((v) => (
          <Link key={v} href={`/c/${slug}/execution?view=${v}`} className={cn("-mb-px border-b-2 px-2.5 py-2 text-sm font-medium capitalize", view === v ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {v} <span className="ml-1 text-xs text-muted-foreground tabular">{count[v]}</span>
          </Link>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {filterSet.map((f) => (
          <Link key={f} href={href({ filter: f })} className={cn("h-7 rounded-full border px-2.5 text-xs leading-[26px] font-medium capitalize", filter === f ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}>
            {f}
          </Link>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">Owner:</span>
          <Link href={href({ owner: undefined })} className={cn("rounded px-1.5 py-0.5 text-xs", !owner ? "bg-muted font-medium" : "text-muted-foreground")}>
            All
          </Link>
          {snap.crew.filter((c) => !c.is_open_seat).map((c) => (
            <Link key={c.id} href={href({ owner: c.id })} className={cn("rounded px-1.5 py-0.5 text-xs", owner === c.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
              {c.full_name.split(" ")[0]}
            </Link>
          ))}
        </div>
      </div>

      {view === "actions" && (
        <Card>
          {shownActions.length ? (
            <div className="divide-y">
              {shownActions.map((a) => {
                const overdue = a.status === "open" && a.due_date && a.due_date < today;
                const p = a.quarterly_priority_id ? priorityById.get(a.quarterly_priority_id) : null;
                const i = a.issue_id ? issueById.get(a.issue_id) : null;
                const m = a.meeting_id ? meetingById.get(a.meeting_id) : null;
                return (
                  <div key={a.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <ActionCheckbox companyId={cid} id={a.id} status={a.status} canWrite={ctx.can.write} />
                      <div className="min-w-0">
                        <p className={cn("text-[13.5px]", a.status !== "open" && "text-muted-foreground line-through")}>{a.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p && (
                            <Link href={`/c/${slug}/flight-plan/quarterly_priority/${p.id}`} className="hover:underline">
                              → {p.title}
                            </Link>
                          )}
                          {i && (
                            <Link href={`/c/${slug}/execution/issue/${i.id}`} className="ml-2 hover:underline">
                              Issue: {i.title}
                            </Link>
                          )}
                          {m && <span className="ml-2">· from {m.title} {formatDate(m.scheduled_at, { year: false })}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-8 sm:pl-0">
                      <Owner person={snap.crewById.get(a.owner_id)} className="w-24" />
                      <span className={cn("w-28 text-right text-xs tabular", overdue ? "font-medium text-off" : "text-muted-foreground")}>
                        {a.status === "done" ? `Done ${formatDate(a.completed_at, { year: false })}` : overdue ? `Overdue · ${relativeDays(a.due_date)}` : `Due ${formatDate(a.due_date, { year: false })}`}
                      </span>
                      {ctx.can.write && (
                        <ActionDialog
                          title="Edit action"
                          submitLabel="Save"
                          trigger={<Button variant="ghost" size="xs">Edit</Button>}
                          action={saveAction.bind(null, cid, a.id)}
                          crew={options.crew}
                          priorities={options.priorities}
                          issues={options.issues}
                          defaults={{ ...a }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState className="m-4" title="No actions match" description="Actions are created in meetings, from issues and decisions, or directly here." />
          )}
        </Card>
      )}

      {view === "issues" && (
        <Card>
          {shownIssues.length ? (
            <div className="divide-y">
              {shownIssues.map((i) => (
                <Link key={i.id} href={`/c/${slug}/execution/issue/${i.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13.5px] font-medium", i.status === "resolved" && "text-muted-foreground")}>{i.title}</p>
                    {i.description && <p className="line-clamp-1 text-xs text-muted-foreground">{i.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {i.escalated_to_omni && <Badge variant="brand">Escalated</Badge>}
                    <PriorityBadge priority={i.priority} />
                    <Badge variant={i.status === "resolved" ? "on" : i.status === "in_discussion" ? "done" : "outline"}>{i.status === "in_discussion" ? "In discussion" : i.status === "resolved" ? "Resolved" : "Open"}</Badge>
                    <Owner person={snap.crewById.get(i.owner_id)} className="w-24" />
                    <span className="w-20 text-right text-xs text-muted-foreground">{relativeDays(i.created_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState className="m-4" title="No issues match" />
          )}
        </Card>
      )}

      {view === "decisions" && (
        <Card>
          {shownDecisions.length ? (
            <div className="divide-y">
              {shownDecisions.map((d) => {
                const i = d.issue_id ? issueById.get(d.issue_id) : null;
                const m = d.meeting_id ? meetingById.get(d.meeting_id) : null;
                return (
                  <div key={d.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[110px_1fr_auto] sm:gap-4">
                    <span className="text-xs text-muted-foreground tabular">{formatDate(d.decided_on)}</span>
                    <div>
                      <p className="text-[13.5px] font-medium">{d.title}</p>
                      {d.rationale && <p className="mt-0.5 text-sm text-muted-foreground">{d.rationale}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {i && (
                          <Link href={`/c/${slug}/execution/issue/${i.id}`} className="hover:underline">
                            Issue: {i.title}
                          </Link>
                        )}
                        {m && (
                          <Link href={`/c/${slug}/meetings/${m.id}`} className="ml-2 hover:underline">
                            · {m.title}, {formatDate(m.scheduled_at, { year: false })}
                          </Link>
                        )}
                      </p>
                    </div>
                    <Owner person={snap.crewById.get(d.owner_id)} />
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState className="m-4" title="No decisions recorded" />
          )}
        </Card>
      )}
    </div>
  );
}
