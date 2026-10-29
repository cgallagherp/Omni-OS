// URL state for the intelligence modules: period, comparison and filters. Filter keys are
// whitelisted against the company's governed dimensions before they reach a query.
import { addMonths, parsePeriod, periodOf, type Grain, type Period } from "./period";
import type { DataStatus } from "./contracts";
import type { Dimension, Filters } from "./source";

export type SearchParams = Record<string, string | string[] | undefined>;

export interface ViewQuery {
  grain: Grain;
  end: string;
  period: Period;
  filters: Filters;
  /** active filters with labels, for chips */
  chips: Array<{ key: string; label: string; values: Array<{ key: string; label: string }> }>;
  compare: "prior" | "year";
}

export function parseFilters(sp: SearchParams, dims: Dimension[]): Filters {
  const out: Filters = {};
  const attr: Record<string, string[]> = {};
  for (const d of dims) {
    const raw = sp[`f_${d.key}`];
    const v = (Array.isArray(raw) ? raw.join(",") : raw ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 50);
    if (!v.length) continue;
    const allowed = d.values.length ? v.filter((x) => d.values.some((y) => y.key === x)) : v;
    if (!allowed.length) continue;
    if (d.key.startsWith("attr:")) attr[d.key.slice(5)] = allowed;
    else out[d.key] = allowed;
  }
  if (Object.keys(attr).length) out.attr = attr;
  return out;
}

export function viewQuery(sp: SearchParams, dims: Dimension[], coverage: { start: string; end: string }, fyStart: number, defaultGrain: Grain = "month"): ViewQuery {
  const { grain, end } = parsePeriod(sp, coverage.end, defaultGrain, coverage.start);
  const filters = parseFilters(sp, dims);
  const chips = dims
    .map((d) => {
      const v = d.key.startsWith("attr:") ? (filters.attr as Record<string, string[]> | undefined)?.[d.key.slice(5)] : (filters[d.key] as string[] | undefined);
      return v ? { key: d.key, label: d.label, values: v.map((k) => ({ key: k, label: d.values.find((x) => x.key === k)?.label ?? k })) } : null;
    })
    .filter(Boolean) as ViewQuery["chips"];
  return { grain, end, period: periodOf(grain, end, fyStart), filters, chips, compare: sp.cmp === "year" ? "year" : "prior" };
}

/** Serialise the current view (minus paging) for links that keep the user's context. */
export function keepParams(sp: SearchParams, drop: string[] = []): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || drop.includes(k)) continue;
    if (k === "g" || k === "end" || k === "cmp" || k.startsWith("f_")) q.set(k, Array.isArray(v) ? v.join(",") : v);
  }
  return q.toString();
}

const RANK: Record<DataStatus, number> = { validated: 0, provisional: 1, incomplete: 2, missing: 3 };
/** The weakest status across the months a figure depends on. */
export function statusOver(map: Map<string, { status: DataStatus; reason: string | null }>, months: string[]): { status: DataStatus; reasons: string[] } {
  let status: DataStatus = "validated";
  const reasons: string[] = [];
  for (const m of months) {
    const s = map.get(m);
    const st: DataStatus = s?.status ?? "missing";
    if (RANK[st] > RANK[status]) status = st;
    if (s?.reason && !reasons.includes(s.reason)) reasons.push(s.reason);
    if (!s && !reasons.includes("No data for one or more months")) reasons.push("No data for one or more months");
  }
  return { status, reasons };
}

/** The retention window ending at `end` (e.g. trailing 12 months). */
export const windowStart = (end: string, months: number) => addMonths(end, -months);
