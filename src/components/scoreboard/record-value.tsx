"use client";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { InlineForm, SubmitButton } from "@/components/os/forms";
import { recordMetricValue } from "@/lib/actions/metrics";

export function RecordValueForm({ companyId, metricId, frequency, defaultPeriod }: { companyId: string; metricId: string; frequency: "weekly" | "monthly"; defaultPeriod: string }) {
  return (
    <InlineForm action={(fd) => recordMetricValue(companyId, metricId, fd)}>
      {({ pending, errors }) => (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={frequency === "monthly" ? "Month" : "Week starting"} error={errors.period}>
              <Input name="period" type={frequency === "monthly" ? "month" : "date"} defaultValue={frequency === "monthly" ? defaultPeriod.slice(0, 7) : defaultPeriod} required />
            </Field>
            <Field label="Actual" error={errors.value}>
              <Input name="value" inputMode="decimal" required placeholder="0" />
            </Field>
          </div>
          <Field label="Note">
            <Input name="note" placeholder="Optional context" />
          </Field>
          <SubmitButton pending={pending}>Save result</SubmitButton>
          <p className="text-xs text-muted-foreground">Weekly results are filed against the Monday of that week. Corrections overwrite the period and are kept in the audit trail.</p>
        </div>
      )}
    </InlineForm>
  );
}
