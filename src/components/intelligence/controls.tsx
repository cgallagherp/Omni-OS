"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark, ChevronDown, Download, Filter, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormDialog, useQuickAction } from "@/components/os/forms";
import { deleteView, saveView } from "@/lib/actions/intelligence";
import { GRAIN_LABEL, monthLabel, type Grain } from "@/lib/analytics/period";
import { cn } from "@/lib/utils";

function useUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>, drop: string[] = ["page"]) => {
    const q = new URLSearchParams(sp.toString());
    for (const k of drop) q.delete(k);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, v);
    }
    start(() => router.push(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false }));
  };
  return { sp, set, pending, pathname };
}

const sel = "h-8 rounded-md border bg-card px-2 text-[13px] font-medium shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Reporting period (grain + end month) and comparison basis. */
export function PeriodControls({ grains, grain, end, months, compare, showCompare = true }: { grains: Grain[]; grain: Grain; end: string; months: string[]; compare?: "prior" | "year"; showCompare?: boolean }) {
  const { set, pending } = useUrl();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Period" className="flex rounded-md border bg-card p-0.5 shadow-xs">
        {grains.map((g) => (
          <button key={g} role="radio" aria-checked={g === grain} onClick={() => set({ g })} className={cn("h-7 rounded px-2.5 text-[12.5px] font-medium", g === grain ? "bg-brand-subtle text-brand-ink" : "text-muted-foreground hover:text-foreground")}>
            {GRAIN_LABEL[g].replace("Last 12 months", "LTM").replace("Year to date", "YTD").replace("Financial year", "Year")}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="period-end">Period ending</label>
      <select id="period-end" className={sel} value={end.slice(0, 7)} onChange={(e) => set({ end: e.target.value })}>
        {months.map((m) => (
          <option key={m} value={m.slice(0, 7)}>
            {grain === "month" ? monthLabel(m, true) : `to ${monthLabel(m, true)}`}
          </option>
        ))}
      </select>
      {showCompare && (
        <>
          <label className="sr-only" htmlFor="period-cmp">Compare with</label>
          <select id="period-cmp" className={sel} value={compare ?? "prior"} onChange={(e) => set({ cmp: e.target.value === "prior" ? null : e.target.value })}>
            <option value="prior">vs prior period</option>
            <option value="year">vs same period last year</option>
          </select>
        </>
      )}
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
    </div>
  );
}

export interface DimOption { key: string; label: string; values: Array<{ key: string; label: string }> }

/** Multi-dimension filters held in the URL (?f_<dimension>=a,b). */
export function FilterBar({ dims, active }: { dims: DimOption[]; active: Array<{ key: string; label: string; values: Array<{ key: string; label: string }> }> }) {
  const { sp, set } = useUrl();
  const [open, setOpen] = useState<string | null>(null);
  const current = (k: string) => (sp.get(`f_${k}`) ?? "").split(",").filter(Boolean);
  const toggle = (k: string, v: string) => {
    const cur = current(k);
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    set({ [`f_${k}`]: next.join(",") || null });
  };
  const usable = dims.filter((d) => d.values.length > 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter /> Filters{active.length ? ` (${active.reduce((s, a) => s + a.values.length, 0)})` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-h-[70vh] w-80 overflow-y-auto p-0">
          {usable.map((d) => (
            <div key={d.key} className="border-b last:border-0">
              <button className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-medium hover:bg-accent" onClick={() => setOpen(open === d.key ? null : d.key)} aria-expanded={open === d.key}>
                {d.label}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {current(d.key).length || ""}
                  <ChevronDown className={cn("size-3.5 transition-transform", open === d.key && "rotate-180")} />
                </span>
              </button>
              {open === d.key && (
                <ul className="space-y-1 px-3 pb-2">
                  {d.values.map((v) => (
                    <li key={v.key}>
                      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                        <Checkbox checked={current(d.key).includes(v.key)} onCheckedChange={() => toggle(d.key, v.key)} />
                        {v.label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </PopoverContent>
      </Popover>
      {active.map((c) => (
        <span key={c.key} className="inline-flex h-7 items-center gap-1 rounded-md border bg-brand-subtle px-2 text-xs text-brand-ink">
          <span className="font-medium">{c.label}:</span> {c.values.map((v) => v.label).join(", ")}
          <button aria-label={`Clear ${c.label}`} className="rounded hover:bg-background/60" onClick={() => set({ [`f_${c.key}`]: null })}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      {active.length > 1 && (
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => set(Object.fromEntries(active.map((c) => [`f_${c.key}`, null])))}>
          Clear all
        </button>
      )}
    </div>
  );
}

/** A select that sets one URL parameter (grouping, dimension, basis…). */
export function ParamSelect({ name, value, options, label }: { name: string; value: string; options: Array<{ value: string; label: string }>; label: string }) {
  const { set } = useUrl();
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select className={sel} value={value} onChange={(e) => set({ [name]: e.target.value })}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchBox({ placeholder }: { placeholder: string }) {
  const { sp, set } = useUrl();
  const [q, setQ] = useState(sp.get("q") ?? "");
  return (
    <form onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || null }); }} className="flex items-center gap-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-8 w-56" aria-label={placeholder} />
    </form>
  );
}

/** Save the current view (period, filters, grouping) for yourself or the company. */
export function SavedViews({ companyId, module, path, views }: { companyId: string; module: "revenue" | "cost"; path: string; views: Array<{ id: string; name: string; path: string; params: string; shared: boolean; mine: boolean }> }) {
  const { sp } = useUrl();
  const { run } = useQuickAction();
  return (
    <div className="flex items-center gap-1">
      {views.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <Bookmark /> Views
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1">
            {views.map((v) => (
              <div key={v.id} className="flex items-center gap-1 rounded hover:bg-accent">
                <Link href={`${v.path}${v.params ? `?${v.params}` : ""}`} className="flex-1 truncate px-2 py-1.5 text-[13px]">
                  {v.name}
                  {v.shared && <span className="ml-1 text-[11px] text-muted-foreground">shared</span>}
                </Link>
                {v.mine && (
                  <button aria-label={`Delete ${v.name}`} className="p-1.5 text-muted-foreground hover:text-foreground" onClick={() => run(() => deleteView(companyId, v.id))}>
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </PopoverContent>
        </Popover>
      )}
      <FormDialog
        title="Save this view"
        description="Saves the period, comparison, filters and grouping currently applied."
        submitLabel="Save view"
        action={(fd) => saveView(companyId, fd)}
        trigger={
          <Button variant="ghost" size="sm">
            <Bookmark /> Save view
          </Button>
        }
      >
        <input type="hidden" name="module" value={module} />
        <input type="hidden" name="path" value={path} />
        <input type="hidden" name="params" value={sp.toString()} />
        <label className="grid gap-1 text-sm">
          Name
          <Input name="name" required maxLength={80} placeholder="e.g. Police retention, quarterly" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="shared" /> Share with everyone who can see this module
        </label>
      </FormDialog>
    </div>
  );
}

export function ExportButton({ href, label = "Export CSV" }: { href: string; label?: string }) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <a href={href} download>
        <Download /> {label}
      </a>
    </Button>
  );
}

/** Switch between a chart and the table behind it. */
export function ChartOrTable({ chart, table, initial = "chart" }: { chart: React.ReactNode; table: React.ReactNode; initial?: "chart" | "table" }) {
  const [view, setView] = useState(initial);
  return (
    <div>
      <div role="radiogroup" aria-label="Display" className="mb-2 flex justify-end">
        <div className="flex rounded-md border p-0.5">
          {(["chart", "table"] as const).map((v) => (
            <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cn("h-6 rounded px-2 text-[11.5px] font-medium capitalize", view === v ? "bg-accent text-foreground" : "text-muted-foreground")}>
              {v}
            </button>
          ))}
        </div>
      </div>
      {view === "chart" ? chart : table}
    </div>
  );
}
