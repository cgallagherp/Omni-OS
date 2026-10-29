// Governed analytical data for agents. Agents read exactly what management sees — the same
// AnalyticsSource, definitions and reference calculations — through their own principal,
// limited by the database to the data domains management granted each agent. They never
// compute financial figures of their own.
import { z } from "zod";
import { getSource } from "@/lib/analytics/source";
import { loadRevenueBase, retentionAt } from "@/lib/analytics/revenue-service";
import { costAnalysis, costSeries, loadCostBase } from "@/lib/analytics/cost-service";
import { costExceptions, revenueExceptions, type FinancialException } from "@/lib/analytics/exceptions";
import { gbp } from "@/lib/analytics/calc/revenue";
import { addMonths, periodOf } from "@/lib/analytics/period";
import type { Filters } from "@/lib/analytics/source";
import { defineTool, ToolError, type Runtime } from "../runtime";

async function sourceFor(rt: Runtime) {
  const src = await getSource(rt.db, rt.companyId);
  if (!src) throw new ToolError("No governed data source is connected for this company");
  const { data: co } = await rt.db.from("companies").select("slug, fiscal_year_start_month").eq("id", rt.companyId).single();
  return { src, slug: co!.slug, fy: co!.fiscal_year_start_month };
}

/** The current exception list for the domains this agent may read. */
export const readExceptions = defineTool({
  name: "analytics.exceptions",
  description: "Current revenue, cost and people exceptions from governed data (the list management sees).",
  sideEffect: "read",
  input: z.object({}),
  run: async (rt) => {
    const { src, slug, fy } = await sourceFor(rt);
    const domains = await src.domains();
    const out: FinancialException[] = [];
    if (domains.includes("revenue")) { const b = await loadRevenueBase(src, fy); out.push(...(await revenueExceptions(b, b.coverage.end, `/c/${slug}`))); }
    if (domains.includes("cost")) { const b = await loadCostBase(src, fy); out.push(...(await costExceptions(b, b.coverage.end, `/c/${slug}`))); }
    return { domains, exceptions: out, synthetic: src.info.is_synthetic };
  },
  summarise: (_i, o) => `${o.exceptions.length} exceptions across ${o.domains.join(", ") || "no permitted domains"}`,
});

const DRIVER_DIMS = ["sector", "product", "business_unit", "size_band", "segment"] as const;

/** Which segments explain a retention change, and which customers drove the losses. */
export const revenueDrivers = defineTool({
  name: "analytics.revenue_drivers",
  description: "Decompose the change in NRR across segments (governed retention by segment now and a year earlier) and list the customers behind contraction and churn.",
  sideEffect: "read",
  input: z.object({ filters: z.record(z.string(), z.array(z.string())).default({}) }),
  run: async (rt, i: { filters: Filters }) => {
    const { src, slug, fy } = await sourceFor(rt);
    const b = await loadRevenueBase(src, fy);
    const end = b.coverage.end;
    const [now, prev] = await Promise.all([retentionAt(b, end, i.filters), retentionAt(b, addMonths(end, -12), i.filters)]);
    const dims = await Promise.all(DRIVER_DIMS.map(async (d) => {
      const [cur, old] = await Promise.all([retentionAt(b, end, i.filters, d), retentionAt(b, addMonths(end, -12), i.filters, d)]);
      const total = cur.reduce((s, x) => s + x.inputs.opening_arr, 0) || 1;
      const rows = cur.map((c) => {
        const o = old.find((x) => x.grp === c.grp);
        const weight = c.inputs.opening_arr / total;
        // contribution of this segment to the change in company NRR (percentage points)
        const contribution = c.ret.nrr !== null && o?.ret.nrr != null ? (c.ret.nrr - o.ret.nrr) * weight : null;
        const label = d === "product" ? b.products.find((x) => x.key === c.grp)?.name ?? c.grp : b.dims.find((x) => x.key === d)?.values.find((v) => v.key === c.grp)?.label ?? c.grp;
        return { key: c.grp, label, weight, nrr: c.ret.nrr, nrrBefore: o?.ret.nrr ?? null, grr: c.ret.grr, contraction: gbp(c.ret.contraction), churn: gbp(c.ret.churn), expansion: gbp(c.ret.expansion), contribution };
      }).sort((x, y) => (x.contribution ?? 0) - (y.contribution ?? 0));
      return { dimension: d, label: b.dims.find((x) => x.key === d)?.label ?? d, rows };
    }));
    const window = periodOf("ltm", end, fy);
    const [contr, churn] = await Promise.all([
      src.movementCustomers({ from: window.open, to: window.end, type: "contraction", filters: i.filters, limit: 15 }),
      src.movementCustomers({ from: window.open, to: window.end, type: "churn", filters: i.filters, limit: 15 }),
    ]);
    const ids = [...contr.rows, ...churn.rows].map((r) => r.id);
    const { data: crm } = ids.length ? await rt.db.from("ri_customers").select("id, crm_id").eq("company_id", rt.companyId).in("id", ids) : { data: [] };
    return {
      crmIds: Object.fromEntries((crm ?? []).map((c) => [c.id, c.crm_id])) as Record<string, string | null>,
      slug, end, synthetic: src.info.is_synthetic, policyVersion: b.defs.get("nrr")?.version ?? 1,
      nrr: now[0]?.ret.nrr ?? null, nrrBefore: prev[0]?.ret.nrr ?? null, grr: now[0]?.ret.grr ?? null, grrBefore: prev[0]?.ret.grr ?? null,
      dims, contraction: contr, churn, windowLabel: window.label,
    };
  },
  summarise: (_i, o) => `NRR ${o.nrr === null ? "—" : (o.nrr * 100).toFixed(1)}% vs ${o.nrrBefore === null ? "—" : (o.nrrBefore * 100).toFixed(1)}% a year earlier; ${o.contraction.total + o.churn.total} customers with losses`,
});

/** Where a cost or margin variance sits, and whether it looks temporary or structural. */
export const costDrivers = defineTool({
  name: "analytics.cost_drivers",
  description: "Break a cost or margin variance down by account, supplier and cost centre against budget and the prior period, with monthly persistence.",
  sideEffect: "read",
  input: z.object({ filters: z.record(z.string(), z.array(z.string())).default({}) }),
  run: async (rt, i: { filters: Filters }) => {
    const { src, slug, fy } = await sourceFor(rt);
    const b = await loadCostBase(src, fy);
    const end = b.coverage.end;
    const q = periodOf("quarter", end, fy);
    const quarter = { ...q, months: [addMonths(end, -2), addMonths(end, -1), end], start: addMonths(end, -2), open: addMonths(end, -3), label: `three months to ${end.slice(0, 7)}` };
    const [byAccount, bySupplier, byCc, series] = await Promise.all([
      costAnalysis(b, quarter, "account", i.filters),
      costAnalysis(b, quarter, "supplier", i.filters),
      costAnalysis(b, quarter, "cost_centre", i.filters),
      costSeries(b, end, 12, null, null, i.filters),
    ]);
    // persistence: months in the last six above budget, and the share of the excess in a single month
    const last6 = series.slice(-6).filter((m) => m.budget !== null);
    const over = last6.filter((m) => m.actual > (m.budget ?? Infinity)).length;
    const excess = last6.map((m) => Math.max(0, m.actual - (m.budget ?? m.actual)));
    const maxShare = excess.reduce((s, x) => s + x, 0) ? Math.max(...excess) / excess.reduce((s, x) => s + x, 0) : 0;
    const tx = b.canTransactions ? await src.transactions({ from: quarter.start, to: end, account: (i.filters.account as string[] | undefined)?.[0] ?? null, supplier: (i.filters.supplier as string[] | undefined)?.[0] ?? null, limit: 10 }) : null;
    return {
      slug, end, synthetic: src.info.is_synthetic,
      topAccounts: byAccount.lines.slice(0, 6), topSuppliers: bySupplier.lines.filter((l) => l.key !== "(none)").slice(0, 6), topCostCentres: byCc.lines.slice(0, 6),
      persistence: { monthsOverBudget: over, of: last6.length, largestMonthShare: maxShare },
      transactions: tx?.rows ?? null, canTransactions: b.canTransactions,
      costCentres: b.costCentres.map((c) => ({ code: c.code, name: c.name, owner: c.owner_crew_id })),
    };
  },
  summarise: (_i, o) => `${o.topAccounts.length} accounts, ${o.topSuppliers.length} suppliers analysed; over budget in ${o.persistence.monthsOverBudget} of ${o.persistence.of} months`,
});

/** CRM context for specific customers (accounts, health, upcoming renewals). */
export const crmAccounts = defineTool({
  name: "crm.accounts",
  description: "Read CRM accounts and renewal opportunities for specific customers from the connected CRM.",
  sideEffect: "read",
  input: z.object({ crmIds: z.array(z.string()).max(50).default([]), segment: z.string().max(80).optional() }),
  run: async (rt, i: { crmIds: string[]; segment?: string }) => {
    if (!i.crmIds.length && !i.segment) return { accounts: [], opportunities: [] };
    // specific accounts, or the at-risk (amber/red) accounts of one segment
    let q = rt.db.from("crm_sandbox_accounts").select("id, external_id, name, health, owner_name, renewal_date, segment, arr").eq("company_id", rt.companyId);
    q = i.segment ? q.eq("segment", i.segment).in("health", ["amber", "red"]) : q.in("external_id", i.crmIds);
    const { data: accounts } = await q.limit(50);
    const ids = (accounts ?? []).map((a) => a.id);
    const { data: opps } = ids.length ? await rt.db.from("crm_sandbox_opportunities").select("id, account_id, name, stage, status, amount, close_date, owner_name, last_activity_on").eq("company_id", rt.companyId).in("account_id", ids).eq("status", "open") : { data: [] };
    return { accounts: accounts ?? [], opportunities: opps ?? [] };
  },
  summarise: (_i, o) => `${o.accounts.length} CRM accounts, ${o.opportunities.length} open opportunities`,
});
