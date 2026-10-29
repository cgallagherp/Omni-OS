// Revenue Intelligence view models. Everything shown in the module and everything the
// agents read comes from here: governed aggregates from the AnalyticsSource, combined only
// by the tested reference calculations in calc/revenue.ts.
import { MOVEMENT_TYPES, retentionPolicy, type Dataset, type MetricDefinition, type MovementTotal, type MovementType, type Provenance, type RetentionPolicy } from "./contracts";
import { bridge, gbp, organicGrowth, p, retention, sumByType, type Bridge, type Retention } from "./calc/revenue";
import { addMonths, monthRange, periodOf, periodSeries, priorPeriod, yearAgo, type Grain, type Period } from "./period";
import { statusOver } from "./query";
import type { AnalyticsSource, Dimension, Filters } from "./source";

export interface RevenueBase {
  src: AnalyticsSource;
  fyStart: number;
  coverage: { start: string; end: string };
  datasets: Dataset[];
  defs: Map<string, MetricDefinition>;
  dims: Dimension[];
  status: Awaited<ReturnType<AnalyticsSource["periodStatus"]>>;
  policy: RetentionPolicy;
  products: Array<{ key: string; name: string; business_unit: string }>;
}

export async function loadRevenueBase(src: AnalyticsSource, fyStart: number): Promise<RevenueBase> {
  const [datasets, defs, dims, status, products] = await Promise.all([src.datasets(), src.definitions(), src.dimensions("revenue"), src.periodStatus("revenue"), src.products()]);
  const arr = datasets.find((d) => d.key === "fct_arr_monthly");
  const coverage = { start: arr?.coverage_start ?? addMonths(new Date().toISOString().slice(0, 7) + "-01", -24), end: arr?.coverage_end ?? new Date().toISOString().slice(0, 7) + "-01" };
  const defMap = new Map(defs.map((d) => [d.key, d]));
  const policy = retentionPolicy.parse(defMap.get("nrr")?.policy ?? {});
  // product values come from the governed product list
  const dimsOut = dims.map((d) => (d.key === "product" && !d.values.length ? { ...d, values: products.map((x) => ({ key: x.key, label: x.name })) } : d));
  return { src, fyStart, coverage, datasets, defs: defMap, dims: dimsOut, status, policy, products };
}

export function provenance(b: RevenueBase, metricKey: string, period: string, months: string[], drill?: string): Provenance {
  const def = b.defs.get(metricKey) ?? null;
  const st = statusOver(b.status, months);
  return {
    metric: def, period, dataset: b.datasets.find((d) => d.key === def?.source_dataset) ?? b.datasets.find((d) => d.key === "fct_arr_movements") ?? null,
    status: st.status, synthetic: b.src.info.is_synthetic, calcVersion: b.datasets[0]?.calc_version ?? "", drill,
  };
}

// ---------------------------------------------------------------------------
// Bridges
// ---------------------------------------------------------------------------
export interface PeriodBridge { period: Period; bridge: Bridge; status: ReturnType<typeof statusOver>; customers: Partial<Record<MovementType, number>> }

function bridgeFor(period: Period, opening: number, closing: number, rows: MovementTotal[]): Omit<PeriodBridge, "status"> {
  const sel = rows.filter((r) => r.month > period.open && r.month <= period.end);
  const customers: Partial<Record<MovementType, number>> = {};
  for (const r of sel) customers[r.type] = (customers[r.type] ?? 0) + r.customers;
  return { period, bridge: bridge(p(opening), sumByType(sel), p(closing)), customers };
}

/** Bridges for a series of consecutive periods from one movement query and one ARR query. */
export async function bridgeSeries(b: RevenueBase, periods: Period[], filters: Filters = {}): Promise<PeriodBridge[]> {
  if (!periods.length) return [];
  const from = periods[0].open, to = periods[periods.length - 1].end;
  const boundaries = [...new Set(periods.flatMap((x) => [x.open, x.end]))];
  const [mv, at] = await Promise.all([b.src.movements(from, to, filters), b.src.arrAt(boundaries, filters, null, from)]);
  const arrAt = (m: string) => at.filter((r) => r.month === m).reduce((s, r) => s + r.arr, 0);
  return periods.map((per) => ({ ...bridgeFor(per, arrAt(per.open), arrAt(per.end), mv), status: statusOver(b.status, per.months) }));
}

export async function bridgeBySegment(b: RevenueBase, period: Period, group: string, filters: Filters = {}) {
  const [mv, at] = await Promise.all([b.src.movements(period.open, period.end, filters, group), b.src.arrAt([period.open, period.end], filters, group, period.open)]);
  const groups = new Set([...mv.map((r) => r.grp), ...at.map((r) => r.grp)]);
  return [...groups].map((g) => {
    const o = at.find((r) => r.grp === g && r.month === period.open)?.arr ?? 0;
    const c = at.find((r) => r.grp === g && r.month === period.end)?.arr ?? 0;
    return { grp: g, ...bridgeFor(period, o, c, mv.filter((r) => r.grp === g)) };
  }).sort((x, y) => y.bridge.closing - x.bridge.closing);
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------
export interface RetentionPoint { end: string; start: string; ret: Retention; status: ReturnType<typeof statusOver> }

export async function retentionAt(b: RevenueBase, end: string, filters: Filters = {}, group: string | null = null, windowMonths = b.policy.window_months) {
  const start = addMonths(end, -windowMonths);
  const rows = await b.src.retention(start, end, filters, group, b.policy.acquired_wait_months);
  return rows.map((r) => ({ grp: r.grp, inputs: r, ret: retention(r, b.policy), start, end }));
}

/** Monthly (or quarterly) series of trailing-window retention. */
export async function retentionTrend(b: RevenueBase, ends: string[], filters: Filters = {}, windowMonths = b.policy.window_months): Promise<RetentionPoint[]> {
  const valid = ends.filter((e) => addMonths(e, -windowMonths) >= b.coverage.start);
  const out = await Promise.all(valid.map(async (end) => {
    const [r] = await retentionAt(b, end, filters, null, windowMonths);
    return r ? { end, start: r.start, ret: r.ret, status: statusOver(b.status, monthRange(addMonths(r.start, 1), end)) } : null;
  }));
  return out.filter(Boolean) as RetentionPoint[];
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  unit: "currency" | "percent";
  compare: { label: string; value: number | null } | null;
  target: { label: string; value: number | null } | null;
  direction: "higher_is_better" | "lower_is_better" | "neutral";
  provenance: Provenance;
  href: string;
}

export async function revenueOverview(b: RevenueBase, period: Period, filters: Filters, compare: "prior" | "year", base: string) {
  const cmp = compare === "year" ? yearAgo(period, b.fyStart) : priorPeriod(period, b.fyStart);
  const ltm = periodOf("ltm", period.end, b.fyStart);
  const covered = (x: Period) => x.open >= b.coverage.start;
  const [[curF], prevS, ltmS, retNow, retPrev, arrBudget, grrT, nrrT] = await Promise.all([
    bridgeSeries(b, [period], filters),
    covered(cmp) ? bridgeSeries(b, [cmp], filters) : Promise.resolve([] as PeriodBridge[]),
    covered(ltm) ? bridgeSeries(b, [ltm], filters) : Promise.resolve([] as PeriodBridge[]),
    retentionAt(b, period.end, filters),
    addMonths(period.end, -12 - b.policy.window_months) >= b.coverage.start ? retentionAt(b, addMonths(period.end, -12), filters) : Promise.resolve([]),
    b.src.targets("arr_total"),
    b.src.targets("grr"),
    b.src.targets("nrr"),
  ]);
  const prevF: PeriodBridge | undefined = prevS[0];
  const ltmB: PeriodBridge | undefined = ltmS[0];
  const r0 = retNow[0]?.ret, r1 = retPrev[0]?.ret;
  const cmpLabel = compare === "year" ? "Same period last year" : "Prior period";
  const kpi = (key: string, label: string, value: number | null, unit: Kpi["unit"], cmpV: number | null, extra: Partial<Kpi> = {}, months = period.months, periodLabel = period.label): Kpi => ({
    key, label, value, unit, compare: { label: cmpLabel, value: cmpV }, target: null, direction: b.defs.get(key)?.direction ?? "higher_is_better",
    provenance: provenance(b, key, periodLabel, months, extra.href), href: extra.href ?? base, ...extra,
  });
  const t = (bb: PeriodBridge | undefined, type: MovementType) => (bb ? gbp(bb.bridge.items.find((i) => i.type === type)!.amount) : null);
  const budget = Object.keys(filters).length ? null : (arrBudget.get(period.end)?.budget ?? null);
  const kpis: Kpi[] = [
    kpi("arr_total", "Total ARR", gbp(curF.bridge.closing), "currency", prevF ? gbp(prevF.bridge.closing) : null, { target: { label: "Budget", value: budget }, href: `${base}/bridge` }, [period.end], `At ${period.end.slice(0, 7)}`),
    kpi("arr_organic_growth", "Organic ARR growth (LTM)", ltmB ? organicGrowth(ltmB.bridge) : null, "percent", null, { href: `${base}/bridge?g=ltm` }, ltm.months, ltm.label),
    kpi("grr", "Gross Revenue Retention", r0?.grr ?? null, "percent", r1?.grr ?? null, { compare: { label: "A year earlier", value: r1?.grr ?? null }, target: { label: "Target", value: grrT.get(period.end)?.target ?? null }, href: `${base}/retention` }, monthRange(addMonths(period.end, -11), period.end), `${b.policy.window_months} months to ${period.end.slice(0, 7)}`),
    kpi("nrr", "Net Revenue Retention", r0?.nrr ?? null, "percent", r1?.nrr ?? null, { compare: { label: "A year earlier", value: r1?.nrr ?? null }, target: { label: "Target", value: nrrT.get(period.end)?.target ?? null }, href: `${base}/retention` }, monthRange(addMonths(period.end, -11), period.end), `${b.policy.window_months} months to ${period.end.slice(0, 7)}`),
    ...(["new", "expansion", "contraction", "churn", "reactivation", "acquired"] as const).map((type) =>
      kpi(`arr_${type === "churn" ? "churn" : type}`, { new: "New ARR", expansion: "Expansion ARR", contraction: "Contraction ARR", churn: "Churned ARR", reactivation: "Reactivation ARR", acquired: "Acquired ARR" }[type], t(curF, type), "currency", t(prevF, type), { href: `${base}/bridge?drill=${type}` })),
  ];
  return { period, compare: cmp, kpis, bridge: curF, ltm: ltmB ?? null, retention: r0 ?? null };
}

export async function arrTrend(b: RevenueBase, end: string, months: number, filters: Filters = {}) {
  const ms = monthRange(addMonths(end, -(months - 1)), end).filter((m) => m >= b.coverage.start);
  const [byOrigin, budget, mv] = await Promise.all([b.src.arrAt(ms, filters, "origin", ms[0]), b.src.targets("arr_total"), b.src.movements(addMonths(ms[0], -1), end, filters)]);
  return ms.map((m) => {
    const rows = byOrigin.filter((r) => r.month === m);
    const sel = mv.filter((r) => r.month === m);
    const sum = (types: MovementType[]) => gbp(sel.filter((r) => types.includes(r.type)).reduce((s, r) => s + p(r.amount), 0));
    return {
      month: m,
      organic: rows.filter((r) => r.grp === "organic").reduce((s, r) => s + r.arr, 0),
      acquired: rows.filter((r) => r.grp !== "organic").reduce((s, r) => s + r.arr, 0),
      budget: Object.keys(filters).length ? null : (budget.get(m)?.budget ?? null),
      new: sum(["new"]), expansion: sum(["expansion"]), reactivation: sum(["reactivation"]),
      contraction: sum(["contraction"]), churn: sum(["churn"]), acquiredMove: sum(["acquired", "disposed"]),
      adjustments: sum(["migration", "transfer", "correction", "reclassification", "unclassified"]),
      status: b.status.get(m)?.status ?? "missing",
    };
  });
}

export const BRIDGE_GRAINS: Grain[] = ["month", "quarter", "year"];
export function bridgePeriods(b: RevenueBase, grain: Grain, end: string, count = 12) {
  return periodSeries(grain === "ytd" || grain === "ltm" ? "month" : grain, end, count, b.fyStart, b.coverage.start).filter((x) => x.open >= b.coverage.start);
}

export { MOVEMENT_TYPES };
