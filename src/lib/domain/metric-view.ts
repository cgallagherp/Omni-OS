import {
  evaluateMetric,
  isDeteriorating,
  lastCompletedPeriod,
  trendOf,
  varianceToTarget,
  type MetricRule,
  type MetricStatus,
  type Trend,
} from "./metrics";

export interface MetricLike {
  id: string;
  direction: "higher_is_better" | "lower_is_better" | "range";
  frequency: "weekly" | "monthly";
  target_value: number | null;
  target_min: number | null;
  target_max: number | null;
  tolerance_pct: number;
}

export interface ValueLike {
  period_start: string;
  value: number | null;
  target: number | null;
}

export interface Point {
  period: string;
  value: number | null;
  target: number | null;
  status: MetricStatus;
}

export interface MetricView<M extends MetricLike = MetricLike> {
  metric: M;
  points: Point[];
  latest: Point | null;
  previous: Point | null;
  status: MetricStatus;
  trend: Trend;
  deteriorating: boolean;
  /** No value recorded for the most recently completed period. */
  missingLatest: boolean;
  lastCompleted: string;
  variance: number | null;
}

export function ruleFor(m: MetricLike, periodTarget?: number | null): MetricRule {
  return {
    direction: m.direction,
    target: periodTarget ?? m.target_value,
    targetMin: m.target_min,
    targetMax: m.target_max,
    tolerancePct: Number(m.tolerance_pct),
  };
}

export function buildMetricView<M extends MetricLike>(metric: M, values: ValueLike[], now: Date): MetricView<M> {
  const lastCompleted = lastCompletedPeriod(now, metric.frequency);
  const points: Point[] = [...values]
    .filter((v) => v.period_start <= lastCompleted || v.value !== null)
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .map((v) => {
      const target = v.target ?? metric.target_value;
      return {
        period: v.period_start,
        value: v.value === null ? null : Number(v.value),
        target: target === null ? null : Number(target),
        status: evaluateMetric(v.value === null ? null : Number(v.value), ruleFor(metric, v.target)),
      };
    });
  const withValues = points.filter((p) => p.value !== null);
  const latest = withValues.at(-1) ?? null;
  const previous = withValues.at(-2) ?? null;
  return {
    metric,
    points,
    latest,
    previous,
    status: latest?.status ?? "no_data",
    trend: trendOf(
      withValues.map((p) => p.value),
      metric.direction,
      ruleFor(metric),
    ),
    deteriorating: isDeteriorating(withValues.slice(-3).map((p) => p.status)),
    missingLatest: !latest || latest.period < lastCompleted,
    lastCompleted,
    variance: latest ? varianceToTarget(latest.value, ruleFor(metric, latest.target)) : null,
  };
}

/** KPI exceptions for meeting agendas and dashboards: off track, at risk, deteriorating or not reported. */
export function isException(v: MetricView): boolean {
  return v.status === "off_track" || v.status === "at_risk" || v.deteriorating || v.missingLatest;
}

export function exceptionReason(v: MetricView): string {
  if (v.status === "off_track") return "Off track";
  if (v.status === "at_risk") return "At risk";
  if (v.deteriorating) return "Deteriorating";
  if (v.missingLatest) return "Not reported";
  return "On track";
}

export function summariseStatuses(views: MetricView[]) {
  const s = { on_track: 0, at_risk: 0, off_track: 0, no_data: 0, total: views.length };
  for (const v of views) s[v.status] += 1;
  return s;
}
