"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquarePlus, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog, InlineForm, SubmitButton, useQuickAction } from "@/components/os/forms";
import { closeInvestigation, decideApproval, disconnectConnection, requestInvestigation, respondToAgent, saveAgentConfig, saveConnection, setTargetStage, completeCrmTask } from "@/lib/actions/agents";
import { APPROVER_LABEL, CATEGORIES, type AgentDef, type AgentKey, type Category } from "@/lib/agents/registry";
import { cn } from "@/lib/utils";

/** Approve, reject or request changes — specific to this one proposal. */
export function ApprovalActions({ companyId, approvalId, canDecide, approverLabel }: { companyId: string; approvalId: string; canDecide: boolean; approverLabel: string }) {
  const q = useQuickAction();
  const [mode, setMode] = useState<null | "rejected" | "changes_requested">(null);
  const [note, setNote] = useState("");
  if (!canDecide) return <p className="text-xs text-muted-foreground">Awaiting a decision by the {approverLabel.toLowerCase()}.</p>;
  return (
    <div className="space-y-2" data-testid="approval-actions">
      {mode ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "rejected" ? "Why not?" : "What should change?"} aria-label="Decision note" className="h-8 flex-1" />
          <Button size="sm" variant={mode === "rejected" ? "destructive" : "outline"} disabled={q.pending || note.trim().length < 3} onClick={() => q.run(() => decideApproval(companyId, approvalId, mode, note))}>
            {mode === "rejected" ? "Reject" : "Request changes"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="brand" disabled={q.pending} onClick={() => q.run(() => decideApproval(companyId, approvalId, "approved"))}>
            <Check /> Approve this action
          </Button>
          <Button size="sm" variant="outline" disabled={q.pending} onClick={() => setMode("changes_requested")}>
            Request changes
          </Button>
          <Button size="sm" variant="ghost" disabled={q.pending} onClick={() => setMode("rejected")}>
            <X /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

/** The recipient's reply to a follow-up. */
export function ReplyForm({ companyId, messageId, canMarkDone }: { companyId: string; messageId: string; canMarkDone: boolean }) {
  const [kind, setKind] = useState<"done" | "new_date" | "blocked" | "update">(canMarkDone ? "done" : "update");
  return (
    <InlineForm action={(fd) => respondToAgent(companyId, messageId, fd)} className="space-y-2" resetOnSuccess={false}>
      {({ pending, errors }) => (
        <>
          <input type="hidden" name="kind" value={kind} />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reply">
            {([canMarkDone && ["done", "It's done"], ["new_date", "New completion date"], ["blocked", "It's blocked"], ["update", "Progress update"]].filter(Boolean) as Array<[typeof kind, string]>).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn("h-7 rounded-md border px-2.5 text-xs font-medium", kind === k ? "border-brand bg-brand-subtle text-brand-ink" : "bg-card text-muted-foreground hover:text-foreground")}
              >
                {l}
              </button>
            ))}
          </div>
          {kind === "new_date" && (
            <Field label="New completion date" error={errors.date}>
              <Input type="date" name="date" required className="h-8 w-44" />
            </Field>
          )}
          {kind !== "done" && (
            <Field label={kind === "blocked" ? "What is blocking it?" : kind === "new_date" ? "Why (optional)" : "Update"} error={errors.text}>
              <Textarea name="text" rows={2} required={kind === "blocked" || kind === "update"} />
            </Field>
          )}
          <SubmitButton pending={pending} size="sm" variant="brand">
            Send reply
          </SubmitButton>
        </>
      )}
    </InlineForm>
  );
}

export function RequestInvestigationDialog({
  companyId,
  slug,
  agent,
  workflows,
  subjects,
  trigger,
}: {
  companyId: string;
  slug: string;
  agent: AgentKey;
  workflows: Array<{ key: string; label: string; subject: string }>;
  subjects: Record<string, Array<{ id: string; label: string }>>;
  trigger?: ReactNode;
}) {
  const [wf, setWf] = useState(workflows[0]?.key ?? "");
  const router = useRouter();
  const subject = workflows.find((w) => w.key === wf)?.subject ?? "";
  return (
    <FormDialog
      trigger={trigger ?? <Button size="sm" variant="outline"><Play /> Ask to investigate</Button>}
      title="Ask the agent to investigate"
      description="The agent starts in the background within a minute and records every step."
      action={async (fd) => {
        const r = await requestInvestigation(companyId, fd);
        if (r.ok && r.data?.id) router.push(`/c/${slug}/agents/investigations/${r.data.id}`);
        return r;
      }}
      submitLabel="Start"
    >
      {(e) => (
        <>
          <input type="hidden" name="agent" value={agent} />
          <input type="hidden" name="subject_type" value={subject} />
          <Field label="Investigation" error={e.workflow}>
            <NativeSelect name="workflow" value={wf} onChange={(ev) => setWf(ev.target.value)}>
              {workflows.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {subject !== "pipeline" && (
            <Field label={subject === "action" ? "Action" : subject === "metric" ? "KPI" : "Acquisition thesis"} error={e.subject_id}>
              <NativeSelect name="subject_id" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {(subjects[subject] ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Note for the agent (optional)" error={e.note}>
            <Input name="note" maxLength={500} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function CloseInvestigationDialog({ companyId, id }: { companyId: string; id: string }) {
  return (
    <FormDialog trigger={<Button size="sm" variant="ghost">Close case</Button>} title="Close this investigation" description="The agent stops working on it. Pending proposals are withdrawn." action={(fd) => closeInvestigation(companyId, id, String(fd.get("note") ?? ""))} submitLabel="Close case" size="sm">
      {(e) => (
        <Field label="Reason" error={e.note}>
          <Input name="note" required minLength={3} placeholder="e.g. Handled in the weekly ELT meeting" />
        </Field>
      )}
    </FormDialog>
  );
}

const MODE_LABEL = { off: "Off", approval: "Needs approval", auto: "Automatic" } as const;

export function AgentConfigForm({
  companyId,
  def,
  config,
  connections,
}: {
  companyId: string;
  def: AgentDef;
  config: {
    enabled: boolean;
    category_modes: Partial<Record<Category, string>>;
    approvers: Partial<Record<Category, string>>;
    schedules: Record<string, { enabled: boolean }>;
    escalation: { reminder_after_days: number; max_reminders: number; escalate_after_days: number; escalate_to: string };
    limits: { max_runs_per_day: number; max_actions_per_day: number; max_messages_per_day: number; monthly_ai_budget_gbp: number };
    notifications: Record<string, string>;
    allowed_connections: string[];
    instructions: string;
    allow_external_ai: boolean;
  };
  connections: Array<{ id: string; display_name: string; mode: string; status: string }>;
}) {
  return (
    <InlineForm action={(fd) => saveAgentConfig(companyId, def.key, fd)} resetOnSuccess={false} className="space-y-5">
      {({ pending }) => (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="enabled" defaultChecked={config.enabled} className="size-4 accent-brand" /> Enabled
          </label>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">What it may do</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Activity</th>
                    <th className="px-3 py-2 font-medium">Level</th>
                    <th className="px-3 py-2 font-medium">Mode</th>
                    <th className="px-3 py-2 font-medium">Approved by</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {def.categories.map((c) => {
                    const cat = CATEGORIES[c];
                    const options = (["off", "approval", "auto"] as const).filter((m) => (cat.cap === "off" ? m === "off" : cat.cap === "approval" ? m !== "auto" : true));
                    return (
                      <tr key={c}>
                        <td className="px-3 py-2">
                          <span className="font-medium">{cat.label}</span>
                          <span className="block text-xs text-muted-foreground">{cat.description}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground tabular">L{cat.level}</td>
                        <td className="px-3 py-2">
                          {c === "record_findings" ? (
                            <span className="text-xs text-muted-foreground">Always (own records)</span>
                          ) : (
                            <NativeSelect name={`mode_${c}`} defaultValue={config.category_modes[c] ?? cat.defaultMode} className="h-7 w-40 text-xs" aria-label={`${cat.label} mode`}>
                              {options.map((m) => (
                                <option key={m} value={m}>
                                  {MODE_LABEL[m]}
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {c !== "record_findings" && cat.cap !== "off" && (
                            <NativeSelect name={`approver_${c}`} defaultValue={config.approvers[c] ?? "ceo"} className="h-7 w-44 text-xs" aria-label={`${cat.label} approver`}>
                              {Object.entries(APPROVER_LABEL).map(([k, l]) => (
                                <option key={k} value={k}>
                                  {l}
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Level 5 activities can never run without a specific approval, and commercial terms are never delegated. These limits are enforced in the database.</p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">When it runs</p>
              <div className="space-y-1.5">
                {def.schedules.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name={`schedule_${s.key}`} defaultChecked={config.schedules[s.key]?.enabled !== false} className="size-4 accent-brand" /> {s.label}
                  </label>
                ))}
              </div>
              <p className="mt-3 mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Systems it may use</p>
              <div className="space-y-1.5">
                {connections.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name="connection" value={c.id} defaultChecked={config.allowed_connections.includes(c.id)} className="size-4 accent-brand" disabled={c.status === "disconnected"} />
                    {c.display_name} <span className="text-xs text-muted-foreground">({c.mode}{c.status !== "connected" ? `, ${c.status.replace("_", " ")}` : ""})</span>
                  </label>
                ))}
                {!connections.length && <p className="text-xs text-muted-foreground">No connections yet.</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Remind after (days)">
                <Input name="reminder_after_days" type="number" min={1} max={14} defaultValue={config.escalation.reminder_after_days} />
              </Field>
              <Field label="Reminders before escalating">
                <Input name="max_reminders" type="number" min={0} max={5} defaultValue={config.escalation.max_reminders} />
              </Field>
              <Field label="Escalate when overdue by (days)">
                <Input name="escalate_after_days" type="number" min={1} max={60} defaultValue={config.escalation.escalate_after_days} />
              </Field>
              <Field label="Escalate to">
                <NativeSelect name="escalate_to" defaultValue={config.escalation.escalate_to}>
                  <option value="manager">Owner&apos;s manager</option>
                  <option value="ceo">CEO</option>
                </NativeSelect>
              </Field>
              <Field label="Max steps/day (×10)">
                <Input name="max_runs_per_day" type="number" min={1} max={500} defaultValue={config.limits.max_runs_per_day} />
              </Field>
              <Field label="Max actions per day">
                <Input name="max_actions_per_day" type="number" min={0} max={200} defaultValue={config.limits.max_actions_per_day} />
              </Field>
              <Field label="Max messages per day">
                <Input name="max_messages_per_day" type="number" min={0} max={200} defaultValue={config.limits.max_messages_per_day} />
              </Field>
              <Field label="Monthly AI budget (£)">
                <Input name="monthly_ai_budget_gbp" type="number" min={0} max={10000} defaultValue={config.limits.monthly_ai_budget_gbp} />
              </Field>
              <Field label="Notify approvals">
                <NativeSelect name="notify_approvals" defaultValue={config.notifications.approvals ?? "in_app"}>
                  <option value="in_app">In Omni OS</option>
                  <option value="in_app_and_email">In Omni OS and email</option>
                </NativeSelect>
              </Field>
              <Field label="Notify escalations">
                <NativeSelect name="notify_escalations" defaultValue={config.notifications.escalations ?? "in_app"}>
                  <option value="in_app">In Omni OS</option>
                  <option value="in_app_and_email">In Omni OS and email</option>
                </NativeSelect>
              </Field>
            </div>
          </div>
          <Field label="Management instructions" hint="Context the agent should apply, e.g. priorities to focus on. Instructions never widen its permissions.">
            <Textarea name="instructions" defaultValue={config.instructions} rows={2} maxLength={2000} />
          </Field>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" name="allow_external_ai" defaultChecked={config.allow_external_ai} className="mt-0.5 size-4 accent-brand" />
            <span>
              Allow an external AI provider to draft wording
              <span className="block text-xs text-muted-foreground">Off by default. Only the minimum context for the draft is sent, under your contractual arrangements. Investigations, findings and authority never depend on it.</span>
            </span>
          </label>
          <SubmitButton pending={pending} variant="brand">
            Save configuration
          </SubmitButton>
        </>
      )}
    </InlineForm>
  );
}

const PROVIDER_OPTIONS = [
  ["email_resend", "Email (Resend)"],
  ["microsoft_outlook", "Microsoft Outlook"],
  ["microsoft_teams", "Microsoft Teams"],
  ["hubspot", "HubSpot CRM"],
  ["salesforce", "Salesforce"],
  ["companies_house", "Companies House"],
  ["sharepoint", "SharePoint (integration documents)"],
  ["onedrive", "OneDrive (integration documents)"],
  ["google_drive", "Google Drive (integration documents)"],
  ["crm_sandbox", "Sandbox CRM (fictional data)"],
  ["ma_sandbox", "Sandbox market dataset (fictional)"],
] as const;

export function ConnectionDialog({ companyId }: { companyId: string }) {
  const [provider, setProvider] = useState<string>("email_resend");
  const sandboxOnly = provider === "crm_sandbox" || provider === "ma_sandbox";
  return (
    <FormDialog trigger={<Button size="sm" variant="outline"><MessageSquarePlus /> Connect a system</Button>} title="Connect a system" description="Each company connects its own systems. Credentials are encrypted and can never be read back. Start in sandbox mode: nothing is sent until you switch to live." action={(fd) => saveConnection(companyId, fd)} submitLabel="Save connection">
      {(e) => (
        <>
          <Field label="System" error={e.provider}>
            <NativeSelect name="provider" value={provider} onChange={(ev) => setProvider(ev.target.value)}>
              {PROVIDER_OPTIONS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {!sandboxOnly && (
            <>
              <Field label="Mode" error={e.mode}>
                <NativeSelect name="mode" defaultValue="sandbox">
                  <option value="sandbox">Sandbox — record, don&apos;t send or change</option>
                  <option value="live">Live</option>
                </NativeSelect>
              </Field>
              <Field label="Credential" error={e.secret} hint="Use a least-privilege token scoped to what the agent needs.">
                <Input name="secret" type="password" autoComplete="off" />
              </Field>
              {provider === "sharepoint" && (
                <Field label="SharePoint site ID" error={e.site_id} hint="Microsoft Graph site id; the token needs Sites.Read.All or Files.Read.Selected">
                  <Input name="site_id" required />
                </Field>
              )}
              {provider === "email_resend" && (
                <Field label="Sender address" error={e.from}>
                  <Input name="from" type="email" placeholder="agents@yourcompany.com" required />
                </Field>
              )}
            </>
          )}
        </>
      )}
    </FormDialog>
  );
}

export function DisconnectButton({ companyId, id }: { companyId: string; id: string }) {
  const q = useQuickAction();
  return (
    <Button size="xs" variant="ghost" disabled={q.pending} onClick={() => confirm("Disconnect this system? Its credentials are deleted.") && q.run(() => disconnectConnection(companyId, id))}>
      Disconnect
    </Button>
  );
}

export function TargetStageSelect({ companyId, id, stage }: { companyId: string; id: string; stage: string }) {
  const q = useQuickAction();
  return (
    <NativeSelect
      value={stage}
      aria-label="Stage"
      disabled={q.pending}
      className="h-7 w-36 text-xs"
      onChange={(e) => {
        const s = e.target.value;
        const reason = s === "rejected" ? prompt("Why is this target rejected?") ?? "" : undefined;
        if (s === "rejected" && !reason) return;
        q.run(() => setTargetStage(companyId, id, s, reason));
      }}
    >
      {["identified", "researching", "shortlisted", "approach_prepared", "approached", "in_discussion", "diligence", "rejected", "closed"].map((s) => (
        <option key={s} value={s}>
          {s.replace("_", " ")}
        </option>
      ))}
    </NativeSelect>
  );
}

export function CompleteTaskButton({ companyId, id }: { companyId: string; id: string }) {
  const q = useQuickAction();
  return (
    <Button size="xs" variant="outline" disabled={q.pending} onClick={() => q.run(() => completeCrmTask(companyId, id), "Task completed")}>
      <Check /> Complete
    </Button>
  );
}

