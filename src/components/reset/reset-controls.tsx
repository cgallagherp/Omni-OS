"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, CornerDownRight, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { InlineForm, SubmitButton, useQuickAction } from "@/components/os/forms";
import { approveReset, carryForward, saveCompanyUpdate, saveOffsite, saveResetNotes, setPriorityOutcome, startQuarterlyReset } from "@/lib/actions/reset";
import { OUTCOME_OPTIONS } from "@/lib/domain/status";
import { cn } from "@/lib/utils";

export function StartResetButton({ companyId, label }: { companyId: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="brand"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await startQuarterlyReset(companyId);
          if (!r.ok) toast.error(r.error);
          else router.refresh();
        })
      }
    >
      <Play /> {pending ? "Preparing…" : label}
    </Button>
  );
}

export function CarryForwardButton({ companyId, resetId, priorityId, carried }: { companyId: string; resetId: string; priorityId: string; carried: boolean }) {
  const q = useQuickAction();
  if (carried) return <span className="text-xs text-done-ink">Carried forward</span>;
  return (
    <Button variant="ghost" size="xs" disabled={q.pending} onClick={() => q.run(() => carryForward(companyId, resetId, priorityId))}>
      <CornerDownRight /> Carry forward
    </Button>
  );
}

export function ReflectionsForm({ companyId, resetId, defaults, disabled }: { companyId: string; resetId: string; defaults: { wins: string | null; misses: string | null; lessons: string | null; constraints_notes: string | null }; disabled: boolean }) {
  return (
    <InlineForm action={(fd) => saveResetNotes(companyId, resetId, fd)} resetOnSuccess={false}>
      {({ pending }) => (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="What went well">
            <Textarea name="wins" defaultValue={defaults.wins ?? ""} rows={3} disabled={disabled} />
          </Field>
          <Field label="What we missed, and why">
            <Textarea name="misses" defaultValue={defaults.misses ?? ""} rows={3} disabled={disabled} />
          </Field>
          <Field label="Lessons">
            <Textarea name="lessons" defaultValue={defaults.lessons ?? ""} rows={3} disabled={disabled} />
          </Field>
          <Field label="Leadership & organisational constraints">
            <Textarea name="constraints_notes" defaultValue={defaults.constraints_notes ?? ""} rows={3} disabled={disabled} />
          </Field>
          {!disabled && (
            <div>
              <SubmitButton pending={pending} variant="outline" size="sm">
                Save reflections
              </SubmitButton>
            </div>
          )}
        </div>
      )}
    </InlineForm>
  );
}

export function ApproveButton({ companyId, resetId, label }: { companyId: string; resetId: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="brand"
      size="lg"
      disabled={pending}
      onClick={() => {
        if (!confirm(`${label}? The last 90 days will be closed with the results you recorded, and the new plan becomes active. Previous plans stay available for comparison.`)) return;
        start(async () => {
          const r = await approveReset(companyId, resetId);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message);
            router.refresh();
          }
        });
      }}
    >
      <CheckCircle2 /> {pending ? "Approving…" : label}
    </Button>
  );
}

/** Stage 2: the result of a priority from the last 90 days, with a short rationale. */
export function OutcomeForm({ companyId, resetId, priorityId, outcome, note, disabled }: { companyId: string; resetId: string; priorityId: string; outcome: string | null; note: string | null; disabled: boolean }) {
  return (
    <InlineForm action={(fd) => setPriorityOutcome(companyId, resetId, priorityId, fd)} resetOnSuccess={false} className="flex flex-col gap-2 sm:flex-row">
      {({ pending, errors }) => (
        <>
          <NativeSelect name="outcome" defaultValue={outcome ?? ""} disabled={disabled} aria-label="Result" className={cn("h-8 sm:w-40", errors.outcome && "border-destructive")} required>
            <option value="" disabled>
              Result…
            </option>
            {OUTCOME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
          <Input name="outcome_note" defaultValue={note ?? ""} disabled={disabled} placeholder="Rationale — what was delivered, why, what next" aria-label="Rationale" className="h-8 flex-1" maxLength={1000} />
          {!disabled && (
            <SubmitButton pending={pending} size="sm" variant="outline">
              Save
            </SubmitButton>
          )}
        </>
      )}
    </InlineForm>
  );
}

export function KeepDropToggle({ companyId, resetId, metricId, decision, disabled }: { companyId: string; resetId: string; metricId: string; decision: "keep" | "drop" | undefined; disabled: boolean }) {
  const q = useQuickAction();
  return (
    <div className="inline-flex h-7 overflow-hidden rounded-md border text-xs" role="group" aria-label="Keep or drop this measure">
      {(["keep", "drop"] as const).map((d) => (
        <button
          key={d}
          type="button"
          disabled={disabled || q.pending}
          aria-pressed={(decision ?? "keep") === d}
          onClick={() => q.run(() => saveOffsite(companyId, resetId, { scorecard: { metricId, decision: d } }))}
          className={cn("px-2.5 font-medium capitalize", (decision ?? "keep") === d ? (d === "drop" ? "bg-off-bg text-off-ink" : "bg-on-bg text-on-ink") : "text-muted-foreground hover:bg-accent")}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

export function StageNotes({ companyId, resetId, stage, defaultValue, disabled, placeholder }: { companyId: string; resetId: string; stage: "north_star" | "scorecard" | "employee" | "customer" | "crew" | "annual"; defaultValue: string; disabled: boolean; placeholder: string }) {
  const [value, setValue] = useState(defaultValue);
  const q = useQuickAction();
  return (
    <div className="grid gap-2">
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} disabled={disabled} placeholder={placeholder} aria-label="Notes" />
      {!disabled && (
        <div>
          <Button size="sm" variant="outline" disabled={q.pending || value === defaultValue} onClick={() => q.run(() => saveOffsite(companyId, resetId, { stage: { key: stage, notes: value } }), "Notes saved")}>
            Save notes
          </Button>
        </div>
      )}
    </div>
  );
}

export function OffsiteToggle({ companyId, resetId, field, checked, label, disabled }: { companyId: string; resetId: string; field: "north_star_confirmed" | "is_annual"; checked: boolean; label: string; disabled: boolean }) {
  const q = useQuickAction();
  return (
    <label className="inline-flex items-center gap-2 text-[13px] font-medium">
      <input type="checkbox" checked={checked} disabled={disabled || q.pending} onChange={(e) => q.run(() => saveOffsite(companyId, resetId, { [field]: e.target.checked }))} className="size-4 accent-brand" />
      {label}
    </label>
  );
}

export function StrategicQuestions({ companyId, resetId, initial, disabled }: { companyId: string; resetId: string; initial: Array<{ question: string; conclusion: string }>; disabled: boolean }) {
  const [rows, setRows] = useState(initial.length ? initial : [{ question: "", conclusion: "" }]);
  const q = useQuickAction();
  const set = (i: number, k: "question" | "conclusion", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-md border p-3">
          <div className="flex gap-2">
            <Input value={r.question} onChange={(e) => set(i, "question", e.target.value)} disabled={disabled} placeholder={`Strategic issue ${i + 1}`} aria-label={`Strategic issue ${i + 1}`} className="h-8 flex-1 font-medium" maxLength={300} />
            {!disabled && rows.length > 1 && (
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            )}
          </div>
          <Textarea value={r.conclusion} onChange={(e) => set(i, "conclusion", e.target.value)} disabled={disabled} rows={2} placeholder="What we concluded and what we will do" aria-label={`Conclusion for strategic issue ${i + 1}`} />
        </div>
      ))}
      {!disabled && (
        <div className="flex gap-2">
          {rows.length < 3 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setRows((x) => [...x, { question: "", conclusion: "" }])}>
              <Plus /> Add issue
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={q.pending} onClick={() => q.run(() => saveOffsite(companyId, resetId, { strategic_questions: rows.filter((x) => x.question.trim()) }), "Strategic issues saved")}>
            Save strategic issues
          </Button>
        </div>
      )}
    </div>
  );
}

export function CompanyUpdateForm({ companyId, resetId, defaultValue, draft, disabled }: { companyId: string; resetId: string; defaultValue: string | null; draft: string; disabled: boolean }) {
  return (
    <InlineForm action={(fd) => saveCompanyUpdate(companyId, resetId, fd)} resetOnSuccess={false}>
      {({ pending }) => (
        <div className="grid gap-2">
          <Textarea name="company_update" defaultValue={defaultValue ?? draft} rows={9} disabled={disabled} aria-label="Company-wide update" />
          {!disabled && (
            <div className="flex items-center gap-2">
              <SubmitButton pending={pending} size="sm" variant="outline">
                Save company update
              </SubmitButton>
              <span className="text-xs text-muted-foreground">Share it with the whole company in your usual channel. It contains no individual assessments.</span>
            </div>
          )}
        </div>
      )}
    </InlineForm>
  );
}
