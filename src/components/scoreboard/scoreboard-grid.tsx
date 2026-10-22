"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { InlineForm, SubmitButton } from "@/components/os/forms";
import { Owner } from "@/components/os/avatar";
import { StatusDot } from "@/components/os/status";
import { TrendIcon } from "@/components/os/metric-card";
import { recordMetricValue } from "@/lib/actions/metrics";
import { CATEGORY_LABEL } from "@/lib/domain/status";
import { cn } from "@/lib/utils";

export interface GridCell {
  period: string;
  label: string;
  value: number | null;
  formatted: string;
  status: "on_track" | "at_risk" | "off_track" | "no_data";
  target: number | null;
  current: boolean; // the in-progress period
}

export interface GridRow {
  id: string;
  name: string;
  category: keyof typeof CATEGORY_LABEL;
  owner: { full_name: string; avatar_color: string | null } | null;
  targetLabel: string;
  status: GridCell["status"];
  trend: "improving" | "declining" | "flat" | "unknown";
  cells: GridCell[];
  isKey: boolean;
  linked: number;
}

const CELL_BG: Record<GridCell["status"], string> = {
  on_track: "bg-on-bg/70 text-foreground",
  at_risk: "bg-risk-bg text-foreground",
  off_track: "bg-off-bg text-off font-medium",
  no_data: "text-muted-foreground",
};

export function ScoreboardGrid({ companyId, slug, rows, periods, canWrite }: { companyId: string; slug: string; rows: GridRow[]; periods: Array<{ period: string; label: string; current: boolean }>; canWrite: boolean }) {
  const [category, setCategory] = useState<string>("all");
  const [onlyExceptions, setOnlyExceptions] = useState(false);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows]);
  const visible = rows.filter((r) => (category === "all" || r.category === category) && (!onlyExceptions || r.status === "off_track" || r.status === "at_risk"));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {["all", ...categories].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn("h-7 rounded-full border px-2.5 text-xs font-medium transition-colors", category === c ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}
          >
            {c === "all" ? "All" : CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyExceptions} onChange={(e) => setOnlyExceptions(e.target.checked)} className="size-3.5 accent-[var(--brand)]" /> Exceptions only
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card scrollbar-thin">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-[240px] bg-card px-3 py-2 text-left font-medium">KPI</th>
              <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Owner</th>
              <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Target</th>
              {periods.map((p) => (
                <th key={p.period} className={cn("min-w-[60px] px-1.5 py-2 text-right font-medium whitespace-nowrap", p.current && "text-foreground")}>
                  {p.label}
                  {p.current && <span className="block text-[10px] font-normal text-brand">current</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="group border-b last:border-0 hover:bg-accent/30">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5 group-hover:bg-[color-mix(in_oklch,var(--accent)_30%,var(--card))]">
                  <Link href={`/c/${slug}/scoreboard/${r.id}`} className="flex items-center gap-2 hover:underline">
                    <StatusDot status={r.status} />
                    <span className="truncate font-medium">{r.name}</span>
                    <TrendIcon trend={r.trend} />
                  </Link>
                </td>
                <td className="px-2 py-1.5">
                  <Owner person={r.owner} />
                </td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap text-muted-foreground tabular">{r.targetLabel}</td>
                {r.cells.map((c) => (
                  <td key={c.period} className="p-0.5">
                    <CellEditor companyId={companyId} metricId={r.id} metricName={r.name} cell={c} canWrite={canWrite} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <p className="p-6 text-center text-sm text-muted-foreground">No KPIs match this filter.</p>}
      </div>
    </div>
  );
}

function CellEditor({ companyId, metricId, metricName, cell, canWrite }: { companyId: string; metricId: string; metricName: string; cell: GridCell; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const body = (
    <span className={cn("flex h-8 items-center justify-end rounded px-2 tabular whitespace-nowrap", CELL_BG[cell.status], cell.current && cell.value === null && "border border-dashed border-border")}>
      {cell.value === null ? (canWrite ? <span className="text-muted-foreground/50">+</span> : "—") : cell.formatted}
    </span>
  );
  if (!canWrite) return body;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="block w-full rounded outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${metricName} ${cell.label}`}>
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <InlineForm
          action={async (fd) => {
            const r = await recordMetricValue(companyId, metricId, fd);
            if (r.ok) setOpen(false);
            return r;
          }}
        >
          {({ pending, errors }) => (
            <div className="grid gap-3">
              <div>
                <p className="text-sm font-medium">{metricName}</p>
                <p className="text-xs text-muted-foreground">{cell.label}</p>
              </div>
              <input type="hidden" name="period" value={cell.period} />
              <Field label="Actual" error={errors.value}>
                <Input name="value" inputMode="decimal" defaultValue={cell.value ?? ""} autoFocus placeholder="Enter value" />
              </Field>
              <Field label="Note (optional)">
                <Input name="note" placeholder="Context for this period" />
              </Field>
              <SubmitButton pending={pending} size="sm">
                Save
              </SubmitButton>
            </div>
          )}
        </InlineForm>
      </PopoverContent>
    </Popover>
  );
}
