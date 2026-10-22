"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FormDialog } from "@/components/os/forms";
import { OwnerSelect, type CrewOption } from "@/components/os/entity-forms";
import { importMetricCsv, saveMetric, setMetricLinks, type ImportReport } from "@/lib/actions/metrics";

export interface MetricDefaults {
  name?: string;
  description?: string | null;
  category?: string;
  unit?: string;
  decimals?: number;
  frequency?: string;
  direction?: string;
  target_value?: number | null;
  target_min?: number | null;
  target_max?: number | null;
  tolerance_pct?: number;
  aggregation?: string;
  owner_id?: string;
  comparable_key?: string | null;
  is_key?: boolean;
}

export function MetricDialog({ companyId, id, crew, defaults = {}, trigger, title }: { companyId: string; id?: string; crew: CrewOption[]; defaults?: MetricDefaults; trigger: ReactNode; title?: string }) {
  const [direction, setDirection] = useState(defaults.direction ?? "higher_is_better");
  return (
    <FormDialog trigger={trigger} title={title ?? (id ? "Edit KPI" : "New KPI")} description="Define how the KPI is measured and what good looks like." action={(fd) => saveMetric(companyId, id ?? null, fd)} size="lg">
      {(e) => (
        <>
          <Field label="Name" error={e.name}>
            <Input name="name" defaultValue={defaults.name} required autoFocus placeholder="e.g. Pipeline coverage" />
          </Field>
          <Field label="Definition" error={e.description}>
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={2} placeholder="How it is calculated and where the data comes from" />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Category" error={e.category}>
              <NativeSelect name="category" defaultValue={defaults.category ?? "commercial"}>
                <option value="financial">Financial</option>
                <option value="commercial">Commercial</option>
                <option value="operational">Operational</option>
                <option value="customer">Customer</option>
                <option value="people">People</option>
              </NativeSelect>
            </Field>
            <Field label="Frequency" error={e.frequency}>
              <NativeSelect name="frequency" defaultValue={defaults.frequency ?? "weekly"}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </NativeSelect>
            </Field>
            <Field label="Unit" error={e.unit}>
              <NativeSelect name="unit" defaultValue={defaults.unit ?? "number"}>
                <option value="number">Number</option>
                <option value="currency">Currency</option>
                <option value="percent">Percent</option>
                <option value="ratio">Ratio (x)</option>
                <option value="days">Days</option>
                <option value="score">Score</option>
              </NativeSelect>
            </Field>
            <Field label="Decimals" error={e.decimals}>
              <Input name="decimals" type="number" min={0} max={4} defaultValue={defaults.decimals ?? 0} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Good performance is" error={e.direction} className="col-span-2">
              <NativeSelect name="direction" value={direction} onChange={(ev) => setDirection(ev.target.value)}>
                <option value="higher_is_better">Higher is better</option>
                <option value="lower_is_better">Lower is better</option>
                <option value="range">Within a range</option>
              </NativeSelect>
            </Field>
            {direction === "range" ? (
              <>
                <Field label="Minimum" error={e.target_min}>
                  <Input name="target_min" inputMode="decimal" defaultValue={defaults.target_min ?? ""} />
                </Field>
                <Field label="Maximum" error={e.target_max}>
                  <Input name="target_max" inputMode="decimal" defaultValue={defaults.target_max ?? ""} />
                </Field>
              </>
            ) : (
              <Field label="Target" error={e.target_value} className="col-span-2">
                <Input name="target_value" inputMode="decimal" defaultValue={defaults.target_value ?? ""} />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="At-risk tolerance %" hint="Band outside target that counts as at risk rather than off track" error={e.tolerance_pct}>
              <Input name="tolerance_pct" type="number" min={0} max={100} step="0.5" defaultValue={defaults.tolerance_pct ?? 10} />
            </Field>
            <Field label="Aggregation" hint="Flow metrics (revenue) sum year-to-date" error={e.aggregation}>
              <NativeSelect name="aggregation" defaultValue={defaults.aggregation ?? "stock"}>
                <option value="stock">Point in time (stock)</option>
                <option value="flow">Sum over period (flow)</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <OwnerSelect crew={crew} defaultValue={defaults.owner_id} error={e.owner_id} />
            <Field label="Portfolio comparison key" hint="Optional, e.g. revenue, ebitda, gross_margin, nrr" error={e.comparable_key}>
              <Input name="comparable_key" defaultValue={defaults.comparable_key ?? ""} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_key" defaultChecked={defaults.is_key} className="size-4 accent-[var(--brand)]" /> Show on the Blueprint scoreboard
          </label>
        </>
      )}
    </FormDialog>
  );
}

export function LinkObjectivesDialog({
  companyId,
  metricId,
  options,
  selected,
  trigger,
}: {
  companyId: string;
  metricId: string;
  options: Array<{ group: string; items: Array<{ value: string; label: string }> }>;
  selected: string[];
  trigger: ReactNode;
}) {
  return (
    <FormDialog trigger={trigger} title="Link to strategic objectives" description="Linked KPIs appear on the objective and roll up into the Flight Plan." action={(fd) => setMetricLinks(companyId, metricId, fd)}>
      <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
        {options.map((g) => (
          <fieldset key={g.group}>
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{g.group}</legend>
            <div className="space-y-1.5">
              {g.items.map((i) => (
                <label key={i.value} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="link" value={i.value} defaultChecked={selected.includes(i.value)} className="mt-0.5 size-4 accent-[var(--brand)]" />
                  {i.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </FormDialog>
  );
}

const SAMPLE = `metric,period,value,target,note
Revenue,2026-09,2102485,2174000,Management accounts
Enterprise pipeline coverage,2026-10-12,2.3,,Weekly CRM snapshot`;

export function CsvImportDialog({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function validate(commit: boolean) {
    start(async () => {
      const r = await importMetricCsv(companyId, csv, commit);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setReport(r.data!);
      if (commit) {
        toast.success(r.message);
        router.refresh();
        setOpen(false);
        setCsv("");
        setReport(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setReport(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileUp /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import KPI actuals</DialogTitle>
          <DialogDescription>
            Columns: <code>metric</code> (name or id), <code>period</code> (YYYY-MM or YYYY-MM-DD), <code>value</code>, optional <code>target</code> and <code>note</code>. Existing values for the same period are updated.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setCsv(await f.text());
                setReport(null);
              }
            }}
            className="h-9 py-1.5"
          />
          <Textarea value={csv} onChange={(e) => { setCsv(e.target.value); setReport(null); }} rows={7} placeholder={SAMPLE} className="font-mono text-xs" />
          {report && (
            <div className="rounded-md border">
              <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
                <Badge variant="on">{report.valid} valid</Badge>
                {report.invalid > 0 && <Badge variant="off">{report.invalid} with errors (skipped)</Badge>}
              </div>
              <div className="max-h-52 overflow-y-auto text-xs">
                <table className="w-full">
                  <tbody className="divide-y">
                    {report.rows.map((r) => (
                      <tr key={r.line} className={r.status === "error" ? "bg-off-bg/50" : ""}>
                        <td className="px-3 py-1 text-muted-foreground">{r.line}</td>
                        <td className="px-2 py-1">{r.metric}</td>
                        <td className="px-2 py-1">{r.period}</td>
                        <td className="px-2 py-1 text-right tabular">{r.value ?? "—"}</td>
                        <td className="px-3 py-1 text-off">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => validate(false)} disabled={!csv.trim() || pending}>
            {pending && !report && <Loader2 className="animate-spin" />} Validate
          </Button>
          <Button onClick={() => validate(true)} disabled={!report || report.valid === 0 || pending}>
            {pending && report && <Loader2 className="animate-spin" />} Import {report ? `${report.valid} rows` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
