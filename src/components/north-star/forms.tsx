"use client";
import type { ReactNode } from "react";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog } from "@/components/os/forms";
import type { CrewOption, Option } from "@/components/os/entity-forms";
import { saveCondition, saveMilestone, updateNorthStar } from "@/lib/actions/strategy";
import { RAG_OPTIONS } from "@/lib/domain/status";

export interface NorthStarValues {
  purpose: string;
  vision: string;
  five_year_ambition: string;
  three_year_destination: string;
  investment_thesis: string;
  exit_equity_story: string;
  buyer_proposition: string;
  target_year: number | null;
  target_revenue: number | null;
  target_ebitda: number | null;
  target_ev: number | null;
  baseline_revenue: number | null;
  baseline_ebitda: number | null;
  assumptions: string[];
}

export function NorthStarDialog({ companyId, values, trigger }: { companyId: string; values: NorthStarValues; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title="Edit North Star" description="Material strategy changes are saved as a new version with your summary." action={(fd) => updateNorthStar(companyId, fd)} size="xl" submitLabel="Save new version">
      {(e) => (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Purpose" error={e.purpose}>
            <Textarea name="purpose" defaultValue={values.purpose} rows={2} />
          </Field>
          <Field label="Vision" error={e.vision}>
            <Textarea name="vision" defaultValue={values.vision} rows={2} />
          </Field>
          <Field label="Five-year ambition" error={e.five_year_ambition}>
            <Textarea name="five_year_ambition" defaultValue={values.five_year_ambition} rows={3} />
          </Field>
          <Field label="Three-year value creation destination" error={e.three_year_destination}>
            <Textarea name="three_year_destination" defaultValue={values.three_year_destination} rows={3} />
          </Field>
          <Field label="Investment thesis" error={e.investment_thesis}>
            <Textarea name="investment_thesis" defaultValue={values.investment_thesis} rows={3} />
          </Field>
          <Field label="Exit equity story" error={e.exit_equity_story}>
            <Textarea name="exit_equity_story" defaultValue={values.exit_equity_story} rows={3} />
          </Field>
          <Field label="Buyer proposition — begin with the buyer" error={e.buyer_proposition} className="md:col-span-2">
            <Textarea name="buyer_proposition" defaultValue={values.buyer_proposition} rows={2} />
          </Field>
          <div className="grid grid-cols-3 gap-3 md:col-span-2 md:grid-cols-6">
            <Field label="Target year" error={e.target_year}>
              <Input name="target_year" type="number" defaultValue={values.target_year ?? ""} />
            </Field>
            <Field label="Target revenue" error={e.target_revenue}>
              <Input name="target_revenue" inputMode="decimal" defaultValue={values.target_revenue ?? ""} />
            </Field>
            <Field label="Target EBITDA" error={e.target_ebitda}>
              <Input name="target_ebitda" inputMode="decimal" defaultValue={values.target_ebitda ?? ""} />
            </Field>
            <Field label="Target EV" error={e.target_ev}>
              <Input name="target_ev" inputMode="decimal" defaultValue={values.target_ev ?? ""} />
            </Field>
            <Field label="Baseline revenue" error={e.baseline_revenue}>
              <Input name="baseline_revenue" inputMode="decimal" defaultValue={values.baseline_revenue ?? ""} />
            </Field>
            <Field label="Baseline EBITDA" error={e.baseline_ebitda}>
              <Input name="baseline_ebitda" inputMode="decimal" defaultValue={values.baseline_ebitda ?? ""} />
            </Field>
          </div>
          <Field label="Strategic assumptions (one per line)" error={e.assumptions} className="md:col-span-2">
            <Textarea name="assumptions" defaultValue={values.assumptions.join("\n")} rows={5} />
          </Field>
          <Field label="Summary of this change" error={e.change_summary} className="md:col-span-2" hint="Recorded in the version history, e.g. “Raised EBITDA target after Q3 board review”.">
            <Input name="change_summary" required />
          </Field>
        </div>
      )}
    </FormDialog>
  );
}

export function ConditionDialog({ companyId, id, crew, defaults = {}, trigger }: { companyId: string; id?: string; crew: CrewOption[]; defaults?: { title?: string; description?: string | null; status?: string; owner_id?: string | null }; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={id ? "Edit condition" : "Add condition for success"} action={(fd) => saveCondition(companyId, id ?? null, fd)}>
      {(e) => (
        <>
          <Field label="Condition" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required />
          </Field>
          <Field label="What must be true" error={e.description}>
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={3} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <NativeSelect name="status" defaultValue={defaults.status ?? "on_track"}>
                {RAG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Owner">
              <NativeSelect name="owner_id" defaultValue={defaults.owner_id ?? ""}>
                <option value="">—</option>
                {crew.filter((c) => !c.is_open_seat).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
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

export function MilestoneDialog({ companyId, id, moves, defaults = {}, trigger }: { companyId: string; id?: string; moves: Option[]; defaults?: { title?: string; description?: string | null; status?: string; target_date?: string; winning_move_id?: string | null }; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={id ? "Edit milestone" : "Add milestone"} action={(fd) => saveMilestone(companyId, id ?? null, fd)}>
      {(e) => (
        <>
          <Field label="Milestone" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target date" error={e.target_date}>
              <Input name="target_date" type="date" defaultValue={defaults.target_date} required />
            </Field>
            <Field label="Status">
              <NativeSelect name="status" defaultValue={defaults.status ?? "not_started"}>
                {RAG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Winning Move">
            <NativeSelect name="winning_move_id" defaultValue={defaults.winning_move_id ?? ""}>
              <option value="">Company-level</option>
              {moves.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Description">
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={2} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
