import { loadIntelligence } from "@/lib/data/intelligence";
import { costAnalysis, loadCostBase, peopleView, supplierAnalysis } from "@/lib/analytics/cost-service";
import { viewQuery } from "@/lib/analytics/query";
import { exportResponse } from "@/lib/analytics/export";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = await loadIntelligence(slug);
  if (!i.src || !i.domains.includes("cost")) return new Response("Not authorised for this data.", { status: 403 });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const b = await loadCostBase(i.src, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "quarter");
  const dataset = sp.dataset ?? "";
  if (dataset === "analysis") {
    const a = await costAnalysis(b, q.period, sp.group ?? "department", q.filters);
    return exportResponse(i, "cost", dataset, url.search, a.lines.map((l) => ({ [a.group]: l.label, actual: l.actual, budget: l.budget, variance: l.variance, variance_pct: l.variancePct, forecast: l.forecast, prior_period: l.prior, year_on_year: l.yoy, run_rate: l.runRate })));
  }
  if (dataset === "suppliers") {
    const s = await supplierAnalysis(b, q.period, q.filters);
    return exportResponse(i, "cost", dataset, url.search, s.suppliers.map((x) => ({ supplier: x.name, category: x.category, spend: x.amount, share: x.share, budget: x.budget, prior_period: x.prior, year_ago: x.yearAgo, contract_end: x.contractEnd })));
  }
  if (dataset === "people") {
    if (!b.canPeople) return new Response("Not authorised for this data.", { status: 403 });
    const v = await peopleView(b, q.period);
    // departmental aggregates only; no individual-level data exists in Omni OS
    return exportResponse(i, "people", dataset, url.search, v.departments.map((d) => ({ department: d.department, headcount: d.headcount, budget_headcount: d.budgetHeadcount, avg_fte: d.avgFte, employment_cost: d.employmentCost, cost_per_fte: d.costPerFte, hires: d.hires, planned_hires: d.plannedHires, leavers: d.leavers, open_roles: d.openRoles })));
  }
  return new Response("Unknown dataset", { status: 400 });
}
