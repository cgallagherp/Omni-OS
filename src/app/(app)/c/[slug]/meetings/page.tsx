import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, Radio, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate, formatDateTime, relativeDays } from "@/lib/domain/format";
import { MEETING_TYPE_LABEL } from "@/lib/domain/status";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScheduleMeetingDialog, StartMeetingButton, StartNowButton } from "@/components/meetings/meeting-buttons";

export const metadata: Metadata = { title: "Meetings & Rhythm" };

const CADENCE = [
  { type: "weekly", label: "Weekly ELT meeting", detail: "Scorecard (exceptions only) · 90-day priorities · issues · actions" },
  { type: "board_monthly", label: "Monthly Board", detail: "One-hour Board with the one-page check-in" },
  { type: "board_quarterly", label: "Quarterly Board", detail: "Full Board pack · papers 3 working days before" },
  { type: "quarterly", label: "Quarterly offsite", detail: "Review the last 90 days and set the next ~3 priorities" },
  { type: "annual", label: "Annual strategy reset", detail: "North Star → Flight Plan → 12-month objectives → budget" },
] as const;

/** Escapes LIKE wildcards in user input. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export default async function MeetingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }) {
  const { slug } = await params;
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 100);
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

  // Permanent, searchable record: meetings, decisions, actions and agenda notes.
  const results = q
    ? await Promise.all([
        ctx.supabase.from("meetings").select("id, title, scheduled_at, summary").eq("company_id", cid).or(`title.ilike.${JSON.stringify(like(q))},summary.ilike.${JSON.stringify(like(q))},notes.ilike.${JSON.stringify(like(q))}`).order("scheduled_at", { ascending: false }).limit(20),
        ctx.supabase.from("decisions").select("id, title, decided_on, meeting_id").eq("company_id", cid).ilike("title", like(q)).order("decided_on", { ascending: false }).limit(20),
        ctx.supabase.from("actions").select("id, title, due_date, status, meeting_id").eq("company_id", cid).ilike("title", like(q)).order("created_at", { ascending: false }).limit(20),
        ctx.supabase.from("meeting_agenda_items").select("id, title, notes, meeting_id").eq("company_id", cid).ilike("notes", like(q)).limit(20),
      ])
    : null;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Mission Control · Rhythm"
        title="Meetings & Rhythm"
        description="The meeting and reporting cadence that turns the plan into weekly execution. Agendas are prepared automatically from the scorecard, 90-day priorities and open issues; everything is updated in the meeting and kept as a permanent record."
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
          <Radio className="size-4 text-off-ink" />
          <span className="font-medium">{m.title} is in progress</span>
          <span className="text-sm text-muted-foreground">started {formatDateTime(m.started_at)}</span>
          <span className="ml-auto text-sm font-medium">Rejoin →</span>
        </Link>
      ))}

      <form className="mb-5 flex max-w-xl gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search meetings, decisions, actions and notes…" aria-label="Search meeting history" className="pl-8" />
        </div>
        <Button type="submit" variant="outline">Search</Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href={`/c/${slug}/meetings`}>Clear</Link>
          </Button>
        )}
      </form>

      {results && (
        <Card className="mb-5" data-testid="search-results">
          <CardHeader>
            <CardTitle>Results for “{q}”</CardTitle>
            <span className="text-xs text-muted-foreground">{results.reduce((n, r) => n + (r.data?.length ?? 0), 0)} found</span>
          </CardHeader>
          <div className="divide-y text-sm">
            {(results[0].data ?? []).map((m) => (
              <SearchRow key={`m${m.id}`} kind="Meeting" href={`/c/${slug}/meetings/${m.id}`} title={m.title} meta={formatDate(m.scheduled_at)} detail={m.summary} />
            ))}
            {(results[1].data ?? []).map((d) => (
              <SearchRow key={`d${d.id}`} kind="Decision" href={d.meeting_id ? `/c/${slug}/meetings/${d.meeting_id}` : `/c/${slug}/execution?view=decisions`} title={d.title} meta={formatDate(d.decided_on)} />
            ))}
            {(results[2].data ?? []).map((a) => (
              <SearchRow key={`a${a.id}`} kind="Action" href={a.meeting_id ? `/c/${slug}/meetings/${a.meeting_id}` : `/c/${slug}/execution?view=actions`} title={a.title} meta={`${a.status} · due ${formatDate(a.due_date)}`} />
            ))}
            {(results[3].data ?? []).map((n) => (
              <SearchRow key={`n${n.id}`} kind="Agenda note" href={`/c/${slug}/meetings/${n.meeting_id}`} title={n.title} detail={n.notes} />
            ))}
            {results.every((r) => !r.data?.length) && <p className="px-4 py-4 text-muted-foreground">Nothing matches.</p>}
          </div>
        </Card>
      )}

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
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
              <EmptyState className="m-4" title="Nothing scheduled" description="Schedule the next weekly ELT meeting to keep the rhythm." />
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

function SearchRow({ kind, href, title, meta, detail }: { kind: string; href: string; title: string; meta?: string; detail?: string | null }) {
  return (
    <Link href={href} className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/40">
      <Badge variant="outline" className="mt-0.5 w-24 justify-center">
        {kind}
      </Badge>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {detail && <span className="line-clamp-1 text-xs text-muted-foreground">{detail}</span>}
      </span>
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
    </Link>
  );
}
