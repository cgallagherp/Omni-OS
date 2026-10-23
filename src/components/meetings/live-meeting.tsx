"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Gavel,
  ListPlus,
  Pencil,
  RefreshCw,
  Square,
  SquareCheck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, Owner } from "@/components/os/avatar";
import { PriorityBadge, StatusBadge } from "@/components/os/status";
import { Sparkline } from "@/components/os/sparkline";
import { FormDialog, InlineForm, SubmitButton, useQuickAction } from "@/components/os/forms";
import { ActionDialog, DecisionDialog, IssueDialog, ResolveIssueDialog, type CrewOption } from "@/components/os/entity-forms";
import { AGENDA_GROUPS, AGENDA_SECTIONS, type AgendaSection } from "@/lib/domain/agenda";
import { PRIORITY_STATUS_OPTIONS, RAG_OPTIONS, MEETING_TYPE_LABEL } from "@/lib/domain/status";
import { formatDate, relativeDays } from "@/lib/domain/format";
import type { MeetingBundle } from "@/lib/data/meetings";
import type { FormOptions } from "@/lib/data/options";
import { setActionStatus, saveAction, updatePlanItem } from "@/lib/actions/flight-plan";
import { resolveIssue, saveDecision, saveIssue, setIssueStatus } from "@/lib/actions/execution";
import { recordMetricValue } from "@/lib/actions/metrics";
import { finishMeeting, refreshAgenda, saveAgendaNote, saveMeetingNotes, setAgendaItemReviewed, setAttendance } from "@/lib/actions/meetings";
import { cn } from "@/lib/utils";

type Crew = CrewOption & { avatar_color: string | null };

const TIMEBOX: Record<string, Partial<Record<AgendaSection, number>>> = {
  weekly: { kpi_exceptions: 5, priorities: 10, issues: 60, previous_actions: 5, discussion: 5, new_actions: 5 },
  monthly: { kpi_exceptions: 30, priorities: 20, issues: 60, previous_actions: 10, discussion: 20, new_actions: 10 },
  board_monthly: { kpi_exceptions: 15, priorities: 15, issues: 20, previous_actions: 5, discussion: 15, new_actions: 5 },
  board_quarterly: { kpi_exceptions: 30, priorities: 30, issues: 45, previous_actions: 10, discussion: 45, new_actions: 10 },
  quarterly: { kpi_exceptions: 30, priorities: 45, issues: 90, previous_actions: 15, discussion: 60, new_actions: 15 },
  annual: { kpi_exceptions: 30, priorities: 45, issues: 90, previous_actions: 15, discussion: 90, new_actions: 15 },
};

function useElapsed(since: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return "0:00";
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function LiveMeeting({ companyId, slug, bundle, crew, options, canWrite }: { companyId: string; slug: string; bundle: MeetingBundle; crew: Crew[]; options: FormOptions; canWrite: boolean }) {
  const { meeting, agenda } = bundle;
  const [section, setSection] = useState<AgendaSection>("kpi_exceptions");
  const elapsed = useElapsed(meeting.started_at);
  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);
  const quick = useQuickAction();
  const sectionItems = (s: AgendaSection) => agenda.filter((i) => i.section === s);
  const count = (s: AgendaSection) =>
    s === "discussion" ? bundle.decisions.length : s === "new_actions" ? bundle.newActions.length : sectionItems(s).length;
  const reviewed = (s: AgendaSection) => sectionItems(s).filter((i) => i.reviewed).length;
  const idx = AGENDA_SECTIONS.findIndex((s) => s.key === section);
  const timebox = TIMEBOX[meeting.type] ?? TIMEBOX.weekly;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=dialog]")) return;
      if (e.key === "ArrowRight" || e.key === "n") setSection((cur) => AGENDA_SECTIONS[Math.min(AGENDA_SECTIONS.length - 1, AGENDA_SECTIONS.findIndex((s) => s.key === cur) + 1)].key);
      if (e.key === "ArrowLeft" || e.key === "p") setSection((cur) => AGENDA_SECTIONS[Math.max(0, AGENDA_SECTIONS.findIndex((s) => s.key === cur) - 1)].key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const present = new Map(bundle.attendees.map((a) => [a.crew_member_id, a.present]));
  const issueOptions = Object.values(bundle.issues)
    .filter((i) => i.status !== "resolved")
    .map((i) => ({ id: i.id, title: i.title }));


  return (
    <div className="-mx-4 -my-5 sm:-mx-6 lg:-mx-8 lg:-my-7">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b bg-background/95 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={`/c/${slug}/meetings`} className="text-muted-foreground hover:text-foreground" aria-label="Back to meetings">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-off opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-off" />
              </span>
              <h1 className="truncate text-[15px] font-semibold">{meeting.title}</h1>
              <Badge variant="outline">{MEETING_TYPE_LABEL[meeting.type]}</Badge>
            </div>
          </div>
          <span className="font-mono text-sm tabular text-muted-foreground" aria-label="Elapsed time">
            {elapsed}
          </span>
          <div className="flex items-center -space-x-1">
            {crew
              .filter((c) => !c.is_open_seat)
              .filter((c) => present.has(c.id))
              .map((c) => (
                <button
                  key={c.id}
                  disabled={!canWrite || quick.pending}
                  onClick={() => quick.run(() => setAttendance(companyId, meeting.id, c.id, !present.get(c.id)))}
                  title={`${c.full_name} — ${present.get(c.id) ? "present (click to mark absent)" : "absent (click to mark present)"}`}
                  className={cn("rounded-full ring-2 ring-background transition-opacity", !present.get(c.id) && "opacity-30 grayscale")}
                >
                  <Avatar name={c.full_name} color={c.avatar_color} size="sm" />
                </button>
              ))}
            <AttendeePicker crew={crew} present={present} onAdd={(id) => quick.run(() => setAttendance(companyId, meeting.id, id, true))} disabled={!canWrite} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canWrite && (
              <Button variant="ghost" size="sm" onClick={() => quick.run(() => refreshAgenda(companyId, meeting.id))} disabled={quick.pending}>
                <RefreshCw className={cn(quick.pending && "animate-spin")} /> <span className="hidden sm:inline">Refresh agenda</span>
              </Button>
            )}
            {canWrite && <FinishDialog companyId={companyId} bundle={bundle} />}
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[232px_1fr] xl:grid-cols-[232px_1fr_300px]">
        {/* Agenda nav */}
        <nav className="border-b px-3 py-3 lg:sticky lg:top-[53px] lg:h-[calc(100dvh-53px)] lg:border-r lg:border-b-0">
          <p className="px-2 pb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Agenda</p>
          <ol className="flex gap-1 overflow-x-auto lg:block lg:space-y-2">
            {AGENDA_GROUPS.map((g) => (
              <li key={g.key} className="flex shrink-0 gap-1 lg:block lg:space-y-0.5">
                <p className="hidden px-2 pt-1 text-[11.5px] font-semibold text-foreground/80 lg:block">{g.label}</p>
                <ol className="flex gap-1 lg:block lg:space-y-0.5">
                  {g.sections.map((key) => {
                    const s = AGENDA_SECTIONS.find((x) => x.key === key)!;
                    const c = count(s.key);
                    const r = reviewed(s.key);
                    const done = c > 0 && r === sectionItems(s.key).length && sectionItems(s.key).length > 0;
                    return (
                      <li key={s.key} className="shrink-0">
                        <button
                          onClick={() => setSection(s.key)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                            section === s.key ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px]", done && "border-on bg-on text-white", section === s.key && !done && "border-brand bg-brand")}>
                            {done && <Check className="size-2.5" />}
                          </span>
                          <span className="flex-1 whitespace-nowrap">{s.label}</span>
                          <span className="text-[11px] tabular text-muted-foreground">{["discussion", "new_actions"].includes(s.key) ? c : `${r}/${c}`}</span>
                        </button>
                        {timebox[s.key] && section === s.key && <p className="hidden pl-[34px] text-[11px] text-muted-foreground lg:block">{timebox[s.key]} min · {s.description}</p>}
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
          <p className="mt-4 hidden px-2 text-[11px] text-muted-foreground lg:block">
            Use <kbd className="rounded border px-1">←</kbd> <kbd className="rounded border px-1">→</kbd> to move between sections.
          </p>
        </nav>

        {/* Section content */}
        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{AGENDA_GROUPS.find((g) => g.sections.includes(section))?.label}</p>
              <h2 className="text-lg font-semibold tracking-tight">{AGENDA_SECTIONS[idx].label}</h2>
              <p className="text-sm text-muted-foreground">{AGENDA_SECTIONS[idx].description}</p>
            </div>
            <SectionActions section={section} companyId={companyId} meetingId={meeting.id} crew={crew} options={options} issueOptions={issueOptions} canWrite={canWrite} />
          </div>

          {section === "kpi_exceptions" && (
            <KpiSection companyId={companyId} meetingId={meeting.id} bundle={bundle} crewById={crewById} crew={crew} options={options} canWrite={canWrite} />
          )}
          {section === "priorities" && <PrioritiesSection companyId={companyId} meetingId={meeting.id} bundle={bundle} crewById={crewById} crew={crew} options={options} canWrite={canWrite} />}
          {section === "previous_actions" && <ActionsSection companyId={companyId} bundle={bundle} crewById={crewById} canWrite={canWrite} />}
          {section === "issues" && <IssuesSection companyId={companyId} meetingId={meeting.id} bundle={bundle} crewById={crewById} crew={crew} options={options} issueOptions={issueOptions} canWrite={canWrite} />}
          {section === "discussion" && <DiscussionSection companyId={companyId} bundle={bundle} crewById={crewById} canWrite={canWrite} />}
          {section === "new_actions" && <NewActionsSection bundle={bundle} crewById={crewById} companyId={companyId} canWrite={canWrite} />}

          <div className="mt-6 flex justify-between border-t pt-4">
            <Button variant="ghost" size="sm" disabled={idx === 0} onClick={() => setSection(AGENDA_SECTIONS[idx - 1].key)}>
              <ArrowLeft /> Previous
            </Button>
            {idx < AGENDA_SECTIONS.length - 1 ? (
              <Button variant="outline" size="sm" onClick={() => setSection(AGENDA_SECTIONS[idx + 1].key)}>
                {AGENDA_SECTIONS[idx + 1].label} <ArrowRight />
              </Button>
            ) : (
              canWrite && <FinishDialog companyId={companyId} bundle={bundle} />
            )}
          </div>
        </section>

        {/* Captured log */}
        <aside className="hidden border-l px-4 py-5 xl:block">
          <CapturedLog bundle={bundle} crewById={crewById} />
        </aside>
      </div>
    </div>
  );
}

function AttendeePicker({ crew, present, onAdd, disabled }: { crew: Crew[]; present: Map<string, boolean>; onAdd: (id: string) => void; disabled?: boolean }) {
  const missing = crew.filter((c) => !c.is_open_seat && !present.has(c.id));
  if (!missing.length || disabled) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="ml-2 flex size-6 items-center justify-center rounded-full border border-dashed text-xs text-muted-foreground hover:bg-accent" aria-label="Add attendee">
          +
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1">
        {missing.map((c) => (
          <button key={c.id} onClick={() => onAdd(c.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
            <Avatar name={c.full_name} color={c.avatar_color} size="xs" /> {c.full_name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function SectionActions({ section, companyId, meetingId, crew, options, issueOptions, canWrite }: { section: AgendaSection; companyId: string; meetingId: string; crew: Crew[]; options: FormOptions; issueOptions: Array<{ id: string; title: string }>; canWrite: boolean }) {
  if (!canWrite) return null;
  if (section === "issues")
    return (
      <IssueDialog
        trigger={<Button size="sm"><AlertTriangle /> Raise issue</Button>}
        action={(fd) => saveIssue(companyId, null, fd)}
        crew={crew}
        priorities={options.priorities}
        metrics={options.metrics}
        defaults={{ raised_in_meeting_id: meetingId }}
      />
    );
  if (section === "discussion")
    return (
      <DecisionDialog trigger={<Button size="sm"><Gavel /> Record decision</Button>} action={(fd) => saveDecision(companyId, null, fd)} crew={crew} issues={issueOptions} defaults={{ meeting_id: meetingId }} />
    );
  if (section === "new_actions")
    return (
      <ActionDialog
        trigger={<Button size="sm"><ListPlus /> Assign action</Button>}
        action={(fd) => saveAction(companyId, null, fd)}
        crew={crew}
        priorities={options.priorities}
        issues={issueOptions}
        defaults={{ meeting_id: meetingId }}
      />
    );
  return null;
}

function ReviewToggle({ companyId, itemId, reviewed, disabled }: { companyId: string; itemId: string; reviewed: boolean; disabled?: boolean }) {
  const q = useQuickAction();
  return (
    <button
      onClick={() => q.run(() => setAgendaItemReviewed(companyId, itemId, !reviewed))}
      disabled={disabled || q.pending}
      className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors", reviewed ? "text-on-ink" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
      aria-pressed={reviewed}
    >
      {reviewed ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
      {reviewed ? "Reviewed" : "Mark reviewed"}
    </button>
  );
}

function CarriedBadge({ show }: { show: boolean }) {
  return show ? <Badge variant="outline">Carried over</Badge> : null;
}

type SectionProps = { companyId: string; meetingId: string; bundle: MeetingBundle; crewById: Map<string, Crew>; crew: Crew[]; options: FormOptions; canWrite: boolean };

function KpiSection({ companyId, meetingId, bundle, crewById, crew, options, canWrite }: SectionProps) {
  const items = bundle.agenda.filter((i) => i.section === "kpi_exceptions");
  const openIssueByMetric = new Map(Object.values(bundle.issues).filter((i) => i.status !== "resolved" && i.metric_id).map((i) => [i.metric_id!, i]));
  if (!items.length) return <Empty text="No KPI exceptions — every metric is on track and reported." />;
  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-card">
      {items.map((item) => {
        const m = bundle.metrics[item.entity_id!];
        const snap = item.snapshot as Record<string, unknown>;
        if (!m) return null;
        const issue = openIssueByMetric.get(m.id);
        const changed = snap.value !== m.rawValue;
        return (
          <div key={item.id} data-testid={`kpi-row-${m.name}`} className={cn("grid gap-3 p-4 md:grid-cols-[1fr_160px_auto]", item.reviewed && "bg-muted/30")}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.name}</span>
                <StatusBadge status={m.status as never} />
                {String(snap.reason) !== "On track" && String(snap.reason) !== "Off track" && String(snap.reason) !== "At risk" && <Badge variant="outline">{String(snap.reason)}</Badge>}
                {snap.exception === false && <Badge variant="outline">Review</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="text-2xl font-semibold tracking-tight text-foreground tabular">{m.value}</span>
                <span className="ml-2">target {m.target}</span>
                <span className="ml-2">· {m.periodLabel}</span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <Owner person={crewById.get(m.owner_id)} />
                {changed && <span className="text-done-ink">Updated during this meeting</span>}
                {issue && (
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <AlertTriangle className="size-3 text-risk-ink" /> Issue open: {issue.title}
                  </span>
                )}
              </div>
            </div>
            <div className="self-center">
              <Sparkline values={m.points} target={m.targetValue} tone={m.status === "off_track" ? "off" : m.status === "at_risk" ? "risk" : m.status === "on_track" ? "on" : "default"} height={40} />
            </div>
            <div className="flex flex-wrap items-center gap-1 md:flex-col md:items-end">
              {canWrite && <UpdateValuePopover companyId={companyId} metric={m} />}
              {canWrite && m.status === "off_track" && (
                <ActionDialog
                  title={`Agree corrective action — ${m.name}`}
                  submitLabel="Agree action"
                  trigger={<Button size="sm" variant="brand"><Wrench /> Corrective action</Button>}
                  action={(fd) => saveAction(companyId, null, fd)}
                  crew={crew}
                  priorities={options.priorities}
                  defaults={{ metric_id: m.id, meeting_id: meetingId, owner_id: m.owner_id, issue_id: issue?.id ?? null }}
                />
              )}
              {canWrite && !issue && (
                <IssueDialog
                  trigger={<Button size="sm" variant="outline"><AlertTriangle /> Raise issue</Button>}
                  action={(fd) => saveIssue(companyId, null, fd)}
                  crew={crew}
                  priorities={options.priorities}
                  metrics={options.metrics}
                  defaults={{ title: `${m.name} ${String(snap.reason).toLowerCase()} — ${m.value} vs ${m.target}`, metric_id: m.id, owner_id: m.owner_id, raised_in_meeting_id: meetingId, priority: m.status === "off_track" ? "high" : "medium" }}
                />
              )}
              <ReviewToggle companyId={companyId} itemId={item.id} reviewed={item.reviewed} disabled={!canWrite} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UpdateValuePopover({ companyId, metric }: { companyId: string; metric: MeetingBundle["metrics"][string] }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil /> Update
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <InlineForm action={async (fd) => { const r = await recordMetricValue(companyId, metric.id, fd); if (r.ok) setOpen(false); return r; }}>
          {({ pending, errors }) => (
            <div className="grid gap-3">
              <p className="text-sm font-medium">{metric.name}</p>
              <Field label="Period" error={errors.period}>
                <Input name="period" type={metric.frequency === "monthly" ? "month" : "date"} defaultValue={metric.frequency === "monthly" ? metric.lastCompleted.slice(0, 7) : metric.lastCompleted} />
              </Field>
              <Field label="Actual" error={errors.value}>
                <Input name="value" inputMode="decimal" autoFocus required placeholder={metric.rawValue?.toString()} />
              </Field>
              <SubmitButton pending={pending} size="sm">Save actual</SubmitButton>
            </div>
          )}
        </InlineForm>
      </PopoverContent>
    </Popover>
  );
}

function PrioritiesSection({ companyId, meetingId, bundle, crewById, crew, options, canWrite }: SectionProps) {
  const items = bundle.agenda.filter((i) => i.section === "priorities");
  const q = useQuickAction();
  if (!items.length) return <Empty text="No 90-day priorities in the active quarter." />;
  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-card">
      {items.map((item) => {
        const p = bundle.priorities[item.entity_id!];
        if (!p) return null;
        const before = (item.snapshot as Record<string, unknown>).status as string;
        return (
          <div key={item.id} className={cn("p-3.5", item.reviewed && "bg-muted/30")}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">{p.title}</p>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                <Owner person={crewById.get(p.owner_id)} />
                <span>Due {formatDate(p.due_date, { year: false })}</span>
                {before !== p.status && <span className="text-done-ink">was {RAG_OPTIONS.find((o) => o.value === before)?.label.toLowerCase()}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NativeSelect
                aria-label="Status"
                value={p.status}
                disabled={!canWrite || q.pending}
                onChange={(e) => q.run(() => updatePlanItem(companyId, "quarterly_priority", p.id, { status: e.target.value }), "Status updated")}
                className={cn("h-7 w-[118px] text-xs font-medium", p.status === "off_track" && "text-off-ink", p.status === "at_risk" && "text-risk-ink", p.status === "on_track" && "text-on-ink")}
              >
                {PRIORITY_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label="Progress"
                value={String(Math.round(p.progress / 5) * 5)}
                disabled={!canWrite || q.pending}
                onChange={(e) => q.run(() => updatePlanItem(companyId, "quarterly_priority", p.id, { progress: Number(e.target.value) }))}
                className="h-7 w-[76px] text-xs tabular"
              >
                {Array.from({ length: 21 }, (_, i) => i * 5).map((v) => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </NativeSelect>
              {canWrite && (
                <IssueDialog
                  trigger={<Button size="icon-sm" variant="ghost" title="Raise issue"><AlertTriangle /></Button>}
                  action={(fd) => saveIssue(companyId, null, fd)}
                  crew={crew}
                  priorities={options.priorities}
                  metrics={options.metrics}
                  defaults={{ title: `${p.title} — `, quarterly_priority_id: p.id, owner_id: p.owner_id, raised_in_meeting_id: meetingId }}
                />
              )}
              <ReviewToggle companyId={companyId} itemId={item.id} reviewed={item.reviewed} disabled={!canWrite} />
            </div>
          </div>
            <InlineForm action={(fd) => saveAgendaNote(companyId, item.id, fd)} resetOnSuccess={false} successMessage="Update saved" className="mt-2 flex gap-2">
              {({ pending }) => (
                <>
                  <Input name="notes" defaultValue={item.notes ?? ""} placeholder="One-line update and evidence (e.g. “3 of 5 milestones done; pilot signed 14 Oct”)" aria-label={`Update for ${p.title}`} className="h-8 flex-1 bg-card text-[13px]" disabled={!canWrite} maxLength={400} />
                  {canWrite && (
                    <SubmitButton pending={pending} size="sm" variant="outline">
                      Save
                    </SubmitButton>
                  )}
                </>
              )}
            </InlineForm>
          </div>
        );
      })}
    </div>
  );
}

function ActionsSection({ companyId, bundle, crewById, canWrite }: { companyId: string; bundle: MeetingBundle; crewById: Map<string, Crew>; canWrite: boolean }) {
  const items = bundle.agenda.filter((i) => i.section === "previous_actions");
  const q = useQuickAction();
  const today = new Date().toISOString().slice(0, 10);
  if (!items.length) return <Empty text="No outstanding actions." />;
  const doneCount = items.filter((i) => bundle.actions[i.entity_id!]?.status === "done").length;
  return (
    <>
      <p className="mb-2 text-sm text-muted-foreground">
        {doneCount} of {items.length} done · {items.filter((i) => (bundle.actions[i.entity_id!]?.due_date ?? "9") < today && bundle.actions[i.entity_id!]?.status === "open").length} overdue
      </p>
      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        {items.map((item) => {
          const a = bundle.actions[item.entity_id!];
          if (!a) return null;
          const done = a.status === "done";
          const overdue = !done && a.due_date !== null && a.due_date < today;
          return (
            <div key={item.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <button
                disabled={!canWrite || q.pending}
                onClick={() => q.run(() => setActionStatus(companyId, a.id, done ? "open" : "done"))}
                className={cn("shrink-0", done ? "text-on-ink" : "text-muted-foreground hover:text-foreground")}
                aria-label={done ? "Mark not done" : "Mark done"}
              >
                {done ? <SquareCheck className="size-5" /> : <Square className="size-5" />}
              </button>
              <span className={cn("min-w-0 flex-1 text-[14px]", done && "text-muted-foreground line-through")}>{a.title}</span>
              <CarriedBadge show={item.carried_over} />
              <Owner person={crewById.get(a.owner_id)} className="w-24" />
              <span className={cn("w-24 text-right text-xs tabular", overdue ? "font-medium text-off-ink" : "text-muted-foreground")}>{overdue ? `Overdue ${relativeDays(a.due_date)}` : formatDate(a.due_date, { year: false })}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function IssuesSection({ companyId, meetingId, bundle, crewById, crew, options, issueOptions, canWrite }: SectionProps & { issueOptions: Array<{ id: string; title: string }> }) {
  const items = bundle.agenda.filter((i) => i.section === "issues");
  const q = useQuickAction();
  const [openId, setOpenId] = useState<string | null>(items.find((i) => bundle.issues[i.entity_id!]?.status !== "resolved")?.id ?? null);
  if (!items.length) return <Empty text="No open issues. Raise one if something needs the team's attention." />;
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const issue = bundle.issues[item.entity_id!];
        if (!issue) return null;
        const resolved = issue.status === "resolved";
        const expanded = openId === item.id;
        const decisions = bundle.decisions.filter((d) => d.issue_id === issue.id);
        const actions = bundle.newActions.filter((a) => a.issue_id === issue.id);
        return (
          <div key={item.id} data-testid={`issue-${issue.title}`} className={cn("overflow-hidden rounded-lg border bg-card transition-shadow", expanded && "shadow-sm ring-1 ring-foreground/10", resolved && "opacity-70")}>
            <button onClick={() => setOpenId(expanded ? null : item.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
              <span className={cn("min-w-0 flex-1 font-medium", resolved && "line-through")}>{issue.title}</span>
              {(item.snapshot as Record<string, unknown>).raised_live ? <Badge variant="brand">Raised today</Badge> : <CarriedBadge show={item.carried_over} />}
              {(item.snapshot as Record<string, unknown>).linked_exception ? <Badge variant="risk">KPI exception</Badge> : null}
              {issue.escalated_to_omni && <Badge variant="brand">Escalated</Badge>}
              <PriorityBadge priority={issue.priority as never} />
              {resolved ? <Badge variant="on">Resolved</Badge> : issue.status === "in_discussion" ? <Badge variant="done">In discussion</Badge> : null}
              <Owner person={crewById.get(issue.owner_id)} className="hidden w-24 sm:inline-flex" />
            </button>
            {expanded && (
              <div className="border-t bg-muted/20 px-4 py-3">
                {issue.description && <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{issue.description}</p>}
                {(decisions.length > 0 || actions.length > 0) && (
                  <div className="mb-3 space-y-1.5">
                    {decisions.map((d) => (
                      <p key={d.id} className="flex items-start gap-2 text-sm">
                        <Gavel className="mt-0.5 size-3.5 shrink-0 text-done-ink" /> <span><span className="font-medium">Decision:</span> {d.title}</span>
                      </p>
                    ))}
                    {actions.map((a) => (
                      <p key={a.id} className="flex items-start gap-2 text-sm">
                        <ListPlus className="mt-0.5 size-3.5 shrink-0 text-brand-ink" />
                        <span>
                          <span className="font-medium">Action:</span> {a.title} — {crewById.get(a.owner_id)?.full_name}, due {formatDate(a.due_date, { year: false })}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
                <InlineForm action={(fd) => saveAgendaNote(companyId, item.id, fd)} resetOnSuccess={false} successMessage="Notes saved">
                  {({ pending }) => (
                    <div className="mb-3 flex items-start gap-2">
                      <Textarea name="notes" defaultValue={item.notes ?? ""} placeholder="Discussion notes…" rows={2} className="min-h-14 bg-card" disabled={!canWrite} />
                      {canWrite && <SubmitButton pending={pending} size="sm" variant="outline">Save</SubmitButton>}
                    </div>
                  )}
                </InlineForm>
                {canWrite && !resolved && (
                  <div className="flex flex-wrap gap-2">
                    {issue.status === "open" && (
                      <Button size="sm" variant="ghost" onClick={() => q.run(() => setIssueStatus(companyId, issue.id, "in_discussion"))}>
                        Start discussing
                      </Button>
                    )}
                    <DecisionDialog trigger={<Button size="sm" variant="outline"><Gavel /> Record decision</Button>} action={(fd) => saveDecision(companyId, null, fd)} crew={crew} issues={issueOptions} defaults={{ issue_id: issue.id, meeting_id: meetingId, owner_id: issue.owner_id }} />
                    <ActionDialog
                      trigger={<Button size="sm" variant="outline"><ListPlus /> Assign action</Button>}
                      action={(fd) => saveAction(companyId, null, fd)}
                      crew={crew}
                      priorities={options.priorities}
                      defaults={{ issue_id: issue.id, meeting_id: meetingId, owner_id: issue.owner_id, quarterly_priority_id: issue.quarterly_priority_id, decision_id: decisions.at(-1)?.id }}
                    />
                    <ResolveIssueDialog trigger={<Button size="sm"><Check /> Resolve</Button>} action={(fd) => resolveIssue(companyId, issue.id, fd)} meetingId={meetingId} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DiscussionSection({ companyId, bundle, crewById, canWrite }: { companyId: string; bundle: MeetingBundle; crewById: Map<string, Crew>; canWrite: boolean }) {
  return (
    <div className="space-y-4">
      {bundle.decisions.length ? (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {bundle.decisions.map((d) => (
            <div key={d.id} className="px-4 py-3">
              <p className="flex items-start gap-2 font-medium">
                <Gavel className="mt-1 size-3.5 shrink-0 text-done-ink" /> {d.title}
              </p>
              {d.rationale && <p className="mt-1 pl-5.5 text-sm text-muted-foreground">{d.rationale}</p>}
              <p className="mt-1 pl-5.5 text-xs text-muted-foreground">
                Owner: {crewById.get(d.owner_id)?.full_name}
                {d.issue_id && bundle.issues[d.issue_id] && ` · resolves “${bundle.issues[d.issue_id].title}”`}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <Empty text="No decisions recorded yet in this meeting." />
      )}
      <InlineForm action={(fd) => saveMeetingNotes(companyId, bundle.meeting.id, fd)} resetOnSuccess={false}>
        {({ pending }) => (
          <Field label="Meeting notes">
            <Textarea name="notes" defaultValue={bundle.meeting.notes ?? ""} rows={5} placeholder="General discussion, context, follow-ups…" disabled={!canWrite} />
            {canWrite && (
              <div>
                <SubmitButton pending={pending} size="sm" variant="outline">Save notes</SubmitButton>
              </div>
            )}
          </Field>
        )}
      </InlineForm>
    </div>
  );
}

function NewActionsSection({ bundle, crewById, companyId, canWrite }: { bundle: MeetingBundle; crewById: Map<string, Crew>; companyId: string; canWrite: boolean }) {
  const q = useQuickAction();
  if (!bundle.newActions.length) return <Empty text="No actions assigned yet. Every commitment needs an owner and a deadline." />;
  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-card">
      {bundle.newActions.map((a) => (
        <div key={a.id} className="flex items-center gap-3 px-3.5 py-2.5">
          <button disabled={!canWrite || q.pending} onClick={() => q.run(() => setActionStatus(companyId, a.id, a.status === "done" ? "open" : "done"))} className={cn(a.status === "done" ? "text-on-ink" : "text-muted-foreground")}>
            {a.status === "done" ? <SquareCheck className="size-5" /> : <Square className="size-5" />}
          </button>
          <span className="min-w-0 flex-1 text-[14px]">{a.title}</span>
          <Owner person={crewById.get(a.owner_id)} className="w-24" />
          <span className="w-20 text-right text-xs text-muted-foreground tabular">{formatDate(a.due_date, { year: false })}</span>
        </div>
      ))}
    </div>
  );
}

function CapturedLog({ bundle, crewById }: { bundle: MeetingBundle; crewById: Map<string, Crew> }) {
  return (
    <div className="space-y-5 text-sm">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Captured in this meeting</p>
      <LogGroup title="Decisions" empty="None yet">
        {bundle.decisions.map((d) => (
          <li key={d.id} className="flex gap-2">
            <Gavel className="mt-0.5 size-3.5 shrink-0 text-done-ink" /> <span>{d.title}</span>
          </li>
        ))}
      </LogGroup>
      <LogGroup title="Actions" empty="None yet">
        {bundle.newActions.map((a) => (
          <li key={a.id} className="flex gap-2">
            <ListPlus className="mt-0.5 size-3.5 shrink-0 text-brand-ink" />
            <span>
              {a.title} <span className="text-muted-foreground">— {crewById.get(a.owner_id)?.full_name.split(" ")[0]}, {formatDate(a.due_date, { year: false })}</span>
            </span>
          </li>
        ))}
      </LogGroup>
      <LogGroup title="Issues raised" empty="None">
        {bundle.raisedIssues.map((i) => (
          <li key={i.id} className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-risk-ink" /> <span>{i.title}</span>
          </li>
        ))}
      </LogGroup>
      <LogGroup title="Issues resolved" empty="None">
        {bundle.resolvedIssues.map((i) => (
          <li key={i.id} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-on-ink" /> <span>{i.title}</span>
          </li>
        ))}
      </LogGroup>
    </div>
  );
}

function LogGroup({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium">
        {title} <span className="text-muted-foreground">{children.length}</span>
      </p>
      {children.length ? <ul className="space-y-1.5 text-[13px] leading-snug">{children}</ul> : <p className="text-xs text-muted-foreground">{empty}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export function draftSummary(bundle: MeetingBundle) {
  const kpi = bundle.agenda.filter((i) => i.section === "kpi_exceptions" && (i.snapshot as Record<string, unknown>).exception !== false);
  const off = kpi.filter((i) => bundle.metrics[i.entity_id!]?.status === "off_track").map((i) => bundle.metrics[i.entity_id!]?.name);
  const pr = bundle.agenda.filter((i) => i.section === "priorities").map((i) => bundle.priorities[i.entity_id!]).filter(Boolean);
  const offP = pr.filter((p) => p.status === "off_track" || p.status === "at_risk").length;
  const prevActions = bundle.agenda.filter((i) => i.section === "previous_actions");
  const doneActions = prevActions.filter((i) => bundle.actions[i.entity_id!]?.status === "done").length;
  const openIssues = Object.values(bundle.issues).filter((i) => i.status !== "resolved").length;
  const lines = [
    `KPIs: ${kpi.length} exception${kpi.length === 1 ? "" : "s"} reviewed${off.length ? ` (off track: ${off.join(", ")})` : ""}.`,
    `Priorities: ${pr.length - offP} of ${pr.length} on track or done; ${offP} at risk or off track.`,
    `Previous actions: ${doneActions} of ${prevActions.length} done.`,
    bundle.decisions.length ? `Decisions: ${bundle.decisions.map((d) => d.title).join("; ")}.` : "No decisions recorded.",
    `New actions: ${bundle.newActions.length}.`,
    `Issues: ${bundle.resolvedIssues.length} resolved, ${bundle.raisedIssues.length} raised, ${openIssues} carried forward.`,
  ];
  return lines.join("\n");
}

function FinishDialog({ companyId, bundle }: { companyId: string; bundle: MeetingBundle }) {
  return (
    <FormDialog
      trigger={<Button variant="brand" size="sm">Finish meeting</Button>}
      title="Finish meeting"
      description="The summary is saved to the permanent meeting record. Open issues and actions carry into the next meeting."
      action={(fd) => finishMeeting(companyId, bundle.meeting.id, fd)}
      submitLabel="Finish & save summary"
      size="lg"
    >
      {(e) => (
        <>
          <Field label="Summary" error={e.summary} hint="Drafted from what was captured — edit before saving.">
            <Textarea name="summary" rows={8} defaultValue={draftSummary(bundle)} required />
          </Field>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Meeting rating (1–10)" className="w-40">
              <NativeSelect name="rating" defaultValue="8">
                {Array.from({ length: 10 }, (_, i) => 10 - i).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {bundle.meeting.type === "weekly" && (
              <label className="flex items-center gap-2 pb-1.5 text-sm">
                <input type="checkbox" name="schedule_next" defaultChecked className="size-4 accent-brand" /> Schedule next week&apos;s meeting
              </label>
            )}
          </div>
        </>
      )}
    </FormDialog>
  );
}
