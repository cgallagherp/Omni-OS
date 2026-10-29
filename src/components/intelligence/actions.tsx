"use client";
import { useState } from "react";
import { Bot, ClipboardPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { FormDialog } from "@/components/os/forms";
import { investigateException, raiseAnalyticsIssue } from "@/lib/actions/intelligence";
import type { AnalyticsRef } from "@/lib/analytics/exceptions";

const select = "h-9 w-full rounded-md border bg-card px-2 text-sm";

/** Record an evidenced issue (and optionally an agreed corrective action) in Mission Control, linked to the figure. */
export function RaiseIssueButton({ companyId, analyticsRef, crew, defaultTitle, defaultDescription, metricId, size = "sm", label = "Raise in Mission Control" }: { companyId: string; analyticsRef: AnalyticsRef; crew: Array<{ id: string; label: string }>; defaultTitle: string; defaultDescription?: string; metricId?: string | null; size?: "sm" | "xs"; label?: string }) {
  const [withAction, setWithAction] = useState(false);
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  return (
    <FormDialog
      title="Raise in Mission Control"
      description="Creates an issue for the weekly ELT meeting, linked to this governed figure so anyone can return to the evidence."
      submitLabel="Add to Mission Control"
      action={(fd) => raiseAnalyticsIssue(companyId, fd)}
      trigger={
        <Button variant="outline" size={size}>
          <ClipboardPlus /> {label}
        </Button>
      }
    >
      {(errors) => (
        <>
          <input type="hidden" name="ref" value={JSON.stringify(analyticsRef)} />
          {metricId && <input type="hidden" name="metric_id" value={metricId} />}
          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Evidence: <span className="text-foreground">{analyticsRef.label}</span> ({analyticsRef.period.slice(0, 7)})
          </div>
          <Field label="Issue" error={errors.title}>
            <Input name="title" defaultValue={defaultTitle} required maxLength={300} />
          </Field>
          <Field label="Description" error={errors.description}>
            <Textarea name="description" defaultValue={defaultDescription} rows={3} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner" error={errors.owner_id}>
              <select name="owner_id" className={select} required defaultValue="">
                <option value="" disabled>Choose…</option>
                {crew.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select name="priority" className={select} defaultValue="high">
                {["critical", "high", "medium", "low"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withAction} onChange={(e) => setWithAction(e.target.checked)} /> Agree a corrective action now
          </label>
          {withAction && (
            <div className="grid gap-3 rounded-md border p-3">
              <Field label="Corrective action" error={errors.action_title}>
                <Input name="action_title" required maxLength={300} placeholder="e.g. Renewal plan agreed with every police force due this quarter" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Owner">
                  <select name="action_owner_id" className={select} required defaultValue="">
                    <option value="" disabled>Choose…</option>
                    {crew.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Due" error={errors.action_due}>
                  <Input type="date" name="action_due" defaultValue={due} required />
                </Field>
              </div>
            </div>
          )}
        </>
      )}
    </FormDialog>
  );
}

/** Ask the CEO Agent to investigate an exception (it commissions the Commercial Agent for revenue questions). */
export function InvestigateButton({ companyId, exceptionKey, slug, existing, size = "sm" }: { companyId: string; exceptionKey: string; slug: string; existing?: string | null; size?: "sm" | "xs" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (existing)
    return (
      <Button variant="ghost" size={size} onClick={() => router.push(`/c/${slug}/agents/investigations/${existing}`)}>
        <Bot /> View investigation
      </Button>
    );
  return (
    <Button
      variant="outline"
      size={size}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const r = await investigateException(companyId, exceptionKey);
        setPending(false);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.message ?? "Investigation requested");
        if (r.data?.id) router.push(`/c/${slug}/agents/investigations/${r.data.id}`);
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Bot />} Investigate
    </Button>
  );
}
