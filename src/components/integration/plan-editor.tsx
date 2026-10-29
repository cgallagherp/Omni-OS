"use client";
// Management review of an acquisition-specific plan before execution: what was taken from the
// playbook, what was added for this acquisition and why, suggested improvements to accept or
// reject, owners and timing, synergy targets. Approval materialises it into execution records.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Hand, Loader2, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { savePlanDraft } from "@/lib/actions/integration";
import { SYNERGY_LABEL, type PlanActivity, type PlanContent } from "@/lib/integration/schema";
import { cn } from "@/lib/utils";
import { ApprovePlanButton } from "./controls";
import { Citations, OriginBadge, money } from "./ui";

export function PlanEditor({ companyId, slug, plan, initial, crew, canEdit, canApprove, completion }: {
  companyId: string; slug: string; plan: { id: string; updated_at: string; version: number }; initial: PlanContent; crew: Array<{ id: string; full_name: string; is_open_seat: boolean }>;
  canEdit: boolean; canApprove: boolean; completion: string | null;
}) {
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [stamp, setStamp] = useState(plan.updated_at);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const mutate = (fn: (d: PlanContent) => void) => {
    setC((p) => {
      const n = structuredClone(p);
      fn(n);
      return n;
    });
    setDirty(true);
  };
  const people = crew.filter((x) => !x.is_open_seat);
  const name = (id: string | null) => people.find((x) => x.id === id)?.full_name ?? "Unassigned";
  const acts = c.workstreams.flatMap((w) => w.activities);
  const pending = acts.filter((a) => a.origin === "recommended" && a.decision === "pending");
  const blockers = [...(pending.length ? [`Accept or reject ${pending.length} suggested improvement${pending.length === 1 ? "" : "s"}`] : []), ...(!completion ? ["Set the completion date on the acquisition"] : []), ...(dirty ? ["Save your changes first"] : [])];
  const date = (off: number) => (completion ? new Date(Date.parse(`${completion}T00:00:00Z`) + off * 86400000).toISOString().slice(0, 10) : `day ${off}`);
  const setAct = (wi: number, ai: number, p: Partial<PlanActivity>) => mutate((d) => Object.assign(d.workstreams[wi].activities[ai], p));

  async function save() {
    setSaving(true);
    const r = await savePlanDraft(companyId, plan.id, { content: c, updated_at: stamp });
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    setStamp(r.data!.updated_at);
    setDirty(false);
    toast.success("Plan saved");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card className="sticky top-0 z-10 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
          <span><span className="font-medium text-foreground tabular">{c.workstreams.filter((w) => w.included).length}</span> workstreams</span>
          <span><span className="font-medium text-foreground tabular">{acts.filter((a) => a.included && !(a.origin === "recommended" && a.decision !== "accepted")).length}</span> activities</span>
          <span><span className="font-medium text-foreground tabular">{acts.filter((a) => a.origin === "acquisition").length}</span> acquisition-specific</span>
          <span><span className="font-medium text-foreground tabular">{c.deviations.length}</span> deviations explained</span>
          <span><span className="font-medium text-foreground tabular">{c.critical_path.length}</span> on the critical path</span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {dirty && <span className="text-xs text-risk-ink">Unsaved changes</span>}
            <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={save}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save plan</Button>
            {canApprove && <ApprovePlanButton companyId={companyId} planId={plan.id} blockers={blockers} />}
          </div>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Deviations from the playbook</p>
          <ul className="space-y-2 text-[13px]">
            {c.deviations.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge variant={d.kind === "added" ? "brand" : d.kind === "omitted" ? "outline" : "default"} className="mt-0.5 shrink-0 capitalize">{d.kind}</Badge>
                <span><span className="font-medium">{d.text}.</span> <span className="text-muted-foreground">{d.reason}</span></span>
              </li>
            ))}
            {!c.deviations.length && <li className="text-muted-foreground">The plan follows the playbook without changes.</li>}
          </ul>
        </Card>
        <div className="space-y-3">
          {c.missing_information.length > 0 && (
            <Card className="border-risk/40 p-4">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Information still needed</p>
              <ul className="list-disc space-y-0.5 pl-4 text-[13px]">{c.missing_information.map((m) => <li key={m}>{m}</li>)}</ul>
            </Card>
          )}
          {c.decisions_required.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Decisions required</p>
              <ul className="space-y-1 text-[13px]">{c.decisions_required.map((d, i) => <li key={i}>{d.text}{d.by && <span className="text-muted-foreground"> — {d.by}</span>}</li>)}</ul>
            </Card>
          )}
        </div>
      </div>

      {c.synergies.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Synergy targets</p>
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-1 font-medium">Synergy</th><th className="pb-1 font-medium">Category</th><th className="pb-1 text-right font-medium">Target</th><th className="pb-1 font-medium pl-3">Realise by</th><th className="pb-1 font-medium">Delivered by</th></tr></thead>
            <tbody className="divide-y">
              {c.synergies.map((s, si) => (
                <tr key={s.key}>
                  <td className="min-w-64 py-1.5 pr-2">{canEdit ? <Input className="h-7" value={s.description} onChange={(e) => mutate((d) => { d.synergies[si].description = e.target.value; })} /> : s.description}</td>
                  <td className="py-1.5 whitespace-nowrap">{SYNERGY_LABEL[s.category]}</td>
                  <td className="py-1.5 text-right tabular">{canEdit ? <Input className="h-7 w-28 text-right" value={s.target} onChange={(e) => mutate((d) => { d.synergies[si].target = Number(e.target.value.replace(/[^\d.-]/g, "")) || 0; })} /> : money(s.target, s.unit)}</td>
                  <td className="py-1.5 pl-3 whitespace-nowrap tabular">{date(s.realisation_offset_days)}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{s.supporting_activity_keys.map((k) => acts.find((a) => a.key === k)?.title ?? k).join("; ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {c.workstreams.map((w, wi) => (
        <Card key={w.key} className={cn("overflow-hidden", !w.included && "opacity-60")}>
          <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">{w.name}{w.origin !== "playbook" && <OriginBadge origin={w.origin} />}</h3>
              <p className="text-xs text-muted-foreground">{w.accountable_function}{w.owner_crew_id ? ` · ${name(w.owner_crew_id)}` : ""}</p>
            </div>
            {canEdit && <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={w.included} onChange={(e) => mutate((d) => { d.workstreams[wi].included = e.target.checked; })} /> Included</label>}
          </div>
          <ul className="divide-y">
            {w.activities.map((a, ai) => {
              const k = `${w.key}:${a.key}`;
              const isOpen = open.has(k);
              const excluded = !a.included || (a.origin === "recommended" && a.decision === "rejected");
              return (
                <li key={a.key} className={cn(excluded && "opacity-55")}>
                  <button type="button" className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/30" onClick={() => setOpen((s) => new Set(s.has(k) ? [...s].filter((x) => x !== k) : [...s, k]))}>
                    {isOpen ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                    <span className="w-24 shrink-0 text-[12px] text-muted-foreground tabular">{date(a.due_offset_days)}</span>
                    <span className={cn("min-w-0 flex-1 text-[13.5px]", excluded && "line-through")}>{a.title}</span>
                    <span className="hidden shrink-0 items-center gap-1.5 md:flex">
                      <span className="text-xs text-muted-foreground">{name(a.owner_crew_id)}</span>
                      {a.critical && <Badge variant="off">Critical path</Badge>}
                      {a.human_only && <Badge variant="outline" title={a.human_only_reason ?? ""}><Hand className="size-3" /> People only</Badge>}
                      {a.origin !== "playbook" && <OriginBadge origin={a.origin} />}
                    </span>
                  </button>
                  {a.origin === "recommended" && a.decision === "pending" && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-dashed bg-muted/20 px-4 py-2 text-[12.5px]">
                      <Sparkles className="size-3.5 text-muted-foreground" />
                      <span className="flex-1 text-muted-foreground">{a.deviation_note}</span>
                      {canEdit && (<><Button size="xs" variant="outline" onClick={() => setAct(wi, ai, { decision: "accepted" })}><Check /> Accept</Button><Button size="xs" variant="ghost" onClick={() => setAct(wi, ai, { decision: "rejected" })}><X /> Reject</Button></>)}
                    </div>
                  )}
                  {isOpen && (
                    <div className="grid gap-3 border-t bg-muted/10 px-4 py-3 lg:grid-cols-[1fr_320px]">
                      <div className="grid gap-3">
                        {a.deviation_note && a.origin !== "recommended" && <p className="rounded-md bg-brand-subtle px-2.5 py-1.5 text-[12.5px] text-brand-ink">{a.deviation_note}</p>}
                        {canEdit ? (
                          <>
                            <Field label="Activity"><Input value={a.title} onChange={(e) => setAct(wi, ai, { title: e.target.value })} /></Field>
                            <div className="grid gap-3 sm:grid-cols-4">
                              <Field label="Owner"><NativeSelect value={a.owner_crew_id ?? ""} onChange={(e) => setAct(wi, ai, { owner_crew_id: e.target.value || null })}><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</NativeSelect></Field>
                              <Field label="Start (day)"><Input type="number" value={a.start_offset_days} onChange={(e) => setAct(wi, ai, { start_offset_days: Number(e.target.value) })} /></Field>
                              <Field label="Due (day)"><Input type="number" value={a.due_offset_days} onChange={(e) => setAct(wi, ai, { due_offset_days: Number(e.target.value) })} /></Field>
                              <Field label="Approval by"><Input value={a.approval_required ?? ""} onChange={(e) => setAct(wi, ai, { approval_required: e.target.value || null })} /></Field>
                            </div>
                            <Field label="Completion criteria"><Textarea rows={2} value={a.completion_criteria} onChange={(e) => setAct(wi, ai, { completion_criteria: e.target.value })} /></Field>
                            <div className="flex flex-wrap gap-4 text-[13px]">
                              <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.critical} onChange={(e) => setAct(wi, ai, { critical: e.target.checked })} /> Critical path</label>
                              <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.milestone} onChange={(e) => setAct(wi, ai, { milestone: e.target.checked })} /> Milestone</label>
                              <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.included} onChange={(e) => setAct(wi, ai, { included: e.target.checked })} /> Included</label>
                            </div>
                          </>
                        ) : (
                          <p className="text-[13px]"><span className="text-muted-foreground">Completion criteria:</span> {a.completion_criteria || "—"}</p>
                        )}
                        {a.depends_on.length > 0 && <p className="text-xs text-muted-foreground">Depends on: {a.depends_on.map((k) => acts.find((x) => x.key === k)?.title ?? k).join("; ")}</p>}
                        {a.human_only && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Hand className="size-3.5" /> {a.human_only_reason}. The agent monitors and follows up; people carry it out after approval.</p>}
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Source in the playbook</p>
                        {a.origin === "playbook" ? <Citations citations={a.citations} slug={slug} /> : <p className="text-[12.5px] text-muted-foreground">Not in the playbook — {a.origin === "acquisition" ? "required by this acquisition" : "a suggested improvement"}.</p>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {c.risks.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Important risks</p>
          <ul className="space-y-1.5 text-[13px]">{c.risks.map((r, i) => <li key={i}><span className="font-medium">{r.text}</span>{r.mitigation && <span className="text-muted-foreground"> — {r.mitigation}</span>}{r.source && <span className="text-xs text-muted-foreground"> ({r.source})</span>}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}
