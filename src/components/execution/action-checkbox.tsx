"use client";
import { Square, SquareCheck } from "lucide-react";
import { useQuickAction } from "@/components/os/forms";
import { setActionStatus } from "@/lib/actions/flight-plan";
import { cn } from "@/lib/utils";

export function ActionCheckbox({ companyId, id, status, canWrite }: { companyId: string; id: string; status: string; canWrite: boolean }) {
  const q = useQuickAction();
  const done = status === "done";
  return (
    <button
      disabled={!canWrite || q.pending || status === "cancelled"}
      onClick={() => q.run(() => setActionStatus(companyId, id, done ? "open" : "done"), done ? "Action reopened" : "Action completed")}
      className={cn("shrink-0 disabled:cursor-default", done ? "text-on-ink" : "text-muted-foreground hover:text-foreground", q.pending && "opacity-50")}
      aria-label={done ? "Mark as not done" : "Mark as done"}
    >
      {done ? <SquareCheck className="size-[18px]" /> : <Square className="size-[18px]" />}
    </button>
  );
}
