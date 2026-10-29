import { loadIntelligence } from "@/lib/data/intelligence";
import { bridgePeriods, bridgeSeries, bridgeBySegment, loadRevenueBase, retentionTrend } from "@/lib/analytics/revenue-service";
import { viewQuery } from "@/lib/analytics/query";
import { exportResponse } from "@/lib/analytics/export";
import { MOVEMENT_LABEL, MOVEMENT_TYPES, type MovementType } from "@/lib/analytics/contracts";
import { gbp } from "@/lib/analytics/calc/revenue";
import { addMonths, monthRange, type Grain } from "@/lib/analytics/period";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = await loadIntelligence(slug);
  if (!i.src || !i.domains.includes("revenue")) return new Response("Not authorised for this data.", { status: 403 });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const b = await loadRevenueBase(i.src, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "quarter");
  const dataset = sp.dataset ?? "";
  let rows: Array<Record<string, unknown>> = [];
  if (dataset === "bridge") {
    // the underlying movement table: one row per customer, month and movement type
    const mv = await b.src.movements(q.period.open, q.period.end, q.filters, "customer");
    rows = mv.map((m) => ({ month: m.month, customer_id: m.grp, movement: m.type, amount: m.amount }));
  } else if (dataset === "movement_customers") {
    const type = (MOVEMENT_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as MovementType) : "contraction";
    const out: Array<Record<string, unknown>> = [];
    for (let offset = 0; ; offset += 200) {
      const page = await b.src.movementCustomers({ from: q.period.open, to: q.period.end, type, filters: q.filters, limit: 200, offset });
      out.push(...page.rows.map((r) => ({ customer: r.name, customer_id: r.id, sector: r.sector, business_unit: r.business_unit, account_owner: r.account_owner, movement: MOVEMENT_LABEL[type], months: r.months, amount: r.amount })));
      if (page.rows.length < 200) break;
    }
    rows = out;
  } else if (dataset === "bridge_history") {
    const hg = (["month", "quarter", "year"].includes(sp.hg ?? "") ? sp.hg : "month") as Grain;
    const hist = await bridgeSeries(b, bridgePeriods(b, hg, q.end, hg === "year" ? 4 : 24), q.filters);
    rows = hist.map((h) => ({ period: h.period.short, opening: gbp(h.bridge.opening), ...Object.fromEntries(h.bridge.items.map((x) => [x.type, gbp(x.amount)])), closing: gbp(h.bridge.closing), difference: gbp(h.bridge.difference), reconciles: h.bridge.reconciles, status: h.status.status }));
  } else if (dataset === "segments") {
    const group = sp.group ?? "sector";
    const segs = await bridgeBySegment(b, q.period, group, q.filters);
    rows = segs.map((s) => ({ segment: s.grp, opening: gbp(s.bridge.opening), ...Object.fromEntries(s.bridge.items.map((x) => [x.type, gbp(x.amount)])), closing: gbp(s.bridge.closing) }));
  } else if (dataset === "retention_trend") {
    const w = [1, 3, 12].includes(Number(sp.window)) ? Number(sp.window) : 12;
    const tr = await retentionTrend(b, monthRange(addMonths(q.end, -23), q.end), q.filters, w);
    rows = tr.map((t) => ({ window_start: t.start, window_end: t.end, opening_arr: gbp(t.ret.opening), grr: t.ret.grr, nrr: t.ret.nrr, logo_retention: t.ret.logoRetention, status: t.status.status }));
  } else if (dataset === "customers") {
    const out: Array<Record<string, unknown>> = [];
    const compare = addMonths(q.end, -12) >= b.coverage.start ? addMonths(q.end, -12) : b.coverage.start;
    for (let offset = 0; offset < 5000; offset += 200) {
      const page = await b.src.customers({ month: q.end, compare, filters: q.filters, search: sp.q ?? null, limit: 200, offset });
      out.push(...page.rows.map((r) => ({ customer: r.name, customer_id: r.id, sector: r.sector, business_unit: r.business_unit, segment: r.segment, origin: r.origin, account_owner: r.account_owner, crm_id: r.crm_id, arr: r.arr, arr_12m_ago: r.arr_compare })));
      if (page.rows.length < 200) break;
    }
    rows = out;
  } else if (dataset === "cohorts") {
    const cells = await b.src.cohorts({ last: q.end, cohort: sp.cohort === "year" ? "year" : "quarter", dimension: sp.dim || null, filters: q.filters, age: sp.age === "year" ? "year" : sp.age === "month" ? "month" : "quarter" });
    rows = cells.map((c) => ({ cohort: c.cohort, age: c.age, members_reached: c.members, initial_arr: c.initial_arr, arr: c.arr, active: c.active, revenue_retention: c.initial_arr ? c.arr / c.initial_arr : null, logo_retention: c.members ? c.active / c.members : null }));
  } else return new Response("Unknown dataset", { status: 400 });
  return exportResponse(i, "revenue", dataset, url.search, rows);
}
