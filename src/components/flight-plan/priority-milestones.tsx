"use client";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InlineForm, SubmitButton, useQuickAction } from "@/components/os/forms";
import { addPriorityMilestone, deletePriorityMilestone, setPriorityMilestoneDone } from "@/lib/actions/flight-plan";
import { formatDate } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

export interface MilestoneRow {
  id: string;
  title: string;
  due_date: string | null;
  done: boolean;
}

export function PriorityMilestones({ companyId, priorityId, milestones, canWrite, today }: { companyId: string; priorityId: string; milestones: MilestoneRow[]; canWrite: boolean; today: string }) {
  const q = useQuickAction();
  return (
    <div>
      <ul className="divide-y" data-testid="priority-milestones">
        {milestones.map((m) => {
          const late = !m.done && m.due_date !== null && m.due_date < today;
          return (
            <li key={m.id} className="group flex items-center gap-2.5 px-4 py-2">
              <input
                type="checkbox"
                checked={m.done}
                disabled={!canWrite || q.pending}
                onChange={(e) => q.run(() => setPriorityMilestoneDone(companyId, m.id, e.target.checked))}
                aria-label={`Mark "${m.title}" ${m.done ? "not done" : "done"}`}
                className="size-4 accent-brand"
              />
              <span className={cn("min-w-0 flex-1 text-[13px]", m.done && "text-muted-foreground line-through")}>{m.title}</span>
              <span className={cn("shrink-0 text-xs tabular", late ? "font-medium text-off-ink" : "text-muted-foreground")}>{m.due_date ? formatDate(m.due_date, { year: false }) : "—"}</span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => q.run(() => deletePriorityMilestone(companyId, m.id), "Milestone removed")}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  aria-label={`Remove milestone ${m.title}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          );
        })}
        {!milestones.length && <li className="px-4 py-3 text-sm text-muted-foreground">No milestones yet.</li>}
      </ul>
      {canWrite && (
        <InlineForm action={(fd) => addPriorityMilestone(companyId, priorityId, fd)} className="flex gap-2 border-t px-4 py-2.5">
          {({ pending }) => (
            <>
              <Input name="title" required placeholder="Add a milestone…" aria-label="Milestone" className="h-8 flex-1" />
              <Input name="due_date" type="date" aria-label="Milestone due date" className="h-8 w-36" />
              <SubmitButton pending={pending} size="sm" variant="outline">
                <Plus /> Add
              </SubmitButton>
            </>
          )}
        </InlineForm>
      )}
    </div>
  );
}
