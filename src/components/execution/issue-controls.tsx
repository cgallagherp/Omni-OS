"use client";
import { Check, Flag, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuickAction } from "@/components/os/forms";
import { ResolveIssueDialog } from "@/components/os/entity-forms";
import { reopenIssue, resolveIssue, setIssueEscalation, setIssueStatus } from "@/lib/actions/execution";

export function IssueControls({ companyId, id, status, escalated }: { companyId: string; id: string; status: string; escalated: boolean }) {
  const q = useQuickAction();
  return (
    <div className="flex flex-wrap gap-2">
      {status === "open" && (
        <Button variant="ghost" size="sm" disabled={q.pending} onClick={() => q.run(() => setIssueStatus(companyId, id, "in_discussion"))}>
          Mark in discussion
        </Button>
      )}
      <Button variant="outline" size="sm" disabled={q.pending || status === "resolved"} onClick={() => q.run(() => setIssueEscalation(companyId, id, !escalated))}>
        <Flag /> {escalated ? "Withdraw escalation" : "Escalate to Omni"}
      </Button>
      {status === "resolved" ? (
        <Button variant="outline" size="sm" disabled={q.pending} onClick={() => q.run(() => reopenIssue(companyId, id))}>
          <RotateCcw /> Reopen
        </Button>
      ) : (
        <ResolveIssueDialog trigger={<Button size="sm"><Check /> Resolve</Button>} action={(fd) => resolveIssue(companyId, id, fd)} />
      )}
    </div>
  );
}
