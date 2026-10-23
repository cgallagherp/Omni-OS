import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Pencil } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate, formatMetric, relativeDays } from "@/lib/domain/format";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/os/avatar";
import { PriorityBadge, StatusDot } from "@/components/os/status";
import { ActionCheckbox } from "@/components/execution/action-checkbox";
import { CrewDialog } from "@/components/crew/forms";
import { RemoveCrewButton } from "@/components/crew/remove-button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Crew member" };

const ORG_ACTION_LABEL = { critical_role: "critical role", hire: "recruitment priority", structure: "structure", capability: "capability" } as const;

export default async function PersonPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  const person = snap?.crewById.get(id);
  if (!snap || !person) notFound();
  const [{ data: decisions }, { data: gaps }] = await Promise.all([
    ctx.supabase.from("decisions").select("*").eq("company_id", cid).eq("owner_id", id).order("decided_on", { ascending: false }).limit(8),
    ctx.supabase.from("org_actions").select("*").eq("company_id", cid).eq("owner_id", id).neq("status", "closed"),
  ]);
  const manager = person.reports_to ? snap.crewById.get(person.reports_to) : null;
  const reports = snap.crew.filter((c) => c.reports_to === id);
  const today = new Date().toISOString().slice(0, 10);
  const moves = snap.winningMoves.filter((w) => w.owner_id === id);
  const goals = snap.annualGoals.filter((g) => g.owner_id === id);
  const priorities = snap.priorities.filter((p) => p.owner_id === id);
  const kpis = snap.metrics.filter((m) => m.metric.owner_id === id);
  const actions = snap.openActions.filter((a) => a.owner_id === id);
  const issues = snap.openIssues.filter((i) => i.owner_id === id);
  const crewOptions = snap.crew.map((c) => ({ id: c.id, full_name: c.full_name, title: c.title, is_open_seat: c.is_open_seat }));

  return (
    <div className="fade-in">
      <Link href={`/c/${slug}/crew`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Crew
      </Link>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={person.full_name} color={person.avatar_color} size="lg" open={person.is_open_seat} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{person.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              {person.title}
              {person.seat && ` · ${person.seat}`}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {manager && (
                <span>
                  Reports to{" "}
                  <Link href={`/c/${slug}/crew/${manager.id}`} className="text-foreground hover:underline">
                    {manager.full_name}
                  </Link>
                </span>
              )}
              {reports.length > 0 && <span>{reports.length} direct report{reports.length > 1 ? "s" : ""}</span>}
              {person.email && (
                <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Mail className="size-3" /> {person.email}
                </a>
              )}
              {person.is_open_seat && <Badge variant="risk">Open seat</Badge>}
            </div>
          </div>
        </div>
        {ctx.can.write && (
          <div className="flex gap-2">
            <CrewDialog companyId={cid} id={id} crew={crewOptions} defaults={person} trigger={<Button variant="outline" size="sm"><Pencil /> Edit</Button>} />
            {ctx.can.admin && <RemoveCrewButton companyId={cid} id={id} slug={slug} />}
          </div>
        )}
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Accountabilities</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5 px-4 py-3 text-sm">
            {person.responsibilities.map((r) => (
              <li key={r}>· {r}</li>
            ))}
            {!person.responsibilities.length && <li className="text-muted-foreground">None recorded.</li>}
          </ul>
          {(gaps ?? []).length > 0 && (
            <div className="border-t px-4 py-3">
              <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Owns organisational actions</p>
              {(gaps ?? []).map((g) => (
                <p key={g.id} className="text-[13px]">
                  {g.title} <span className="text-xs text-muted-foreground">({ORG_ACTION_LABEL[g.type]}, {g.status.replace("_", " ")})</span>
                </p>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Owns in the Flight Plan</CardTitle>
          </CardHeader>
          <div className="divide-y text-sm">
            {[
              ...moves.map((x) => ({ href: `flight-plan/winning_move/${x.id}`, kind: "Three-Year Outcome", title: x.title, status: x.status, extra: `${x.progress}%` })),
              ...goals.map((x) => ({ href: `flight-plan/annual_goal/${x.id}`, kind: "12-Month Objective", title: x.title, status: x.status, extra: `${x.progress}%` })),
              ...priorities.map((x) => ({ href: `flight-plan/quarterly_priority/${x.id}`, kind: "90-Day Priority", title: x.title, status: x.status, extra: `due ${formatDate(x.due_date, { year: false })}` })),
            ].map((r) => (
              <Link key={r.href} href={`/c/${slug}/${r.href}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                <StatusDot status={r.status} />
                <Badge variant="outline" className="w-24 justify-center">{r.kind}</Badge>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="text-xs text-muted-foreground">{r.extra}</span>
              </Link>
            ))}
            {!moves.length && !goals.length && !priorities.length && <p className="px-4 py-3 text-muted-foreground">Owns no Flight Plan items.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>KPIs owned</CardTitle>
          </CardHeader>
          <div className="divide-y text-sm">
            {kpis.map((v) => (
              <Link key={v.metric.id} href={`/c/${slug}/scoreboard/${v.metric.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-accent/40">
                <StatusDot status={v.status} />
                <span className="flex-1 truncate">{v.metric.name}</span>
                <span className="text-xs font-medium tabular">{formatMetric(v.latest?.value, v.metric.unit, { decimals: v.metric.decimals, currency: snap.company.currency })}</span>
              </Link>
            ))}
            {!kpis.length && <p className="px-4 py-3 text-muted-foreground">No KPIs.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commitments</CardTitle>
            <span className="text-xs text-muted-foreground">{actions.length} open</span>
          </CardHeader>
          <div className="divide-y">
            {actions.map((a) => {
              const overdue = a.due_date !== null && a.due_date < today;
              return (
                <div key={a.id} className="flex items-center gap-2.5 px-4 py-2">
                  <ActionCheckbox companyId={cid} id={a.id} status={a.status} canWrite={ctx.can.write} />
                  <span className="min-w-0 flex-1 text-[13px]">{a.title}</span>
                  <span className={cn("shrink-0 text-xs", overdue ? "font-medium text-off-ink" : "text-muted-foreground")}>{overdue ? relativeDays(a.due_date) : formatDate(a.due_date, { year: false })}</span>
                </div>
              );
            })}
            {!actions.length && <p className="px-4 py-3 text-sm text-muted-foreground">No open actions.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Issues & decisions</CardTitle>
          </CardHeader>
          <div className="divide-y text-sm">
            {issues.map((i) => (
              <Link key={i.id} href={`/c/${slug}/execution/issue/${i.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-accent/40">
                <PriorityBadge priority={i.priority} />
                <span className="flex-1 truncate">{i.title}</span>
              </Link>
            ))}
            {(decisions ?? []).map((d) => (
              <p key={d.id} className="px-4 py-2 text-[13px]">
                <span className="text-xs text-muted-foreground">Decision {formatDate(d.decided_on, { year: false })} · </span>
                {d.title}
              </p>
            ))}
            {!issues.length && !decisions?.length && <p className="px-4 py-3 text-muted-foreground">None.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
