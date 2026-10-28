import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Mail } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadAgentWork } from "@/lib/data/agents";
import { AgentEvidence } from "@/components/agents/agent-notice";

import { attentionOf, loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate, relativeDays } from "@/lib/domain/format";
import { MEETING_TYPE_LABEL } from "@/lib/domain/status";
import { REPORT_META } from "@/lib/domain/reporting";
import { SCORECARD_STATUS_LABEL } from "@/lib/domain/weekly-scorecard";
import { PageHeader } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Owner } from "@/components/os/avatar";
import { StatusDot } from "@/components/os/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mission Control" };

const SC_TONE = { on_track: "on", at_risk: "risk", off_track: "off", not_reported: "none" } as const;

export default async function MissionControlPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const s = await loadCompanySnapshot(ctx.supabase, ctx.company.companyId);
  if (!s) return null;
  const base = `/c/${slug}`;
  const agentWork = await loadAgentWork(ctx.supabase, ctx.company.companyId);
  const attention = attentionOf(s);
  const today = s.now.toISOString().slice(0, 10);
  const weekEnd = new Date(s.now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const dueThisWeek = s.openActions.filter((a) => a.due_date && a.due_date >= today && a.due_date <= weekEnd);
  const approved = s.sentScorecards.find((w) => w.week_start === s.weekStart && w.approved_at);

  // Owners: who holds the priorities, KPIs and actions this quarter
  const owners = new Map<string, { priorities: number; offPriorities: number; kpis: number; offKpis: number; actions: number; overdue: number }>();
  const o = (id: string) => {
    const x = owners.get(id) ?? { priorities: 0, offPriorities: 0, kpis: 0, offKpis: 0, actions: 0, overdue: 0 };
    owners.set(id, x);
    return x;
  };
  for (const p of s.priorities) {
    o(p.owner_id).priorities++;
    if (p.status === "off_track" || p.status === "at_risk") o(p.owner_id).offPriorities++;
  }
  for (const m of s.metrics.filter((v) => v.metric.in_weekly_scorecard)) {
    o(m.metric.owner_id).kpis++;
    if (m.status === "off_track") o(m.metric.owner_id).offKpis++;
  }
  for (const a of s.openActions) o(a.owner_id).actions++;
  for (const a of s.overdueActions) o(a.owner_id).overdue++;
  const ownerRows = [...owners.entries()].sort((a, b) => b[1].offPriorities + b[1].offKpis + b[1].overdue - (a[1].offPriorities + a[1].offKpis + a[1].overdue));

  return (
    <div className="fade-in space-y-5">
      <PageHeader
        eyebrow="Mission Control"
        title="What needs attention this week?"
        description="Priorities → Owners → Scorecard → Issues → Decisions → Actions. Exceptions first; routine, on-track activity stays out of the way."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/weekly-scorecard`}>
                <Mail /> Monday scorecard
              </Link>
            </Button>
            {s.nextMeeting && (
              <Button asChild size="sm" variant={s.nextMeeting.status === "in_progress" ? "brand" : "default"}>
                <Link href={`${base}/meetings/${s.nextMeeting.id}`}>
                  <CalendarClock /> {MEETING_TYPE_LABEL[s.nextMeeting.type]} · {relativeDays(s.nextMeeting.scheduled_at)}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <AgentEvidence slug={slug} work={agentWork} title="Agents" limit={4} />

      <Card data-testid="mc-attention">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            {attention.items.length ? <AlertTriangle className="size-4 text-risk-ink" /> : <CheckCircle2 className="size-4 text-on-ink" />}
            {attention.items.length ? `${attention.items.length} item${attention.items.length === 1 ? "" : "s"} need attention` : "Nothing needs attention this week"}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Routine: {attention.routine.kpisOnTrack}/{attention.routine.kpisTotal} KPIs on track · {attention.routine.prioritiesOnTrack}/{attention.routine.prioritiesTotal} priorities on track
          </span>
        </CardHeader>
        <div className="divide-y">
          {attention.items.map((a, i) => (
            <Link key={i} href={`${base}${a.href}`} className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40">
              <span className={cn("size-2 shrink-0 rounded-full", a.severity === "off" ? "bg-off" : "bg-risk")} aria-hidden />
              <Badge variant="outline" className="w-24 justify-center capitalize">
                {a.kind.replace("_", " ")}
              </Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{a.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
              </span>
              {a.ownerId && <Owner person={s.crewById.get(a.ownerId)} className="hidden sm:inline-flex" />}
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-2 xl:grid-cols-3">
        <Flow n={1} title="90-day priorities" href={`${base}/flight-plan`} link="Flight Plan">
          {s.priorities.map((p) => (
            <Row key={p.id} href={`${base}/flight-plan/quarterly_priority/${p.id}`}>
              <StatusDot status={p.status} />
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
              <Owner person={s.crewById.get(p.owner_id)} showName={false} />
            </Row>
          ))}
          {!s.priorities.length && <Empty>No priorities in the active quarter.</Empty>}
        </Flow>

        <Flow n={2} title="Owners" href={`${base}/crew`} link="Crew">
          {ownerRows.slice(0, 7).map(([id, x]) => (
            <div key={id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
              <Owner person={s.crewById.get(id)} className="min-w-0 flex-1" />
              <span className="text-xs text-muted-foreground tabular">
                {x.priorities} pri · {x.kpis} KPI · {x.actions} act
              </span>
              {x.offPriorities + x.offKpis + x.overdue > 0 && <span className="text-xs font-medium text-off-ink tabular">{x.offPriorities + x.offKpis + x.overdue} flagged</span>}
            </div>
          ))}
        </Flow>

        <Flow n={3} title="Scorecard" href={`${base}/weekly-scorecard`} link={approved ? "Approved this week" : "Awaiting approval"}>
          {s.scorecard.map((r) => (
            <Row key={r.metricId} href={`${base}/scoreboard/${r.metricId}`}>
              <span className="min-w-0 flex-1 truncate">{r.kpi}</span>
              <span className="text-xs tabular">{r.actual}</span>
              <Badge variant={SC_TONE[r.status]} className="w-[84px] justify-center">
                {SCORECARD_STATUS_LABEL[r.status]}
              </Badge>
            </Row>
          ))}
          {!s.scorecard.length && <Empty>No KPIs are in the weekly scorecard yet.</Empty>}
        </Flow>

        <Flow n={4} title="Issues" href={`${base}/execution?view=issues`} link={`${s.openIssues.length} open`}>
          {s.openIssues.slice(0, 6).map((i) => (
            <Row key={i.id} href={`${base}/execution/issue/${i.id}`}>
              <span className={cn("size-1.5 shrink-0 rounded-full", i.priority === "critical" ? "bg-off" : i.priority === "high" ? "bg-risk" : "bg-none")} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{i.title}</span>
              {i.escalated_to_omni && <Badge variant="brand">Omni</Badge>}
            </Row>
          ))}
          {!s.openIssues.length && <Empty>No open issues.</Empty>}
        </Flow>

        <Flow n={5} title="Decisions" href={`${base}/execution?view=decisions`} link="Decision log">
          {s.recentDecisions.slice(0, 6).map((d) => (
            <div key={d.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate">{d.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(d.decided_on, { year: false })}</span>
            </div>
          ))}
          {!s.recentDecisions.length && <Empty>No decisions recorded yet.</Empty>}
        </Flow>

        <Flow n={6} title="Actions" href={`${base}/execution?view=actions`} link={`${s.openActions.length} open`}>
          {[...s.overdueActions, ...dueThisWeek].slice(0, 7).map((a) => {
            const overdue = s.overdueActions.includes(a);
            return (
              <div key={a.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                <Owner person={s.crewById.get(a.owner_id)} showName={false} />
                <span className={cn("w-20 shrink-0 text-right text-xs tabular", overdue ? "font-medium text-off-ink" : "text-muted-foreground")}>{overdue ? relativeDays(a.due_date) : formatDate(a.due_date, { year: false })}</span>
              </div>
            );
          })}
          {!s.overdueActions.length && !dueThisWeek.length && <Empty>Nothing overdue or due this week.</Empty>}
        </Flow>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rhythm</CardTitle>
          <Link href={`${base}/calendar`} className="text-xs text-muted-foreground hover:text-foreground">
            Calendar & governance <ArrowRight className="inline size-3" />
          </Link>
        </CardHeader>
        <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          <RhythmCell label="Weekly ELT meeting" value={s.lastWeekly ? `Last ${formatDate(s.lastWeekly.scheduled_at, { year: false })}` : "None held yet"} sub={`${s.meetingsLast4Weeks}/4 held in the last four weeks`} warn={s.meetingsLast4Weeks < 3} />
          <RhythmCell label="Monday scorecard" value={approved ? `Approved ${formatDate(approved.approved_at, { year: false })}` : "Not yet approved"} sub={`Week of ${formatDate(s.weekStart, { year: false })}`} warn={!approved} />
          {s.reporting.slice(0, 1).map((r) => (
            <RhythmCell key="r" label={REPORT_META[r.kind].label} value={r.state === "published" || r.state === "published_late" ? "Published" : r.state === "overdue" ? "Overdue" : `Due ${formatDate(r.due, { year: false })}`} sub={r.periodLabel} warn={r.state === "overdue"} />
          ))}
          <RhythmCell label="Quarterly offsite" value={s.nextOffsite ? formatDate(s.nextOffsite.scheduled_at) : "Not scheduled"} sub={s.lastOffsite ? `Last ${formatDate(s.lastOffsite.scheduled_at)}` : "No previous offsite"} warn={!s.nextOffsite} />
        </div>
      </Card>

    </div>
  );
}

function Flow({ n, title, href, link, children }: { n: number; title: string; href: string; link: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-brand-subtle text-[11px] font-semibold text-brand-ink">{n}</span>
          {title}
        </CardTitle>
        <Link href={href} className="text-xs text-muted-foreground hover:text-foreground">
          {link} <ArrowRight className="inline size-3" />
        </Link>
      </CardHeader>
      <div className="divide-y">{children}</div>
    </Card>
  );
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-accent/40">
      {children}
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}

function RhythmCell({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-medium", warn && "text-risk-ink")}>{value}</p>
      <p className="text-[11.5px] text-muted-foreground">{sub}</p>
    </div>
  );
}
