import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Gavel, ListPlus, Users } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { loadMeetingBundle } from "@/lib/data/meetings";
import { formOptions } from "@/lib/data/options";
import { AGENDA_SECTIONS, buildAgenda } from "@/lib/domain/agenda";
import { formatDate, formatDateTime, formatMetric } from "@/lib/domain/format";
import { MEETING_TYPE_LABEL, STATUS_META } from "@/lib/domain/status";
import { LiveMeeting } from "@/components/meetings/live-meeting";
import { StartMeetingButton } from "@/components/meetings/meeting-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, Owner } from "@/components/os/avatar";
import { PriorityBadge, StatusDot } from "@/components/os/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Meeting" };

export default async function MeetingPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getCompanyContext(slug);
  const snap = await loadCompanySnapshot(ctx.supabase, ctx.company.companyId);
  if (!snap) notFound();
  const bundle = await loadMeetingBundle(ctx.supabase, snap, id);
  if (!bundle) notFound();
  const crew = snap.crew.map((c) => ({ id: c.id, full_name: c.full_name, title: c.title, is_open_seat: c.is_open_seat, avatar_color: c.avatar_color }));
  const m = bundle.meeting;

  if (m.status === "in_progress") {
    const options = await formOptions(ctx.supabase, snap);
    return <LiveMeeting companyId={ctx.company.companyId} slug={slug} bundle={bundle} crew={crew} options={options} canWrite={ctx.can.write} />;
  }

  const back = (
    <Link href={`/c/${slug}/meetings`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" /> Meetings
    </Link>
  );
  const cur = snap.company.currency;

  if (m.status === "scheduled") {
    const preview = buildAgenda({
      meetingType: m.type,
      metrics: snap.metrics.map((v) => ({ ...v, metric: { ...v.metric, tolerance_pct: Number(v.metric.tolerance_pct) } })),
      priorities: snap.priorities,
      openActions: snap.openActions,
      openIssues: snap.openIssues,
      previouslyDiscussed: new Set(),
      today: new Date().toISOString().slice(0, 10),
    });
    const { data: live } = await ctx.supabase.from("meetings").select("id").eq("company_id", ctx.company.companyId).eq("status", "in_progress").limit(1);
    return (
      <div className="fade-in max-w-4xl">
        {back}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge variant="outline">{MEETING_TYPE_LABEL[m.type]}</Badge>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight">{m.title}</h1>
            <p className="text-sm text-muted-foreground">{formatDateTime(m.scheduled_at)} · agenda prepared automatically from the live plan</p>
          </div>
          {ctx.can.write && !live?.length && <StartMeetingButton companyId={ctx.company.companyId} meetingId={m.id} size="lg" />}
          {live?.length ? <p className="text-sm text-muted-foreground">Another meeting is in progress.</p> : null}
        </div>
        <div className="space-y-4">
          {AGENDA_SECTIONS.map((s, n) => {
            const items = preview.filter((i) => i.section === s.key);
            return (
              <Card key={s.key}>
                <CardHeader>
                  <CardTitle>
                    {n + 1}. {s.label}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{["discussion", "new_actions"].includes(s.key) ? "Captured live" : `${items.length} items`}</span>
                </CardHeader>
                {items.length > 0 && (
                  <ul className="divide-y text-sm">
                    {items.slice(0, 12).map((i) => {
                      const snapshot = i.snapshot as Record<string, unknown>;
                      return (
                        <li key={i.entity_id} className="flex items-center gap-2 px-4 py-2">
                          {i.entity_type === "metric" && <StatusDot status={snapshot.status as never} />}
                          {i.entity_type === "quarterly_priority" && <StatusDot status={snapshot.status as never} />}
                          <span className="min-w-0 flex-1 truncate">{i.title}</span>
                          {i.entity_type === "metric" && (
                            <span className="text-xs text-muted-foreground tabular">
                              {formatMetric(snapshot.value as number, snapshot.unit as never, { decimals: snapshot.decimals as number, currency: cur })} · {String(snapshot.reason)}
                            </span>
                          )}
                          {i.entity_type === "action" && snapshot.overdue ? <Badge variant="off">Overdue</Badge> : null}
                          {i.entity_type === "issue" && <PriorityBadge priority={snapshot.priority as never} />}
                        </li>
                      );
                    })}
                    {items.length > 12 && <li className="px-4 py-2 text-xs text-muted-foreground">+ {items.length - 12} more</li>}
                  </ul>
                )}
                {!items.length && !["discussion", "new_actions"].includes(s.key) && <CardContent className="text-sm text-muted-foreground">Nothing to review.</CardContent>}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Completed — permanent meeting record
  const crewById = new Map(snap.crew.map((c) => [c.id, c]));
  const minutes = m.started_at && m.ended_at ? Math.round((new Date(m.ended_at).getTime() - new Date(m.started_at).getTime()) / 60000) : null;
  const present = bundle.attendees.filter((a) => a.present);
  const absent = bundle.attendees.filter((a) => !a.present);
  const kpiItems = bundle.agenda.filter((i) => i.section === "kpi_exceptions");
  const priorityItems = bundle.agenda.filter((i) => i.section === "priorities");
  const issueItems = bundle.agenda.filter((i) => i.section === "issues");
  const carried = bundle.agenda.filter((i) => i.carried_over && i.entity_type === "issue");

  return (
    <div className="fade-in max-w-5xl">
      {back}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{MEETING_TYPE_LABEL[m.type]}</Badge>
          <Badge variant="on">Completed</Badge>
        </div>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight">{m.title}</h1>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{formatDateTime(m.started_at ?? m.scheduled_at)}</span>
          {minutes !== null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {minutes} min
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" /> {present.length} present{absent.length ? `, ${absent.length} absent` : ""}
          </span>
          {m.rating && <span>Rated {m.rating}/10</span>}
        </div>
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed whitespace-pre-line">{m.summary ?? "No summary recorded."}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Gavel className="size-3.5 text-done" /> Decisions ({bundle.decisions.length})
              </CardTitle>
            </CardHeader>
            <div className="divide-y">
              {bundle.decisions.map((d) => (
                <div key={d.id} className="px-4 py-2.5">
                  <p className="text-sm font-medium">{d.title}</p>
                  {d.rationale && <p className="mt-0.5 text-sm text-muted-foreground">{d.rationale}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">Owner: {crewById.get(d.owner_id)?.full_name}</p>
                </div>
              ))}
              {!bundle.decisions.length && <p className="px-4 py-3 text-sm text-muted-foreground">No decisions recorded.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <ListPlus className="size-3.5 text-brand" /> Actions assigned ({bundle.newActions.length})
              </CardTitle>
            </CardHeader>
            <div className="divide-y">
              {bundle.newActions.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  {a.status === "done" ? <CheckCircle2 className="size-4 text-on" /> : <span className="size-4 rounded-full border" />}
                  <span className={cn("flex-1", a.status === "done" && "text-muted-foreground line-through")}>{a.title}</span>
                  <Owner person={crewById.get(a.owner_id)} />
                  <span className="w-16 text-right text-xs text-muted-foreground">{formatDate(a.due_date, { year: false })}</span>
                </div>
              ))}
              {!bundle.newActions.length && <p className="px-4 py-3 text-sm text-muted-foreground">No actions assigned.</p>}
            </div>
          </Card>

          {(kpiItems.length > 0 || priorityItems.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Reviewed at the time</CardTitle>
                <span className="text-xs text-muted-foreground">Snapshot when the meeting started</span>
              </CardHeader>
              <div className="grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
                <ul className="divide-y text-sm">
                  {kpiItems.map((i) => {
                    const s = i.snapshot as Record<string, unknown>;
                    return (
                      <li key={i.id} className="flex items-center gap-2 px-4 py-2">
                        <StatusDot status={s.status as never} />
                        <span className="flex-1 truncate">{i.title}</span>
                        <span className="text-xs text-muted-foreground tabular">{formatMetric(s.value as number, s.unit as never, { decimals: s.decimals as number, currency: cur })}</span>
                      </li>
                    );
                  })}
                </ul>
                <ul className="divide-y text-sm">
                  {priorityItems.map((i) => {
                    const s = i.snapshot as Record<string, unknown>;
                    return (
                      <li key={i.id} className="flex items-center gap-2 px-4 py-2">
                        <span className="flex-1 truncate">{i.title}</span>
                        <span className="text-xs text-muted-foreground">{STATUS_META[s.status as keyof typeof STATUS_META]?.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Attendees</CardTitle>
            </CardHeader>
            <ul className="divide-y text-sm">
              {bundle.attendees.map((a) => {
                const c = crewById.get(a.crew_member_id);
                if (!c) return null;
                return (
                  <li key={a.crew_member_id} className={cn("flex items-center gap-2 px-4 py-2", !a.present && "opacity-50")}>
                    <Avatar name={c.full_name} color={c.avatar_color} size="xs" />
                    <span className="flex-1">{c.full_name}</span>
                    <span className="text-xs text-muted-foreground">{a.present ? "Present" : "Absent"}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Issues</CardTitle>
            </CardHeader>
            <div className="space-y-3 px-4 py-3 text-sm">
              {bundle.resolvedIssues.map((i) => (
                <p key={i.id} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-on" /> {i.title}
                </p>
              ))}
              {bundle.raisedIssues.map((i) => (
                <p key={i.id} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-risk" /> {i.title} <span className="text-xs text-muted-foreground">(raised)</span>
                </p>
              ))}
              {carried.length > 0 && <p className="text-xs text-muted-foreground">{carried.length} issue(s) carried into the next meeting.</p>}
              {!bundle.resolvedIssues.length && !bundle.raisedIssues.length && !issueItems.length && <p className="text-muted-foreground">No issues discussed.</p>}
              {issueItems.length > 0 && !bundle.resolvedIssues.length && !bundle.raisedIssues.length && <p className="text-muted-foreground">{issueItems.length} issue(s) discussed.</p>}
            </div>
          </Card>
          {m.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-line">{m.notes}</CardContent>
            </Card>
          )}
          {issueItems.some((i) => i.notes) && (
            <Card>
              <CardHeader>
                <CardTitle>Discussion notes</CardTitle>
              </CardHeader>
              <div className="divide-y text-sm">
                {issueItems
                  .filter((i) => i.notes)
                  .map((i) => (
                    <div key={i.id} className="px-4 py-2.5">
                      <p className="font-medium">{i.title}</p>
                      <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{i.notes}</p>
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
