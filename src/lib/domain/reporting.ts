// The three management reporting outputs and their deadlines (Omni Operating System):
//   flash report      — CFO, within 5 working days of month end
//   monthly Board     — one-page check-in with the monthly accounts; papers 3 working days
//                       before the Board meeting, accounts within 21 days of month end
//   quarterly Board   — the full pack for the quarter; papers 3 working days before the meeting
// They are distinct from each other and from the Monday KPI scorecard.
import { accountsDeadline, flashDeadline } from "./operating-system";

export type ReportKind = "flash" | "monthly_board" | "quarterly_board";

export const REPORT_META: Record<ReportKind, { label: string; short: string; owner: string; cadence: string; purpose: string }> = {
  flash: {
    label: "Monthly flash report",
    short: "Flash",
    owner: "CFO",
    cadence: "Within 5 working days of month end",
    purpose: "Headline trading, revenue and EBITDA, cash, KPIs and exceptions for the month.",
  },
  monthly_board: {
    label: "Monthly Board check-in",
    short: "Board check-in",
    owner: "CEO · CFO",
    cadence: "Papers 3 working days before the monthly Board; accounts within 21 days",
    purpose: "One page: financials against budget, trends, KPIs, cash and liquidity, people and risks, priority progress, changes needing attention and decisions needed.",
  },
  quarterly_board: {
    label: "Quarterly Board pack",
    short: "Board pack",
    owner: "CEO · CFO",
    cadence: "Papers 3 working days before the quarterly Board",
    purpose: "Strategy against the North Star, Flight Plan progress, budget, capital allocation, M&A, risk, leadership at governance level, outlook and decisions required.",
  },
};

/** Management text sections a report carries (stored in board_reports.content). */
export const REPORT_SECTIONS: Record<ReportKind, Array<{ key: string; label: string; hint: string }>> = {
  flash: [
    { key: "headline", label: "Headline trading", hint: "Two or three sentences on the month." },
    { key: "cash", label: "Cash", hint: "Closing cash, headroom and anything unusual." },
    { key: "exceptions", label: "Exceptions", hint: "What is off plan and what is being done about it." },
  ],
  monthly_board: [
    { key: "financials", label: "Financials against budget", hint: "Revenue, EBITDA and the main variances." },
    { key: "trends", label: "Trends", hint: "Direction of travel across the last few months." },
    { key: "cash", label: "Cash and liquidity", hint: "Cash, headroom, covenants." },
    { key: "people_risks", label: "People and risks", hint: "Organisational matters at governance level and key risks. No individual assessments." },
    { key: "changes", label: "Changes needing attention", hint: "What has changed since the last Board." },
    { key: "decisions", label: "Decisions needed", hint: "What the Board is asked to decide." },
  ],
  quarterly_board: [
    { key: "strategy", label: "Strategy against the North Star", hint: "Are we still heading to the agreed destination?" },
    { key: "budget", label: "Budget and outlook", hint: "Performance against budget and the outlook for the year." },
    { key: "capital", label: "Capital allocation", hint: "Investment, capex and working capital priorities." },
    { key: "mna", label: "M&A", hint: "Pipeline and progress on buy-and-build." },
    { key: "risk", label: "Risk", hint: "Principal risks and mitigations." },
    { key: "leadership", label: "Leadership and organisation", hint: "At governance level only — agreed organisational actions, not individual assessments." },
    { key: "decisions", label: "Decisions required", hint: "What the Board is asked to decide." },
  ],
};

const DAY = 86400000;
const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function workingDaysBefore(d: Date, n: number): Date {
  let x = new Date(d);
  let left = n;
  while (left > 0) {
    x = new Date(x.getTime() - DAY);
    const dow = x.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return x;
}

/** Start of the fiscal quarter containing `d`. */
export function fiscalQuarterStart(d: Date, fyStartMonth: number): Date {
  const offset = (d.getUTCMonth() - (fyStartMonth - 1) + 12) % 12;
  return utc(d.getUTCFullYear(), d.getUTCMonth() - (offset % 3));
}

export interface ReportRecord {
  kind: ReportKind;
  period_start: string;
  status: "draft" | "published";
  published_at: string | null;
}

export interface ScheduledReport {
  kind: ReportKind;
  periodStart: string;
  periodLabel: string;
  due: string;
  state: "published" | "published_late" | "draft" | "due" | "overdue";
  record: ReportRecord | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function periodLabel(kind: ReportKind, periodStart: string): string {
  const d = new Date(`${periodStart}T00:00:00Z`);
  if (kind === "quarterly_board") {
    const end = utc(d.getUTCFullYear(), d.getUTCMonth() + 2);
    return `${MONTHS[d.getUTCMonth()]}–${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
  }
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Due date for a report period, using the next Board meeting after the period where one is scheduled. */
export function reportDue(kind: ReportKind, periodStart: string, boardMeetings: Array<{ type: string; scheduled_at: string }>): string {
  const start = new Date(`${periodStart}T00:00:00Z`);
  if (kind === "flash") return iso(flashDeadline(start));
  const months = kind === "quarterly_board" ? 3 : 1;
  const periodEnd = utc(start.getUTCFullYear(), start.getUTCMonth() + months, 0);
  const type = kind === "quarterly_board" ? "board_quarterly" : "board_monthly";
  const meeting = boardMeetings
    .filter((m) => m.type === type && m.scheduled_at.slice(0, 10) > iso(periodEnd))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  if (meeting) return iso(workingDaysBefore(new Date(`${meeting.scheduled_at.slice(0, 10)}T00:00:00Z`), 3));
  // No meeting scheduled: fall back to the accounts deadline for the period's last month.
  return iso(accountsDeadline(utc(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth())));
}

/**
 * The reporting obligations for the most recent completed periods — the last
 * two months (flash, monthly Board) and the last completed quarter — and
 * whether each was published, published late, is still due or is overdue.
 */
export function reportingSchedule(input: {
  today: Date;
  fyStartMonth: number;
  reports: ReportRecord[];
  boardMeetings: Array<{ type: string; scheduled_at: string }>;
  since?: string | null; // e.g. completion date: nothing is owed before this
}): ScheduledReport[] {
  const { today } = input;
  const todayIso = iso(today);
  const periods: Array<{ kind: ReportKind; start: string }> = [];
  for (const back of [2, 1]) {
    const m = iso(utc(today.getUTCFullYear(), today.getUTCMonth() - back));
    periods.push({ kind: "flash", start: m }, { kind: "monthly_board", start: m });
  }
  const thisQ = fiscalQuarterStart(today, input.fyStartMonth);
  periods.push({ kind: "quarterly_board", start: iso(utc(thisQ.getUTCFullYear(), thisQ.getUTCMonth() - 3)) });

  return periods
    .filter((p) => !input.since || p.start >= input.since.slice(0, 7) + "-01")
    .map((p) => {
      const record = input.reports.find((r) => r.kind === p.kind && r.period_start === p.start) ?? null;
      const due = reportDue(p.kind, p.start, input.boardMeetings);
      let state: ScheduledReport["state"];
      if (record?.status === "published") state = record.published_at && record.published_at.slice(0, 10) > due ? "published_late" : "published";
      else if (due < todayIso) state = "overdue";
      else state = record ? "draft" : "due";
      return { kind: p.kind, periodStart: p.start, periodLabel: periodLabel(p.kind, p.start), due, state, record };
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

export const REPORT_STATE = {
  published: { label: "Published on time", variant: "on" },
  published_late: { label: "Published late", variant: "risk" },
  draft: { label: "Draft", variant: "outline" },
  due: { label: "Due", variant: "outline" },
  overdue: { label: "Overdue", variant: "off" },
} as const;

export function reportingCompliance(items: ScheduledReport[]) {
  const settled = items.filter((i) => i.state !== "due" && i.state !== "draft");
  const onTime = settled.filter((i) => i.state === "published").length;
  return { onTime, late: settled.filter((i) => i.state === "published_late").length, overdue: settled.filter((i) => i.state === "overdue").length, total: settled.length };
}

/** Reporting deadlines falling in the next `months` months (for the governance calendar). */
export function upcomingReportDeadlines(input: { today: Date; fyStartMonth: number; boardMeetings: Array<{ type: string; scheduled_at: string }>; months?: number }) {
  const { today } = input;
  const horizon = iso(utc(today.getUTCFullYear(), today.getUTCMonth() + (input.months ?? 12), 1));
  const todayIso = iso(today);
  const out: Array<{ kind: ReportKind; periodStart: string; periodLabel: string; due: string }> = [];
  for (let back = 1; back >= -(input.months ?? 12); back--) {
    const m = iso(utc(today.getUTCFullYear(), today.getUTCMonth() - back));
    for (const kind of ["flash", "monthly_board"] as const) {
      const due = reportDue(kind, m, input.boardMeetings);
      if (due >= todayIso && due < horizon) out.push({ kind, periodStart: m, periodLabel: periodLabel(kind, m), due });
    }
    const d = new Date(`${m}T00:00:00Z`);
    if (iso(fiscalQuarterStart(d, input.fyStartMonth)) === m) {
      const due = reportDue("quarterly_board", m, input.boardMeetings);
      if (due >= todayIso && due < horizon && utc(d.getUTCFullYear(), d.getUTCMonth() + 3) <= utc(today.getUTCFullYear(), today.getUTCMonth() + (input.months ?? 12)))
        out.push({ kind: "quarterly_board", periodStart: m, periodLabel: periodLabel("quarterly_board", m), due });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
