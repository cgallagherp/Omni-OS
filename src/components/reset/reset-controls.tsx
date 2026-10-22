"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2, CornerDownRight, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { InlineForm, SubmitButton, useQuickAction } from "@/components/os/forms";
import { approveReset, carryForward, saveResetNotes, startQuarterlyReset } from "@/lib/actions/reset";

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
  if (carried) return <span className="text-xs text-done">Carried forward</span>;
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
        if (!confirm(`${label}? The current quarter will be closed (unfinished priorities recorded as missed) and the new plan becomes active.`)) return;
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
