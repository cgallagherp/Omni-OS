"use client";
import type { ReactNode } from "react";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog } from "@/components/os/forms";
import { OwnerSelect, type CrewOption, type Option } from "@/components/os/entity-forms";
import { saveCrewMember, saveOrgAction } from "@/lib/actions/crew";
import { ORG_ACTION_TYPES } from "@/lib/domain/crew";

export function CrewDialog({ companyId, id, crew, defaults = {}, trigger, title }: { companyId: string; id?: string; crew: CrewOption[]; defaults?: Partial<{ full_name: string; title: string; email: string | null; seat: string | null; responsibilities: string[]; reports_to: string | null; is_leadership: boolean; is_open_seat: boolean }>; trigger: ReactNode; title?: string }) {
  return (
    <FormDialog trigger={trigger} title={title ?? (id ? "Edit seat" : "Add person or open seat")} description="Seats and accountabilities make up the accountability chart." action={(fd) => saveCrewMember(companyId, id ?? null, fd)}>
      {(e) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" error={e.full_name} hint="For an open seat, use the role name">
              <Input name="full_name" defaultValue={defaults.full_name} required />
            </Field>
            <Field label="Title" error={e.title}>
              <Input name="title" defaultValue={defaults.title} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Seat / function" error={e.seat}>
              <Input name="seat" defaultValue={defaults.seat ?? ""} placeholder="e.g. Revenue" />
            </Field>
            <Field label="Reports to" error={e.reports_to}>
              <NativeSelect name="reports_to" defaultValue={defaults.reports_to ?? ""}>
                <option value="">— (top of chart)</option>
                {crew
                  .filter((c) => c.id !== id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Email" error={e.email}>
            <Input name="email" type="email" defaultValue={defaults.email ?? ""} />
          </Field>
          <Field label="Accountabilities (one per line)" error={e.responsibilities}>
            <Textarea name="responsibilities" defaultValue={(defaults.responsibilities ?? []).join("\n")} rows={4} />
          </Field>
          <div className="flex gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_leadership" defaultChecked={defaults.is_leadership ?? true} className="size-4 accent-brand" /> Leadership team
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_open_seat" defaultChecked={defaults.is_open_seat} className="size-4 accent-brand" /> Open seat (vacant)
            </label>
          </div>
        </>
      )}
    </FormDialog>
  );
}


export function OrgActionDialog({
  companyId,
  id,
  crew,
  priorities,
  goals,
  defaults = {},
  trigger,
}: {
  companyId: string;
  id?: string;
  crew: CrewOption[];
  priorities: Option[];
  goals: Option[];
  defaults?: Partial<{ type: string; title: string; description: string | null; priority: string; status: string; owner_id: string; target_date: string | null; quarterly_priority_id: string | null; annual_goal_id: string | null }>;
  trigger: ReactNode;
}) {
  return (
    <FormDialog
      trigger={trigger}
      title={id ? "Edit organisational action" : "Add organisational action"}
      description="Record agreed organisational actions only, e.g. “Hire a CRO by Q2”. Do not record assessments of individuals."
      action={(fd) => saveOrgAction(companyId, id ?? null, fd)}
    >
      {(e) => (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Type" error={e.type}>
              <NativeSelect name="type" defaultValue={defaults.type ?? "hire"}>
                {ORG_ACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Priority" error={e.priority}>
              <NativeSelect name="priority" defaultValue={defaults.priority ?? "high"}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </NativeSelect>
            </Field>
            <Field label="Status" error={e.status}>
              <NativeSelect name="status" defaultValue={defaults.status ?? "open"}>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="closed">Closed</option>
              </NativeSelect>
            </Field>
          </div>
          <Field label="Agreed action" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required placeholder="e.g. Hire a Chief Revenue Officer by Q2" />
          </Field>
          <Field label="Why it matters to the plan" error={e.description}>
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <OwnerSelect crew={crew} defaultValue={defaults.owner_id} error={e.owner_id} />
            <Field label="Deadline" error={e.target_date}>
              <Input name="target_date" type="date" defaultValue={defaults.target_date ?? ""} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supports 90-Day Priority" error={e.quarterly_priority_id}>
              <NativeSelect name="quarterly_priority_id" defaultValue={defaults.quarterly_priority_id ?? ""}>
                <option value="">—</option>
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Supports 12-Month Objective" error={e.annual_goal_id}>
              <NativeSelect name="annual_goal_id" defaultValue={defaults.annual_goal_id ?? ""}>
                <option value="">—</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}
