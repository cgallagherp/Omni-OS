"use client";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { InlineForm, SubmitButton } from "@/components/os/forms";
import { changeMetricPolicy } from "@/lib/actions/intelligence";

const sel = "h-9 w-full rounded-md border bg-card px-2 text-sm";

export function PolicyForm({ companyId, policy }: { companyId: string; policy: Record<string, unknown> }) {
  return (
    <InlineForm action={(fd) => changeMetricPolicy(companyId, fd)} className="grid gap-3 md:grid-cols-4" resetOnSuccess={false}>
      {({ pending, errors }) => (
        <>
          <input type="hidden" name="key" value="nrr" />
          <Field label="Reactivation in the window">
            <select name="reactivation" className={sel} defaultValue={String(policy.reactivation ?? "include_in_nrr")}>
              <option value="include_in_nrr">Counts in NRR (not GRR)</option>
              <option value="exclude">Excluded</option>
            </select>
          </Field>
          <Field label="Customer transfers">
            <select name="transfers" className={sel} defaultValue={String(policy.transfers ?? "neutral")}>
              <option value="neutral">Neutral (retained)</option>
              <option value="count_as_churn">Count as churn</option>
            </select>
          </Field>
          <Field label="Acquired customers join after (months)" error={errors.acquired_wait_months}>
            <Input type="number" name="acquired_wait_months" min={0} max={36} defaultValue={Number(policy.acquired_wait_months ?? 12)} />
          </Field>
          <Field label="Why is it changing?" error={errors.note}>
            <Input name="note" required minLength={10} maxLength={500} placeholder="e.g. Board agreed to exclude reactivations" />
          </Field>
          <div className="md:col-span-4">
            <SubmitButton pending={pending} size="sm">Record new definition version</SubmitButton>
          </div>
        </>
      )}
    </InlineForm>
  );
}
