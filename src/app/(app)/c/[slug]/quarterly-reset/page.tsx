import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formOptions } from "@/lib/data/options";
import { formatDate, formatMetric, formatMoney, formatPct } from "@/lib/domain/format";
import { quarterLabel, quarterProgress } from "@/lib/domain/quarters";
import { savePriority } from "@/lib/actions/flight-plan";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Owner } from "@/components/os/avatar";
import { PriorityBadge, StatusBadge, StatusBar, StatusDot } from "@/components/os/status";
import { PriorityDialog } from "@/components/os/entity-forms";
import { InlineStatus } from "@/components/flight-plan/inline-status";
import { ApproveButton, CarryForwardButton, ReflectionsForm, StartResetButton } from "@/components/reset/reset-controls";

export const metadata: Metadata = { title: "Quarterly Reset" };

export default async function QuarterlyResetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) return null;
  const q = snap.activeQuarter;
  const [{ data: resets }, { data: quarters }] = await Promise.all([
    ctx.supabase.from("quarterly_resets").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
    ctx.supabase.from("quarters").select("*").eq("company_id", cid).order("start_date", { ascending: false }),
  ]);
  const quarterById = new Map((quarters ?? []).map((x) => [x.id, x]));
  const draft = (resets ?? []).find((r) => r.status === "draft" && r.from_quarter_id === q?.id);
  const history = (resets ?? []).filter((r) => r.status === "approved");
  const options = await formOptions(ctx.supabase, snap);
  const cur = snap.company.currency;

  const header = (
    <PageHeader
      eyebrow="Quarterly Reset"
      title={q ? `Close ${quarterLabel(q)} and set the next 90 days` : "Quarterly Reset"}
      description="A guided review: what we committed to, what we delivered, how the business performed, and the few priorities that matter most next quarter."
    />
  );

  if (!q) return <div className="fade-in">{header}<p className="text-sm text-muted-foreground">No active quarter.</p></div>;
  const qp = quarterProgress(q);

  if (!draft) {
    return (
      <div className="fade-in">
        {header}
        <Card className="mb-5">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-medium">
                {quarterLabel(q)} · week {qp.week} of {qp.total} · {qp.daysLeft} days left
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Starting the reset prepares the next quarter as a draft. Current priorities stay live until the new plan is approved.
              </p>
              <Progress value={qp.pct * 100} tone="brand" className="mt-3 max-w-md" />
            </div>
            {ctx.can.write && <StartResetButton companyId={cid} label={`Start ${quarterLabel(q)} reset`} />}
          </CardContent>
        </Card>
        <History history={history} quarterById={quarterById} />
      </div>
    );
  }

  const next = quarterById.get(draft.to_quarter_id)!;
  const { data: nextPriorities } = await ctx.supabase.from("quarterly_priorities").select("*").eq("company_id", cid).eq("quarter_id", next.id).order("sort_order");
  const carried = new Set((nextPriorities ?? []).map((p) => p.carried_from_id).filter(Boolean));
  const done = snap.priorities.filter((p) => p.status === "done").length;
  const unfinished = snap.priorities.filter((p) => p.status !== "done");
  const inQuarter = (period: string) => period >= q.start_date && period <= q.end_date;
  const kpiRows = snap.metrics.map((v) => {
    const pts = v.points.filter((p) => inQuarter(p.period) && p.value !== null);
    return { v, pts, on: pts.filter((p) => p.status === "on_track").length, risk: pts.filter((p) => p.status === "at_risk").length, off: pts.filter((p) => p.status === "off_track").length };
  });
  const strategic = snap.openIssues.filter((i) => i.priority === "critical" || i.priority === "high");
  const gapsRes = await ctx.supabase.from("org_gaps").select("*").eq("company_id", cid).neq("status", "closed").in("priority", ["critical", "high"]);
  const steps = ["Commitments", "KPI performance", "Annual plan", "Issues & constraints", "Next 90 days", "Approve"];
  const locked = draft.status !== "draft";

  return (
    <div className="fade-in">
      {header}
      <nav className="sticky top-0 z-10 -mx-4 mb-5 flex gap-1 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {steps.map((s, i) => (
          <a key={s} href={`#step-${i + 1}`} className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground">
            <span className="flex size-5 items-center justify-center rounded-full border text-[10px] tabular">{i + 1}</span>
            {s}
          </a>
        ))}
      </nav>

      <div className="space-y-5">
        <Step n={1} title={`Review ${quarterLabel(q)} commitments`} subtitle={`${done} of ${snap.priorities.length} completed. Confirm the final status of each priority; carry forward anything that still matters.`}>
          <div className="divide-y">
            {snap.priorities.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Link href={`/c/${slug}/flight-plan/quarterly_priority/${p.id}`} className="text-[13.5px] font-medium hover:underline">
                    {p.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{p.measurable_outcome}</p>
                </div>
                <Owner person={snap.crewById.get(p.owner_id)} />
                <span className="w-10 text-right text-xs text-muted-foreground tabular">{p.progress}%</span>
                <InlineStatus companyId={cid} entity="quarterly_priority" id={p.id} status={p.status} canWrite={ctx.can.write && !locked} />
                {ctx.can.write && p.status !== "done" && <CarryForwardButton companyId={cid} resetId={draft.id} priorityId={p.id} carried={carried.has(p.id)} />}
              </div>
            ))}
          </div>
        </Step>

        <Step n={2} title="KPI performance this quarter" subtitle="Periods on target, at risk and off track since the start of the quarter.">
          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {kpiRows.map(({ v, pts, on, risk, off }) => (
              <Link key={v.metric.id} href={`/c/${slug}/scoreboard/${v.metric.id}`} className="bg-card px-4 py-2.5 hover:bg-accent/40">
                <div className="flex items-center gap-2">
                  <StatusDot status={v.status} />
                  <span className="flex-1 truncate text-[13px] font-medium">{v.metric.name}</span>
                  <span className="text-xs font-medium tabular">{formatMetric(v.latest?.value, v.metric.unit, { decimals: v.metric.decimals, currency: cur })}</span>
                </div>
                <StatusBar counts={{ on, risk, off }} className="mt-1.5" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {pts.length} period{pts.length === 1 ? "" : "s"} · {on} on · {risk} at risk · {off} off
                </p>
              </Link>
            ))}
          </div>
        </Step>

        <Step n={3} title={`Progress against the FY${snap.fiscalYear} plan`} subtitle={`Revenue YTD ${formatMoney(snap.financials.revenue?.actual, cur)} (${formatPct(snap.financials.revenue?.variancePct, 1, true)} vs plan) · EBITDA YTD ${formatMoney(snap.financials.ebitda?.actual, cur)} (${formatPct(snap.financials.ebitda?.variancePct, 1, true)} vs plan)`}>
          <div className="divide-y">
            {snap.annualGoals.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{g.title}</span>
                <Progress value={g.progress} className="h-1 w-28" tone={g.status === "on_track" ? "on" : g.status === "at_risk" ? "risk" : g.status === "off_track" ? "off" : "default"} />
                <span className="w-10 text-right text-xs text-muted-foreground tabular">{g.progress}%</span>
                <StatusBadge status={g.status} />
              </div>
            ))}
          </div>
        </Step>

        <Step n={4} title="Material issues, constraints and reflections" subtitle="What is in the way, and what we learned.">
          <div className="grid gap-5 p-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Strategic issues ({strategic.length})</p>
              <ul className="space-y-1.5">
                {strategic.map((i) => (
                  <li key={i.id} className="flex items-start gap-2 text-[13px]">
                    <PriorityBadge priority={i.priority} />
                    <Link href={`/c/${slug}/execution/issue/${i.id}`} className="hover:underline">
                      {i.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Leadership & organisational constraints</p>
              <ul className="space-y-1.5">
                {(gapsRes.data ?? []).map((g) => (
                  <li key={g.id} className="flex items-start gap-2 text-[13px]">
                    <Badge variant="outline">{g.type}</Badge> {g.title}
                  </li>
                ))}
                {snap.crew.filter((c) => c.is_open_seat).map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-[13px]">
                    <Badge variant="risk">Open seat</Badge> {c.full_name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t p-4">
            <ReflectionsForm companyId={cid} resetId={draft.id} defaults={draft} disabled={!ctx.can.write || locked} />
          </div>
        </Step>

        <Step
          n={5}
          title={`Proposed priorities for ${quarterLabel(next)}`}
          subtitle="Focus on less: 3–7 priorities, each tied to an annual goal with one owner."
          action={
            ctx.can.write && (
              <PriorityDialog
                trigger={<Button size="sm"><Plus /> Add priority</Button>}
                action={savePriority.bind(null, cid, null)}
                crew={options.crew}
                goals={options.goals}
                quarters={options.quarters.filter((o) => o.id === next.id)}
                defaults={{ quarter_id: next.id, start_date: next.start_date, due_date: next.end_date, status: "not_started" }}
              />
            )
          }
        >
          <div className="divide-y">
            {(nextPriorities ?? []).map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/c/${slug}/flight-plan/quarterly_priority/${p.id}`} className="text-[13.5px] font-medium hover:underline">
                    {p.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">→ {snap.annualGoals.find((g) => g.id === p.annual_goal_id)?.title}</p>
                </div>
                {p.carried_from_id && <Badge variant="risk">Carried over</Badge>}
                <Owner person={snap.crewById.get(p.owner_id)} />
                <span className="text-xs text-muted-foreground">{formatDate(p.due_date, { year: false })}</span>
              </div>
            ))}
            {!nextPriorities?.length && <p className="px-4 py-4 text-sm text-muted-foreground">No priorities proposed yet. Add new ones or carry forward unfinished priorities from step 1.</p>}
          </div>
          {(nextPriorities?.length ?? 0) > 7 && <p className="border-t px-4 py-2 text-xs text-risk">{nextPriorities!.length} priorities — consider focusing on fewer.</p>}
        </Step>

        <Step n={6} title="Approve the new quarterly plan" subtitle="Approval closes the current quarter, records unfinished priorities as missed, activates the new plan and keeps the full history.">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <dl className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label={`${quarterLabel(q)} completed`} value={`${done}/${snap.priorities.length}`} />
              <Stat label="Will be recorded as missed" value={String(unfinished.length)} />
              <Stat label={`${quarterLabel(next)} priorities`} value={String(nextPriorities?.length ?? 0)} />
              <Stat label="Carried forward" value={String(carried.size)} />
            </dl>
            {ctx.can.admin ? (
              <ApproveButton companyId={cid} resetId={draft.id} label={`Approve ${quarterLabel(next)} plan`} />
            ) : (
              <p className="text-sm text-muted-foreground">A company administrator approves the plan.</p>
            )}
          </div>
        </Step>

        <History history={history} quarterById={quarterById} />
      </div>
    </div>
  );
}

function Step({ n, title, subtitle, action, children }: { n: number; title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card id={`step-${n}`} className="scroll-mt-16">
      <CardHeader className="items-start py-3">
        <div className="flex gap-3">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">{n}</span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular">{value}</dd>
    </div>
  );
}

function History({ history, quarterById }: { history: Array<{ id: string; from_quarter_id: string; to_quarter_id: string; approved_at: string | null; wins: string | null; misses: string | null; lessons: string | null; summary_snapshot: unknown }>; quarterById: Map<string, { year: number; quarter: number }> }) {
  if (!history.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Previous quarterly resets</CardTitle>
      </CardHeader>
      <div className="divide-y">
        {history.map((r) => {
          const from = quarterById.get(r.from_quarter_id);
          const to = quarterById.get(r.to_quarter_id);
          const s = (r.summary_snapshot ?? {}) as { completed?: number; total?: number };
          return (
            <details key={r.id} className="px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <span className="text-[13.5px] font-medium">
                  {from && quarterLabel(from)} → {to && quarterLabel(to)}
                </span>
                {s.total !== undefined && <Badge variant="outline">{s.completed}/{s.total} priorities completed</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">Approved {formatDate(r.approved_at)}</span>
              </summary>
              <dl className="mt-2 grid gap-2 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Wins</dt>
                  <dd>{r.wins}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Misses</dt>
                  <dd>{r.misses}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Lessons</dt>
                  <dd>{r.lessons}</dd>
                </div>
              </dl>
            </details>
          );
        })}
      </div>
    </Card>
  );
}
