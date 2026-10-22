"use client";
import type * as React from "react";
import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RAG_OPTIONS } from "@/lib/domain/status";
import { FormDialog, type FormAction } from "./forms";

export interface CrewOption {
  id: string;
  full_name: string;
  title: string;
  is_open_seat: boolean;
}
export interface Option {
  id: string;
  title: string;
}

type Errors = Record<string, string>;

export function OwnerSelect({ crew, defaultValue, name = "owner_id", label = "Owner", error }: { crew: CrewOption[]; defaultValue?: string | null; name?: string; label?: string; error?: string }) {
  return (
    <Field label={label} error={error} hint="One accountable owner">
      <NativeSelect name={name} defaultValue={defaultValue ?? ""} required>
        <option value="" disabled>
          Choose owner…
        </option>
        {crew
          .filter((c) => !c.is_open_seat)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name} — {c.title}
            </option>
          ))}
      </NativeSelect>
    </Field>
  );
}

function OptionalSelect({ name, label, options, defaultValue, placeholder = "None", error }: { name: string; label: string; options: Option[]; defaultValue?: string | null; placeholder?: string; error?: string }) {
  return (
    <Field label={label} error={error}>
      <NativeSelect name={name} defaultValue={defaultValue ?? ""}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

function StatusProgress({ status, progress, errors }: { status?: string; progress?: number; errors: Errors }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Status" error={errors.status}>
        <NativeSelect name="status" defaultValue={status ?? "on_track"}>
          {RAG_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Progress %" error={errors.progress}>
        <Input name="progress" type="number" min={0} max={100} step={5} defaultValue={progress ?? 0} />
      </Field>
    </div>
  );
}

function Dates({ start, due, errors, startLabel = "Start", dueLabel = "Due" }: { start?: string | null; due?: string | null; errors: Errors; startLabel?: string; dueLabel?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={startLabel} error={errors.start_date}>
        <Input name="start_date" type="date" defaultValue={start ?? ""} />
      </Field>
      <Field label={dueLabel} error={errors.due_date}>
        <Input name="due_date" type="date" defaultValue={due ?? ""} />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface ActionDefaults {
  title?: string;
  description?: string | null;
  owner_id?: string | null;
  due_date?: string | null;
  status?: string;
  quarterly_priority_id?: string | null;
  issue_id?: string | null;
  decision_id?: string | null;
  meeting_id?: string | null;
}

export function ActionDialog({ trigger, action, crew, priorities, issues = [], defaults = {}, title = "Assign action", submitLabel = "Assign action" }: { trigger: ReactNode; action: FormAction; crew: CrewOption[]; priorities: Option[]; issues?: Option[]; defaults?: ActionDefaults; title?: string; submitLabel?: string }) {
  const [inAWeek] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const due = defaults.due_date ?? inAWeek;
  return (
    <FormDialog trigger={trigger} title={title} description="Every action has one owner and a deadline." action={action} submitLabel={submitLabel}>
      {(e) => (
        <>
          <Field label="Action" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required autoFocus placeholder="What will be done?" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <OwnerSelect crew={crew} defaultValue={defaults.owner_id} error={e.owner_id} />
            <Field label="Due date" error={e.due_date}>
              <Input name="due_date" type="date" defaultValue={due} required />
            </Field>
          </div>
          <OptionalSelect name="quarterly_priority_id" label="Supports priority" options={priorities} defaultValue={defaults.quarterly_priority_id} />
          {issues.length > 0 && <OptionalSelect name="issue_id" label="Resolves issue" options={issues} defaultValue={defaults.issue_id} />}
          {defaults.decision_id && <input type="hidden" name="decision_id" value={defaults.decision_id} />}
          {defaults.issue_id && issues.length === 0 && <input type="hidden" name="issue_id" value={defaults.issue_id} />}
          {defaults.meeting_id && <input type="hidden" name="meeting_id" value={defaults.meeting_id} />}
          {defaults.status && <input type="hidden" name="status" value={defaults.status} />}
          <Field label="Notes" error={e.description}>
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={2} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export interface IssueDefaults {
  title?: string;
  description?: string | null;
  priority?: string;
  status?: string;
  owner_id?: string | null;
  metric_id?: string | null;
  quarterly_priority_id?: string | null;
  annual_goal_id?: string | null;
  raised_in_meeting_id?: string | null;
  escalated_to_omni?: boolean;
}

export function IssueDialog({ trigger, action, crew, priorities, metrics, goals = [], defaults = {}, title = "Raise an issue", submitLabel = "Raise issue" }: { trigger: ReactNode; action: FormAction; crew: CrewOption[]; priorities: Option[]; metrics: Option[]; goals?: Option[]; defaults?: IssueDefaults; title?: string; submitLabel?: string }) {
  return (
    <FormDialog trigger={trigger} title={title} description="A material problem that needs management attention." action={action} submitLabel={submitLabel}>
      {(e) => (
        <>
          <Field label="Issue" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required autoFocus />
          </Field>
          <Field label="Context" error={e.description}>
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={3} placeholder="What is happening, and why does it matter?" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <OwnerSelect crew={crew} defaultValue={defaults.owner_id} error={e.owner_id} />
            <Field label="Priority" error={e.priority}>
              <NativeSelect name="priority" defaultValue={defaults.priority ?? "high"}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <OptionalSelect name="metric_id" label="Related KPI" options={metrics} defaultValue={defaults.metric_id} />
            <OptionalSelect name="quarterly_priority_id" label="Related priority" options={priorities} defaultValue={defaults.quarterly_priority_id} />
          </div>
          {goals.length > 0 && <OptionalSelect name="annual_goal_id" label="Related annual goal" options={goals} defaultValue={defaults.annual_goal_id} />}
          {defaults.status && <input type="hidden" name="status" value={defaults.status} />}
          {defaults.raised_in_meeting_id && <input type="hidden" name="raised_in_meeting_id" value={defaults.raised_in_meeting_id} />}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="escalated_to_omni" defaultChecked={defaults.escalated_to_omni} className="size-4 rounded border-input accent-[var(--brand)]" />
            Escalate to the Omni operating team
          </label>
        </>
      )}
    </FormDialog>
  );
}

export function DecisionDialog({ trigger, action, crew, issues, defaults = {} }: { trigger: ReactNode; action: FormAction; crew: CrewOption[]; issues: Option[]; defaults?: { issue_id?: string | null; meeting_id?: string | null; owner_id?: string | null; title?: string } }) {
  return (
    <FormDialog trigger={trigger} title="Record a decision" description="Decisions are logged permanently with their rationale." action={action} submitLabel="Record decision">
      {(e) => (
        <>
          <Field label="Decision" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required autoFocus placeholder="We will…" />
          </Field>
          <Field label="Rationale" error={e.rationale}>
            <Textarea name="rationale" rows={3} placeholder="Why — options considered, trade-offs, evidence" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <OwnerSelect crew={crew} defaultValue={defaults.owner_id} label="Decision owner" error={e.owner_id} />
            <Field label="Decided on" error={e.decided_on}>
              <Input name="decided_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </Field>
          </div>
          <OptionalSelect name="issue_id" label="Resolves issue" options={issues} defaultValue={defaults.issue_id} />
          {defaults.meeting_id && <input type="hidden" name="meeting_id" value={defaults.meeting_id} />}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="resolve_issue" defaultChecked={Boolean(defaults.issue_id)} className="size-4 rounded border-input accent-[var(--brand)]" />
            Mark the linked issue as resolved
          </label>
        </>
      )}
    </FormDialog>
  );
}

export function ResolveIssueDialog({ trigger, action, meetingId }: { trigger: ReactNode; action: FormAction; meetingId?: string }) {
  return (
    <FormDialog trigger={trigger} title="Resolve issue" action={action} submitLabel="Resolve" size="sm">
      {(e) => (
        <>
          <Field label="Resolution" error={e.resolution}>
            <Textarea name="resolution" rows={3} required autoFocus placeholder="How was it resolved?" />
          </Field>
          {meetingId && <input type="hidden" name="meeting_id" value={meetingId} />}
        </>
      )}
    </FormDialog>
  );
}

export function WinningMoveDialog({ trigger, action, crew, defaults = {}, title = "Add Winning Move" }: { trigger: ReactNode; action: FormAction; crew: CrewOption[]; defaults?: Partial<{ title: string; description: string | null; measurable_outcome: string | null; owner_id: string; status: string; progress: number; start_date: string | null; due_date: string | null }>; title?: string }) {
  return (
    <FormDialog trigger={trigger} title={title} description="A strategic move that underpins value creation." action={action} size="lg">
      {(e) => (
        <>
          <Field label="Winning Move" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required />
          </Field>
          <Field label="Description" error={e.description}>
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={3} />
          </Field>
          <Field label="Measurable outcome" error={e.measurable_outcome}>
            <Input name="measurable_outcome" defaultValue={defaults.measurable_outcome ?? ""} placeholder="e.g. NRR ≥115% by year end" />
          </Field>
          <OwnerSelect crew={crew} defaultValue={defaults.owner_id} error={e.owner_id} />
          <StatusProgress status={defaults.status} progress={defaults.progress} errors={e} />
          <Dates start={defaults.start_date} due={defaults.due_date} errors={e} />
        </>
      )}
    </FormDialog>
  );
}

export function AnnualGoalDialog({ trigger, action, crew, moves, fiscalYear, defaults = {}, title = "Add annual goal" }: { trigger: ReactNode; action: FormAction; crew: CrewOption[]; moves: Option[]; fiscalYear: number; defaults?: Partial<{ title: string; description: string | null; measurable_outcome: string | null; owner_id: string; status: string; progress: number; start_date: string | null; due_date: string | null; winning_move_id: string; unit: string | null; baseline_value: number | null; target_value: number | null; current_value: number | null; fiscal_year: number }>; title?: string }) {
  return (
    <FormDialog trigger={trigger} title={title} description="A measurable outcome management commits to this year." action={action} size="lg">
      {(e) => (
        <>
          <Field label="Annual goal" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required />
          </Field>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Winning Move" error={e.winning_move_id}>
              <NativeSelect name="winning_move_id" defaultValue={defaults.winning_move_id ?? ""} required>
                <option value="" disabled>
                  Choose…
                </option>
                {moves.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Fiscal year" error={e.fiscal_year}>
              <Input name="fiscal_year" type="number" defaultValue={defaults.fiscal_year ?? fiscalYear} />
            </Field>
          </div>
          <Field label="Measurable outcome" error={e.measurable_outcome}>
            <Input name="measurable_outcome" defaultValue={defaults.measurable_outcome ?? ""} />
          </Field>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Unit" error={e.unit}>
              <NativeSelect name="unit" defaultValue={defaults.unit ?? ""}>
                <option value="">—</option>
                <option value="currency">Currency</option>
                <option value="percent">Percent</option>
                <option value="number">Number</option>
                <option value="ratio">Ratio</option>
                <option value="days">Days</option>
                <option value="score">Score</option>
              </NativeSelect>
            </Field>
            <Field label="Baseline" error={e.baseline_value}>
              <Input name="baseline_value" inputMode="decimal" defaultValue={defaults.baseline_value ?? ""} />
            </Field>
            <Field label="Target" error={e.target_value}>
              <Input name="target_value" inputMode="decimal" defaultValue={defaults.target_value ?? ""} />
            </Field>
            <Field label="Current" error={e.current_value}>
              <Input name="current_value" inputMode="decimal" defaultValue={defaults.current_value ?? ""} />
            </Field>
          </div>
          <OwnerSelect crew={crew} defaultValue={defaults.owner_id} error={e.owner_id} />
          <StatusProgress status={defaults.status} progress={defaults.progress} errors={e} />
          <Dates start={defaults.start_date} due={defaults.due_date} errors={e} />
          <Field label="Description" error={e.description}>
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={2} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function PriorityDialog({ trigger, action, crew, goals, quarters, defaults = {}, title = "Add quarterly priority" }: { trigger: ReactNode; action: FormAction; crew: CrewOption[]; goals: Option[]; quarters: Option[]; defaults?: Partial<{ title: string; description: string | null; measurable_outcome: string | null; owner_id: string; status: string; progress: number; start_date: string | null; due_date: string | null; annual_goal_id: string; quarter_id: string }>; title?: string }) {
  return (
    <FormDialog trigger={trigger} title={title} description="Every priority must connect to an annual goal." action={action} size="lg">
      {(e) => (
        <>
          <Field label="Priority" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required />
          </Field>
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <Field label="Annual goal" error={e.annual_goal_id}>
              <NativeSelect name="annual_goal_id" defaultValue={defaults.annual_goal_id ?? ""} required>
                <option value="" disabled>
                  Choose…
                </option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Quarter" error={e.quarter_id}>
              <NativeSelect name="quarter_id" defaultValue={defaults.quarter_id ?? quarters[0]?.id} required>
                {quarters.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Measurable outcome" error={e.measurable_outcome}>
            <Input name="measurable_outcome" defaultValue={defaults.measurable_outcome ?? ""} placeholder="What does done look like?" />
          </Field>
          <OwnerSelect crew={crew} defaultValue={defaults.owner_id} error={e.owner_id} />
          <StatusProgress status={defaults.status} progress={defaults.progress} errors={e} />
          <Dates start={defaults.start_date} due={defaults.due_date} errors={e} />
          <Field label="Description" error={e.description}>
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={2} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function AddButton({ children, variant = "outline", ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button variant={variant} size="sm" {...props}>
      <Plus /> {children}
    </Button>
  );
}
