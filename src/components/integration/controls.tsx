"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Folder, FileText, Loader2, Pause, Play, Sparkles, Upload, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog, useQuickAction } from "@/components/os/forms";
import {
  approveActivity, approveIntegrationPlan, browseStore, decideChangeProposal, generateIntegrationPlan, generatePlaybook, handoverTarget, importFromStore, recommendForAcquisition,
  recordSynergyResult, revisePlaybook, saveAcquisition, saveSynergy, setAcquisitionStatus, setAgentPaused, startReview, updateActivity, uploadKnowledge, verifyActivity, verifySynergyResult,
} from "@/lib/actions/integration";
import type { StoreItem } from "@/lib/integration/document-stores";
import { cn } from "@/lib/utils";

export const DOC_TYPE_OPTIONS: Array<[string, string]> = [
  ["playbook", "Integration playbook / policy"], ["integration_plan", "Previous integration plan"], ["checklist", "Integration checklist"], ["post_acquisition_review", "Post-acquisition review"],
  ["lessons_learned", "Lessons learned"], ["diligence", "Due diligence report"], ["ic_paper", "Investment committee paper"], ["board_paper", "Board paper"], ["meeting_notes", "Management meeting notes"],
  ["sop", "Standard operating procedure"], ["contract", "Contract / obligations"], ["strategy", "Acquisition strategy"], ["other", "Other"],
];

/** Upload one or many files; each is sent and indexed separately (15 MB per file). */
export function KnowledgeUploader({ companyId, acquisitionId, canRestrict, defaultType = "other" }: { companyId: string; acquisitionId?: string; canRestrict: boolean; defaultType?: string }) {
  const router = useRouter();
  const [type, setType] = useState(defaultType);
  const [restricted, setRestricted] = useState(false);
  const [progress, setProgress] = useState<Array<{ name: string; state: "waiting" | "uploading" | "done" | "error"; note?: string }>>([]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files];
    setProgress(list.map((f) => ({ name: f.name, state: "waiting" })));
    for (const [i, f] of list.entries()) {
      setProgress((p) => p.map((x, j) => (j === i ? { ...x, state: "uploading" } : x)));
      const fd = new FormData();
      fd.set("file", f);
      fd.set("doc_type", type);
      if (acquisitionId) fd.set("acquisition_id", acquisitionId);
      if (restricted) fd.set("restricted", "on");
      const r = await uploadKnowledge(companyId, fd);
      setProgress((p) => p.map((x, j) => (j === i ? { ...x, state: r.ok && r.data?.status === "ready" ? "done" : "error", note: r.ok ? r.message : r.error } : x)));
    }
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Document type" className="w-60"><NativeSelect value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></Field>
        {canRestrict && <label className="flex items-center gap-1.5 pb-2 text-[13px]"><input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} /> Confidential transaction document (administrators only)</label>}
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-6 py-6 text-center hover:bg-muted/30">
        <Upload className="size-5 text-muted-foreground" />
        <span className="text-sm font-medium">Choose files to upload</span>
        <span className="text-xs text-muted-foreground">PDF, Word, PowerPoint, Excel, text, Markdown or CSV · up to 15 MB each</span>
        <input type="file" multiple className="sr-only" accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv" onChange={(e) => upload(e.target.files)} data-testid="knowledge-upload" />
      </label>
      {progress.length > 0 && (
        <ul className="space-y-1 text-[13px]">
          {progress.map((p) => (
            <li key={p.name} className="flex items-center gap-2">
              {p.state === "uploading" ? <Loader2 className="size-3.5 animate-spin" /> : p.state === "done" ? <Check className="size-3.5 text-on-ink" /> : p.state === "error" ? <X className="size-3.5 text-off-ink" /> : <FileText className="size-3.5 text-muted-foreground" />}
              <span className="font-medium">{p.name}</span>
              {p.note && <span className="text-muted-foreground">— {p.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Generate Playbook with AI": choose exactly which documents the agent may analyse. */
export function GeneratePlaybookDialog({ companyId, slug, sources, lineages, aiEnabled, trigger }: { companyId: string; slug: string; sources: Array<{ id: string; title: string; doc_type: string }>; lineages: Array<{ id: string; name: string }>; aiEnabled: boolean; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(sources.map((s) => s.id)));
  const [name, setName] = useState("Master integration playbook");
  const [lineage, setLineage] = useState("");
  const [busy, setBusy] = useState(false);
  const byType = useMemo(() => {
    const m = new Map<string, typeof sources>();
    for (const s of sources) m.set(s.doc_type, [...(m.get(s.doc_type) ?? []), s]);
    return [...m];
  }, [sources]);
  async function go() {
    setBusy(true);
    const fd = new FormData();
    fd.set("name", name);
    if (lineage) fd.set("lineage_id", lineage);
    for (const id of selected) fd.append("source", id);
    const r = await generatePlaybook(companyId, fd);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    setOpen(false);
    router.push(`/c/${slug}/integrations/playbooks/${r.data!.id}`);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4" /> Generate Playbook with AI</DialogTitle>
          <DialogDescription>
            The M&A Integration Agent analyses only the documents you select, extracts your company&apos;s own practice with citations, flags conflicts and gaps, and drafts a structured playbook for management to review. Nothing is published without approval.
            {!aiEnabled && " No AI provider is configured for this company, so the rule-based extractor will be used and labelled as such."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Playbook name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="New version of" hint="Leave blank for a new playbook"><NativeSelect value={lineage} onChange={(e) => setLineage(e.target.value)}><option value="">— New playbook —</option>{lineages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</NativeSelect></Field>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border p-3">
            {byType.map(([t, list]) => (
              <div key={t}>
                <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{DOC_TYPE_OPTIONS.find(([k]) => k === t)?.[1] ?? t}</p>
                {list.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 py-0.5 text-[13px]">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={(e) => setSelected((x) => { const n = new Set(x); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
                    {s.title}
                  </label>
                ))}
              </div>
            ))}
            {!sources.length && <p className="text-sm text-muted-foreground">Upload or import documents first.</p>}
          </div>
          <p className="text-xs text-muted-foreground">{selected.size} of {sources.length} documents selected. Content of the documents is treated as data: instructions inside them are ignored.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="brand" disabled={busy || !selected.size || name.trim().length < 2} onClick={go}>{busy ? <Loader2 className="animate-spin" /> : <Wand2 />} Generate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** While the agent works in the background, refresh the page until the draft is ready. */
export function GenerationWatch({ active, label }: { active: boolean; label: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [active, router]);
  if (!active) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-brand/30 bg-brand-subtle px-3 py-2 text-[13px]">
      <Loader2 className="size-4 animate-spin text-brand-ink" />
      <span>{label}</span>
      <span className="text-muted-foreground">— this runs in the agent worker; you can leave the page.</span>
    </div>
  );
}

/** Browse a connected SharePoint / OneDrive / Google Drive and import only the selected items. */
export function StoreBrowser({ companyId, connectionId, name }: { companyId: string; connectionId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name }]);
  const [items, setItems] = useState<StoreItem[] | null>(null);
  const [sel, setSel] = useState<Map<string, StoreItem>>(new Map());
  const [type, setType] = useState("other");
  const [busy, setBusy] = useState(false);
  async function load(folder: string | null) {
    setItems(null);
    const r = await browseStore(companyId, connectionId, folder);
    if (!r.ok) {
      toast.error(r.error);
      setItems([]);
    } else setItems(r.data!.items);
  }
  async function doImport() {
    setBusy(true);
    const r = await importFromStore(companyId, connectionId, [...sel.values()], type, null);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    if (r.data!.failed.length) toast.error(r.data!.failed.slice(0, 3).join("; "));
    setOpen(false);
    router.refresh();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) load(null); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Folder /> Select from {name}</Button></DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Select from {name}</DialogTitle>
          <DialogDescription>Choose specific files or folders. Nothing else in the store is read.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1 text-[13px]">
          {path.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
              <button type="button" className="hover:underline" onClick={() => { setPath(path.slice(0, i + 1)); load(p.id); }}>{p.name}</button>
            </span>
          ))}
        </div>
        <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
          {items === null ? <p className="p-3 text-sm text-muted-foreground"><Loader2 className="mr-1 inline size-3.5 animate-spin" /> Loading…</p> : items.map((it) => (
            <div key={it.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
              <input type="checkbox" checked={sel.has(it.id)} onChange={(e) => setSel((m) => { const n = new Map(m); if (e.target.checked) n.set(it.id, it); else n.delete(it.id); return n; })} />
              {it.kind === "folder" ? <Folder className="size-3.5 text-muted-foreground" /> : <FileText className="size-3.5 text-muted-foreground" />}
              {it.kind === "folder" ? <button type="button" className="hover:underline" onClick={() => { setPath([...path, { id: it.id, name: it.name }]); load(it.id); }}>{it.name}</button> : <span>{it.name}</span>}
            </div>
          ))}
          {items?.length === 0 && <p className="p-3 text-sm text-muted-foreground">Empty.</p>}
        </div>
        <Field label="Document type for the imported files" className="w-72"><NativeSelect value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!sel.size || busy} onClick={doImport}>{busy && <Loader2 className="animate-spin" />} Import {sel.size} selected</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevisePlaybookButton({ companyId, slug, playbookId }: { companyId: string; slug: string; playbookId: string }) {
  const router = useRouter();
  const q = useQuickAction();
  return (
    <Button size="sm" variant="outline" disabled={q.pending} onClick={async () => { const r = await revisePlaybook(companyId, playbookId); if (!r.ok) return toast.error(r.error); router.push(`/c/${slug}/integrations/playbooks/${r.data!.id}`); }}>
      Revise (new version)
    </Button>
  );
}

export function ChangeProposalActions({ companyId, slug, proposalId }: { companyId: string; slug: string; proposalId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "rejected">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function decide(d: "accepted" | "rejected") {
    setBusy(true);
    const r = await decideChangeProposal(companyId, proposalId, d, note);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    if (r.data?.playbookId) router.push(`/c/${slug}/integrations/playbooks/${r.data.playbookId}`);
    else router.refresh();
  }
  if (mode) return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="h-8 w-72" placeholder="Why is it rejected?" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" variant="destructive" disabled={busy || note.trim().length < 3} onClick={() => decide("rejected")}>Reject</Button>
      <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
    </div>
  );
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="brand" disabled={busy} onClick={() => decide("accepted")}><Check /> Accept into a new draft</Button>
      <Button size="sm" variant="ghost" onClick={() => setMode("rejected")}><X /> Reject</Button>
    </div>
  );
}

type Crew = Array<{ id: string; full_name: string; title: string; is_open_seat?: boolean }>;

export function AcquisitionForm({ companyId, slug, acquisition, crew, goals, priorities, trigger }: {
  companyId: string; slug: string; crew: Crew; goals: Array<{ id: string; title: string }>; priorities: Array<{ id: string; title: string }>; trigger: React.ReactNode;
  acquisition?: Record<string, unknown> & { id: string };
}) {
  const router = useRouter();
  const v = (k: string) => (acquisition?.[k] as string | null | undefined) ?? "";
  const people = crew.filter((c) => !c.is_open_seat);
  return (
    <FormDialog
      trigger={trigger}
      size="xl"
      title={acquisition ? "Edit acquisition" : "New acquisition"}
      description="What the integration plan is built from. The more specific the rationale, operating model, synergies and diligence findings, the better the plan."
      submitLabel={acquisition ? "Save" : "Create acquisition"}
      action={async (fd) => {
        const r = await saveAcquisition(companyId, acquisition?.id ?? null, fd);
        if (r.ok && !acquisition) router.push(`/c/${slug}/integrations/${r.data!.id}`);
        return r;
      }}
    >
      {(errors) => (
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          <Field label="Acquired company" error={errors.name}><Input name="name" defaultValue={v("name")} required /></Field>
          <Field label="Completion date" error={errors.completion_date} hint="Day 0 for the plan's timing"><Input type="date" name="completion_date" defaultValue={v("completion_date")} /></Field>
          <Field label="Integration model" hint="e.g. Full integration, Partial integration, Standalone"><Input name="integration_model" defaultValue={v("integration_model")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Integration sponsor"><NativeSelect name="sponsor_crew_id" defaultValue={v("sponsor_crew_id")}><option value="">—</option>{people.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</NativeSelect></Field>
            <Field label="Integration leader"><NativeSelect name="leader_crew_id" defaultValue={v("leader_crew_id")}><option value="">—</option>{people.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</NativeSelect></Field>
          </div>
          <Field label="Acquisition rationale" className="sm:col-span-2"><Textarea name="rationale" rows={2} defaultValue={v("rationale")} /></Field>
          <Field label="Strategic objectives" className="sm:col-span-2"><Textarea name="objectives" rows={2} defaultValue={v("objectives")} /></Field>
          <Field label="Target operating model" hint="e.g. retain the brand for 12 months; integrate finance, CRM and sales" className="sm:col-span-2"><Textarea name="operating_model" rows={2} defaultValue={v("operating_model")} /></Field>
          <Field label="Expected synergies" hint="One per line, with amount and timing, e.g. £1m annual cross-selling revenue by month 18" className="sm:col-span-2"><Textarea name="expected_synergies" rows={2} defaultValue={v("expected_synergies")} /></Field>
          <Field label="Relevant diligence findings" className="sm:col-span-2"><Textarea name="diligence_findings" rows={3} defaultValue={v("diligence_findings")} /></Field>
          <Field label="Key integration risks"><Textarea name="key_risks" rows={2} defaultValue={v("key_risks")} /></Field>
          <Field label="Contractual commitments" hint="Earn-out, TSA, employment undertakings"><Textarea name="commitments" rows={2} defaultValue={v("commitments")} /></Field>
          <Field label="Systems"><Textarea name="systems_info" rows={2} defaultValue={v("systems_info")} /></Field>
          <Field label="Organisation"><Textarea name="org_info" rows={2} defaultValue={v("org_info")} /></Field>
          <Field label="Serves 12-month objective"><NativeSelect name="annual_goal_id" defaultValue={v("annual_goal_id")}><option value="">—</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</NativeSelect></Field>
          <Field label="Serves 90-day priority"><NativeSelect name="quarterly_priority_id" defaultValue={v("quarterly_priority_id")}><option value="">—</option>{priorities.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</NativeSelect></Field>
        </div>
      )}
    </FormDialog>
  );
}

export function HandoverDialog({ companyId, slug, targetId, targetName, crew }: { companyId: string; slug: string; targetId: string; targetName: string; crew: Crew }) {
  const router = useRouter();
  return (
    <FormDialog
      trigger={<Button size="xs" variant="outline">Hand over for integration</Button>}
      title={`Hand ${targetName} over for integration planning`}
      description="Creates an acquisition for the M&A Integration Agent from the approved thesis and target record. Confidential transaction information is withheld from integration participants unless you include it."
      submitLabel="Hand over"
      action={async (fd) => {
        const r = await handoverTarget(companyId, targetId, fd);
        if (r.ok) router.push(`/c/${slug}/integrations/${r.data!.id}`);
        return r;
      }}
    >
      <Field label="Expected completion date"><Input type="date" name="completion_date" /></Field>
      <Field label="Integration leader"><NativeSelect name="leader_crew_id"><option value="">Deal lead</option>{crew.filter((c) => !c.is_open_seat).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</NativeSelect></Field>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="include_financials" /> Share the target&apos;s financials with the integration team</label>
    </FormDialog>
  );
}

export function GeneratePlanDialog({ companyId, acquisitionId, playbooks, recommended, recommendation, aiEnabled }: { companyId: string; acquisitionId: string; playbooks: Array<{ id: string; name: string; version: number }>; recommended: string | null; recommendation: string | null; aiEnabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pb, setPb] = useState(recommended ?? playbooks[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const q = useQuickAction();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && !recommended && playbooks.length) q.run(() => recommendForAcquisition(companyId, acquisitionId)); }}>
      <DialogTrigger asChild><Button variant="brand" size="sm" disabled={!playbooks.length}><Sparkles /> Generate Integration Plan</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Integration Plan</DialogTitle>
          <DialogDescription>The agent adapts the selected approved playbook to this acquisition and explains every deviation. Management reviews and approves the plan before execution begins.{!aiEnabled && " No AI provider is configured, so the rule-based planner will be used."}</DialogDescription>
        </DialogHeader>
        <Field label="Playbook" hint={recommendation ? `Recommended: ${recommendation}` : undefined}>
          <NativeSelect value={pb} onChange={(e) => setPb(e.target.value)}>
            {playbooks.map((p) => <option key={p.id} value={p.id}>{p.name} v{p.version}{p.id === recommended ? " (recommended)" : ""}</option>)}
          </NativeSelect>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="brand" disabled={!pb || busy} onClick={async () => { setBusy(true); const r = await generateIntegrationPlan(companyId, acquisitionId, pb); setBusy(false); if (!r.ok) return toast.error(r.error); toast.success(r.message); setOpen(false); router.refresh(); }}>{busy && <Loader2 className="animate-spin" />} Generate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApprovePlanButton({ companyId, planId, blockers }: { companyId: string; planId: string; blockers: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="brand" size="sm">Approve plan</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve the integration plan</DialogTitle>
          <DialogDescription>Approval creates the execution records. The M&A Integration Agent starts driving the plan from the completion date. Approving the acquisition does not authorise consequential actions: those still need their own approvals.</DialogDescription>
        </DialogHeader>
        {blockers.length ? <ul className="space-y-1 text-sm text-risk-ink">{blockers.map((b) => <li key={b}>{b}</li>)}</ul> : <Field label="Approval note (optional)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="brand" disabled={busy || blockers.length > 0} onClick={async () => { setBusy(true); const r = await approveIntegrationPlan(companyId, planId, note); setBusy(false); if (!r.ok) return toast.error(r.error); toast.success(r.message); setOpen(false); router.refresh(); }}>{busy && <Loader2 className="animate-spin" />} Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ActivityDialog({ companyId, activity, crew, trigger }: { companyId: string; crew: Crew; trigger: React.ReactNode; activity: { id: string; title: string; status: string; owner_crew_id: string | null; due_date: string | null; evidence_note: string | null; blocked_reason: string | null; completion_criteria: string } }) {
  const [status, setStatus] = useState(activity.status);
  return (
    <FormDialog trigger={trigger} title={activity.title} description={activity.completion_criteria ? `Completion criteria: ${activity.completion_criteria}` : undefined} action={(fd) => updateActivity(companyId, activity.id, fd)}>
      {(errors) => (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Status"><NativeSelect name="status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option><option value="not_needed">Not needed</option></NativeSelect></Field>
            <Field label="Owner"><NativeSelect name="owner_crew_id" defaultValue={activity.owner_crew_id ?? ""}><option value="">—</option>{crew.filter((c) => !c.is_open_seat).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</NativeSelect></Field>
            <Field label="Due date"><Input type="date" name="due_date" defaultValue={activity.due_date ?? ""} /></Field>
          </div>
          {status === "blocked" && <Field label="What is blocking it?" error={errors.blocked_reason}><Input name="blocked_reason" defaultValue={activity.blocked_reason ?? ""} /></Field>}
          <Field label="Evidence or update"><Textarea name="evidence_note" rows={2} defaultValue={activity.evidence_note ?? ""} /></Field>
          {status === "done" && activity.completion_criteria && <p className="text-xs text-muted-foreground">Marking it done does not verify it: the integration leader confirms the completion criteria separately.</p>}
        </>
      )}
    </FormDialog>
  );
}

export function VerifyButtons({ companyId, activityId }: { companyId: string; activityId: string }) {
  const q = useQuickAction();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  if (rejecting) return (
    <span className="flex items-center gap-1">
      <Input className="h-7 w-48" placeholder="Which criteria are not met?" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="xs" variant="destructive" disabled={q.pending || note.trim().length < 3} onClick={() => q.run(() => verifyActivity(companyId, activityId, false, note))}>Not met</Button>
      <Button size="xs" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
    </span>
  );
  return (
    <span className="flex items-center gap-1">
      <Button size="xs" variant="outline" disabled={q.pending} onClick={() => q.run(() => verifyActivity(companyId, activityId, true, ""))}><Check /> Criteria met</Button>
      <Button size="xs" variant="ghost" onClick={() => setRejecting(true)}>Not met</Button>
    </span>
  );
}

export function ApproveActivityButton({ companyId, activityId }: { companyId: string; activityId: string }) {
  const q = useQuickAction();
  return <Button size="xs" variant="outline" disabled={q.pending} onClick={() => q.run(() => approveActivity(companyId, activityId))}><Check /> Record approval</Button>;
}

export function PauseToggle({ companyId, acquisitionId, paused }: { companyId: string; acquisitionId: string; paused: boolean }) {
  const q = useQuickAction();
  return (
    <Button size="sm" variant="outline" disabled={q.pending} onClick={() => q.run(() => setAgentPaused(companyId, acquisitionId, !paused))}>
      {paused ? <Play /> : <Pause />} {paused ? "Resume agent" : "Pause agent"}
    </Button>
  );
}

export function StatusButton({ companyId, acquisitionId, status, label, confirmText, variant = "outline" }: { companyId: string; acquisitionId: string; status: "active" | "completed" | "on_hold" | "cancelled"; label: string; confirmText?: string; variant?: "outline" | "brand" | "ghost" }) {
  const q = useQuickAction();
  return <Button size="sm" variant={variant} disabled={q.pending} onClick={() => (!confirmText || confirm(confirmText)) && q.run(() => setAcquisitionStatus(companyId, acquisitionId, status))}>{label}</Button>;
}

export function StartReviewButton({ companyId, acquisitionId }: { companyId: string; acquisitionId: string }) {
  const q = useQuickAction();
  return <Button size="sm" variant="brand" disabled={q.pending} onClick={() => q.run(() => startReview(companyId, acquisitionId))}><Sparkles /> Run post-integration review</Button>;
}

export function SynergyResultDialog({ companyId, synergyId, canVerify }: { companyId: string; synergyId: string; canVerify: boolean }) {
  const [kind, setKind] = useState("actual");
  return (
    <FormDialog trigger={<Button size="xs" variant="outline">Record result</Button>} title="Record a synergy result" description="Actual results count as realised only once verified. Forecasts are tracked separately and never counted as realised." action={(fd) => recordSynergyResult(companyId, synergyId, fd)}>
      {(errors) => (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Type"><NativeSelect name="kind" value={kind} onChange={(e) => setKind(e.target.value)}><option value="actual">Actual</option><option value="forecast">Forecast</option></NativeSelect></Field>
            <Field label="Month" error={errors.period_start}><Input type="month" name="period_start" required /></Field>
            <Field label="Value" error={errors.value}><Input name="value" inputMode="decimal" required /></Field>
          </div>
          <Field label="Source of evidence" error={errors.source} hint="e.g. invoiced revenue from acquired customers (billing)"><Input name="source" required /></Field>
          <Field label="Note"><Input name="note" /></Field>
          {kind === "actual" && canVerify && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="verified" /> Verified against the source</label>}
        </>
      )}
    </FormDialog>
  );
}

export function VerifyResultButton({ companyId, actualId }: { companyId: string; actualId: string }) {
  const q = useQuickAction();
  return <Button size="xs" variant="ghost" disabled={q.pending} onClick={() => q.run(() => verifySynergyResult(companyId, actualId))}>Verify</Button>;
}

export function SynergyDialog({ companyId, acquisitionId, crew, activities, synergy, trigger }: { companyId: string; acquisitionId: string; crew: Crew; activities: Array<{ id: string; title: string }>; trigger: React.ReactNode; synergy?: { id: string; category: string; description: string; unit: string; baseline: number; target: number; measurement: string; owner_crew_id: string | null; evidence_source: string; start_date: string | null; expected_realisation_date: string | null; supporting_activity_ids: string[] } }) {
  return (
    <FormDialog trigger={trigger} size="lg" title={synergy ? "Edit synergy" : "Add synergy"} action={(fd) => saveSynergy(companyId, acquisitionId, synergy?.id ?? null, fd)}>
      {(errors) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category"><NativeSelect name="category" defaultValue={synergy?.category ?? "cross_sell"}>{["revenue", "cross_sell", "cost", "procurement", "operational", "product", "technology", "capability", "other"].map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}</NativeSelect></Field>
          <Field label="Owner"><NativeSelect name="owner_crew_id" defaultValue={synergy?.owner_crew_id ?? ""}><option value="">—</option>{crew.filter((c) => !c.is_open_seat).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</NativeSelect></Field>
          <Field label="Description" error={errors.description} className="sm:col-span-2"><Input name="description" defaultValue={synergy?.description} required /></Field>
          <Field label="Unit"><NativeSelect name="unit" defaultValue={synergy?.unit ?? "currency"}><option value="currency">£</option><option value="number">Number</option><option value="percent">%</option></NativeSelect></Field>
          <Field label="Measured as"><NativeSelect name="measurement" defaultValue={synergy?.measurement ?? "annual_run_rate"}><option value="annual_run_rate">Annual run-rate</option><option value="cumulative">Cumulative</option><option value="monthly">Monthly</option></NativeSelect></Field>
          <Field label="Baseline"><Input name="baseline" defaultValue={synergy?.baseline ?? 0} /></Field>
          <Field label="Target" error={errors.target}><Input name="target" defaultValue={synergy?.target} required /></Field>
          <Field label="Measurement starts"><Input type="date" name="start_date" defaultValue={synergy?.start_date ?? ""} /></Field>
          <Field label="Expected realisation"><Input type="date" name="expected_realisation_date" defaultValue={synergy?.expected_realisation_date ?? ""} /></Field>
          <Field label="Source of evidence" className="sm:col-span-2"><Input name="evidence_source" defaultValue={synergy?.evidence_source} /></Field>
          <Field label="Supporting activities" className="sm:col-span-2" hint="Hold Ctrl/Cmd to select several">
            <select name="supporting" multiple defaultValue={synergy?.supporting_activity_ids} className="min-h-24 rounded-md border bg-card px-2 py-1 text-[13px]">{activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select>
          </Field>
        </div>
      )}
    </FormDialog>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <Badge variant={status === "approved" ? "on" : status === "draft" ? "risk" : status === "generating" ? "brand" : status === "failed" ? "off" : "none"} className={cn("capitalize")}>{status === "generating" ? "Generating…" : status}</Badge>;
}
