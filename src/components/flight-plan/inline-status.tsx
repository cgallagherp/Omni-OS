"use client";
import { NativeSelect } from "@/components/ui/input";
import { useQuickAction } from "@/components/os/forms";
import { StatusBadge } from "@/components/os/status";
import { updatePlanItem, type PlanEntity } from "@/lib/actions/flight-plan";
import { RAG_OPTIONS } from "@/lib/domain/status";
import { cn } from "@/lib/utils";

export function InlineStatus({ companyId, entity, id, status, canWrite, className }: { companyId: string; entity: PlanEntity; id: string; status: string; canWrite: boolean; className?: string }) {
  const q = useQuickAction();
  if (!canWrite) return <StatusBadge status={status as never} />;
  return (
    <NativeSelect
      aria-label="Status"
      value={status}
      disabled={q.pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => q.run(() => updatePlanItem(companyId, entity, id, { status: e.target.value }), "Status updated")}
      className={cn(
        "h-6 w-[104px] border-transparent bg-transparent px-1.5 text-xs font-medium shadow-none hover:border-input",
        status === "on_track" && "text-on",
        status === "at_risk" && "text-[color-mix(in_oklch,var(--status-risk)_80%,black)]",
        (status === "off_track" || status === "missed") && "text-off",
        status === "done" && "text-done",
        className,
      )}
    >
      {RAG_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function InlineProgress({ companyId, entity, id, progress, canWrite }: { companyId: string; entity: PlanEntity; id: string; progress: number; canWrite: boolean }) {
  const q = useQuickAction();
  if (!canWrite) return <span className="text-xs text-muted-foreground tabular">{progress}%</span>;
  return (
    <NativeSelect
      aria-label="Progress"
      value={String(Math.round(progress / 5) * 5)}
      disabled={q.pending}
      onChange={(e) => q.run(() => updatePlanItem(companyId, entity, id, { progress: Number(e.target.value) }))}
      className="h-6 w-[64px] border-transparent bg-transparent px-1.5 text-xs shadow-none tabular hover:border-input"
    >
      {Array.from({ length: 21 }, (_, i) => i * 5).map((v) => (
        <option key={v} value={v}>
          {v}%
        </option>
      ))}
    </NativeSelect>
  );
}
