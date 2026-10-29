// Integration status, derived from the execution records. Progress is measured by
// milestones whose completion criteria have been verified — not by ticked checklist items.
// Synergies count as realised only from verified actuals; forecasts are kept separate.

export type ActivityStatus = "not_started" | "in_progress" | "blocked" | "done" | "not_needed";
export interface ActivityLike {
  id: string;
  key: string;
  title: string;
  workstream_id: string;
  owner_crew_id: string | null;
  status: ActivityStatus;
  start_date: string | null;
  due_date: string | null;
  baseline_due_date: string | null;
  completed_at: string | null;
  milestone: boolean;
  critical: boolean;
  completion_criteria: string;
  criteria_met: boolean | null;
  approval_status: "not_required" | "pending" | "approved";
}
export interface DependencyLike {
  from_activity_id: string;
  to_activity_id: string;
}

export type Health = "done" | "on_track" | "at_risk" | "off_track" | "not_started";
export const HEALTH_LABEL: Record<Health, string> = { done: "Done", on_track: "On track", at_risk: "At risk", off_track: "Off track", not_started: "Not started" };
/** Status tokens (never brand colours) */
export const HEALTH_TONE: Record<Health, "done" | "on" | "risk" | "off" | "none"> = { done: "done", on_track: "on", at_risk: "risk", off_track: "off", not_started: "none" };

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const daysBetween = (a: string, b: string) => Math.round((day(b) - day(a)) / 86400000);
const closed = (a: Pick<ActivityLike, "status">) => a.status === "done" || a.status === "not_needed";

/** Done is not the same as complete: criteria must be verified where there are criteria. */
export function verifiedComplete(a: ActivityLike) {
  if (a.status === "not_needed") return true;
  if (a.status !== "done") return false;
  return !a.completion_criteria.trim() || a.criteria_met === true;
}

export interface ActivityAssessment {
  health: Health;
  overdueDays: number;
  /** Prerequisites not finished while this activity is due soon or under way */
  blockedBy: string[];
  /** Marked done, but the completion criteria have not been verified (or were not met) */
  unverified: boolean;
  slipDays: number;
}

export function assessActivity(a: ActivityLike, deps: DependencyLike[], byId: Map<string, ActivityLike>, today: string, leadDays = 10): ActivityAssessment {
  const prereqs = deps.filter((d) => d.to_activity_id === a.id).map((d) => byId.get(d.from_activity_id)).filter((x): x is ActivityLike => !!x);
  const blockedBy = closed(a) ? [] : prereqs.filter((p) => !closed(p)).map((p) => p.id);
  const overdueDays = !closed(a) && a.due_date && a.due_date < today ? daysBetween(a.due_date, today) : 0;
  const unverified = a.status === "done" && !!a.completion_criteria.trim() && a.criteria_met !== true;
  const slipDays = a.baseline_due_date && a.due_date ? Math.max(0, daysBetween(a.baseline_due_date, a.status === "done" && a.completed_at ? a.completed_at.slice(0, 10) : a.due_date)) : 0;
  let health: Health;
  if (closed(a)) health = a.status === "done" && a.criteria_met === false ? "off_track" : "done";
  else if (overdueDays > 0 || a.status === "blocked") health = "off_track";
  else if (a.due_date && daysBetween(today, a.due_date) <= leadDays && blockedBy.length) health = "at_risk";
  else if (a.approval_status === "pending" && a.due_date && daysBetween(today, a.due_date) <= 3) health = "at_risk";
  else if (a.status === "not_started" && (!a.start_date || a.start_date > today)) health = "not_started";
  else health = "on_track";
  return { health, overdueDays, blockedBy, unverified, slipDays };
}

export function rollup(healths: Health[]): Health {
  if (!healths.length) return "not_started";
  if (healths.every((h) => h === "done")) return "done";
  if (healths.includes("off_track")) return "off_track";
  if (healths.includes("at_risk")) return "at_risk";
  if (healths.every((h) => h === "not_started")) return "not_started";
  return "on_track";
}

export interface SynergyLike {
  id: string;
  key: string;
  category: string;
  description: string;
  unit: string;
  baseline: number;
  target: number;
  measurement: string;
  start_date: string | null;
  expected_realisation_date: string | null;
  supporting_activity_ids: string[];
}
export interface ActualLike {
  synergy_id: string;
  period_start: string;
  value: number;
  kind: "actual" | "forecast";
  verified: boolean;
}

export type SynergyStatus = "not_yet_due" | "on_track" | "at_risk" | "off_track" | "achieved" | "no_data";
export const SYNERGY_STATUS_LABEL: Record<SynergyStatus, string> = { not_yet_due: "Not yet due", on_track: "On track", at_risk: "At risk", off_track: "Below plan", achieved: "Achieved", no_data: "Not reported" };
export const SYNERGY_TONE: Record<SynergyStatus, "on" | "risk" | "off" | "done" | "none"> = { not_yet_due: "none", on_track: "on", at_risk: "risk", off_track: "off", achieved: "done", no_data: "none" };

export interface SynergyAssessment {
  status: SynergyStatus;
  /** Latest verified actual (realised benefit) */
  realised: number | null;
  realisedPeriod: string | null;
  /** Latest forecast — never counted as realised */
  forecast: number | null;
  /** What the plan implies should have been realised by the latest period */
  expectedByNow: number;
  /** realised ÷ expected-by-now */
  attainment: number | null;
  unverifiedActuals: number;
  supportingDone: number;
  supportingTotal: number;
}

/** Expected benefit ramps linearly from the start date to the realisation date. */
export function expectedAt(s: SynergyLike, at: string) {
  if (!s.start_date || !s.expected_realisation_date) return s.target;
  const total = daysBetween(s.start_date, s.expected_realisation_date);
  if (total <= 0) return s.target;
  const f = Math.max(0, Math.min(1, daysBetween(s.start_date, at) / total));
  return s.baseline + (s.target - s.baseline) * f;
}

export function assessSynergy(s: SynergyLike, actuals: ActualLike[], activities: Map<string, ActivityLike>, today: string): SynergyAssessment {
  const mine = actuals.filter((a) => a.synergy_id === s.id).sort((a, b) => a.period_start.localeCompare(b.period_start));
  const verified = mine.filter((a) => a.kind === "actual" && a.verified);
  const latest = verified.at(-1) ?? null;
  const forecast = mine.filter((a) => a.kind === "forecast").at(-1)?.value ?? null;
  const supporting = s.supporting_activity_ids.map((id) => activities.get(id)).filter((x): x is ActivityLike => !!x);
  const supportingDone = supporting.filter(verifiedComplete).length;
  const at = latest?.period_start ?? today;
  const expectedByNow = expectedAt(s, at);
  const attainment = latest && expectedByNow > s.baseline ? (latest.value - s.baseline) / (expectedByNow - s.baseline) : null;
  let status: SynergyStatus;
  if (latest && latest.value >= s.target) status = "achieved";
  else if (!latest) status = s.start_date && daysBetween(s.start_date, today) > 120 ? "no_data" : "not_yet_due";
  else if (attainment === null) status = "not_yet_due";
  else if (attainment >= 0.9) status = "on_track";
  else if (attainment >= 0.75) status = "at_risk";
  else status = "off_track";
  return {
    status,
    realised: latest?.value ?? null,
    realisedPeriod: latest?.period_start ?? null,
    forecast,
    expectedByNow,
    attainment,
    unverifiedActuals: mine.filter((a) => a.kind === "actual" && !a.verified).length,
    supportingDone,
    supportingTotal: supporting.length,
  };
}

/** Sum targets only once per synergy key, so synergies are never double-counted. */
export function synergyTotals(synergies: SynergyLike[], assessed: Map<string, SynergyAssessment>) {
  const seen = new Set<string>();
  let target = 0;
  let realised = 0;
  for (const s of synergies) {
    if (s.unit !== "currency" || seen.has(s.key)) continue;
    seen.add(s.key);
    target += s.target;
    realised += Math.max(0, assessed.get(s.id)?.realised ?? 0);
  }
  return { target, realised };
}

export interface IntegrationSummary {
  health: Health;
  milestonesTotal: number;
  milestonesDue: number;
  milestonesVerified: number;
  milestonesOnTime: number;
  /** milestones verified ÷ milestones due (meaningful progress, not ticks) */
  progress: number | null;
  overdue: ActivityLike[];
  atRisk: ActivityLike[];
  unverified: ActivityLike[];
  criticalOpen: ActivityLike[];
  criticalSlipDays: number;
  pendingApprovals: ActivityLike[];
  nextMilestone: ActivityLike | null;
  workstreamHealth: Map<string, Health>;
  assessments: Map<string, ActivityAssessment>;
}

export function summariseIntegration(activities: ActivityLike[], deps: DependencyLike[], today: string, leadDays = 10): IntegrationSummary {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const assessments = new Map(activities.map((a) => [a.id, assessActivity(a, deps, byId, today, leadDays)]));
  const milestones = activities.filter((a) => a.milestone || a.critical);
  const due = milestones.filter((a) => a.due_date && a.due_date <= today);
  const verifiedM = milestones.filter(verifiedComplete);
  const onTime = verifiedM.filter((a) => !a.baseline_due_date || !a.completed_at || a.completed_at.slice(0, 10) <= a.baseline_due_date);
  const ws = new Map<string, Health[]>();
  for (const a of activities) ws.set(a.workstream_id, [...(ws.get(a.workstream_id) ?? []), assessments.get(a.id)!.health]);
  const workstreamHealth = new Map([...ws].map(([k, v]) => [k, rollup(v)]));
  const criticalOpen = activities.filter((a) => a.critical && !closed(a));
  const health = rollup([...workstreamHealth.values()]);
  return {
    health,
    milestonesTotal: milestones.length,
    milestonesDue: due.length,
    milestonesVerified: verifiedM.length,
    milestonesOnTime: onTime.length,
    progress: due.length ? due.filter(verifiedComplete).length / due.length : null,
    overdue: activities.filter((a) => assessments.get(a.id)!.overdueDays > 0).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
    atRisk: activities.filter((a) => assessments.get(a.id)!.health === "at_risk"),
    unverified: activities.filter((a) => assessments.get(a.id)!.unverified),
    criticalOpen,
    criticalSlipDays: Math.max(0, ...activities.filter((a) => a.critical).map((a) => assessments.get(a.id)!.slipDays)),
    pendingApprovals: activities.filter((a) => a.approval_status === "pending" && !closed(a)),
    // the next one still ahead; overdue milestones are reported as overdue
    nextMilestone: milestones.filter((a) => !closed(a) && a.due_date && a.due_date >= today).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0] ?? null,
    workstreamHealth,
    assessments,
  };
}

/** Everything that depends, directly or transitively, on an activity. */
export function downstream(id: string, deps: DependencyLike[]): string[] {
  const out: string[] = [];
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const d of deps.filter((x) => x.from_activity_id === cur)) {
      if (!out.includes(d.to_activity_id) && d.to_activity_id !== id) {
        out.push(d.to_activity_id);
        queue.push(d.to_activity_id);
      }
    }
  }
  return out;
}

/** Which playbook should a new acquisition use? A transparent match on types and wording. */
export function recommendPlaybook<P extends { id: string; name: string; applies_when: string; acquisition_types: string[] }>(playbooks: P[], acquisition: { rationale: string; operating_model: string; integration_model: string; objectives: string }) {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
  const a = words(`${acquisition.rationale} ${acquisition.operating_model} ${acquisition.integration_model} ${acquisition.objectives}`);
  const scored = playbooks.map((p) => {
    const typeHit = p.acquisition_types.find((t) => `${acquisition.integration_model} ${acquisition.operating_model}`.toLowerCase().includes(t.toLowerCase().split(" ")[0]));
    const pw = words(`${p.name} ${p.applies_when} ${p.acquisition_types.join(" ")}`);
    const overlap = [...pw].filter((w) => a.has(w));
    return { p, score: (typeHit ? 10 : 0) + overlap.length, reason: typeHit ? `Matches the "${typeHit}" acquisition type` : overlap.length ? `Shares: ${overlap.slice(0, 6).join(", ")}` : "Only approved playbook" };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored[0] ?? null;
}

export const ACQUISITION_STATUS_LABEL: Record<string, string> = {
  planning: "Planning", plan_in_review: "Plan in review", ready: "Plan approved — awaiting completion", active: "Integrating", completed: "Completed", on_hold: "On hold", cancelled: "Cancelled",
};
