"use client";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { useQuickAction } from "@/components/os/forms";
import { setUpOnboarding, updateOnboardingMilestone } from "@/lib/actions/governance";
import { cn } from "@/lib/utils";

export function MilestoneStatus({ companyId, id, status, disabled }: { companyId: string; id: string; status: string; disabled: boolean }) {
  const q = useQuickAction();
  return (
    <NativeSelect
      aria-label="Milestone status"
      value={status}
      disabled={disabled || q.pending}
      onChange={(e) => q.run(() => updateOnboardingMilestone(companyId, id, { status: e.target.value }), "Updated")}
      className={cn("h-7 w-[124px] text-xs font-medium", status === "done" && "text-on-ink", status === "in_progress" && "text-done-ink")}
    >
      <option value="not_started">Not started</option>
      <option value="in_progress">In progress</option>
      <option value="done">Done</option>
    </NativeSelect>
  );
}

export function MilestoneOwner({ companyId, id, ownerId, crew, disabled }: { companyId: string; id: string; ownerId: string | null; crew: Array<{ id: string; full_name: string }>; disabled: boolean }) {
  const q = useQuickAction();
  return (
    <NativeSelect
      aria-label="Milestone owner"
      value={ownerId ?? ""}
      disabled={disabled || q.pending}
      onChange={(e) => q.run(() => updateOnboardingMilestone(companyId, id, { owner_id: e.target.value || null }), "Owner updated")}
      className="h-7 w-[150px] text-xs"
    >
      <option value="">No owner</option>
      {crew.map((c) => (
        <option key={c.id} value={c.id}>
          {c.full_name}
        </option>
      ))}
    </NativeSelect>
  );
}

export function SetUpOnboardingButton({ companyId }: { companyId: string }) {
  const q = useQuickAction();
  return (
    <Button variant="brand" disabled={q.pending} onClick={() => q.run(() => setUpOnboarding(companyId))}>
      Create the 100-day plan
    </Button>
  );
}
