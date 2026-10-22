import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import { buildMetricView, isException, summariseStatuses, type MetricView } from "@/lib/domain/metric-view";
import { fiscalYearOf, fiscalYearStart, toISODate, ytd, type YtdSummary } from "@/lib/domain/metrics";
import type {
  Action,
  AnnualGoal,
  Company,
  CrewMember,
  Decision,
  Issue,
  Meeting,
  Metric,
  MetricLink,
  NorthStar,
  Quarter,
  QuarterlyPriority,
  WinningMove,
} from "./types";

/** Paginates past PostgREST's max-rows limit. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export interface CompanySnapshot {
  company: Company;
  now: Date;
  fiscalYear: number;
  northStar: NorthStar | null;
  crew: CrewMember[];
  crewById: Map<string, CrewMember>;
  winningMoves: WinningMove[];
  annualGoals: AnnualGoal[];
  activeQuarter: Quarter | null;
  priorities: QuarterlyPriority[];
  metrics: MetricView<Metric>[];
  metricLinks: MetricLink[];
  kpi: ReturnType<typeof summariseStatuses>;
  exceptions: MetricView<Metric>[];
  financials: { revenue: YtdSummary | null; ebitda: YtdSummary | null; revenueMetric: Metric | null; ebitdaMetric: Metric | null };
  priorityStatus: Record<"on_track" | "at_risk" | "off_track" | "done" | "other", number>;
  openIssues: Issue[];
  escalatedIssues: Issue[];
  openActions: Action[];
  overdueActions: Action[];
  recentDecisions: Decision[];
  lastWeekly: Meeting | null;
  lastReview: Meeting | null;
  nextMeeting: Meeting | null;
  nextQuarterly: Meeting | null;
  meetingsLast4Weeks: number;
}

const byOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

export async function loadCompanySnapshots(supabase: Supabase, companyIds: string[], now = new Date()): Promise<CompanySnapshot[]> {
  if (companyIds.length === 0) return [];
  const sinceValues = toISODate(new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() - 2, 1)));
  const today = toISODate(now);

  const [companies, northStars, crew, moves, goals, quarters, priorities, metrics, links, issues, actions, decisions, meetings, values] =
    await Promise.all([
      supabase.from("companies").select("*").in("id", companyIds).then(must),
      supabase.from("north_stars").select("*").in("company_id", companyIds).then(must),
      supabase.from("crew_members").select("*").in("company_id", companyIds).order("sort_order").then(must),
      supabase.from("winning_moves").select("*").in("company_id", companyIds).eq("archived", false).then(must),
      supabase.from("annual_goals").select("*").in("company_id", companyIds).then(must),
      supabase.from("quarters").select("*").in("company_id", companyIds).order("start_date").then(must),
      supabase.from("quarterly_priorities").select("*").in("company_id", companyIds).then(must),
      supabase.from("metrics").select("*").in("company_id", companyIds).eq("archived", false).then(must),
      supabase.from("metric_links").select("*").in("company_id", companyIds).then(must),
      supabase.from("issues").select("*").in("company_id", companyIds).neq("status", "resolved").then(must),
      supabase.from("actions").select("*").in("company_id", companyIds).eq("status", "open").order("due_date").then(must),
      supabase.from("decisions").select("*").in("company_id", companyIds).order("decided_on", { ascending: false }).limit(50 * companyIds.length).then(must),
      supabase.from("meetings").select("*").in("company_id", companyIds).order("scheduled_at").then(must),
      fetchAll((from, to) =>
        supabase
          .from("metric_values")
          .select("metric_id, company_id, period_start, value, target")
          .in("company_id", companyIds)
          .gte("period_start", sinceValues)
          .order("period_start")
          .order("id")
          .range(from, to),
      ),
    ]);

  const valuesByMetric = new Map<string, typeof values>();
  for (const v of values) {
    const list = valuesByMetric.get(v.metric_id) ?? [];
    list.push(v);
    valuesByMetric.set(v.metric_id, list);
  }

  return companies.map((company) => {
    const cid = company.id;
    const fyStart = fiscalYearStart(now, company.fiscal_year_start_month);
    const fiscalYear = fiscalYearOf(now, company.fiscal_year_start_month);
    const companyCrew = crew.filter((c) => c.company_id === cid);
    const activeQuarter = quarters.find((q) => q.company_id === cid && q.status === "active") ?? null;
    const qp = priorities.filter((p) => p.company_id === cid && p.quarter_id === activeQuarter?.id).sort(byOrder);
    const metricViews = metrics
      .filter((m) => m.company_id === cid)
      .sort(byOrder)
      .map((m) => buildMetricView(m, valuesByMetric.get(m.id) ?? [], now));

    const flow = (key: string) => {
      const view = metricViews.find((v) => v.metric.comparable_key === key);
      if (!view) return { summary: null, metric: null };
      return { summary: ytd(view.points.map((p) => ({ period_start: p.period, value: p.value, target: p.target })), fyStart, view.metric.target_value), metric: view.metric };
    };
    const revenue = flow("revenue");
    const ebitda = flow("ebitda");

    const priorityStatus = { on_track: 0, at_risk: 0, off_track: 0, done: 0, other: 0 };
    for (const p of qp) {
      if (p.status === "on_track" || p.status === "at_risk" || p.status === "off_track" || p.status === "done") priorityStatus[p.status] += 1;
      else priorityStatus.other += 1;
    }

    const companyMeetings = meetings.filter((m) => m.company_id === cid);
    const completed = companyMeetings.filter((m) => m.status === "completed");
    const upcoming = companyMeetings.filter((m) => m.status !== "completed" && m.scheduled_at >= `${today}T00:00:00`);
    const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000).toISOString();
    const openIssues = issues
      .filter((i) => i.company_id === cid)
      .sort((a, b) => rankPriority(a.priority) - rankPriority(b.priority) || b.created_at.localeCompare(a.created_at));
    const openActions = actions.filter((a) => a.company_id === cid);

    return {
      company,
      now,
      fiscalYear,
      northStar: northStars.find((n) => n.company_id === cid) ?? null,
      crew: companyCrew,
      crewById: new Map(companyCrew.map((c) => [c.id, c])),
      winningMoves: moves.filter((m) => m.company_id === cid).sort(byOrder),
      annualGoals: goals.filter((g) => g.company_id === cid && g.fiscal_year === fiscalYear).sort(byOrder),
      activeQuarter,
      priorities: qp,
      metrics: metricViews,
      metricLinks: links.filter((l) => l.company_id === cid),
      kpi: summariseStatuses(metricViews),
      exceptions: metricViews.filter(isException),
      financials: { revenue: revenue.summary, ebitda: ebitda.summary, revenueMetric: revenue.metric, ebitdaMetric: ebitda.metric },
      priorityStatus,
      openIssues,
      escalatedIssues: openIssues.filter((i) => i.escalated_to_omni || i.priority === "critical"),
      openActions,
      overdueActions: openActions.filter((a) => a.due_date !== null && a.due_date < today),
      recentDecisions: decisions.filter((d) => d.company_id === cid).slice(0, 10),
      lastWeekly: completed.filter((m) => m.type === "weekly").at(-1) ?? null,
      lastReview: completed.filter((m) => m.type !== "weekly").at(-1) ?? null,
      nextMeeting: upcoming[0] ?? null,
      nextQuarterly: upcoming.find((m) => m.type === "quarterly" || m.type === "annual") ?? null,
      meetingsLast4Weeks: completed.filter((m) => m.type === "weekly" && (m.ended_at ?? m.scheduled_at) >= fourWeeksAgo).length,
    } satisfies CompanySnapshot;
  });
}

export function rankPriority(p: Issue["priority"]): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[p];
}

export async function loadCompanySnapshot(supabase: Supabase, companyId: string, now = new Date()) {
  const [snap] = await loadCompanySnapshots(supabase, [companyId], now);
  return snap ?? null;
}
