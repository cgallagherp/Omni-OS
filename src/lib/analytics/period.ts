// Reporting periods for the intelligence modules. Months are ISO dates on the 1st
// ("2026-09-01") and represent the month-end position (ARR) or the month's flow (P&L).
// A period runs from an *opening* month (exclusive, the prior month-end) to an end month.

export type Grain = "month" | "quarter" | "ytd" | "ltm" | "year";
export const GRAINS: Grain[] = ["month", "quarter", "ytd", "ltm", "year"];
export const GRAIN_LABEL: Record<Grain, string> = { month: "Month", quarter: "Quarter", ytd: "Year to date", ltm: "Last 12 months", year: "Financial year" };

export interface Period {
  grain: Grain;
  /** Month-end before the first month of the period (opening position) */
  open: string;
  /** First month of the period */
  start: string;
  /** Last month of the period */
  end: string;
  months: string[];
  label: string;
  short: string;
  /** The period is still running (a quarter or year to date) */
  partial: boolean;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function month(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toISOString().slice(0, 10);
}
export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  return month(y, m + n);
}
export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}
export function monthLabel(iso: string, long = false) {
  const [y, m] = iso.split("-").map(Number);
  return long ? `${MON[m - 1]} ${y}` : `${MON[m - 1]} ${String(y).slice(2)}`;
}
export function isMonth(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])(-01)?$/.test(s);
}
export function normMonth(s: string) {
  return s.length === 7 ? `${s}-01` : s;
}

/** Fiscal year (named by the calendar year it ends in) and its first month. */
export function fiscalYear(iso: string, fyStart: number) {
  const [y, m] = iso.split("-").map(Number);
  const fyEndYear = fyStart === 1 ? y : m >= fyStart ? y + 1 : y;
  const startYear = fyStart === 1 ? y : fyEndYear - 1;
  return { fy: fyEndYear, start: month(startYear, fyStart) };
}
export function fiscalQuarter(iso: string, fyStart: number) {
  const { fy, start } = fiscalYear(iso, fyStart);
  const q = Math.floor(monthsBetween(start, iso) / 3) + 1;
  return { fy, q, start: addMonths(start, (q - 1) * 3) };
}
const fyLabel = (fy: number, fyStart: number) => (fyStart === 1 ? String(fy) : `FY${String(fy).slice(2)}`);

export function periodOf(grain: Grain, end: string, fyStart = 1): Period {
  let start: string;
  let label: string;
  let short: string;
  let partial = false;
  if (grain === "month") {
    start = end;
    label = monthLabel(end, true);
    short = monthLabel(end);
  } else if (grain === "quarter") {
    const fq = fiscalQuarter(end, fyStart);
    start = fq.start;
    partial = monthsBetween(start, end) < 2;
    label = `Q${fq.q} ${fyLabel(fq.fy, fyStart)}${partial ? ` (to ${monthLabel(end)})` : ""}`;
    short = `Q${fq.q} ${fyLabel(fq.fy, fyStart)}`;
  } else if (grain === "ytd" || grain === "year") {
    const f = fiscalYear(end, fyStart);
    start = f.start;
    partial = monthsBetween(start, end) < 11;
    label = grain === "ytd" ? `${fyLabel(f.fy, fyStart)} year to ${monthLabel(end)}` : `${fyLabel(f.fy, fyStart)}${partial ? ` (to ${monthLabel(end)})` : ""}`;
    short = fyLabel(f.fy, fyStart) + (grain === "ytd" ? " YTD" : "");
  } else {
    start = addMonths(end, -11);
    label = `12 months to ${monthLabel(end, true)}`;
    short = `LTM ${monthLabel(end)}`;
  }
  return { grain, open: addMonths(start, -1), start, end, months: monthRange(start, end), label, short, partial };
}

/** The same-length period immediately before, and the same period a year earlier. */
export function priorPeriod(p: Period, fyStart = 1): Period {
  if (p.grain === "month" || p.grain === "ltm") return periodOf(p.grain, addMonths(p.start, -1), fyStart);
  const len = p.months.length;
  if (p.grain === "quarter") return periodOf("quarter", addMonths(p.start, -1), fyStart);
  // year / ytd: same months of the previous financial year
  const prev = periodOf(p.grain, addMonths(p.end, -12), fyStart);
  return { ...prev, months: prev.months.slice(0, len) };
}
export function yearAgo(p: Period, fyStart = 1): Period {
  return periodOf(p.grain, addMonths(p.end, -12), fyStart);
}

/** A series of consecutive periods ending at `end` (for trend charts and the bridge history). */
export function periodSeries(grain: Grain, end: string, count: number, fyStart = 1, earliest?: string): Period[] {
  const out: Period[] = [];
  let p = periodOf(grain, end, fyStart);
  for (let i = 0; i < count; i++) {
    if (earliest && p.open < addMonths(earliest, -1)) break;
    out.unshift(p);
    p = grain === "ytd" || grain === "ltm" ? periodOf(grain, addMonths(p.end, -1), fyStart) : periodOf(grain, addMonths(p.start, -1), fyStart);
  }
  return out;
}

export interface PeriodQuery {
  grain: Grain;
  end: string;
}
/** Read ?g= and ?end= from search params, clamped to the data's coverage. */
export function parsePeriod(sp: Record<string, string | string[] | undefined>, coverageEnd: string, defaultGrain: Grain = "month", coverageStart?: string): PeriodQuery {
  const g = typeof sp.g === "string" && (GRAINS as string[]).includes(sp.g) ? (sp.g as Grain) : defaultGrain;
  let end = typeof sp.end === "string" && isMonth(sp.end) ? normMonth(sp.end) : coverageEnd;
  if (end > coverageEnd) end = coverageEnd;
  if (coverageStart && end < addMonths(coverageStart, 1)) end = addMonths(coverageStart, 1);
  return { grain: g, end };
}
