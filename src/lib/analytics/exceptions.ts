// Financial and commercial exceptions, derived from governed data with fixed, documented
// rules. The same list feeds Revenue/Cost Intelligence, Mission Control links and the
// agents' detectors, so an agent investigates exactly what management sees.
import { gbp, p } from "./calc/revenue";
import { growth, pl } from "./calc/cost";
import { addMonths, monthRange, monthLabel } from "./period";
import { retentionAt, type RevenueBase } from "./revenue-service";
import type { CostBase } from "./cost-service";

export interface FinancialException {
  key: string;
  domain: "revenue" | "cost" | "people";
  metric_key: string;
  title: string;
  detail: string;
  period: string;
  actual: number | null;
  comparison: number | null;
  comparisonLabel: string;
  unit: "currency" | "percent" | "currency_per_fte";
  severity: "medium" | "high" | "critical";
  href: string;
  filters?: Record<string, string[]>;
  /** the agent workflow that investigates it */
  workflow: "ceo.financial_variance";
}

export interface AnalyticsRef {
  module: "revenue" | "cost";
  exception_key?: string;
  metric_key: string;
  period: string;
  label: string;
  href: string;
  values?: { actual: number | null; comparison: number | null; unit: string };
  filters?: Record<string, string[]>;
  customer_id?: string;
}

export const refFor = (e: FinancialException): AnalyticsRef => ({
  module: e.domain === "revenue" ? "revenue" : "cost", exception_key: e.key, metric_key: e.metric_key, period: e.period, label: e.title, href: e.href,
  values: { actual: e.actual, comparison: e.comparison, unit: e.unit }, filters: e.filters,
});

const SECTOR_LABEL = (b: RevenueBase, key: string) => b.dims.find((d) => d.key === "sector")?.values.find((v) => v.key === key)?.label ?? key;

export async function revenueExceptions(b: RevenueBase, end: string, slugBase: string): Promise<FinancialException[]> {
  const out: FinancialException[] = [];
  const base = `${slugBase}/revenue`;
  const [now, sixAgo, bySector, nrrT, grrT] = await Promise.all([
    retentionAt(b, end),
    addMonths(end, -6 - b.policy.window_months) >= b.coverage.start ? retentionAt(b, addMonths(end, -6)) : Promise.resolve([]),
    retentionAt(b, end, {}, "sector"),
    b.src.targets("nrr"),
    b.src.targets("grr"),
  ]);
  const r = now[0]?.ret, r6 = sixAgo[0]?.ret;
  const nrrTarget = nrrT.get(end)?.target ?? null, grrTarget = grrT.get(end)?.target ?? null;
  const label = monthLabel(end, true);
  if (r?.nrr != null && r6?.nrr != null && r6.nrr - r.nrr >= 0.03) {
    out.push({ key: "nrr_decline", domain: "revenue", metric_key: "nrr", title: `NRR fell from ${(r6.nrr * 100).toFixed(1)}% to ${(r.nrr * 100).toFixed(1)}% in six months`, detail: `Trailing 12-month NRR to ${label}, against ${(r6.nrr * 100).toFixed(1)}% six months earlier${nrrTarget ? ` and a ${(nrrTarget * 100).toFixed(0)}% target` : ""}.`, period: end, actual: r.nrr, comparison: r6.nrr, comparisonLabel: "Six months earlier", unit: "percent", severity: r6.nrr - r.nrr >= 0.05 ? "critical" : "high", href: `${base}/retention`, workflow: "ceo.financial_variance" });
  } else if (r?.nrr != null && nrrTarget && r.nrr < nrrTarget - 0.01) {
    out.push({ key: "nrr_below_target", domain: "revenue", metric_key: "nrr", title: `NRR ${(r.nrr * 100).toFixed(1)}% is below the ${(nrrTarget * 100).toFixed(0)}% target`, detail: `Trailing 12-month NRR to ${label}.`, period: end, actual: r.nrr, comparison: nrrTarget, comparisonLabel: "Target", unit: "percent", severity: "high", href: `${base}/retention`, workflow: "ceo.financial_variance" });
  }
  if (r?.grr != null && grrTarget && r.grr < grrTarget - 0.005) {
    out.push({ key: "grr_below_target", domain: "revenue", metric_key: "grr", title: `GRR ${(r.grr * 100).toFixed(1)}% is below the ${(grrTarget * 100).toFixed(0)}% target`, detail: `Trailing 12-month GRR to ${label}: churn and contraction from the opening cohort.`, period: end, actual: r.grr, comparison: grrTarget, comparisonLabel: "Target", unit: "percent", severity: grrTarget - r.grr > 0.02 ? "high" : "medium", href: `${base}/retention`, workflow: "ceo.financial_variance" });
  }
  // a material segment whose retention is well below the company's
  const totalOpen = bySector.reduce((s, x) => s + x.inputs.opening_arr, 0);
  for (const s of bySector) {
    if (!r?.nrr || s.ret.nrr === null || s.inputs.opening_arr < totalOpen * 0.05) continue;
    if (s.ret.nrr < 0.95 && r.nrr - s.ret.nrr > 0.08) {
      const lost = gbp(-(s.ret.contraction + s.ret.churn));
      out.push({
        key: `segment_retention:sector:${s.grp}`, domain: "revenue", metric_key: "nrr", title: `${SECTOR_LABEL(b, s.grp)}: NRR ${(s.ret.nrr * 100).toFixed(1)}% vs ${(r.nrr * 100).toFixed(1)}% overall`,
        detail: `${SECTOR_LABEL(b, s.grp)} is ${((s.inputs.opening_arr / totalOpen) * 100).toFixed(0)}% of opening ARR but lost £${Math.round(lost / 1000).toLocaleString("en-GB")}k to contraction and churn in the 12 months to ${label}.`,
        period: end, actual: s.ret.nrr, comparison: r.nrr, comparisonLabel: "Company NRR", unit: "percent", severity: s.ret.nrr < 0.85 ? "critical" : "high", href: `${base}/retention?f_sector=${s.grp}`, filters: { sector: [s.grp] }, workflow: "ceo.financial_variance",
      });
    }
  }
  // contraction rising vs the previous 12 months
  if (addMonths(end, -24) >= b.coverage.start) {
    const [cur, prev] = await Promise.all([b.src.movements(addMonths(end, -12), end), b.src.movements(addMonths(end, -24), addMonths(end, -12))]);
    const s = (rows: typeof cur, t: string) => gbp(rows.filter((x) => x.type === t).reduce((a, x) => a + p(x.amount), 0));
    const c1 = -s(cur, "contraction"), c0 = -s(prev, "contraction");
    if (c0 > 0 && c1 > c0 * 1.3) out.push({ key: "contraction_increase", domain: "revenue", metric_key: "arr_contraction", title: `Contraction ARR up ${Math.round((c1 / c0 - 1) * 100)}% year on year`, detail: `£${Math.round(c1 / 1000).toLocaleString("en-GB")}k of contraction in the 12 months to ${label} against £${Math.round(c0 / 1000).toLocaleString("en-GB")}k in the prior 12 months.`, period: end, actual: c1, comparison: c0, comparisonLabel: "Prior 12 months", unit: "currency", severity: "medium", href: `${base}/bridge?g=ltm&drill=contraction`, workflow: "ceo.financial_variance" });
    const e1 = s(cur, "expansion"), e0 = s(prev, "expansion");
    if (e0 > 0 && e1 < e0 * 0.85) out.push({ key: "weak_expansion", domain: "revenue", metric_key: "arr_expansion", title: `Expansion ARR down ${Math.round((1 - e1 / e0) * 100)}% year on year`, detail: `£${Math.round(e1 / 1000).toLocaleString("en-GB")}k in the 12 months to ${label}.`, period: end, actual: e1, comparison: e0, comparisonLabel: "Prior 12 months", unit: "currency", severity: "medium", href: `${base}/bridge?g=ltm&drill=expansion`, workflow: "ceo.financial_variance" });
  }
  return out;
}

export async function costExceptions(b: CostBase, end: string, slugBase: string, arrNow?: number | null, arrYearAgo?: number | null): Promise<FinancialException[]> {
  const out: FinancialException[] = [];
  const base = `${slugBase}/cost`;
  const q = monthRange(addMonths(end, -2), end);
  const qPrev = monthRange(addMonths(end, -5), addMonths(end, -3));
  const qYear = q.map((m) => addMonths(m, -12));
  const label = `three months to ${monthLabel(end, true)}`;
  if (qYear[0] < b.coverage.start) return out;
  const [rows, byDept, bySupplier] = await Promise.all([
    b.src.ledger(qYear[0], end, ["actual", "budget"]),
    b.src.ledger(q[0], end, ["actual", "budget"], "department"),
    b.src.ledger(qPrev[0], end, ["actual"], "supplier"),
  ]);
  const sel = (ms: string[]) => rows.filter((r) => ms.includes(r.month));
  const a = pl(sel(q), "actual"), bu = pl(sel(q), "budget"), ay = pl(sel(qYear), "actual"), ap = pl(sel(qPrev), "actual");
  if (a.grossMargin !== null && bu.grossMargin !== null && bu.grossMargin - a.grossMargin > 0.01) {
    out.push({ key: "gross_margin_below_plan", domain: "cost", metric_key: "gross_margin", title: `Gross margin ${(a.grossMargin * 100).toFixed(1)}% vs ${(bu.grossMargin * 100).toFixed(1)}% budget`, detail: `${label[0].toUpperCase() + label.slice(1)}: gross profit £${Math.round(gbp(a.grossProfit) / 1000).toLocaleString("en-GB")}k against £${Math.round(gbp(bu.grossProfit) / 1000).toLocaleString("en-GB")}k budget.`, period: end, actual: a.grossMargin, comparison: bu.grossMargin, comparisonLabel: "Budget", unit: "percent", severity: bu.grossMargin - a.grossMargin > 0.025 ? "high" : "medium", href: `${base}/bridges?basis=budget&g=quarter&end=${end.slice(0, 7)}`, workflow: "ceo.financial_variance" });
  }
  const hostG = growth(a.lines.hosting ?? 0, ay.lines.hosting ?? 0);
  const arrG = arrNow && arrYearAgo ? growth(arrNow, arrYearAgo) : growth(a.revenueLines.recurring_revenue ?? a.revenue, ay.revenueLines.recurring_revenue ?? ay.revenue);
  if (hostG !== null && arrG !== null && hostG - arrG > 0.1) {
    out.push({ key: "hosting_vs_arr", domain: "cost", metric_key: "hosting_pct_arr", title: `Hosting costs up ${Math.round(hostG * 100)}% vs ARR up ${Math.round(arrG * 100)}%`, detail: `Hosting and infrastructure, ${label}, against the same months a year earlier.`, period: end, actual: hostG, comparison: arrG, comparisonLabel: "ARR growth", unit: "percent", severity: hostG - arrG > 0.2 ? "high" : "medium", href: `${base}/analysis?group=supplier&f_line=hosting`, filters: { line: ["hosting"] }, workflow: "ceo.financial_variance" });
  }
  const smG = growth(a.lines.sales_marketing ?? 0, ap.lines.sales_marketing ?? 0);
  if (smG !== null && smG > 0.15) {
    out.push({ key: "sales_marketing_up", domain: "cost", metric_key: "total_costs", title: `Sales and marketing spend up ${Math.round(smG * 100)}% on the previous quarter`, detail: `Non-people sales and marketing costs, ${label}. Check whether new ARR and pipeline have moved with it.`, period: end, actual: gbp(a.lines.sales_marketing ?? 0), comparison: gbp(ap.lines.sales_marketing ?? 0), comparisonLabel: "Previous three months", unit: "currency", severity: "medium", href: `${base}/analysis?group=account&f_line=sales_marketing`, filters: { line: ["sales_marketing"] }, workflow: "ceo.financial_variance" });
  }
  for (const d of [...new Set(byDept.map((r) => r.grp))]) {
    const da = byDept.filter((r) => r.grp === d && r.scenario === "actual" && r.section !== "revenue").reduce((s, r) => s + p(r.amount), 0);
    const db = byDept.filter((r) => r.grp === d && r.scenario === "budget" && r.section !== "revenue").reduce((s, r) => s + p(r.amount), 0);
    if (db > 0 && da > db * 1.1 && da - db > 3_000_000) {
      out.push({ key: `department_over_budget:${d}`, domain: "cost", metric_key: "total_costs", title: `${d} ${Math.round((da / db - 1) * 100)}% over budget`, detail: `£${Math.round(gbp(da) / 1000).toLocaleString("en-GB")}k against £${Math.round(gbp(db) / 1000).toLocaleString("en-GB")}k budget, ${label}.`, period: end, actual: gbp(da), comparison: gbp(db), comparisonLabel: "Budget", unit: "currency", severity: da > db * 1.25 ? "high" : "medium", href: `${base}/analysis?group=account&f_department=${encodeURIComponent(d)}`, filters: { department: [d] }, workflow: "ceo.financial_variance" });
    }
  }
  for (const sid of [...new Set(bySupplier.map((r) => r.grp))].filter((x) => x !== "(none)")) {
    const cur = bySupplier.filter((r) => r.grp === sid && q.includes(r.month)).reduce((s, r) => s + p(r.amount), 0);
    const prev = bySupplier.filter((r) => r.grp === sid && qPrev.includes(r.month)).reduce((s, r) => s + p(r.amount), 0);
    if (prev > 0 && cur > prev * 1.25 && cur - prev > 2_000_000) {
      const name = b.suppliers.find((s) => s.id === sid)?.name ?? "Supplier";
      out.push({ key: `supplier_increase:${sid}`, domain: "cost", metric_key: "total_costs", title: `${name}: spend up ${Math.round((cur / prev - 1) * 100)}% on the previous quarter`, detail: `£${Math.round(gbp(cur) / 1000).toLocaleString("en-GB")}k, ${label}, against £${Math.round(gbp(prev) / 1000).toLocaleString("en-GB")}k.`, period: end, actual: gbp(cur), comparison: gbp(prev), comparisonLabel: "Previous three months", unit: "currency", severity: "medium", href: `${base}/suppliers?supplier=${sid}`, filters: { supplier: [sid] }, workflow: "ceo.financial_variance" });
    }
  }
  if (b.canPeople) {
    const ltm = monthRange(addMonths(end, -11), end), ltmY = ltm.map((m) => addMonths(m, -12));
    if (ltmY[0] >= b.coverage.start) {
      const [people, rev] = await Promise.all([b.src.people(ltmY[0], end), b.src.ledger(ltmY[0], end, ["actual"], null, { section: ["revenue"] })]);
      const fte = (ms: string[]) => people.filter((x) => x.scenario === "actual" && ms.includes(x.month)).reduce((s, x) => s + x.fte, 0) / ms.length;
      const revOf = (ms: string[]) => rev.filter((x) => ms.includes(x.month)).reduce((s, x) => s + x.amount, 0);
      const r1 = revOf(ltm) / fte(ltm), r0 = revOf(ltmY) / fte(ltmY);
      if (r0 > 0 && r1 < r0 * 0.95) out.push({ key: "revenue_per_fte", domain: "people", metric_key: "revenue_per_fte", title: `Revenue per FTE down ${Math.round((1 - r1 / r0) * 100)}% year on year`, detail: `£${Math.round(r1 / 1000)}k per average FTE in the 12 months to ${monthLabel(end, true)}, against £${Math.round(r0 / 1000)}k a year earlier.`, period: end, actual: Math.round(r1), comparison: Math.round(r0), comparisonLabel: "A year earlier", unit: "currency_per_fte", severity: "medium", href: `${base}/people`, workflow: "ceo.financial_variance" });
    }
  }
  return out;
}
