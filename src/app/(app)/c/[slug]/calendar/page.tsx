import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate } from "@/lib/domain/format";
import { MEETING_TYPE_LABEL } from "@/lib/domain/status";
import { REPORT_META, upcomingReportDeadlines } from "@/lib/domain/reporting";
import { PageHeader } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompleteRequirementButton, GovernanceDialog } from "@/components/governance/controls";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendar & governance" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Event = { date: string; kind: "board" | "offsite" | "reporting" | "listening" | "governance"; label: string; href: string };
const KIND = {
  board: { label: "Board", cls: "bg-done-bg text-done-ink" },
  offsite: { label: "Offsite", cls: "bg-brand-subtle text-brand-ink" },
  reporting: { label: "Reporting", cls: "bg-muted text-foreground/80" },
  listening: { label: "Listening", cls: "bg-on-bg text-on-ink" },
  governance: { label: "Governance", cls: "bg-risk-bg text-risk-ink" },
} as const;

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const s = await loadCompanySnapshot(ctx.supabase, cid);
  if (!s) return null;
  const base = `/c/${slug}`;
  const today = s.now.toISOString().slice(0, 10);
  const horizon = new Date(Date.UTC(s.now.getUTCFullYear(), s.now.getUTCMonth() + 12, 1)).toISOString().slice(0, 10);
  const { data: meetings } = await ctx.supabase.from("meetings").select("id, type, title, scheduled_at, status").eq("company_id", cid).neq("type", "weekly").gte("scheduled_at", `${today}T00:00:00`).order("scheduled_at");
  const { data: allBoard } = await ctx.supabase.from("meetings").select("type, scheduled_at").eq("company_id", cid).in("type", ["board_monthly", "board_quarterly"]);

  const events: Event[] = [];
  for (const m of meetings ?? []) {
    const date = m.scheduled_at.slice(0, 10);
    if (date >= horizon) continue;
    const kind = m.type === "board_monthly" || m.type === "board_quarterly" ? "board" : m.type === "quarterly" || m.type === "annual" ? "offsite" : "governance";
    events.push({ date, kind, label: m.title || MEETING_TYPE_LABEL[m.type], href: `${base}/meetings/${m.id}` });
  }
  for (const r of upcomingReportDeadlines({ today: s.now, fyStartMonth: s.company.fiscal_year_start_month, boardMeetings: allBoard ?? [] })) {
    events.push({ date: r.due, kind: "reporting", label: `${REPORT_META[r.kind].label} · ${r.periodLabel}`, href: `${base}/reporting/${r.kind}/${r.periodStart}` });
  }
  for (const kind of ["employee", "customer"] as const) {
    const last = s.listening.find((l) => l.kind === kind);
    const d = last ? new Date(`${last.held_on}T00:00:00Z`) : null;
    if (d) d.setUTCMonth(d.getUTCMonth() + 6);
    const due = d ? d.toISOString().slice(0, 10) : today;
    if (due < horizon) events.push({ date: due < today ? today : due, kind: "listening", label: `${kind === "employee" ? "Employee" : "Customer"} listening ${due < today ? "overdue" : "due"}`, href: `${base}/listening` });
  }
  for (const g of s.governance) if (g.next_due && g.next_due < horizon && !/flash|management accounts/i.test(g.title)) events.push({ date: g.next_due < today ? today : g.next_due, kind: "governance", label: g.title, href: "#governance" });
  events.sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = new Map<string, Event[]>();
  for (const e of events) {
    const k = e.date.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
  }

  return (
    <div className="fade-in space-y-5">
      <PageHeader
        eyebrow="Cycles · Calendar & governance"
        title="Calendar & governance"
        description="The rolling 12-month rhythm: Boards, offsites and the annual strategy reset, reporting deadlines, listening cycles and investor requirements."
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-4 py-2.5 text-[13px]">
        <span>
          Financial year starts in <span className="font-medium">{MONTHS[s.company.fiscal_year_start_month - 1]}</span> (FY{s.fiscalYear})
        </span>
        {ctx.can.admin && (
          <Link href={`${base}/settings`} className="text-xs text-muted-foreground underline">
            Change in Settings
          </Link>
        )}
        <span className="text-xs text-muted-foreground">Weekly ELT meetings are not listed; see Meetings & Rhythm.</span>
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Next 12 months</CardTitle>
          </CardHeader>
          <div className="divide-y" data-testid="calendar">
            {[...byMonth.entries()].map(([month, list]) => (
              <div key={month} className="px-4 py-3">
                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
                </p>
                <ul className="space-y-1">
                  {list.map((e, i) => (
                    <li key={i}>
                      <Link href={e.href} className="flex items-center gap-2 rounded px-1 py-0.5 text-[13px] hover:bg-accent/50">
                        <span className="w-12 shrink-0 text-xs text-muted-foreground tabular">{formatDate(e.date, { year: false })}</span>
                        <span className={cn("w-[76px] shrink-0 rounded px-1.5 text-center text-[10.5px] font-medium", KIND[e.kind].cls)}>{KIND[e.kind].label}</span>
                        <span className="min-w-0 flex-1 truncate">{e.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!events.length && <p className="px-4 py-3 text-sm text-muted-foreground">Nothing scheduled.</p>}
          </div>
        </Card>

        <Card id="governance" className="h-fit scroll-mt-16">
          <CardHeader>
            <CardTitle>Investor governance</CardTitle>
            {ctx.can.admin && <GovernanceDialog companyId={cid} trigger={<Button variant="ghost" size="xs"><Plus /> Requirement</Button>} />}
          </CardHeader>
          <div className="divide-y" data-testid="governance">
            {s.governance.map((g) => {
              const overdue = g.next_due && g.next_due < today;
              const soon = g.next_due && !overdue && g.next_due <= new Date(s.now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
              return (
                <div key={g.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{g.title}</p>
                    <p className="text-xs text-muted-foreground">{g.requirement}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {g.owner_label} · {g.cadence_label}
                      {g.last_completed_on && <> · last done {formatDate(g.last_completed_on)}</>}
                    </p>
                    {g.notes && <p className="mt-0.5 text-[11.5px]">{g.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {g.next_due ? (
                      <Badge variant={overdue ? "off" : soon ? "risk" : "outline"}>
                        {overdue ? "Overdue · " : "Due "}
                        {formatDate(g.next_due, { year: false })}
                      </Badge>
                    ) : (
                      <Badge variant="on">Complete</Badge>
                    )}
                    {ctx.can.write && g.next_due && <CompleteRequirementButton companyId={cid} id={g.id} />}
                    {ctx.can.admin && <GovernanceDialog companyId={cid} id={g.id} defaults={g} trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${g.title}`}><Pencil /></Button>} />}
                  </div>
                </div>
              );
            })}
            {!s.governance.length && <p className="px-4 py-3 text-sm text-muted-foreground">No requirements tracked yet.</p>}
          </div>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">Where these differ from the investment agreement, the agreement governs. Omni OS does not apply consent thresholds; record any company-specific requirements here.</p>
        </Card>
      </div>
    </div>
  );
}
