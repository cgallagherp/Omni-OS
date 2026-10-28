// Operating-context service: assembles what an investigation needs — and only that —
// from the company's own records, through the agent principal (so RLS scopes it to one
// company and excludes Omni-only data), with a source reference for every item.
import { loadCompanySnapshot, type CompanySnapshot } from "@/lib/data/snapshot";
import { formatMetric } from "@/lib/domain/format";
import type { KpiInput } from "./analysis/ceo";
import type { Runtime } from "./runtime";
import { ref } from "./tools/mission-control";

const snapshots = new WeakMap<Runtime, CompanySnapshot>();

export async function companySnapshot(rt: Runtime): Promise<CompanySnapshot> {
  const cached = snapshots.get(rt);
  if (cached) return cached;
  // Supabase clients share an interface; the snapshot loader only issues RLS-scoped reads
  const snap = await loadCompanySnapshot(rt.db as never, rt.companyId, rt.now);
  if (!snap) throw new Error("Company not visible to the agent");
  snapshots.set(rt, snap);
  return snap;
}

/** Strategy summary for any agent: destination, plan and current priorities, with sources. */
export async function strategyContext(rt: Runtime) {
  const s = await companySnapshot(rt);
  return {
    company: { id: s.company.id, name: s.company.name, sector: s.company.sector, currency: s.company.currency },
    northStar: s.northStar ? { vision: s.northStar.vision, targetEndState: s.northStar.target_end_state, targetYear: s.northStar.target_year, ref: ref.northStar(s.northStar.id) } : null,
    outcomes: s.winningMoves.map((w) => ({ id: w.id, title: w.title, status: w.status, ref: ref.move(w.id, w.title) })),
    objectives: s.annualGoals.map((g) => ({ id: g.id, title: g.title, status: g.status, ref: ref.goal(g.id, g.title) })),
    priorities: s.priorities.map((p) => ({ id: p.id, title: p.title, status: p.status, ref: ref.priority(p.id, p.title) })),
  };
}

/** Everything the CEO Agent needs to read one KPI against the strategy. */
export async function kpiContext(rt: Runtime, metricId: string): Promise<KpiInput> {
  const s = await companySnapshot(rt);
  const view = s.metrics.find((v) => v.metric.id === metricId);
  if (!view) throw new Error("KPI not found or archived");
  const m = view.metric;
  const cur = s.company.currency;
  const fmt = (v: number | null) => formatMetric(v, m.unit, { decimals: m.decimals, currency: cur });
  const links = s.metricLinks
    .filter((l) => l.metric_id === metricId)
    .flatMap((l): KpiInput["links"] => {
      if (l.winning_move_id) {
        const w = s.winningMoves.find((x) => x.id === l.winning_move_id);
        return w ? [{ type: "winning_move" as const, id: w.id, title: w.title, status: w.status, ref: ref.move(w.id, w.title) }] : [];
      }
      if (l.annual_goal_id) {
        const g = s.annualGoals.find((x) => x.id === l.annual_goal_id);
        return g ? [{ type: "annual_goal" as const, id: g.id, title: g.title, status: g.status, ref: ref.goal(g.id, g.title) }] : [];
      }
      const p = s.priorities.find((x) => x.id === l.quarterly_priority_id);
      return p ? [{ type: "quarterly_priority" as const, id: p.id, title: p.title, status: p.status, ref: ref.priority(p.id, p.title) }] : [];
    });
  const related = s.metrics
    .filter((v) => v.metric.id !== metricId && (v.metric.is_key || v.metric.in_weekly_scorecard))
    .map((v) => ({ id: v.metric.id, name: v.metric.name, category: v.metric.category, status: v.status, declining: v.trend === "declining" || v.deteriorating, ref: ref.metric(v.metric.id, v.metric.name) }));
  const { data: actions } = await rt.db.from("actions").select("id, title, due_date, status").eq("company_id", rt.companyId).eq("metric_id", metricId).order("created_at", { ascending: false }).limit(10);
  const issues = s.openIssues.filter((i) => i.metric_id === metricId);
  const fin = m.comparable_key === "revenue" ? s.financials.revenue : m.comparable_key === "ebitda" ? s.financials.ebitda : null;
  return {
    today: rt.today,
    metric: { id: m.id, name: m.name, unit: m.unit, category: m.category, comparable_key: m.comparable_key, direction: m.direction, owner_name: s.crewById.get(m.owner_id)?.full_name ?? "" },
    points: view.points.map((p) => ({ period: p.period, value: p.value, target: p.target, status: p.status })),
    fmt,
    links,
    related,
    correctiveActions: (actions ?? []).map((a) => ({ ...a, ref: ref.action(a.id, a.title) })),
    issues: issues.map((i) => ({ id: i.id, title: i.title, ref: ref.issue(i.id, i.title) })),
    northStar: s.northStar
      ? { vision: s.northStar.vision, targetYear: s.northStar.target_year, targetRevenue: s.northStar.target_revenue, targetEbitda: s.northStar.target_ebitda, assumptions: (s.northStar.assumptions as string[]) ?? [], ref: ref.northStar(s.northStar.id) }
      : null,
    financial: fin ? { ytdActual: fin.actual, ytdPlan: fin.plan, variancePct: fin.variancePct } : null,
    metricRef: ref.metric(m.id, m.name),
  };
}
