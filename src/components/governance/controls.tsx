"use client";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog, useQuickAction } from "@/components/os/forms";
import { completeGovernanceItem, saveGovernanceItem } from "@/lib/actions/governance";

export function CompleteRequirementButton({ companyId, id }: { companyId: string; id: string }) {
  const q = useQuickAction();
  return (
    <Button size="xs" variant="outline" disabled={q.pending} onClick={() => q.run(() => completeGovernanceItem(companyId, id))}>
      <Check /> Done
    </Button>
  );
}

export function GovernanceDialog({
  companyId,
  id,
  defaults = {},
  trigger,
}: {
  companyId: string;
  id?: string;
  defaults?: Partial<{ title: string; requirement: string | null; owner_label: string | null; cadence_label: string | null; cadence_months: number | null; next_due: string | null; notes: string | null }>;
  trigger: ReactNode;
}) {
  return (
    <FormDialog
      trigger={trigger}
      title={id ? "Edit requirement" : "Add governance requirement"}
      description="Track the investor requirements that apply to this company. Where these differ from the investment agreement, the agreement governs; enter any company-specific thresholds in the notes."
      action={(fd) => saveGovernanceItem(companyId, id ?? null, fd)}
    >
      {(e) => (
        <>
          <Field label="Requirement" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required />
          </Field>
          <Field label="What is required" error={e.requirement}>
            <Textarea name="requirement" defaultValue={defaults.requirement ?? ""} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner" error={e.owner_label}>
              <Input name="owner_label" defaultValue={defaults.owner_label ?? ""} placeholder="e.g. CFO" />
            </Field>
            <Field label="Next due" error={e.next_due}>
              <Input name="next_due" type="date" defaultValue={defaults.next_due ?? ""} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cadence" error={e.cadence_label}>
              <Input name="cadence_label" defaultValue={defaults.cadence_label ?? ""} placeholder="e.g. Within 21 days of month end" />
            </Field>
            <Field label="Repeats every (months)" error={e.cadence_months} hint="Leave blank for a one-off">
              <Input name="cadence_months" type="number" min={1} max={36} defaultValue={defaults.cadence_months ?? ""} />
            </Field>
          </div>
          <Field label="Notes" error={e.notes}>
            <Textarea name="notes" defaultValue={defaults.notes ?? ""} rows={2} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
