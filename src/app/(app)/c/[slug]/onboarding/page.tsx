import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate } from "@/lib/domain/format";
import { OPERATING_CYCLE } from "@/lib/domain/operating-system";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MilestoneOwner, MilestoneStatus, SetUpOnboardingButton } from "@/components/onboarding/controls";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "First 100 days" };

const PHASES = [
  { when: "Day 1", what: "Completion · Chair and CEO briefing · governance rhythm agreed" },
  { when: "Weeks 1–4", what: "Listening, diagnostics and one agreed set of facts" },
  { when: "Weeks 3–6", what: "Leadership offsite: Vision, Mission, Values and North Star" },
  { when: "Weeks 4–8", what: "Flight Plan and the first 90-day priorities" },
  { when: "Weeks 4–10", what: "Crew review and agreed organisational actions" },
  { when: "By week 12", what: "Mission Control running: weekly ELT, scorecard, monthly Board" },
  { when: "Around day 90", what: "First quarterly offsite: review and reset" },
  { when: "By day 100", what: "100-day plan delivered to the Board" },
];
const WEEKS = 15;

export default async function OnboardingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const s = await loadCompanySnapshot(ctx.supabase, cid);
  if (!s) return null;
  const base = `/c/${slug}`;
  const ms = s.onboarding;
  const acquired = s.company.acquired_on ? new Date(`${s.company.acquired_on}T00:00:00Z`) : null;
  const day = acquired ? Math.max(0, Math.floor((s.now.getTime() - acquired.getTime()) / 86400000)) : null;
  const week = day !== null ? day / 7 : null;
  const done = ms.filter((m) => m.status === "done").length;
  const today = s.now.toISOString().slice(0, 10);
  const crew = s.crew.filter((c) => !c.is_open_seat).map((c) => ({ id: c.id, full_name: c.full_name }));
  const stepState = (step: number) => {
    const list = ms.filter((m) => m.step === step);
    if (!list.length) return "none";
    if (list.every((m) => m.status === "done")) return "done";
    if (list.some((m) => m.status !== "not_started")) return "active";
    return "todo";
  };

  return (
    <div className="fade-in space-y-5">
      <PageHeader
        eyebrow="Cycles · First 100 days"
        title={day !== null ? (day <= 100 ? `Day ${day} of the first 100` : `First 100 days — completed ${formatDate(new Date(acquired!.getTime() + 100 * 86400000))}`) : "First 100 days"}
        description="A lightweight tracker for the Omni Operating System's first cycle, from completion to the first quarterly offsite. Mission Control set-up starts in week 1."
      />

      {/* Seven-step operating cycle */}
      <Card>
        <CardHeader>
          <CardTitle>The operating cycle</CardTitle>
          {ms.length > 0 && <span className="text-xs text-muted-foreground">{done} of {ms.length} milestones complete</span>}
        </CardHeader>
        <ol className="grid gap-px bg-border sm:grid-cols-4 xl:grid-cols-7" data-testid="cycle">
          {OPERATING_CYCLE.map((c) => {
            const st = stepState(c.step);
            return (
              <li key={c.step} className={cn("bg-card px-3 py-3", st === "active" && "bg-brand-subtle")}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border text-xs font-semibold",
                      st === "done" && "border-on bg-on text-white",
                      st === "active" && "border-brand bg-brand text-brand-foreground",
                    )}
                  >
                    {st === "done" ? <Check className="size-3.5" /> : c.step}
                  </span>
                  <span className="text-[13px] font-medium">{c.title}</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{c.summary}</p>
              </li>
            );
          })}
        </ol>
      </Card>

      {!ms.length ? (
        <EmptyState title="No 100-day plan yet" description="Create it from the Omni template; dates are set from the completion date." action={ctx.can.admin ? <SetUpOnboardingButton companyId={cid} /> : undefined} />
      ) : (
        <>
          {/* Timetable */}
          <Card className="overflow-x-auto">
            <CardHeader>
              <CardTitle>Timetable</CardTitle>
              <Progress value={(done / ms.length) * 100} tone="brand" className="w-40" />
            </CardHeader>
            <div className="min-w-[760px] px-4 pt-2 pb-4">
              <div className="grid grid-cols-[260px_1fr] text-[11px] text-muted-foreground">
                <span />
                <div className="relative grid" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
                  {Array.from({ length: WEEKS }, (_, i) => (
                    <span key={i} className="border-l px-1">
                      {i === 0 ? "Day 1" : `W${i}`}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-1 space-y-1">
                {ms.map((m) => (
                  <div key={m.id} className="grid grid-cols-[260px_1fr] items-center">
                    <span className="truncate pr-3 text-[12.5px]">{m.title}</span>
                    <div className="relative h-5 rounded bg-muted/40">
                      <div
                        className={cn("absolute inset-y-0.5 rounded", m.status === "done" ? "bg-on/70" : m.status === "in_progress" ? "bg-brand" : "bg-muted-foreground/25", m.status !== "done" && m.due_date && m.due_date < today && "bg-off/70")}
                        style={{ left: `${(m.start_week / WEEKS) * 100}%`, width: `${(Math.max(0.6, m.end_week - m.start_week) / WEEKS) * 100}%` }}
                        title={`${m.title} · weeks ${m.start_week}–${m.end_week}`}
                      />
                      {week !== null && week <= WEEKS && <div className="absolute -inset-y-1 w-px bg-foreground" style={{ left: `${(week / WEEKS) * 100}%` }} aria-hidden />}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">Bars show planned weeks; the vertical line is today. Red bars are past their due date.</p>
            </div>
          </Card>

          <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1fr_320px]">
            {/* Milestones */}
            <Card>
              <CardHeader>
                <CardTitle>Milestones</CardTitle>
              </CardHeader>
              <div className="divide-y" data-testid="onboarding-milestones">
                {ms.map((m) => {
                  const late = m.status !== "done" && m.due_date && m.due_date < today;
                  return (
                    <div key={m.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">{m.step}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium">{m.title}</p>
                        <p className="text-xs text-muted-foreground">{m.description}</p>
                        <p className="mt-1 text-xs">
                          <span className="text-muted-foreground">Deliverable:</span> {m.deliverable} · <span className="text-muted-foreground">Lead:</span> {m.lead}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <span className={cn("text-xs tabular", late ? "font-medium text-off-ink" : "text-muted-foreground")}>Due {formatDate(m.due_date, { year: false })}</span>
                        <MilestoneOwner companyId={cid} id={m.id} ownerId={m.owner_id} crew={crew} disabled={!ctx.can.write} />
                        <MilestoneStatus companyId={cid} id={m.id} status={m.status} disabled={!ctx.can.write} />
                        {m.link_path && m.link_path !== "/onboarding" && (
                          <Link href={`${base}${m.link_path}`} className="text-xs text-muted-foreground hover:text-foreground">
                            Open <ArrowRight className="inline size-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle>The first 100 days at a glance</CardTitle>
              </CardHeader>
              <ol className="divide-y text-[13px]">
                {PHASES.map((p) => (
                  <li key={p.when} className="px-4 py-2">
                    <span className="block font-medium">{p.when}</span>
                    <span className="text-muted-foreground">{p.what}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
