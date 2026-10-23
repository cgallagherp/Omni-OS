"use client";
import { useState } from "react";
import { ListChecks, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/os/forms";
import { approveWeeklyScorecard, setScorecardMetrics } from "@/lib/actions/scorecard";

export function ApproveScorecardDialog({
  companyId,
  recipients,
  emailHtml,
  reapprove,
  emailConfigured,
}: {
  companyId: string;
  recipients: Array<{ userId: string; name: string; email: string }>;
  emailHtml: string;
  reapprove: boolean;
  emailConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="brand" size="sm">
          <Send /> {reapprove ? "Re-approve and resend" : "Approve and send"}
        </Button>
      }
      title={reapprove ? "Re-approve this week's scorecard" : "Approve the Monday scorecard"}
      description="The scorecard is rebuilt from live data when you approve it. It contains the KPI table only — no commentary."
      action={(fd) => approveWeeklyScorecard(companyId, fd)}
      submitLabel="Approve and send"
      size="xl"
    >
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-[13px] font-medium">Authorised Omni recipients</legend>
        {recipients.map((r) => (
          <label key={r.userId} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="recipient" value={r.userId} defaultChecked className="size-4 accent-brand" />
            {r.name} <span className="text-muted-foreground">{r.email}</span>
          </label>
        ))}
        {!recipients.length && <p className="text-sm text-muted-foreground">No Omni team members have access to this company yet.</p>}
        {!emailConfigured && <p className="mt-1 text-xs text-muted-foreground">Email delivery is not configured for this deployment; recipients will see the approved scorecard in Omni OS and the email is kept in the delivery log.</p>}
      </fieldset>
      <div>
        <p className="mb-1.5 text-[13px] font-medium">Email preview</p>
        <iframe title="Email preview" srcDoc={emailHtml} sandbox="" className="h-[360px] w-full rounded-md border bg-white" />
      </div>
    </FormDialog>
  );
}

export function ChooseScorecardKpisDialog({ companyId, metrics }: { companyId: string; metrics: Array<{ id: string; name: string; frequency: string; selected: boolean }> }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          <ListChecks /> Choose KPIs
        </Button>
      }
      title="Weekly scorecard KPIs"
      description="Keep it to the handful of measures the ELT and Omni look at every week."
      action={(fd) => setScorecardMetrics(companyId, fd)}
    >
      <div className="grid max-h-[50vh] gap-1.5 overflow-y-auto">
        {metrics.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="metric" value={m.id} defaultChecked={m.selected} className="size-4 accent-brand" />
            {m.name} <span className="text-xs text-muted-foreground">{m.frequency}</span>
          </label>
        ))}
      </div>
    </FormDialog>
  );
}
