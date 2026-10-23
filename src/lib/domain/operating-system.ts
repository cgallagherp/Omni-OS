// The Omni Operating System (Chair & CEO briefing, October 2026): the operating cycle,
// the first-100-days timetable and the investor governance requirements, as templates.

export const OPERATING_CYCLE = [
  { step: 1, title: "Listen", summary: "Understand the company, its people and its customers." },
  { step: 2, title: "Choose the destination", summary: "Agree Vision, Mission and Values, then the North Star." },
  { step: 3, title: "Work backwards", summary: "Build the Flight Plan from the destination." },
  { step: 4, title: "Build the Crew", summary: "Make sure the organisation can deliver it." },
  { step: 5, title: "Create Mission Control", summary: "Set up the scorecard and the meeting rhythm." },
  { step: 6, title: "Execute for 90 days", summary: "Deliver about three priorities, each with one owner." },
  { step: 7, title: "Stop and reset", summary: "Review the quarter and choose the next priorities." },
] as const;

export interface MilestoneTemplate {
  step: number;
  title: string;
  description: string;
  deliverable: string;
  lead: string;
  startWeek: number;
  endWeek: number;
  link: string; // company-relative path
}

/** First-100-days timetable. Mission Control set-up starts in week 1. */
export const ONBOARDING_TEMPLATE: MilestoneTemplate[] = [
  { step: 1, title: "Chair and CEO briefing", description: "Completion. Briefing on the Omni Operating System; agree the governance and communication rhythm and fix the leadership offsite dates.", deliverable: "Governance rhythm and offsite dates agreed", lead: "Omni · Chair · CEO", startWeek: 0, endWeek: 1, link: "/onboarding" },
  { step: 1, title: "Employee listening", description: "Hear from people below the ELT through an initial survey and interviews or focus groups across levels and functions.", deliverable: "Listening findings recorded; baseline eNPS", lead: "CEO", startWeek: 1, endWeek: 4, link: "/listening" },
  { step: 1, title: "Leadership diagnostics", description: "Diagnostics for the CEO and key leaders, run by Mindflick. Individual results stay outside Omni OS.", deliverable: "Diagnostics complete (held outside Omni OS)", lead: "Mindflick", startWeek: 1, endWeek: 4, link: "/onboarding" },
  { step: 1, title: "Strategic and operational diagnostic", description: "Omni and management agree one set of facts: financial performance, customer economics, commercial engine, operations, technology, organisation, competitive position, M&A, key risks.", deliverable: "Starting position agreed by the end of month 1", lead: "Omni · management", startWeek: 1, endWeek: 4, link: "/onboarding" },
  { step: 2, title: "Leadership offsite: Vision, Mission, Values and the North Star", description: "Two in-person sessions with the CEO, ELT, Chair and Omni. Session 1 led by People Made; session 2 by Omni and the CEO.", deliverable: "Vision, Mission, Values and North Star agreed", lead: "People Made · Omni · CEO", startWeek: 3, endWeek: 6, link: "/north-star" },
  { step: 3, title: "Flight Plan and first 90-day priorities", description: "Work back from the North Star: three-year outcomes, 12-month objectives and about three 90-day priorities.", deliverable: "Flight Plan and first priorities agreed", lead: "Omni · CEO · ELT", startWeek: 4, endWeek: 8, link: "/flight-plan" },
  { step: 4, title: "Crew review and agreed organisational actions", description: "Test whether the organisation can deliver the plan. Record only the agreed organisational actions — not assessments of individuals.", deliverable: "Critical roles and organisational actions recorded", lead: "CEO · Chair · Omni", startWeek: 4, endWeek: 10, link: "/crew" },
  { step: 5, title: "Mission Control set-up", description: "Scorecard, weekly ELT meeting, issues and actions, Monday KPI scorecard and the monthly reporting set.", deliverable: "Weekly ELT · scorecard · monthly Board running", lead: "CEO", startWeek: 1, endWeek: 12, link: "/mission-control" },
  { step: 5, title: "Agree the monthly reporting set and Board calendar", description: "Flash report, management accounts, one-page Board check-in and a rolling 12-month Board calendar.", deliverable: "Reporting set and Board calendar agreed", lead: "CEO · CFO · Chair", startWeek: 1, endWeek: 2, link: "/calendar" },
  { step: 5, title: "Personalise the workspace (optional)", description: "Add the company logo and colours. Without changes, the workspace keeps the Omni identity.", deliverable: "Company branding applied, or Omni defaults kept", lead: "Company administrator", startWeek: 1, endWeek: 4, link: "/settings/branding" },
  { step: 6, title: "Execute the first 90 days", description: "Deliver the agreed priorities and manage progress weekly.", deliverable: "Weekly ELT meetings held; Monday scorecard sent", lead: "CEO · ELT", startWeek: 8, endWeek: 13, link: "/meetings" },
  { step: 7, title: "First quarterly offsite: review and reset", description: "Review the quarter and set the next 90 days. The second cycle begins.", deliverable: "Next 90-day priorities active", lead: "CEO · ELT · Chair · Omni", startWeek: 12, endWeek: 14, link: "/quarterly-reset" },
];

export interface GovernanceTemplate {
  title: string;
  requirement: string;
  owner: string;
  cadenceLabel: string;
  cadenceMonths: number | null;
  /** first due date given the completion date and financial-year start */
  firstDue: (ctx: { acquiredOn: Date; fyStart: Date; today: Date }) => Date;
}

const addDaysUTC = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const monthEnd = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

/** n working days (Mon–Fri) after `d`. */
export function workingDaysAfter(d: Date, n: number): Date {
  let x = new Date(d);
  let left = n;
  while (left > 0) {
    x = addDaysUTC(x, 1);
    const dow = x.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return x;
}

/** Flash report deadline for a month: 5 working days after month end. */
export function flashDeadline(monthStart: Date) {
  return workingDaysAfter(monthEnd(monthStart), 5);
}
/** Management accounts deadline: 21 days after month end. */
export function accountsDeadline(monthStart: Date) {
  return addDaysUTC(monthEnd(monthStart), 21);
}

const nextMonthly = (today: Date, fn: (m: Date) => Date) => {
  const prev = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const due = fn(prev);
  return due >= today ? due : fn(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
};

/** Investor requirements. Where these differ from the investment agreement, the agreement governs. */
export const GOVERNANCE_TEMPLATE: GovernanceTemplate[] = [
  { title: "100-day plan", requirement: "Flight Plan and first 90-day priorities agreed with the Board", owner: "CEO", cadenceLabel: "By day 100", cadenceMonths: null, firstDue: ({ acquiredOn }) => addDaysUTC(acquiredOn, 100) },
  { title: "Annual business plan", requirement: "Budget with full P&L, cash flow, balance sheet and covenant tests, built from the annual strategy reset", owner: "CEO / CFO", cadenceLabel: "Draft at least 4 weeks before the financial year", cadenceMonths: 12, firstDue: ({ fyStart, today }) => { let d = addDaysUTC(fyStart, -28); while (d < today) d = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate())); return d; } },
  { title: "Flash report", requirement: "Headline trading, cash and KPIs for the month", owner: "CFO", cadenceLabel: "Within 5 working days of month end", cadenceMonths: 1, firstDue: ({ today }) => nextMonthly(today, flashDeadline) },
  { title: "Management accounts and check-in", requirement: "Monthly accounts against budget plus the one-page Board check-in; papers 3 days before the Board", owner: "CFO", cadenceLabel: "Within 21 days of month end", cadenceMonths: 1, firstDue: ({ today }) => nextMonthly(today, accountsDeadline) },
  { title: "Board calendar", requirement: "Rolling 12-month schedule: monthly 1-hour Board and quarterly Board", owner: "Chair / CEO", cadenceLabel: "Set at completion, rolled forward quarterly", cadenceMonths: 3, firstDue: ({ today }) => new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3 + 3, 1)) },
  { title: "Annual strategy reset", requirement: "One quarterly offsite confirms the North Star, Flight Plan and investment priorities", owner: "Chair / CEO", cadenceLabel: "The quarter before the budget", cadenceMonths: 12, firstDue: ({ fyStart, today }) => { let d = addDaysUTC(fyStart, -84); while (d < today) d = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate())); return d; } },
  { title: "Board committees", requirement: "People Committee and Audit Committee; Acquisition Committee where buy-and-build is live", owner: "Chair", cadenceLabel: "People Committee at least twice a year", cadenceMonths: 6, firstDue: ({ today }) => addDaysUTC(today, 60) },
  { title: "Cyber and health and safety", requirement: "Any incidents, or a nil return, in the monthly CEO report; cyber training for all staff at least yearly", owner: "CEO / CFO", cadenceLabel: "Monthly; training yearly", cadenceMonths: 1, firstDue: ({ today }) => nextMonthly(today, accountsDeadline) },
  { title: "People risks", requirement: "Serious employment issues escalated early to the Chief People Officer; people risks and overdue mandatory training reported monthly", owner: "CEO / HR lead", cadenceLabel: "As they arise; monthly", cadenceMonths: 1, firstDue: ({ today }) => nextMonthly(today, accountsDeadline) },
  { title: "Expenses and ESG", requirement: "Chair signs off CEO expenses and CEO signs off executives monthly; a named executive owns ESG policy", owner: "Chair / CEO", cadenceLabel: "Monthly", cadenceMonths: 1, firstDue: ({ today }) => nextMonthly(today, accountsDeadline) },
];

export const PRIORITY_TARGET_DEFAULT = 3;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** First-100-days milestones for a company completed on `acquiredOn`. */
export function onboardingPlan(acquiredOn: Date) {
  return ONBOARDING_TEMPLATE.map((t, i) => ({
    step: t.step,
    title: t.title,
    description: t.description,
    deliverable: t.deliverable,
    lead: t.lead,
    start_week: t.startWeek,
    end_week: t.endWeek,
    due_date: isoDate(addDaysUTC(acquiredOn, Math.max(1, t.endWeek * 7))),
    status: "not_started" as const,
    link_path: t.link,
    sort_order: i,
  }));
}

/** Investor governance requirements, with first due dates. Thresholds are never hard-coded. */
export function governancePlan(acquiredOn: Date, fyStartMonth: number, today: Date) {
  const y = today.getUTCFullYear();
  const fyStart = new Date(Date.UTC(today.getUTCMonth() + 1 >= fyStartMonth ? y + 1 : y, fyStartMonth - 1, 1));
  return GOVERNANCE_TEMPLATE.map((g, i) => ({
    title: g.title,
    requirement: g.requirement,
    owner_label: g.owner,
    cadence_label: g.cadenceLabel,
    cadence_months: g.cadenceMonths,
    next_due: isoDate(g.firstDue({ acquiredOn, fyStart, today })),
    sort_order: i,
  }));
}

/** Next due date after completing a recurring requirement. */
export function nextDueAfter(completedOn: string, cadenceMonths: number | null): string | null {
  if (!cadenceMonths) return null;
  const d = new Date(`${completedOn}T00:00:00Z`);
  return isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + cadenceMonths, d.getUTCDate())));
}
