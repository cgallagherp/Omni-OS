"use client";
import { useState, type ReactNode } from "react";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog } from "@/components/os/forms";
import { saveListeningRound } from "@/lib/actions/listening";

export interface ListeningDefaults {
  kind?: "employee" | "customer";
  held_on?: string;
  method?: string | null;
  responses?: number | null;
  engagement?: number | null;
  enps?: number | null;
  leadership_confidence?: number | null;
  strategy_confidence?: number | null;
  clarity_accountability?: number | null;
  nps?: number | null;
  satisfaction?: number | null;
  retention?: number | null;
  churn?: number | null;
  themes?: string[];
  issues?: string | null;
  summary?: string | null;
}

export function ListeningDialog({ companyId, id, defaults = {}, trigger }: { companyId: string; id?: string; defaults?: ListeningDefaults; trigger: ReactNode }) {
  const [kind, setKind] = useState(defaults.kind ?? "employee");
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return (
    <FormDialog
      trigger={trigger}
      title={id ? "Edit listening round" : "Record a listening round"}
      description="Record aggregate results and themes only. Do not enter raw or identifiable responses."
      action={(fd) => saveListeningRound(companyId, id ?? null, fd)}
      size="lg"
    >
      {(e) => (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Listening to" error={e.kind}>
              <NativeSelect name="kind" value={kind} onChange={(ev) => setKind(ev.target.value as "employee" | "customer")}>
                <option value="employee">Employees</option>
                <option value="customer">Customers</option>
              </NativeSelect>
            </Field>
            <Field label="Date" error={e.held_on}>
              <Input name="held_on" type="date" defaultValue={defaults.held_on ?? ""} required />
            </Field>
            <Field label="Responses" error={e.responses}>
              <Input name="responses" type="number" min={0} defaultValue={n(defaults.responses)} />
            </Field>
          </div>
          <Field label="Method" error={e.method}>
            <Input name="method" defaultValue={defaults.method ?? ""} placeholder={kind === "employee" ? "e.g. Pulse survey and six focus groups" : "e.g. NPS survey and 12 customer interviews"} />
          </Field>
          {kind === "employee" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label="Engagement %" error={e.engagement}>
                <Input name="engagement" inputMode="decimal" defaultValue={n(defaults.engagement)} />
              </Field>
              <Field label="eNPS" error={e.enps}>
                <Input name="enps" inputMode="decimal" defaultValue={n(defaults.enps)} />
              </Field>
              <Field label="Leadership confidence %" error={e.leadership_confidence}>
                <Input name="leadership_confidence" inputMode="decimal" defaultValue={n(defaults.leadership_confidence)} />
              </Field>
              <Field label="Strategy confidence %" error={e.strategy_confidence}>
                <Input name="strategy_confidence" inputMode="decimal" defaultValue={n(defaults.strategy_confidence)} />
              </Field>
              <Field label="Clarity of accountability %" error={e.clarity_accountability}>
                <Input name="clarity_accountability" inputMode="decimal" defaultValue={n(defaults.clarity_accountability)} />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="NPS" error={e.nps}>
                <Input name="nps" inputMode="decimal" defaultValue={n(defaults.nps)} />
              </Field>
              <Field label="Satisfaction %" error={e.satisfaction}>
                <Input name="satisfaction" inputMode="decimal" defaultValue={n(defaults.satisfaction)} />
              </Field>
              <Field label="Retention %" error={e.retention}>
                <Input name="retention" inputMode="decimal" defaultValue={n(defaults.retention)} />
              </Field>
              <Field label="Churn %" error={e.churn}>
                <Input name="churn" inputMode="decimal" defaultValue={n(defaults.churn)} />
              </Field>
            </div>
          )}
          <Field label="Themes (one per line)" error={e.themes}>
            <Textarea name="themes" defaultValue={(defaults.themes ?? []).join("\n")} rows={3} />
          </Field>
          {kind === "customer" && (
            <Field label="Issues raised" error={e.issues}>
              <Textarea name="issues" defaultValue={defaults.issues ?? ""} rows={2} />
            </Field>
          )}
          <Field label="Summary" error={e.summary}>
            <Textarea name="summary" defaultValue={defaults.summary ?? ""} rows={2} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
