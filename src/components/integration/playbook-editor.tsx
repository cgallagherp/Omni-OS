"use client";
// Management review of a generated (or revised) master playbook. Everything is editable while
// it is a draft; the evidence behind each requirement is one click away; conflicts and AI
// suggestions must be settled before the CEO or an administrator can approve it.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, ChevronRight, CircleHelp, Flag, Hand, Loader2, Plus, Save, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { approvePlaybook, discardPlaybookDraft, savePlaybookDraft } from "@/lib/actions/integration";
import { ANCHORS, BASIS_HELP, BASIS_LABEL, slug as toKey, timingLabel, uniqueKey, type Activity, type PlaybookContent, type Workstream } from "@/lib/integration/schema";
import { cn } from "@/lib/utils";
import { BasisBadge, Citations } from "./ui";

const ANCHOR_LABEL: Record<(typeof ANCHORS)[number], string> = { pre_completion: "Pre-completion", day_1: "Day 1", days: "Days after completion", ongoing: "Ongoing" };
const BLOCKS = ["Strategy and governance", "Finance", "Commercial", "People", "Technology", "Operations", "Legal and compliance", "Brand and communications"];

export function PlaybookEditor({
  companyId, slug, playbook, initial, canEdit, canApprove,
}: {
  companyId: string;
  slug: string;
  playbook: { id: string; name: string; version: number; status: string; applies_when: string; acquisition_types: string[]; updated_at: string };
  initial: PlaybookContent;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const editable = canEdit && playbook.status === "draft";
  const [c, setC] = useState<PlaybookContent>(initial);
  const [meta, setMeta] = useState({ name: playbook.name, applies_when: playbook.applies_when, acquisition_types: playbook.acquisition_types });
  const [stamp, setStamp] = useState(playbook.updated_at);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [approveOpen, setApproveOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const mutate = (fn: (draft: PlaybookContent) => void) => {
    setC((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const toggle = (k: string) => setOpen((s) => new Set(s.has(k) ? [...s].filter((x) => x !== k) : [...s, k]));

  const all = c.workstreams.flatMap((w) => w.activities);
  const pending = all.filter((a) => a.basis === "recommended" && a.decision === "pending");
  const unresolved = c.conflicts.filter((x) => !x.resolution.trim());
  const openGaps = c.gaps.filter((g) => !g.answer.trim());
  const blockers = [
    ...(unresolved.length ? [`${unresolved.length} conflicting requirement${unresolved.length === 1 ? "" : "s"} to resolve`] : []),
    ...(pending.length ? [`${pending.length} AI suggestion${pending.length === 1 ? "" : "s"} to accept or reject`] : []),
    ...(!c.workstreams.length ? ["Add at least one workstream"] : []),
    ...(dirty ? ["Save your changes first"] : []),
  ];
  const keys = useMemo(() => new Set(all.map((a) => a.key)), [all]);

  async function save() {
    setSaving(true);
    const r = await savePlaybookDraft(companyId, playbook.id, { content: c, ...meta, updated_at: stamp });
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    setStamp(r.data!.updated_at);
    setDirty(false);
    toast.success("Draft saved");
    router.refresh();
  }
  async function approve() {
    setBusy(true);
    const r = await approvePlaybook(companyId, playbook.id, note);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    setApproveOpen(false);
    router.refresh();
  }
  async function discard() {
    if (!confirm("Discard this draft? Approved versions are not affected.")) return;
    const r = await discardPlaybookDraft(companyId, playbook.id);
    if (!r.ok) return toast.error(r.error);
    router.push(`/c/${slug}/integrations/playbooks`);
  }

  const updateActivity = (wi: number, ai: number, patch: Partial<Activity>) => mutate((d) => Object.assign(d.workstreams[wi].activities[ai], patch));
  const addActivity = (wi: number) =>
    mutate((d) => {
      const k = uniqueKey("new_activity", new Set(d.workstreams.flatMap((w) => w.activities.map((a) => a.key))));
      d.workstreams[wi].activities.push({
        key: k, title: "New activity", description: "", accountable_function: d.workstreams[wi].accountable_function, timing: { anchor: "days", start_offset_days: 1, due_offset_days: 30, label: "First 30 days" },
        milestone: false, critical: false, completion_criteria: "", evidence_required: "", approval_required: null, depends_on: [], basis: "established", rationale: "Added by management.", citations: [], decision: "accepted",
        human_only: false, human_only_reason: null, applies_to: [],
      });
      setOpen((s) => new Set([...s, `${d.workstreams[wi].key}:${k}`]));
    });
  const addWorkstream = (name: string) =>
    mutate((d) => {
      const k = uniqueKey(toKey(name), new Set(d.workstreams.map((w) => w.key)));
      d.workstreams.push({ key: k, name, objective: "", accountable_function: "", basis: "established", rationale: "Added by management.", citations: [], decision: "accepted", activities: [], applies_to: [] });
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      {/* Navigation */}
      <nav className="hidden lg:block" aria-label="Playbook sections">
        <div className="sticky top-4 space-y-0.5 text-[13px]">
          {[
            ["overview", "Overview"],
            ...(c.conflicts.length ? [["conflicts", `Conflicts (${unresolved.length} open)`]] : []),
            ...(c.gaps.length ? [["questions", `Questions (${openGaps.length} open)`]] : []),
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">{label}</a>
          ))}
          <p className="px-2 pt-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Workstreams</p>
          {c.workstreams.map((w) => (
            <a key={w.key} href={`#ws-${w.key}`} className="flex items-center justify-between rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <span className="truncate">{w.name}</span>
              <span className="text-[11px] tabular">{w.activities.length}</span>
            </a>
          ))}
          {[["risks", "Risks and escalation"], ["kpis", "KPIs and synergies"], ["lessons", "Lessons"]].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">{label}</a>
          ))}
        </div>
      </nav>

      <div className="min-w-0 space-y-5">
        {/* Decision bar */}
        <Card className="sticky top-0 z-10 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
            <span><span className="font-medium text-foreground tabular">{c.workstreams.length}</span> workstreams</span>
            <span><span className="font-medium text-foreground tabular">{all.length}</span> activities</span>
            <span className="inline-flex items-center gap-1"><BasisBadge basis="established" /> {all.filter((a) => a.basis === "established").length}</span>
            <span className="inline-flex items-center gap-1"><BasisBadge basis="inferred" /> {all.filter((a) => a.basis === "inferred").length}</span>
            <span className="inline-flex items-center gap-1"><BasisBadge basis="recommended" /> {all.filter((a) => a.basis === "recommended").length}</span>
            {c.stats && <span title="Every citation is checked against the passage it names">{c.stats.citations_checked - c.stats.citations_rejected} citations verified{c.stats.citations_rejected ? ` · ${c.stats.citations_rejected} rejected` : ""}</span>}
          </div>
          {editable && (
            <div className="flex shrink-0 items-center gap-2">
              {dirty && <span className="text-xs text-risk-ink">Unsaved changes</span>}
              <Button variant="ghost" size="sm" onClick={discard}><Trash2 /> Discard</Button>
              <Button variant="outline" size="sm" onClick={save} disabled={!dirty || saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save draft</Button>
              {canApprove && <Button variant="brand" size="sm" onClick={() => setApproveOpen(true)}><ShieldCheck /> Approve playbook</Button>}
            </div>
          )}
        </Card>

        {/* Overview */}
        <section id="overview" className="scroll-mt-20">
          <Card className="space-y-4 p-4">
            {editable ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Playbook name"><Input value={meta.name} onChange={(e) => { setMeta({ ...meta, name: e.target.value }); setDirty(true); }} /></Field>
                <Field label="Acquisition types it applies to" hint="Comma-separated, e.g. Full integration, Bolt-on">
                  <Input value={meta.acquisition_types.join(", ")} onChange={(e) => { setMeta({ ...meta, acquisition_types: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10) }); setDirty(true); }} />
                </Field>
                <Field label="When to use this playbook" className="sm:col-span-2"><Textarea rows={2} value={meta.applies_when} onChange={(e) => { setMeta({ ...meta, applies_when: e.target.value }); setDirty(true); }} /></Field>
              </div>
            ) : (
              <div className="text-sm">
                <p className="text-muted-foreground">{meta.applies_when || "—"}</p>
                {meta.acquisition_types.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{meta.acquisition_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div>}
              </div>
            )}
            {c.summary && <p className="text-[13px] text-muted-foreground">{c.summary}</p>}
            {c.philosophy.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Integration philosophy</p>
                <ul className="space-y-1.5">
                  {c.philosophy.map((p, i) => (
                    <li key={i} className="text-[13px]">
                      <button type="button" onClick={() => toggle(`ph:${i}`)} className="flex w-full items-start gap-2 text-left">
                        <BasisBadge basis={p.basis} className="mt-0.5 shrink-0" />
                        <span className="flex-1">{p.text}</span>
                      </button>
                      {open.has(`ph:${i}`) && <Citations citations={p.citations} slug={slug} className="mt-1.5 ml-2" />}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.acquisition_types.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Acquisition types in the documents</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {c.acquisition_types.map((t, i) => (
                    <li key={i} className="rounded-md border p-2.5 text-[13px]">
                      <div className="flex items-center gap-2"><span className="font-medium">{t.name}</span><BasisBadge basis={t.basis} /></div>
                      <p className="mt-0.5 text-muted-foreground">{t.when}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </section>

        {/* Conflicts */}
        {c.conflicts.length > 0 && (
          <section id="conflicts" className="scroll-mt-20 space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-risk-ink" /> Conflicting requirements</h2>
            <p className="text-[13px] text-muted-foreground">The documents disagree. Nothing has been chosen for you: record which applies, and why.</p>
            {c.conflicts.map((x, ci) => (
              <Card key={x.key} className={cn("space-y-3 p-4", !x.resolution.trim() && "border-risk/50")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13.5px] font-medium">{x.topic}</p>
                  {x.resolution.trim() ? <Badge variant="on">Resolved</Badge> : <Badge variant="risk">Needs a decision</Badge>}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {x.positions.map((p, pi) => (
                    <div key={pi} className="rounded-md border p-2.5">
                      <p className="text-[13px] font-medium">{p.text}</p>
                      <Citations citations={p.citations} slug={slug} className="mt-1.5" />
                      {editable && <Button size="xs" variant="outline" className="mt-2" onClick={() => mutate((d) => { d.conflicts[ci].resolution = `Adopt: ${p.text}`; })}><Check /> Adopt this</Button>}
                    </div>
                  ))}
                </div>
                {editable ? (
                  <Field label="Resolution"><Textarea rows={2} value={x.resolution} placeholder="Which applies, and in what circumstances" onChange={(e) => mutate((d) => { d.conflicts[ci].resolution = e.target.value; })} /></Field>
                ) : x.resolution && <p className="text-[13px]"><span className="text-muted-foreground">Resolution:</span> {x.resolution}</p>}
              </Card>
            ))}
          </section>
        )}

        {/* Gaps */}
        {c.gaps.length > 0 && (
          <section id="questions" className="scroll-mt-20 space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><CircleHelp className="size-4 text-muted-foreground" /> Questions for management</h2>
            <Card className="divide-y">
              {c.gaps.map((g, gi) => (
                <div key={g.key} className="grid gap-2 p-3 md:grid-cols-[1fr_320px]">
                  <div>
                    <p className="text-[13px] font-medium">{g.question}</p>
                    <p className="text-xs text-muted-foreground">{g.context}</p>
                  </div>
                  {editable ? <Input value={g.answer} placeholder="Answer (optional)" onChange={(e) => mutate((d) => { d.gaps[gi].answer = e.target.value; })} /> : <p className="text-[13px]">{g.answer || <span className="text-muted-foreground">Not answered</span>}</p>}
                </div>
              ))}
            </Card>
          </section>
        )}

        {/* Workstreams */}
        {c.workstreams.map((w, wi) => (
          <WorkstreamCard
            key={w.key} w={w} slug={slug} editable={editable} open={open} toggle={toggle} keys={keys} all={all}
            onWs={(patch) => mutate((d) => Object.assign(d.workstreams[wi], patch))}
            onRemoveWs={() => confirm(`Remove the ${w.name} workstream and its ${w.activities.length} activities?`) && mutate((d) => { d.workstreams.splice(wi, 1); for (const ws of d.workstreams) for (const a of ws.activities) a.depends_on = a.depends_on.filter((k) => w.activities.every((x) => x.key !== k)); })}
            onActivity={(ai, patch) => updateActivity(wi, ai, patch)}
            onRemoveActivity={(ai) => mutate((d) => { const k = d.workstreams[wi].activities[ai].key; d.workstreams[wi].activities.splice(ai, 1); for (const ws of d.workstreams) for (const a of ws.activities) a.depends_on = a.depends_on.filter((x) => x !== k); })}
            onAdd={() => addActivity(wi)}
          />
        ))}
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect className="h-8 w-60" value="" onChange={(e) => e.target.value && addWorkstream(e.target.value)}>
              <option value="">Add a workstream…</option>
              {BLOCKS.filter((b) => !c.workstreams.some((w) => w.name === b)).map((b) => <option key={b}>{b}</option>)}
              <option value="Custom workstream">Custom workstream</option>
            </NativeSelect>
          </div>
        )}

        {/* Risks */}
        <section id="risks" className="scroll-mt-20 space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Flag className="size-4 text-muted-foreground" /> Risks and escalation triggers</h2>
          <Card className="divide-y">
            {c.risks.map((r, ri) => (
              <div key={r.key} className="grid gap-2 p-3 md:grid-cols-[1fr_1fr_auto]">
                {editable ? (
                  <>
                    <Textarea rows={2} value={r.description} onChange={(e) => mutate((d) => { d.risks[ri].description = e.target.value; })} />
                    <Textarea rows={2} value={r.escalation_trigger} placeholder="Escalation trigger" onChange={(e) => mutate((d) => { d.risks[ri].escalation_trigger = e.target.value; })} />
                    <Button variant="ghost" size="icon" aria-label="Remove risk" onClick={() => mutate((d) => { d.risks.splice(ri, 1); })}><X /></Button>
                  </>
                ) : (
                  <>
                    <div className="text-[13px]"><BasisBadge basis={r.basis} className="mr-1.5" />{r.description}</div>
                    <p className="text-[13px] text-muted-foreground">{r.escalation_trigger}</p>
                  </>
                )}
              </div>
            ))}
            {!c.risks.length && <p className="p-3 text-sm text-muted-foreground">No risks recorded.</p>}
          </Card>
          {editable && <Button size="xs" variant="outline" onClick={() => mutate((d) => { d.risks.push({ key: uniqueKey("risk_new", new Set(d.risks.map((r) => r.key))), description: "New risk", escalation_trigger: "", escalate_to: "", basis: "established", citations: [] }); })}><Plus /> Add risk</Button>}
        </section>

        <section id="kpis" className="scroll-mt-20 grid gap-3 md:grid-cols-2">
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Integration KPIs</p>
            <ul className="space-y-1.5 text-[13px]">
              {c.kpis.map((k) => <li key={k.key} className="flex items-start gap-2"><BasisBadge basis={k.basis} className="shrink-0" /><span>{k.name}{k.target && <span className="text-muted-foreground"> — target {k.target}</span>}</span></li>)}
              {!c.kpis.length && <li className="text-muted-foreground">None in the documents.</li>}
            </ul>
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Synergy tracking rules</p>
            <ul className="space-y-1.5 text-[13px]">
              {c.synergy_rules.map((s, i) => <li key={i} className="flex items-start gap-2"><BasisBadge basis={s.basis} className="shrink-0" /><span>{s.text}</span></li>)}
              {!c.synergy_rules.length && <li className="text-muted-foreground">None in the documents.</li>}
            </ul>
          </Card>
        </section>

        <section id="lessons" className="scroll-mt-20 space-y-2">
          <h2 className="text-sm font-semibold">Lessons from previous integrations</h2>
          <Card className="divide-y">
            {c.lessons.map((l) => (
              <div key={l.key} className="p-3 text-[13px]">
                <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => toggle(`l:${l.key}`)}>
                  {open.has(`l:${l.key}`) ? <ChevronDown className="mt-0.5 size-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 size-3.5 shrink-0" />}
                  <span className="flex-1">{l.text}</span>
                </button>
                {open.has(`l:${l.key}`) && <Citations citations={l.citations} slug={slug} className="mt-1.5 ml-5" />}
              </div>
            ))}
            {!c.lessons.length && <p className="p-3 text-sm text-muted-foreground">No lessons found.</p>}
          </Card>
        </section>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve “{meta.name}” v{playbook.version}</DialogTitle>
            <DialogDescription>The approved version becomes the company&apos;s integration template. It cannot be edited afterwards; changes create a new version that also needs approval. Active integrations keep the plan they were approved with.</DialogDescription>
          </DialogHeader>
          {blockers.length ? (
            <ul className="space-y-1 text-sm">{blockers.map((b) => <li key={b} className="flex items-center gap-2 text-risk-ink"><Hand className="size-3.5" /> {b}</li>)}</ul>
          ) : (
            <Field label="Approval note (optional)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approved at the ELT on 3 November" /></Field>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button variant="brand" disabled={blockers.length > 0 || busy} onClick={approve}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkstreamCard({
  w, slug, editable, open, toggle, all, onWs, onRemoveWs, onActivity, onRemoveActivity, onAdd,
}: {
  w: Workstream; slug: string; editable: boolean; open: Set<string>; toggle: (k: string) => void; keys: Set<string>; all: Activity[];
  onWs: (p: Partial<Workstream>) => void; onRemoveWs: () => void; onActivity: (ai: number, p: Partial<Activity>) => void; onRemoveActivity: (ai: number) => void; onAdd: () => void;
}) {
  const sorted = w.activities.map((a, ai) => ({ a, ai })).sort((p, q) => p.a.timing.due_offset_days - q.a.timing.due_offset_days);
  return (
    <section id={`ws-${w.key}`} className="scroll-mt-20">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {editable ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
                <Input value={w.name} onChange={(e) => onWs({ name: e.target.value })} className="h-8 font-semibold" />
                <Input value={w.accountable_function} placeholder="Accountable function" onChange={(e) => onWs({ accountable_function: e.target.value })} className="h-8" />
                <Input value={w.objective} placeholder="Objective" onChange={(e) => onWs({ objective: e.target.value })} className="h-8 sm:col-span-2" />
              </div>
            ) : (
              <>
                <h3 className="text-[14px] font-semibold">{w.name}</h3>
                <p className="text-[12.5px] text-muted-foreground">{w.objective}{w.accountable_function ? ` · ${w.accountable_function}` : ""}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <BasisBadge basis={w.basis} />
            {editable && <Button variant="ghost" size="icon" aria-label={`Remove ${w.name}`} onClick={onRemoveWs}><Trash2 /></Button>}
          </div>
        </div>
        <ul className="divide-y">
          {sorted.map(({ a, ai }) => {
            const k = `${w.key}:${a.key}`;
            const isOpen = open.has(k);
            const rejected = a.basis === "recommended" && a.decision === "rejected";
            return (
              <li key={a.key} className={cn(rejected && "opacity-55")}>
                <button type="button" onClick={() => toggle(k)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30">
                  {isOpen ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                  <span className="w-28 shrink-0 text-[12px] text-muted-foreground tabular">{a.timing.label || timingLabel(a.timing)}</span>
                  <span className={cn("min-w-0 flex-1 text-[13.5px]", rejected && "line-through")}>{a.title}</span>
                  <span className="hidden shrink-0 items-center gap-1.5 md:flex">
                    {a.critical && <Badge variant="off">Critical path</Badge>}
                    {a.milestone && <Badge variant="outline">Milestone</Badge>}
                    {a.approval_required && <Badge variant="outline">Approval: {a.approval_required}</Badge>}
                    {a.human_only && <Badge variant="outline" title={a.human_only_reason ?? ""}><Hand className="size-3" /> People only</Badge>}
                    <BasisBadge basis={a.basis} />
                  </span>
                </button>
                {a.basis === "recommended" && a.decision === "pending" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-dashed bg-muted/20 px-4 py-2 text-[12.5px]">
                    <Sparkles className="size-3.5 text-muted-foreground" />
                    <span className="flex-1 text-muted-foreground">{a.rationale || "Suggested addition — not company practice until you accept it."}</span>
                    {editable && (
                      <>
                        <Button size="xs" variant="outline" onClick={() => onActivity(ai, { decision: "accepted" })}><Check /> Accept</Button>
                        <Button size="xs" variant="ghost" onClick={() => onActivity(ai, { decision: "rejected" })}><X /> Reject</Button>
                      </>
                    )}
                  </div>
                )}
                {isOpen && (
                  <div className="grid gap-4 border-t bg-muted/10 px-4 py-3 lg:grid-cols-[1fr_340px]">
                    <div className="grid gap-3">
                      {editable ? (
                        <>
                          <Field label="Activity"><Input value={a.title} onChange={(e) => onActivity(ai, { title: e.target.value })} /></Field>
                          <Field label="Description"><Textarea rows={2} value={a.description} onChange={(e) => onActivity(ai, { description: e.target.value })} /></Field>
                          <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_1fr_1.2fr]">
                            <Field label="Timing">
                              <NativeSelect value={a.timing.anchor} onChange={(e) => { const anchor = e.target.value as Activity["timing"]["anchor"]; const t = { ...a.timing, anchor, ...(anchor === "pre_completion" ? { start_offset_days: -30, due_offset_days: -1 } : anchor === "day_1" ? { start_offset_days: 0, due_offset_days: 0 } : {}) }; onActivity(ai, { timing: { ...t, label: timingLabel(t) } }); }}>
                                {ANCHORS.map((x) => <option key={x} value={x}>{ANCHOR_LABEL[x]}</option>)}
                              </NativeSelect>
                            </Field>
                            <Field label="Start (day)"><Input type="number" value={a.timing.start_offset_days} onChange={(e) => onActivity(ai, { timing: { ...a.timing, start_offset_days: Number(e.target.value) } })} /></Field>
                            <Field label="Due (day)"><Input type="number" value={a.timing.due_offset_days} onChange={(e) => onActivity(ai, { timing: { ...a.timing, due_offset_days: Number(e.target.value), label: a.timing.anchor === "days" ? `By day ${e.target.value}` : a.timing.label } })} /></Field>
                            <Field label="Label"><Input value={a.timing.label} onChange={(e) => onActivity(ai, { timing: { ...a.timing, label: e.target.value } })} /></Field>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Accountable function"><Input value={a.accountable_function} onChange={(e) => onActivity(ai, { accountable_function: e.target.value })} /></Field>
                            <Field label="Approval required (role)" hint="Leave blank if none"><Input value={a.approval_required ?? ""} onChange={(e) => onActivity(ai, { approval_required: e.target.value || null })} /></Field>
                          </div>
                          <Field label="Completion criteria" hint="How completion is verified — not just that a task is ticked"><Textarea rows={2} value={a.completion_criteria} onChange={(e) => onActivity(ai, { completion_criteria: e.target.value })} /></Field>
                          <Field label="Evidence required"><Input value={a.evidence_required} onChange={(e) => onActivity(ai, { evidence_required: e.target.value })} /></Field>
                          <Field label="Depends on" hint="Hold Ctrl/Cmd to select several">
                            <select multiple className="min-h-20 rounded-md border bg-card px-2 py-1 text-[13px]" value={a.depends_on} onChange={(e) => onActivity(ai, { depends_on: [...e.target.selectedOptions].map((o) => o.value) })}>
                              {all.filter((x) => x.key !== a.key).map((x) => <option key={x.key} value={x.key}>{x.title}</option>)}
                            </select>
                          </Field>
                          <div className="flex flex-wrap items-center gap-4 text-[13px]">
                            <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.critical} onChange={(e) => onActivity(ai, { critical: e.target.checked })} /> Critical path</label>
                            <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.milestone} onChange={(e) => onActivity(ai, { milestone: e.target.checked })} /> Milestone</label>
                            <Button size="xs" variant="ghost" className="ml-auto text-destructive" onClick={() => onRemoveActivity(ai)}><Trash2 /> Remove activity</Button>
                          </div>
                        </>
                      ) : (
                        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                          {a.description && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Description</dt><dd>{a.description}</dd></div>}
                          <div><dt className="text-xs text-muted-foreground">Accountable</dt><dd>{a.accountable_function || "—"}</dd></div>
                          <div><dt className="text-xs text-muted-foreground">Timing</dt><dd>{a.timing.label} (day {a.timing.start_offset_days} → {a.timing.due_offset_days})</dd></div>
                          <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Completion criteria</dt><dd>{a.completion_criteria || <span className="text-muted-foreground">Not defined</span>}</dd></div>
                          {a.depends_on.length > 0 && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Depends on</dt><dd>{a.depends_on.map((k) => all.find((x) => x.key === k)?.title ?? k).join("; ")}</dd></div>}
                        </dl>
                      )}
                      {a.human_only && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Hand className="size-3.5" /> {a.human_only_reason} — the agent tracks it but never performs it.</p>}
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Why it is included</p>
                      <p className="mb-2 text-[12.5px]"><span className="font-medium">{BASIS_LABEL[a.basis]}.</span> <span className="text-muted-foreground">{BASIS_HELP[a.basis]}</span></p>
                      {a.rationale && <p className="mb-2 text-[12.5px] text-muted-foreground">{a.rationale}</p>}
                      <Citations citations={a.citations} slug={slug} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {!w.activities.length && <li className="px-4 py-3 text-sm text-muted-foreground">No activities.</li>}
        </ul>
        {editable && <div className="border-t px-4 py-2"><Button size="xs" variant="ghost" onClick={onAdd}><Plus /> Add activity</Button></div>}
      </Card>
    </section>
  );
}
