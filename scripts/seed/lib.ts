// Seed helpers: relative dates, deterministic randomness and the company spec shape.
import type { Database } from "../../src/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export const TODAY = (() => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
})();

export function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
export function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
/** ISO date `days` from today. */
export function day(days: number) {
  return iso(addDays(TODAY, days));
}
/** Timestamp `days` from today at hh:mm UTC. */
export function at(days: number, hh: number, mm = 0) {
  const d = addDays(TODAY, days);
  d.setUTCHours(hh, mm, 0, 0);
  return d.toISOString();
}
/** Most recent date (<= today) with the given weekday (0=Sun..6=Sat). */
export function lastWeekday(dow: number) {
  const diff = (TODAY.getUTCDay() - dow + 7) % 7;
  return -diff;
}

export function quarterOf(d: Date) {
  return Math.floor(d.getUTCMonth() / 3) + 1;
}
export function quarterBounds(year: number, q: number) {
  const start = new Date(Date.UTC(year, (q - 1) * 3, 1));
  const end = new Date(Date.UTC(year, q * 3, 0));
  return { start: iso(start), end: iso(end) };
}
export function prevQuarter(year: number, q: number) {
  return q === 1 ? { year: year - 1, q: 4 } : { year, q: q - 1 };
}
export function nextQuarter(year: number, q: number) {
  return q === 4 ? { year: year + 1, q: 1 } : { year, q: q + 1 };
}

/** Deterministic PRNG so the demo looks the same on every reseed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeriesCtx {
  /** 0 = oldest period, n - 1 = last completed period */
  i: number;
  n: number;
  /** progress through the history, 0..1 */
  t: number;
  period: string;
  month: number; // 1..12
  year: number;
  noise: (pct: number) => number; // multiplicative noise factor around 1
  future: boolean; // target-only budget periods after the last completed one
}

export type Series = (ctx: SeriesCtx) => { value: number | null; target?: number | null };

export interface PersonSpec {
  key: string;
  full_name: string;
  title: string;
  seat?: string;
  responsibilities?: string[];
  reports_to?: string;
  email?: string;
  login?: Enums["company_role"];
  open?: boolean;
  leadership?: boolean;
  avatar_color?: string;
}

export interface MetricSpec {
  key: string;
  name: string;
  description?: string;
  category: Enums["metric_category"];
  unit: Enums["metric_unit"];
  decimals?: number;
  frequency: Enums["metric_frequency"];
  direction: Enums["metric_direction"];
  target?: number;
  min?: number;
  max?: number;
  tolerance?: number;
  aggregation?: "flow" | "stock";
  owner: string;
  comparable?: string;
  isKey?: boolean;
  /** Agreed with Omni for the Monday KPI scorecard */
  scorecard?: boolean;
  history: number; // number of completed periods of history
  futureTargets?: number; // budget periods after the last completed one
  series: Series;
  links?: Array<{ move?: string; goal?: string; priority?: string }>;
}

export interface PrioritySpec {
  key: string;
  goal: string;
  title: string;
  description?: string;
  outcome: string; // the clearly defined outcome
  successCriteria?: string;
  owner: string;
  status: Enums["rag_status"];
  progress: number;
  dueOffsetWeeks?: number; // from quarter start; default = quarter end
  milestones?: Array<{ title: string; week: number; done: boolean }>;
  /** Offsite classification for a closed quarter */
  result?: Enums["priority_outcome"];
  resultNote?: string;
}

export interface MeetingSeed {
  key: string;
  type: Enums["meeting_type"];
  title: string;
  at: string;
  status: Enums["meeting_status"];
  facilitator: string;
  attendees: string[];
  absent?: string[];
  summary?: string;
  rating?: number;
}

export interface IssueSeed {
  key: string;
  title: string;
  description: string;
  priority: Enums["issue_priority"];
  status: Enums["issue_status"];
  owner: string;
  raisedBy: string;
  metric?: string;
  priorityKey?: string;
  goal?: string;
  raisedIn?: string;
  resolvedIn?: string;
  escalated?: boolean;
  resolution?: string;
  createdDaysAgo: number;
}

export interface DecisionSeed {
  key: string;
  title: string;
  rationale: string;
  owner: string;
  issue?: string;
  meeting?: string;
  decidedDaysAgo: number;
}

export interface ActionSeed {
  title: string;
  description?: string;
  owner: string;
  due: number; // days from today
  status: Enums["action_status"];
  priorityKey?: string;
  issue?: string;
  decision?: string;
  meeting?: string;
  /** Corrective action agreed against a KPI */
  metric?: string;
  createdDaysAgo: number;
}

export interface ListeningSeed {
  kind: "employee" | "customer";
  daysAgo: number;
  method: string;
  responses?: number;
  engagement?: number;
  enps?: number;
  leadership_confidence?: number;
  strategy_confidence?: number;
  clarity_accountability?: number;
  nps?: number;
  satisfaction?: number;
  retention?: number;
  churn?: number;
  themes: string[];
  issues?: string;
  summary: string;
  actions?: Array<{ title: string; owner: string; due: number; status: Enums["action_status"] }>;
}

export interface CompanySpec {
  /** Demo reporting tweaks: headline for the latest flash; leave the latest Board check-in in draft. */
  reporting?: { flashHeadline?: string; latestCheckInDraft?: boolean; approveThisWeek?: boolean };
  company: {
    slug: string;
    name: string;
    legal_name: string;
    sector: string;
    description: string;
    headquarters: string;
    brand_color: string;
    acquired_on: string;
    fiscal_year_start_month?: number;
  };
  /** Company-chosen branding; omit to keep the Omni defaults */
  branding?: { primary: string; secondary: string; accent: string; logo?: string };
  people: PersonSpec[];
  observers?: Array<{ email: string; full_name: string; title: string }>;
  northStar: Omit<Database["public"]["Tables"]["north_stars"]["Insert"], "company_id">;
  conditions: Array<{ title: string; description: string; status: Enums["rag_status"]; owner: string }>;
  /** Three-year outcomes */
  moves: Array<{ key: string; title: string; description: string; outcome: string; owner: string; status: Enums["rag_status"]; progress: number }>;
  milestones: Array<{ title: string; description?: string; date: string; status: Enums["rag_status"]; move?: string }>;
  /** 12-month objectives */
  goals: Array<{
    key: string;
    move: string;
    title: string;
    description?: string;
    outcome: string;
    unit?: Enums["metric_unit"];
    baseline?: number;
    target?: number;
    current?: number;
    owner: string;
    status: Enums["rag_status"];
    progress: number;
  }>;
  previousPriorities: PrioritySpec[];
  priorities: PrioritySpec[];
  metrics: MetricSpec[];
  meetings: MeetingSeed[];
  issues: IssueSeed[];
  decisions: DecisionSeed[];
  actions: ActionSeed[];
  /** Agreed organisational actions (never assessments of individuals) */
  orgActions: Array<{
    type: Enums["org_action_type"];
    title: string;
    description: string;
    priority: Enums["issue_priority"];
    status: Enums["gap_status"];
    owner: string;
    priorityKey?: string;
    goal?: string;
    targetDays: number;
  }>;
  comments: Array<{ priority: string; author: string; body: string; daysAgo: number; kind?: "comment" | "update" }>;
  listening: ListeningSeed[];
  /** Days since completion for onboarding progress; ≥100 means the system is established */
  onboardingDay: number;
  reset?: { wins: string; misses: string; lessons: string; constraints: string };
  investmentCase: Omit<Database["public"]["Tables"]["investment_cases"]["Insert"], "company_id">;
  omniNotes: Array<{ body: string; level: "none" | "monitor" | "support" | "intervene"; daysAgo: number }>;
}
