"use client";
import { X } from "lucide-react";
import { NativeSelect } from "@/components/ui/input";
import { InlineForm, SubmitButton, useQuickAction, type FormAction } from "@/components/os/forms";
import { removeDependency } from "@/lib/actions/flight-plan";

export function DependencyForm({ action, targets }: { action: FormAction; targets: Array<{ value: string; label: string }> }) {
  return (
    <InlineForm action={action} successMessage="Dependency added">
      {({ pending }) => (
        <div className="flex gap-2">
          <NativeSelect name="target" defaultValue="" required className="h-7 text-xs">
            <option value="" disabled>
              Add dependency on…
            </option>
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
          <SubmitButton pending={pending} size="xs" variant="outline">
            Add
          </SubmitButton>
        </div>
      )}
    </InlineForm>
  );
}

export function RemoveDependencyButton({ companyId, id }: { companyId: string; id: string }) {
  const q = useQuickAction();
  return (
    <button onClick={() => q.run(() => removeDependency(companyId, id))} disabled={q.pending} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Remove dependency">
      <X className="size-3.5" />
    </button>
  );
}
