// Pure KPI logic shared by the Scoreboard, Blueprint, meeting agendas and portfolio views.

export type MetricDirection = "higher_is_better" | "lower_is_better" | "range";
export type MetricFrequency = "weekly" | "monthly";
export type MetricStatus = "on_track" | "at_risk" | "off_track" | "no_data";

export interface MetricRule {
  direction: MetricDirection;
  target: number | null;
  targetMin?: number | null;
  targetMax?: number | null;
  /** Percentage band outside the target that counts as "at risk" rather than "off track". */
  tolerancePct: number;
}

const num = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Status of a single observation against its target.
 * - higher_is_better: on track at or above target; at risk within tolerance below.
 * - lower_is_better: on track at or below target; at risk within tolerance above.
 * - range: on track inside [min, max]; at risk within tolerance of the range width outside it.
 */
export function evaluateMetric(value: number | null | undefined, rule: MetricRule): MetricStatus {
  if (!num(value)) return "no_data";
  const tol = Math.max(0, rule.tolerancePct) / 100;

  if (rule.direction === "range") {
    const min = rule.targetMin;
    const max = rule.targetMax;
    if (!num(min) || !num(max)) return "no_data";
    if (value >= min && value <= max) return "on_track";
    const width = max - min;
    const band = width > 0 ? width * tol : Math.abs(max) * tol;
    if (value >= min - band && value <= max + band) return "at_risk";
    return "off_track";
  }

  const target = rule.target;
  if (!num(target)) return "no_data";
  const band = Math.abs(target) * tol;
  if (rule.direction === "higher_is_better") {
    if (value >= target) return "on_track";
    if (value >= target - band) return "at_risk";
    return "off_track";
  }
  if (value <= target) return "on_track";
  if (value <= target + band) return "at_risk";
  return "off_track";
}

/** Signed performance vs target, where positive is always "better". Null when not comparable. */
export function varianceToTarget(value: number | null | undefined, rule: MetricRule): number | null {
  if (!num(value)) return null;
  if (rule.direction === "range") {
    if (!num(rule.targetMin) || !num(rule.targetMax)) return null;
    if (value < rule.targetMin) return value - rule.targetMin;
    if (value > rule.targetMax) return rule.targetMax - value;
    return 0;
  }
  if (!num(rule.target)) return null;
  return rule.direction === "higher_is_better" ? value - rule.target : rule.target - value;
}

export type Trend = "improving" | "declining" | "flat" | "unknown";

/** Direction-aware trend from the last few observations (oldest first). */
export function trendOf(values: Array<number | null | undefined>, direction: MetricDirection, rule?: MetricRule): Trend {
  const clean = values.filter(num);
  if (clean.length < 2) return "unknown";
  const recent = clean.slice(-3);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const scale = Math.max(Math.abs(first), Math.abs(last), 1e-9);
  const change = (last - first) / scale;
  if (Math.abs(change) < 0.01) return "flat";
  if (direction === "range" && rule && num(rule.targetMin) && num(rule.targetMax)) {
    const mid = (rule.targetMin + rule.targetMax) / 2;
    return Math.abs(last - mid) < Math.abs(first - mid) ? "improving" : "declining";
  }
  const up = change > 0;
  return (direction === "lower_is_better" ? !up : up) ? "improving" : "declining";
}

/** True when the metric has worsened status-wise over the last observations. */
export function isDeteriorating(statuses: MetricStatus[]): boolean {
  const rank: Record<MetricStatus, number> = { on_track: 0, at_risk: 1, off_track: 2, no_data: -1 };
  const known = statuses.filter((s) => s !== "no_data");
  if (known.length < 2) return false;
  return rank[known[known.length - 1]] > rank[known[known.length - 2]];
}

// ---------------------------------------------------------------------------
// Reporting periods
// ---------------------------------------------------------------------------

export function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Start of the reporting period containing `date`: Monday for weekly, the 1st for monthly. */
export function periodStart(date: Date | string, frequency: MetricFrequency): string {
  const d = typeof date === "string" ? parseISODate(date) : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (frequency === "monthly") return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return toISODate(d);
}

export function shiftPeriod(start: string, frequency: MetricFrequency, n: number): string {
  const d = parseISODate(start);
  if (frequency === "monthly") return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return toISODate(d);
}

/** The most recent fully-completed period before `today`. */
export function lastCompletedPeriod(today: Date, frequency: MetricFrequency): string {
  return shiftPeriod(periodStart(today, frequency), frequency, -1);
}

/** `count` period starts ending with `end` (inclusive), oldest first. */
export function periodRange(end: string, frequency: MetricFrequency, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftPeriod(end, frequency, i - count + 1));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function periodLabel(start: string, frequency: MetricFrequency, short = false): string {
  const d = parseISODate(start);
  if (frequency === "monthly") return short ? MONTHS[d.getUTCMonth()] : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${short ? "" : "w/c "}${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** First day of the fiscal year containing `date`. */
export function fiscalYearStart(date: Date, fyStartMonth: number): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const startYear = m >= fyStartMonth ? y : y - 1;
  return toISODate(new Date(Date.UTC(startYear, fyStartMonth - 1, 1)));
}

/** Label year of a fiscal year (the calendar year in which it ends). */
export function fiscalYearOf(date: Date, fyStartMonth: number): number {
  const start = parseISODate(fiscalYearStart(date, fyStartMonth));
  return fyStartMonth === 1 ? start.getUTCFullYear() : start.getUTCFullYear() + 1;
}

export interface Observation {
  period_start: string;
  value: number | null;
  target: number | null;
}

export interface YtdSummary {
  actual: number;
  plan: number;
  periods: number;
  variancePct: number | null;
}

/** Year-to-date actual vs plan for flow metrics (e.g. revenue) over completed periods with data. */
export function ytd(observations: Observation[], fyStart: string, defaultTarget: number | null): YtdSummary {
  let actual = 0;
  let plan = 0;
  let periods = 0;
  for (const o of observations) {
    if (o.period_start < fyStart || !num(o.value)) continue;
    const t = num(o.target) ? o.target : defaultTarget;
    actual += o.value;
    plan += num(t) ? t : 0;
    periods += 1;
  }
  return { actual, plan, periods, variancePct: plan !== 0 ? (actual - plan) / Math.abs(plan) : null };
}
