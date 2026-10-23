import "server-only";
import { formatMetric, targetLabel } from "@/lib/domain/format";
import { periodLabel as metricPeriodLabel } from "@/lib/domain/metrics";
import type { ReportKind } from "@/lib/domain/reporting";
import type { CompanySnapshot } from "./snapshot";

export interface FigureRow {
  metricId: string;
  name: string;
  actual: string;
  target: string;
  status: string;
  period: string;
  exception: boolean;
}

export interface ReportFigures {
  kind: ReportKind;
  periodStart: string;
  periodEnd: string;
  revenue: { actual: number | null; target: number | null } | null;
  ebitda: { actual: number | null; target: number | null } | null;
  cash: { actual: number | null; target: number | null } | null;
  trend: Array<{ period: string; revenue: number | null; revenueTarget: number | null; ebitda: number | null; ebitdaTarget: number | null }>;
  kpis: FigureRow[];
  priorities: Array<{ id: string; title: string; status: string; outcome: string | null; owner: string }>;
  orgActions: Array<{ title: string; target_date: string | null; status: string }>;
  openSeats: number;
  escalatedIssues: Array<{ title: string; priority: string }>;
}

const sumPoints = (pts: Array<{ value: number | null; target: number | null }>) => ({
  actual: pts.every((p) => p.value === null) ? null : pts.reduce((a, p) => a + (p.value ?? 0), 0),
  target: pts.every((p) => p.target === null) ? null : pts.reduce((a, p) => a + (p.target ?? 0), 0),
});

/**
 * Figures for a report period, taken from the operating data (the same KPIs and
 * plan as everywhere else). Published reports store these figures as a snapshot.
 */
export function reportFigures(s: CompanySnapshot, kind: ReportKind, periodStart: string): ReportFigures {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const months = kind === "quarterly_board" ? 3 : 1;
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 0)).toISOString().slice(0, 10);
  const cur = s.company.currency;
  const byKey = (k: string) => s.metrics.find((v) => v.metric.comparable_key === k);
  const inPeriod = (p: string) => p >= periodStart && p <= end;
  const flow = (k: string) => {
    const v = byKey(k);
    if (!v) return null;
    return sumPoints(v.points.filter((p) => inPeriod(p.period)));
  };
  const stock = (k: string) => {
    const v = byKey(k);
    if (!v) return null;
    const p = [...v.points].reverse().find((x) => x.period <= end && x.value !== null);
    return p ? { actual: p.value, target: p.target ?? v.metric.target_value } : { actual: null, target: v.metric.target_value };
  };

  const trendStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months - 6, 1)).toISOString().slice(0, 10);
  const rev = byKey("revenue");
  const ebi = byKey("ebitda");
  const trend: ReportFigures["trend"] = [];
  for (let i = 0; i < 6; i++) {
    const m = new Date(`${trendStart}T00:00:00Z`);
    m.setUTCMonth(m.getUTCMonth() + i);
    const key = m.toISOString().slice(0, 10);
    const r = rev?.points.find((p) => p.period === key);
    const e = ebi?.points.find((p) => p.period === key);
    trend.push({ period: key, revenue: r?.value ?? null, revenueTarget: r?.target ?? null, ebitda: e?.value ?? null, ebitdaTarget: e?.target ?? null });
  }

  const kpis = s.metrics
    .filter((v) => v.metric.is_key || v.metric.in_weekly_scorecard)
    .map((v) => {
      const p = [...v.points].reverse().find((x) => x.period <= end);
      const reported = p && p.value !== null;
      const status = reported ? p.status : "no_data";
      return {
        metricId: v.metric.id,
        name: v.metric.name,
        actual: reported ? formatMetric(p.value, v.metric.unit, { decimals: v.metric.decimals, currency: cur }) : "Not reported",
        target: targetLabel(v.metric, p?.target ?? v.metric.target_value, cur),
        status,
        period: p ? metricPeriodLabel(p.period, v.metric.frequency) : "—",
        exception: status !== "on_track",
      };
    })
    .sort((a, b) => Number(b.exception) - Number(a.exception));

  return {
    kind,
    periodStart,
    periodEnd: end,
    revenue: flow("revenue"),
    ebitda: flow("ebitda"),
    cash: stock("cash"),
    trend,
    kpis,
    priorities: s.priorities.map((p) => ({ id: p.id, title: p.title, status: p.status, outcome: p.outcome, owner: s.crewById.get(p.owner_id)?.full_name ?? "—" })),
    orgActions: s.orgActions.map((o) => ({ title: o.title, target_date: o.target_date, status: o.status })),
    openSeats: s.crew.filter((c) => c.is_open_seat).length,
    escalatedIssues: s.escalatedIssues.map((i) => ({ title: i.title, priority: i.priority })),
  };
}
