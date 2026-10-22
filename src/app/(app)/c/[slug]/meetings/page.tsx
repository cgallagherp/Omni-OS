import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, Radio } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate, formatDateTime, relativeDays } from "@/lib/domain/format";
import { MEETING_TYPE_LABEL } from "@/lib/domain/status";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScheduleMeetingDialog, StartMeetingButton, StartNowButton } from "@/components/meetings/meeting-buttons";

export const metadata: Metadata = { title: "Rhythm" };

const CADENCE = [
  { type: "weekly", label: "Weekly leadership meeting", detail: "90 minutes · KPI exceptions, priorities, actions, issues" },
  { type: "monthly", label: "Monthly operating review", detail: "Financial & operational performance vs plan" },
  { type: "quarterly", label: "Quarterly strategic reset", detail: "Close the quarter, approve the next 90 days" },
  { type: "annual", label: "Annual strategic planning", detail: "Refresh the North Star, Winning Moves and budget" },
] as const;

export default async function MeetingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const snap = await loadCompanySnapshot(ctx.supabase, ctx.company.companyId);
  const cid = ctx.company.companyId;
  const [{ data: meetings }, { data: counts }] = await Promise.all([
    ctx.supabase.from("meetings").select("*, meeting_attendees(present)").eq("company_id", cid).order("scheduled_at", { ascending: false }),
    ctx.supabase.from("decisions").select("meeting_id").eq("company_id", cid).not("meeting_id", "is", null),
  ]);
  const { data: actionCounts } = await ctx.supabase.from("actions").select("meeting_id").eq("company_id", cid).not("meeting_id", "is", null);
  const tally = (rows: Array<{ meeting_id: string | null }> | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r.meeting_id) m.set(r.meeting_id, (m.get(r.meeting_id) ?? 0) + 1);
    return m;
  };
  const dCount = tally(counts);
  const aCount = tally(actionCounts);
  const all = meetings ?? [];
  const live = all.filter((m) => m.status === "in_progress");
  const upcoming = all.filter((m) => m.status === "scheduled").reverse();
  const history = all.filter((m) => m.status === "completed");
  const crew = (snap?.crew ?? []).map((c) => ({ id: c.id, full_name: c.full_name, title: c.title, is_open_seat: c.is_open_seat }));

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Rhythm"
        title="Management meetings"
        description="The operating cadence that turns the plan into weekly execution. Agendas are prepared automatically from the Scoreboard, Flight Plan and open issues."
        actions={
          ctx.can.write && (
            <>
              {live.length === 0 && <StartNowButton companyId={cid} slug={slug} />}
              <ScheduleMeetingDialog companyId={cid} crew={crew} trigger={<Button size="sm"><CalendarPlus /> Schedule</Button>} />
            </>
          )
        }
      />

      {live.map((m) => (
        <Link key={m.id} href={`/c/${slug}/meetings/${m.id}`} className="mb-5 flex items-center gap-3 rounded-lg border border-off/40 bg-off-bg/60 px-4 py-3 hover:bg-off-bg">
          <Radio className="size-4 text-off" />
          <span className="font-medium">{m.title} is in progress</span>
          <span className="text-sm text-muted-foreground">started {formatDateTime(m.started_at)}</span>
          <span className="ml-auto text-sm font-medium">Rejoin →</span>
        </Link>
      ))}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming</CardTitle>
            </CardHeader>
            {upcoming.length ? (
              <div className="divide-y">
                {upcoming.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="w-14 text-center">
                      <div className="text-[11px] font-medium text-muted-foreground uppercase">{new Date(m.scheduled_at).toLocaleDateString("en-GB", { month: "short", timeZone: "Europe/London" })}</div>
                      <div className="text-lg leading-none font-semibold">{new Date(m.scheduled_at).toLocaleDateString("en-GB", { day: "numeric", timeZone: "Europe/London" })}</div>
                    </div>
                    <Link href={`/c/${slug}/meetings/${m.id}`} className="min-w-0 flex-1 hover:underline">
                      <p className="font-medium">{m.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {MEETING_TYPE_LABEL[m.type]} · {formatDateTime(m.scheduled_at)} · {relativeDays(m.scheduled_at)}
                      </p>
                    </Link>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/c/${slug}/meetings/${m.id}`}>Preview agenda</Link>
                    </Button>
                    {ctx.can.write && live.length === 0 && <StartMeetingButton companyId={cid} meetingId={m.id} size="sm" label="Start" href={`/c/${slug}/meetings/${m.id}`} />}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState className="m-4" title="Nothing scheduled" description="Schedule the next weekly leadership meeting to keep the rhythm." />
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Meeting history</CardTitle>
              <span className="text-xs text-muted-foreground">{history.length} meetings</span>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 font-medium">Meeting</th>
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 text-right font-medium">Attendance</th>
                    <th className="px-2 py-2 text-right font-medium">Decisions</th>
                    <th className="px-2 py-2 text-right font-medium">Actions</th>
                    <th className="px-4 py-2 text-right font-medium">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((m) => {
                    const att = m.meeting_attendees as Array<{ present: boolean }>;
                    return (
                      <tr key={m.id} className="hover:bg-accent/40">
                        <td className="px-4 py-2.5">
                          <Link href={`/c/${slug}/meetings/${m.id}`} className="font-medium hover:underline">
                            {m.title}
                          </Link>
                          <p className="line-clamp-1 max-w-md text-xs text-muted-foreground">{m.summary}</p>
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(m.scheduled_at)}</td>
                        <td className="px-2 py-2.5 text-right tabular">
                          {att.filter((a) => a.present).length}/{att.length}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular">{dCount.get(m.id) ?? 0}</td>
                        <td className="px-2 py-2.5 text-right tabular">{aCount.get(m.id) ?? 0}</td>
                        <td className="px-4 py-2.5 text-right tabular">{m.rating ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Operating cadence</CardTitle>
          </CardHeader>
          <div className="divide-y">
            {CADENCE.map((c) => {
              const last = history.find((m) => m.type === c.type);
              const next = upcoming.find((m) => m.type === c.type);
              return (
                <div key={c.type} className="px-4 py-3">
                  <p className="text-[13px] font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                  <div className="mt-1.5 flex gap-2 text-xs">
                    <Badge variant="outline">Last {last ? formatDate(last.scheduled_at, { year: false }) : "—"}</Badge>
                    <Badge variant={next ? "default" : "outline"}>Next {next ? formatDate(next.scheduled_at, { year: false }) : "not scheduled"}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
