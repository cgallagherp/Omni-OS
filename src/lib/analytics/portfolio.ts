// Comparable financial and commercial metrics across the portfolio. A metric is compared
// only between companies whose governed definitions share a comparability group; anything
// else is shown as not comparable, with the reason.
import { getSource, type Db } from "./source";
import { loadRevenueBase, retentionAt } from "./revenue-service";
import { loadCostBase } from "./cost-service";
import { growth, peopleSummary, pl } from "./calc/cost";
import { gbp } from "./calc/revenue";
import { addMonths, monthLabel, monthRange } from "./period";
import { statusOver } from "./query";
import type { DataStatus } from "./contracts";

export interface PortfolioCell { value: number | null; group: string | null; label: string; status: DataStatus }
export interface PortfolioRow { companyId: string; name: string; slug: string; synthetic: boolean; period: string; cells: Record<string, PortfolioCell | null> }

export const PORTFOLIO_METRICS = [
  { key: "revenue_growth", label: "Revenue growth (LTM)", unit: "percent" as const },
  { key: "gross_margin", label: "Gross margin (LTM)", unit: "percent" as const },
  { key: "ebitda_margin", label: "EBITDA margin (LTM)", unit: "percent" as const },
  { key: "budget_variance", label: "EBITDA vs budget (LTM)", unit: "percent" as const },
  { key: "grr", label: "GRR", unit: "percent" as const },
  { key: "nrr", label: "NRR", unit: "percent" as const },
  { key: "revenue_per_fte", label: "Revenue per FTE", unit: "currency" as const },
];

export async function portfolioComparables(db: Db, companies: Array<{ id: string; name: string; slug: string }>): Promise<PortfolioRow[]> {
  const rows = await Promise.all(companies.map(async (c) => {
    const src = await getSource(db, c.id);
    if (!src) return null;
    const [domains, { data: co }] = await Promise.all([src.domains(), db.from("companies").select("fiscal_year_start_month").eq("id", c.id).single()]);
    const fy = co?.fiscal_year_start_month ?? 1;
    const defs = new Map((await src.definitions()).map((d) => [d.key, d]));
    const cells: Record<string, PortfolioCell | null> = {};
    let period = "";
    const cell = (key: string, value: number | null, status: DataStatus): PortfolioCell => ({ value, status, group: defs.get(key)?.comparability_group ?? null, label: defs.get(key)?.name ?? key });
    if (domains.includes("cost")) {
      const b = await loadCostBase(src, fy);
      const end = b.coverage.end;
      period = monthLabel(end, true);
      const ltm = monthRange(addMonths(end, -11), end), prev = ltm.map((m) => addMonths(m, -12));
      const rowsL = await src.ledger(prev[0] < b.coverage.start ? ltm[0] : prev[0], end, ["actual", "budget"]);
      const a = pl(rowsL.filter((r) => ltm.includes(r.month)), "actual"), bu = pl(rowsL.filter((r) => ltm.includes(r.month)), "budget"), p = pl(rowsL.filter((r) => prev.includes(r.month)), "actual");
      const st = statusOver(b.status, ltm).status;
      cells.revenue_growth = cell("revenue_growth", prev[0] >= b.coverage.start ? growth(a.revenue, p.revenue) : null, st);
      cells.gross_margin = cell("gross_margin", a.grossMargin, st);
      cells.ebitda_margin = cell("ebitda_margin", a.ebitdaMargin, st);
      cells.budget_variance = cell("budget_variance", bu.ebitda ? (a.ebitda - bu.ebitda) / Math.abs(bu.ebitda) : null, st);
      if (domains.includes("people")) {
        const ppl = await src.people(ltm[0], end);
        const ps = peopleSummary(ppl, ltm, a);
        cells.revenue_per_fte = cell("revenue_per_fte", ps.revenuePerFte === null ? null : gbp(ps.revenuePerFte), st);
      }
    }
    if (domains.includes("revenue")) {
      const b = await loadRevenueBase(src, fy);
      const [r] = await retentionAt(b, b.coverage.end);
      const st = statusOver(b.status, monthRange(addMonths(b.coverage.end, -11), b.coverage.end)).status;
      cells.grr = cell("grr", r?.ret.grr ?? null, st);
      cells.nrr = cell("nrr", r?.ret.nrr ?? null, st);
      period ||= monthLabel(b.coverage.end, true);
    }
    return { companyId: c.id, name: c.name, slug: c.slug, synthetic: src.info.is_synthetic, period, cells };
  }));
  return rows.filter(Boolean) as PortfolioRow[];
}

/** A metric is compared across the portfolio only if every company reporting it uses the same governed methodology. */
export function comparableAcross(rows: PortfolioRow[], key: string): boolean {
  const groups = new Set(rows.map((r) => r.cells[key]).filter(Boolean).map((c) => c!.group ?? "(company-specific)"));
  return groups.size <= 1 && !groups.has("(company-specific)");
}
