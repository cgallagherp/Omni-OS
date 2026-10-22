"use client";
import type { ReactNode } from "react";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog } from "@/components/os/forms";
import { OwnerSelect, type CrewOption } from "@/components/os/entity-forms";
import { saveCrewMember, saveGap } from "@/lib/actions/crew";

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
              <input type="checkbox" name="is_leadership" defaultChecked={defaults.is_leadership ?? true} className="size-4 accent-[var(--brand)]" /> Leadership team
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_open_seat" defaultChecked={defaults.is_open_seat} className="size-4 accent-[var(--brand)]" /> Open seat (vacant)
            </label>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function GapDialog({ companyId, id, crew, defaults = {}, trigger }: { companyId: string; id?: string; crew: CrewOption[]; defaults?: Partial<{ type: string; title: string; description: string | null; priority: string; status: string; owner_id: string; crew_member_id: string | null; target_date: string | null }>; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={id ? "Edit" : "Add organisational priority"} action={(fd) => saveGap(companyId, id ?? null, fd)}>
      {(e) => (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Type" error={e.type}>
              <NativeSelect name="type" defaultValue={defaults.type ?? "hire"}>
                <option value="hire">Key hire</option>
                <option value="capability">Capability gap</option>
                <option value="development">Leadership development</option>
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
          <Field label="Title" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required />
          </Field>
          <Field label="Why it matters" error={e.description}>
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={3} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <OwnerSelect crew={crew} defaultValue={defaults.owner_id} error={e.owner_id} />
            <Field label="Target date" error={e.target_date}>
              <Input name="target_date" type="date" defaultValue={defaults.target_date ?? ""} />
            </Field>
          </div>
          <Field label="Person being developed (development only)">
            <NativeSelect name="crew_member_id" defaultValue={defaults.crew_member_id ?? ""}>
              <option value="">—</option>
              {crew.filter((c) => !c.is_open_seat).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </>
      )}
    </FormDialog>
  );
}
