// Deterministic reference calculations for costs and profitability, from governed GL
// aggregates. Integer pence throughout; every bridge sums exactly to its movement.
import type { LedgerTotal, PeopleRow } from "../contracts";
import { p } from "./revenue";

export type Scenario = "actual" | "budget" | "forecast";

export const PL_LINE_LABEL: Record<string, string> = {
  recurring_revenue: "Recurring revenue",
  services_revenue: "Services revenue",
  other_revenue: "Other revenue",
  hosting: "Hosting and infrastructure",
  direct_labour: "Direct labour",
  third_party_delivery: "Third-party delivery",
  licences_cogs: "Third-party licences",
  other_direct: "Other direct costs",
  people: "People costs",
  sales_marketing: "Sales and marketing",
  technology: "Technology",
  g_and_a: "General and administrative",
  property: "Property and facilities",
  other_opex: "Other operating costs",
};
export const lineLabel = (l: string) => PL_LINE_LABEL[l] ?? l.replace(/_/g, " ");

export interface PL {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number | null;
  opex: number;
  ebitda: number;
  ebitdaMargin: number | null;
  /** total operating costs = cost of sales + operating expenses */
  totalCosts: number;
  lines: Record<string, number>;
  revenueLines: Record<string, number>;
  cogsLines: Record<string, number>;
  opexLines: Record<string, number>;
}

export function pl(rows: LedgerTotal[], scenario: Scenario, filter?: (r: LedgerTotal) => boolean): PL {
  const lines: Record<string, number> = {};
  const by = { revenue: {} as Record<string, number>, cogs: {} as Record<string, number>, opex: {} as Record<string, number> };
  let revenue = 0, cogs = 0, opex = 0;
  for (const r of rows) {
    if (r.scenario !== scenario || (filter && !filter(r))) continue;
    const v = p(r.amount);
    lines[r.line] = (lines[r.line] ?? 0) + v;
    if (r.section === "revenue") { revenue += v; by.revenue[r.line] = (by.revenue[r.line] ?? 0) + v; }
    else if (r.section === "cogs") { cogs += v; by.cogs[r.line] = (by.cogs[r.line] ?? 0) + v; }
    else if (r.section === "opex") { opex += v; by.opex[r.line] = (by.opex[r.line] ?? 0) + v; }
  }
  const gp = revenue - cogs;
  const ebitda = gp - opex;
  return {
    revenue, cogs, grossProfit: gp, grossMargin: revenue ? gp / revenue : null, opex, ebitda, ebitdaMargin: revenue ? ebitda / revenue : null,
    totalCosts: cogs + opex, lines, revenueLines: by.revenue, cogsLines: by.cogs, opexLines: by.opex,
  };
}

export const hasScenario = (rows: LedgerTotal[], s: Scenario) => rows.some((r) => r.scenario === s);

// ---------------------------------------------------------------------------
// Bridges
// ---------------------------------------------------------------------------
export interface BridgeStep { key: string; label: string; amount: number; group: "revenue" | "cost" | "mix" | "acquisition" | "rounding" }
export interface ValueBridge { from: number; to: number; steps: BridgeStep[]; reconciles: boolean; unavailable: Array<{ key: string; label: string; reason: string }> }

const close = (from: number, to: number, steps: BridgeStep[], unavailable: ValueBridge["unavailable"]): ValueBridge => {
  const sum = from + steps.reduce((s, x) => s + x.amount, 0);
  return { from, to, steps, reconciles: sum === to, unavailable };
};

const PRICING_UNAVAILABLE = { key: "pricing", label: "Pricing", reason: "Needs price and volume data (units and price per unit) from billing, which the governed data does not yet provide. No price effect is estimated." };

/**
 * Gross profit bridge by line: revenue change, then the change in each direct cost line.
 * Always exact; no allocation is assumed.
 */
export function gpBridgeByLine(base: PL, cur: PL): ValueBridge {
  const steps: BridgeStep[] = [];
  const rl = new Set([...Object.keys(base.revenueLines), ...Object.keys(cur.revenueLines)]);
  for (const l of [...rl].sort()) {
    const d = (cur.revenueLines[l] ?? 0) - (base.revenueLines[l] ?? 0);
    if (d) steps.push({ key: l, label: lineLabel(l), amount: d, group: "revenue" });
  }
  const cl = new Set([...Object.keys(base.cogsLines), ...Object.keys(cur.cogsLines)]);
  for (const l of [...cl].sort()) {
    const d = (cur.cogsLines[l] ?? 0) - (base.cogsLines[l] ?? 0);
    if (d) steps.push({ key: l, label: lineLabel(l), amount: -d, group: "cost" });
  }
  return close(base.grossProfit, cur.grossProfit, steps, [PRICING_UNAVAILABLE]);
}

/**
 * Volume / mix / cost-rate decomposition. Only available when every product has revenue in
 * both periods and every direct cost is allocated to a product; otherwise it says why.
 * ΔGP = ΔR·m₀ + R₁·Σ(s₁−s₀)m₀ + R₁·Σ s₁(m₁−m₀), with the last term split by cost line.
 */
export function gpBridgeVolumeMix(base: LedgerTotal[], cur: LedgerTotal[], scenarioBase: Scenario, scenarioCur: Scenario): ValueBridge | { unavailable: string } {
  type P = { rev: number; cost: Record<string, number> };
  const collect = (rows: LedgerTotal[], s: Scenario) => {
    const m = new Map<string, P>();
    let unallocated = 0;
    for (const r of rows) {
      if (r.scenario !== s || (r.section !== "revenue" && r.section !== "cogs")) continue;
      if (r.grp === "(unallocated)") { if (r.section === "cogs") unallocated += p(r.amount); continue; }
      const x = m.get(r.grp) ?? { rev: 0, cost: {} };
      if (r.section === "revenue") x.rev += p(r.amount);
      else x.cost[r.line] = (x.cost[r.line] ?? 0) + p(r.amount);
      m.set(r.grp, x);
    }
    return { m, unallocated };
  };
  const b = collect(base, scenarioBase), c = collect(cur, scenarioCur);
  if (b.unallocated || c.unallocated) return { unavailable: "Some direct costs are not allocated to a product in the governed data, so a mix analysis would rest on an allocation Omni OS would have to invent." };
  const products = new Set([...b.m.keys(), ...c.m.keys()]);
  for (const k of products) if (!(b.m.get(k)?.rev && c.m.get(k)?.rev)) return { unavailable: `Product "${k}" has no revenue in one of the periods; a mix effect would not be meaningful.` };
  const R0 = [...b.m.values()].reduce((s, x) => s + x.rev, 0), R1 = [...c.m.values()].reduce((s, x) => s + x.rev, 0);
  const gp = (x: P) => x.rev - Object.values(x.cost).reduce((s, v) => s + v, 0);
  const GP0 = [...b.m.values()].reduce((s, x) => s + gp(x), 0), GP1 = [...c.m.values()].reduce((s, x) => s + gp(x), 0);
  const m0 = GP0 / R0;
  const volume = (R1 - R0) * m0;
  let mix = 0;
  const rate: Record<string, number> = {};
  for (const k of products) {
    const x0 = b.m.get(k)!, x1 = c.m.get(k)!;
    const s0 = x0.rev / R0, s1 = x1.rev / R1;
    mix += R1 * (s1 - s0) * (gp(x0) / x0.rev);
    const lines = new Set([...Object.keys(x0.cost), ...Object.keys(x1.cost)]);
    for (const l of lines) rate[l] = (rate[l] ?? 0) - R1 * s1 * ((x1.cost[l] ?? 0) / x1.rev - (x0.cost[l] ?? 0) / x0.rev);
  }
  const steps: BridgeStep[] = [
    { key: "volume", label: "Revenue growth at prior margin", amount: Math.round(volume), group: "revenue" },
    { key: "mix", label: "Product mix", amount: Math.round(mix), group: "mix" },
    ...Object.entries(rate).sort().map(([l, v]) => ({ key: l, label: `${lineLabel(l)} (cost rate)`, amount: Math.round(v), group: "cost" as const })),
  ];
  const residual = GP1 - GP0 - steps.reduce((s, x) => s + x.amount, 0);
  if (residual) steps.push({ key: "rounding", label: "Rounding", amount: residual, group: "rounding" });
  return close(GP0, GP1, steps, [PRICING_UNAVAILABLE]);
}

/**
 * EBITDA bridge: organic gross profit and organic operating-cost lines, then the
 * combined change from acquired (or disposed) entities as its own step — nothing is
 * counted twice because every ledger row belongs to exactly one step.
 */
export function ebitdaBridge(base: LedgerTotal[], cur: LedgerTotal[], scenarioBase: Scenario, scenarioCur: Scenario): ValueBridge {
  const organic = (r: LedgerTotal) => r.grp === "organic";
  const b = pl(base, scenarioBase, organic), c = pl(cur, scenarioCur, organic);
  const bAll = pl(base, scenarioBase), cAll = pl(cur, scenarioCur);
  const steps: BridgeStep[] = [{ key: "gross_profit", label: "Gross profit (organic)", amount: c.grossProfit - b.grossProfit, group: "revenue" }];
  const ol = new Set([...Object.keys(b.opexLines), ...Object.keys(c.opexLines)]);
  for (const l of [...ol].sort()) {
    const d = (c.opexLines[l] ?? 0) - (b.opexLines[l] ?? 0);
    if (d) steps.push({ key: l, label: lineLabel(l), amount: -d, group: "cost" });
  }
  const acq = cAll.ebitda - c.ebitda - (bAll.ebitda - b.ebitda);
  if (acq) steps.push({ key: "acquisitions", label: "Acquisitions and disposals", amount: acq, group: "acquisition" });
  return close(bAll.ebitda, cAll.ebitda, steps, []);
}

// ---------------------------------------------------------------------------
// Variance, run-rate, concentration
// ---------------------------------------------------------------------------
export interface VarianceRow { key: string; actual: number; budget: number | null; forecast: number | null; prior: number | null; variance: number | null; variancePct: number | null; favourable: boolean | null }

/** For costs, spending less than budget is favourable; for revenue and profit, more. */
export function variance(key: string, actual: number, budget: number | null, kind: "cost" | "income", extra: { forecast?: number | null; prior?: number | null } = {}): VarianceRow {
  const v = budget === null ? null : actual - budget;
  return {
    key, actual, budget, forecast: extra.forecast ?? null, prior: extra.prior ?? null, variance: v,
    variancePct: budget ? (actual - budget) / Math.abs(budget) : null,
    favourable: v === null || v === 0 ? null : kind === "cost" ? v < 0 : v > 0,
  };
}

export const growth = (cur: number, prev: number) => (prev ? (cur - prev) / Math.abs(prev) : null);

/** Annualised run-rate from the average of the last `n` monthly values. */
export function runRate(monthly: number[], n = 3) {
  const last = monthly.slice(-n);
  return last.length ? Math.round((last.reduce((s, v) => s + v, 0) / last.length) * 12) : 0;
}

export function concentration(values: Array<{ key: string; amount: number }>) {
  const total = values.reduce((s, v) => s + Math.max(v.amount, 0), 0);
  const sorted = [...values].sort((a, b) => b.amount - a.amount);
  const share = (n: number) => (total ? sorted.slice(0, n).reduce((s, v) => s + Math.max(v.amount, 0), 0) / total : null);
  const hhi = total ? sorted.reduce((s, v) => s + (Math.max(v.amount, 0) / total) ** 2, 0) * 10000 : null;
  return { total, top1: share(1), top5: share(5), top10: share(10), hhi: hhi === null ? null : Math.round(hhi), sorted };
}

// ---------------------------------------------------------------------------
// People (departmental aggregates only)
// ---------------------------------------------------------------------------
export interface PeopleSummary {
  employmentCost: number;
  headcount: number;
  fte: number;
  avgFte: number;
  budgetHeadcount: number | null;
  costPerFte: number | null;      // annualised
  revenuePerFte: number | null;   // annualised
  gpPerFte: number | null;        // annualised
  employmentCostPct: number | null;
  hires: number;
  plannedHires: number | null;
  leavers: number;
  openRoles: number;
}

export function peopleSummary(rows: PeopleRow[], months: string[], plActual: PL | null, department?: string): PeopleSummary {
  const sel = rows.filter((r) => months.includes(r.month) && (!department || r.department === department));
  const act = sel.filter((r) => r.scenario === "actual"), bud = sel.filter((r) => r.scenario === "budget");
  const last = months[months.length - 1];
  const sum = <K extends keyof PeopleRow>(xs: PeopleRow[], k: K) => xs.reduce((s, r) => s + Number(r[k]), 0);
  const cost = act.reduce((s, r) => s + p(r.employment_cost), 0);
  const monthsWithData = new Set(act.map((r) => r.month)).size || 1;
  const avgFte = sum(act, "fte") / monthsWithData;
  const annualise = 12 / months.length;
  const lastAct = act.filter((r) => r.month === last), lastBud = bud.filter((r) => r.month === last);
  return {
    employmentCost: cost,
    headcount: sum(lastAct, "headcount"),
    fte: +sum(lastAct, "fte").toFixed(1),
    avgFte: +avgFte.toFixed(1),
    budgetHeadcount: lastBud.length ? sum(lastBud, "headcount") : null,
    costPerFte: avgFte ? Math.round((cost / avgFte) * annualise) : null,
    revenuePerFte: plActual && avgFte ? Math.round((plActual.revenue / avgFte) * annualise) : null,
    gpPerFte: plActual && avgFte ? Math.round((plActual.grossProfit / avgFte) * annualise) : null,
    employmentCostPct: plActual?.revenue ? cost / plActual.revenue : null,
    hires: sum(act, "hires"),
    plannedHires: bud.length ? sum(bud, "hires") : null,
    leavers: sum(act, "leavers"),
    openRoles: sum(lastAct, "open_roles"),
  };
}
