// Cost Intelligence view models: governed GL and departmental people aggregates combined
// by the reference calculations in calc/cost.ts. Accounting and transaction processing
// stay in the finance system; this only reads what the governed layer publishes.
import type { Dataset, LedgerTotal, MetricDefinition, PeopleRow, Provenance } from "./contracts";
import { concentration, ebitdaBridge, gpBridgeByLine, gpBridgeVolumeMix, growth, lineLabel, peopleSummary, pl, runRate, variance, type PL, type Scenario, type ValueBridge } from "./calc/cost";
import { gbp } from "./calc/revenue";
import { addMonths, monthRange, periodOf, priorPeriod, yearAgo, type Period } from "./period";
import { statusOver } from "./query";
import type { AnalyticsSource, Dimension, Filters } from "./source";

export interface CostBase {
  src: AnalyticsSource;
  fyStart: number;
  coverage: { start: string; end: string };
  datasets: Dataset[];
  defs: Map<string, MetricDefinition>;
  dims: Dimension[];
  status: Awaited<ReturnType<AnalyticsSource["periodStatus"]>>;
  accounts: Awaited<ReturnType<AnalyticsSource["accounts"]>>;
  costCentres: Awaited<ReturnType<AnalyticsSource["costCentres"]>>;
  suppliers: Awaited<ReturnType<AnalyticsSource["suppliers"]>>;
  canPeople: boolean;
  canTransactions: boolean;
}

export async function loadCostBase(src: AnalyticsSource, fyStart: number): Promise<CostBase> {
  const [datasets, defs, dims, status, accounts, costCentres, suppliers, domains] = await Promise.all([
    src.datasets(), src.definitions(), src.dimensions("cost"), src.periodStatus("cost"), src.accounts(), src.costCentres(), src.suppliers(), src.domains(),
  ]);
  const months = [...status.keys()].sort();
  const gl = datasets.find((d) => d.key === "fct_gl_monthly");
  const coverage = { start: months[0] ?? gl?.coverage_start ?? "", end: months[months.length - 1] ?? gl?.coverage_end ?? "" };
  // the P&L line is a governed attribute of the chart of accounts
  const lines = [...new Set(accounts.map((a) => a.pl_line))];
  const dimsOut = [{ domain: "cost" as const, key: "line", label: "P&L line", values: lines.map((l) => ({ key: l, label: lineLabel(l) })) }, ...dims];
  return { src, fyStart, coverage, datasets, defs: new Map(defs.map((d) => [d.key, d])), dims: dimsOut, status, accounts, costCentres, suppliers, canPeople: domains.includes("people"), canTransactions: domains.includes("transactions") };
}

export function costProvenance(b: CostBase, metricKey: string, period: string, months: string[], drill?: string): Provenance {
  const def = b.defs.get(metricKey) ?? null;
  return {
    metric: def, period, dataset: b.datasets.find((d) => d.key === def?.source_dataset) ?? b.datasets.find((d) => d.key === "fct_gl_monthly") ?? null,
    status: statusOver(b.status, months).status, synthetic: b.src.info.is_synthetic, calcVersion: b.datasets[0]?.calc_version ?? "", drill,
  };
}

export const groupLabel = (b: CostBase, group: string, key: string) => {
  if (group === "supplier") return b.suppliers.find((s) => s.id === key)?.name ?? (key === "(none)" ? "No supplier" : key);
  if (group === "account") { const a = b.accounts.find((x) => x.code === key); return a ? `${a.code} ${a.name}` : key; }
  if (group === "cost_centre") { const c = b.costCentres.find((x) => x.code === key); return c ? `${c.code} ${c.name}` : key; }
  if (group === "line") return lineLabel(key);
  return key;
};

const inMonths = (rows: LedgerTotal[], months: string[]) => rows.filter((r) => months.includes(r.month));

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export interface CostKpi { key: string; label: string; value: number | null; unit: "currency" | "percent"; budget: number | null; forecast: number | null; prior: number | null; kind: "cost" | "income"; provenance: Provenance; href: string }

export async function costOverview(b: CostBase, period: Period, filters: Filters, compare: "prior" | "year", base: string) {
  const cmp = compare === "year" ? yearAgo(period, b.fyStart) : priorPeriod(period, b.fyStart);
  const from = cmp.start < period.start ? cmp.start : period.start;
  const [rows, behaviour, people] = await Promise.all([
    b.src.ledger(from, period.end, ["actual", "budget", "forecast"], null, filters),
    b.src.ledger(period.start, period.end, ["actual"], "behaviour", filters),
    b.canPeople ? b.src.people(period.start, period.end) : Promise.resolve([] as PeopleRow[]),
  ]);
  const cur = inMonths(rows, period.months), prev = inMonths(rows, cmp.months);
  const a = pl(cur, "actual"), bud = pl(cur, "budget"), fc = pl(cur, "forecast"), pr = pl(prev, "actual");
  const has = (s: Scenario) => cur.some((r) => r.scenario === s);
  const k = (key: string, label: string, f: (x: PL) => number | null, unit: CostKpi["unit"], kind: CostKpi["kind"], href: string): CostKpi => ({
    key, label, unit, kind, href, value: unitVal(f(a), unit), budget: has("budget") ? unitVal(f(bud), unit) : null, forecast: has("forecast") ? unitVal(f(fc), unit) : null,
    prior: prev.length ? unitVal(f(pr), unit) : null, provenance: costProvenance(b, key, period.label, period.months, href),
  });
  const kpis = [
    k("revenue", "Recognised revenue", (x) => x.revenue, "currency", "income", `${base}/analysis?group=line`),
    k("total_costs", "Total operating costs", (x) => x.totalCosts, "currency", "cost", `${base}/analysis`),
    k("gross_profit", "Gross profit", (x) => x.grossProfit, "currency", "income", `${base}/bridges`),
    k("gross_margin", "Gross margin", (x) => x.grossMargin, "percent", "income", `${base}/bridges`),
    k("ebitda", "EBITDA", (x) => x.ebitda, "currency", "income", `${base}/bridges?bridge=ebitda`),
    k("ebitda_margin", "EBITDA margin", (x) => x.ebitdaMargin, "percent", "income", `${base}/bridges?bridge=ebitda`),
  ];
  const fixedVariable = ["fixed", "semi_variable", "variable", "(not defined)"].map((key) => ({
    key, amount: gbp(behaviour.filter((r) => r.grp === key && r.section !== "revenue").reduce((s, r) => s + Math.round(r.amount * 100), 0)),
  }));
  // cost growth vs revenue growth over the same months a year earlier
  const ya = yearAgo(period, b.fyStart);
  const yaRows = ya.open >= b.coverage.start ? await b.src.ledger(ya.start, ya.end, ["actual"], null, filters) : [];
  const y = pl(yaRows, "actual");
  const growthVs = yaRows.length ? { revenue: growth(a.revenue, y.revenue), costs: growth(a.totalCosts, y.totalCosts), period: ya.label } : null;
  const ps = people.length ? peopleGbp(peopleSummary(people, period.months, a)) : null;
  return { period, compare: cmp, actual: a, budget: has("budget") ? bud : null, forecast: has("forecast") ? fc : null, prior: prev.length ? pr : null, kpis, fixedVariable, growthVs, people: ps };
}
const unitVal = (v: number | null, unit: "currency" | "percent") => (v === null ? null : unit === "currency" ? gbp(v) : v);
/** People summaries are computed in pence; present them in pounds. */
const peopleGbp = <T extends ReturnType<typeof peopleSummary>>(x: T): T => ({
  ...x, employmentCost: gbp(x.employmentCost), costPerFte: x.costPerFte === null ? null : gbp(x.costPerFte),
  revenuePerFte: x.revenuePerFte === null ? null : gbp(x.revenuePerFte), gpPerFte: x.gpPerFte === null ? null : gbp(x.gpPerFte),
});

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------
export async function costTrend(b: CostBase, end: string, months: number, filters: Filters = {}) {
  const ms = monthRange(addMonths(end, -(months - 1)), end).filter((m) => m >= b.coverage.start);
  const rows = await b.src.ledger(ms[0], end, ["actual", "budget", "forecast"], null, filters);
  const lines = [...new Set(rows.filter((r) => r.section !== "revenue").map((r) => r.line))];
  return {
    lines,
    points: ms.map((m) => {
      const r = rows.filter((x) => x.month === m);
      const a = pl(r, "actual"), bu = pl(r, "budget"), f = pl(r, "forecast");
      const byLine = Object.fromEntries(lines.map((l) => [l, gbp(a.lines[l] ?? 0)]));
      return {
        month: m, ...byLine, actual: gbp(a.totalCosts), budget: r.some((x) => x.scenario === "budget") ? gbp(bu.totalCosts) : null, forecast: r.some((x) => x.scenario === "forecast") ? gbp(f.totalCosts) : null,
        revenue: gbp(a.revenue), grossMargin: a.grossMargin, budgetGrossMargin: r.some((x) => x.scenario === "budget") ? bu.grossMargin : null, ebitda: gbp(a.ebitda), budgetEbitda: r.some((x) => x.scenario === "budget") ? gbp(bu.ebitda) : null,
        status: b.status.get(m)?.status ?? "missing",
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Variance analysis by any dimension
// ---------------------------------------------------------------------------
export interface VarianceLine { key: string; label: string; actual: number; budget: number | null; forecast: number | null; prior: number | null; yoy: number | null; runRate: number; budgetRunRate: number | null; variance: number | null; variancePct: number | null; favourable: boolean | null; share: number }

export async function costAnalysis(b: CostBase, period: Period, group: string, filters: Filters, opts: { includeRevenue?: boolean } = {}) {
  const prior = priorPeriod(period, b.fyStart), ya = yearAgo(period, b.fyStart);
  const from = [prior.start, ya.start, period.start].sort()[0];
  const rows = await b.src.ledger(from, period.end, ["actual", "budget", "forecast"], group === "line" ? null : group, filters);
  const costRows = rows.filter((r) => (opts.includeRevenue ? true : r.section !== "revenue"));
  const keyOf = (r: LedgerTotal) => (group === "line" ? r.line : r.grp);
  const sumP = (sel: LedgerTotal[]) => sel.reduce((s, r) => s + Math.round(r.amount * 100), 0);
  const keys = [...new Set(costRows.filter((r) => period.months.includes(r.month)).map(keyOf))];
  const hasBudget = costRows.some((r) => r.scenario === "budget" && period.months.includes(r.month));
  const hasForecast = costRows.some((r) => r.scenario === "forecast" && period.months.includes(r.month));
  const total = sumP(costRows.filter((r) => r.scenario === "actual" && period.months.includes(r.month)));
  const lastMonths = monthRange(addMonths(period.end, -2), period.end);
  const lines: VarianceLine[] = keys.map((k) => {
    const mine = costRows.filter((r) => keyOf(r) === k);
    const sel = (s: Scenario, ms: string[]) => sumP(mine.filter((r) => r.scenario === s && ms.includes(r.month)));
    const actual = sel("actual", period.months);
    const budget = hasBudget ? sel("budget", period.months) : null;
    const isRevenue = mine.some((r) => r.section === "revenue");
    const v = variance(k, actual, budget, isRevenue ? "income" : "cost", { forecast: hasForecast ? sel("forecast", period.months) : null, prior: sel("actual", prior.months) });
    const monthly = lastMonths.map((m) => sel("actual", [m]));
    const monthlyB = lastMonths.map((m) => sel("budget", [m]));
    return {
      key: k, label: groupLabel(b, group, k), actual: gbp(actual), budget: budget === null ? null : gbp(budget), forecast: v.forecast === null ? null : gbp(v.forecast),
      prior: gbp(v.prior ?? 0), yoy: ya.open >= b.coverage.start ? growth(actual, sel("actual", ya.months)) : null,
      runRate: gbp(runRate(monthly)), budgetRunRate: hasBudget ? gbp(runRate(monthlyB)) : null,
      variance: v.variance === null ? null : gbp(v.variance), variancePct: v.variancePct, favourable: v.favourable, share: total ? actual / total : 0,
    };
  }).sort((x, y) => y.actual - x.actual);
  return { period, prior, group, lines, hasBudget, hasForecast, total: gbp(total) };
}

/** Monthly actual vs budget for one dimension value (for the drill-down chart). */
export async function costSeries(b: CostBase, end: string, months: number, group: string | null, key: string | null, filters: Filters) {
  const ms = monthRange(addMonths(end, -(months - 1)), end).filter((m) => m >= b.coverage.start);
  const rows = await b.src.ledger(ms[0], end, ["actual", "budget", "forecast"], group, filters);
  const mine = rows.filter((r) => r.section !== "revenue" && (!key || (group === "line" ? r.line === key : r.grp === key)));
  const s = (m: string, sc: Scenario) => gbp(mine.filter((r) => r.month === m && r.scenario === sc).reduce((t, r) => t + Math.round(r.amount * 100), 0));
  return ms.map((m) => ({ month: m, actual: s(m, "actual"), budget: mine.some((r) => r.scenario === "budget" && r.month === m) ? s(m, "budget") : null, forecast: mine.some((r) => r.scenario === "forecast" && r.month === m) ? s(m, "forecast") : null, status: b.status.get(m)?.status ?? "missing" }));
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
export async function supplierAnalysis(b: CostBase, period: Period, filters: Filters) {
  const prior = priorPeriod(period, b.fyStart), ya = yearAgo(period, b.fyStart);
  const from = [prior.start, ya.start].sort()[0];
  const rows = (await b.src.ledger(from, period.end, ["actual", "budget"], "supplier", filters)).filter((r) => r.grp !== "(none)");
  const sumP = (sel: LedgerTotal[]) => sel.reduce((s, r) => s + Math.round(r.amount * 100), 0);
  const ids = [...new Set(rows.filter((r) => period.months.includes(r.month)).map((r) => r.grp))];
  const list = ids.map((id) => {
    const mine = rows.filter((r) => r.grp === id && r.scenario === "actual");
    const s = b.suppliers.find((x) => x.id === id);
    const cur = sumP(mine.filter((r) => period.months.includes(r.month)));
    const pr = sumP(mine.filter((r) => prior.months.includes(r.month)));
    const y = sumP(mine.filter((r) => ya.months.includes(r.month)));
    const budget = sumP(rows.filter((r) => r.grp === id && r.scenario === "budget" && period.months.includes(r.month)));
    return { id, name: s?.name ?? id, category: s?.category ?? "", origin: s?.origin ?? "organic", contractEnd: s?.contract_end ?? null, amount: cur, prior: pr, yearAgo: y, budget, change: growth(cur, pr), yoy: ya.open >= b.coverage.start ? growth(cur, y) : null, lines: [...new Set(mine.map((r) => r.line))] };
  }).sort((x, y) => y.amount - x.amount);
  const conc = concentration(list.map((x) => ({ key: x.id, amount: x.amount })));
  const byCategory = [...new Set(list.map((x) => x.category))].map((c) => ({ category: c, amount: gbp(list.filter((x) => x.category === c).reduce((s, x) => s + x.amount, 0)) })).sort((x, y) => y.amount - x.amount);
  return {
    period, prior,
    suppliers: list.map((x) => ({ ...x, amount: gbp(x.amount), prior: gbp(x.prior), yearAgo: gbp(x.yearAgo), budget: gbp(x.budget), share: conc.total ? x.amount / conc.total : 0 })),
    concentration: { total: gbp(conc.total), top1: conc.top1, top5: conc.top5, top10: conc.top10, hhi: conc.hhi },
    byCategory,
  };
}

// ---------------------------------------------------------------------------
// Bridges
// ---------------------------------------------------------------------------
export type BridgeBasis = "prior" | "year" | "budget";
export async function profitBridges(b: CostBase, period: Period, basis: BridgeBasis, filters: Filters) {
  const basePeriod = basis === "budget" ? period : basis === "year" ? yearAgo(period, b.fyStart) : priorPeriod(period, b.fyStart);
  const baseScenario: Scenario = basis === "budget" ? "budget" : "actual";
  const available = basePeriod.open >= addMonths(b.coverage.start, -1);
  const [cur, base, curP, baseP, curO, baseO] = await Promise.all([
    b.src.ledger(period.start, period.end, ["actual"], null, filters),
    available ? b.src.ledger(basePeriod.start, basePeriod.end, [baseScenario], null, filters) : Promise.resolve([] as LedgerTotal[]),
    b.src.ledger(period.start, period.end, ["actual"], "product", filters),
    available ? b.src.ledger(basePeriod.start, basePeriod.end, [baseScenario], "product", filters) : Promise.resolve([] as LedgerTotal[]),
    b.src.ledger(period.start, period.end, ["actual"], "origin", filters),
    available ? b.src.ledger(basePeriod.start, basePeriod.end, [baseScenario], "origin", filters) : Promise.resolve([] as LedgerTotal[]),
  ]);
  if (!base.length) return { period, basePeriod, basis, unavailable: basis === "budget" ? "No budget exists for these months." : "The comparison period is outside the governed data coverage." } as const;
  const pc = pl(cur, "actual"), pb = pl(base, baseScenario);
  const byLine: ValueBridge = gpBridgeByLine(pb, pc);
  const vm = gpBridgeVolumeMix(baseP, curP, baseScenario, "actual");
  const eb = ebitdaBridge(baseO, curO, baseScenario, "actual");
  return { period, basePeriod, basis, current: pc, base: pb, gpByLine: byLine, gpVolumeMix: vm, ebitda: eb, unavailable: null };
}

// ---------------------------------------------------------------------------
// People (aggregated)
// ---------------------------------------------------------------------------
export async function peopleView(b: CostBase, period: Period, trendMonths = 24) {
  const ms = monthRange(addMonths(period.end, -(trendMonths - 1)), period.end).filter((m) => m >= b.coverage.start);
  const ya = yearAgo(period, b.fyStart);
  const from = [ms[0], ya.start].sort()[0];
  const [people, rows] = await Promise.all([b.src.people(from, period.end), b.src.ledger(from, period.end, ["actual"], null, {})]);
  const plFor = (months: string[]) => pl(inMonths(rows, months), "actual");
  const total = peopleGbp(peopleSummary(people, period.months, plFor(period.months)));
  const prior = ya.open >= b.coverage.start ? peopleGbp(peopleSummary(people, ya.months, plFor(ya.months))) : null;
  const departments = [...new Set(people.map((r) => r.department))].map((d) => ({ department: d, ...peopleGbp(peopleSummary(people, period.months, null, d)) })).filter((d) => d.headcount > 0 || d.employmentCost > 0).sort((x, y) => y.employmentCost - x.employmentCost);
  const trend = ms.map((m) => {
    const ltm = monthRange(addMonths(m, -11), m).filter((x) => x >= b.coverage.start);
    const s = peopleGbp(peopleSummary(people, [m], plFor([m])));
    const l = peopleGbp(peopleSummary(people, ltm, plFor(ltm)));
    return { month: m, headcount: s.headcount, budgetHeadcount: s.budgetHeadcount, hires: s.hires, plannedHires: s.plannedHires, revenuePerFte: ltm.length === 12 ? l.revenuePerFte : null, gpPerFte: ltm.length === 12 ? l.gpPerFte : null, costPct: s.employmentCostPct };
  });
  return { period, total, prior, departments, trend, ltmLabel: periodOf("ltm", period.end, b.fyStart).label };
}
