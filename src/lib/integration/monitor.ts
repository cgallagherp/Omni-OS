// Pure logic for the M&A Integration Agent's monitoring: what an issue affects downstream,
// whether it is material, who to ask, what to say, and when it is reasonable to say it.
import type { Finding, SourceRef } from "@/lib/agents/registry";
import { assessSynergy, daysBetween, downstream, verifiedComplete, type ActivityLike, type ActualLike, type DependencyLike, type SynergyLike } from "@/lib/domain/integration";

export type WatchTrigger = "dependency" | "overdue" | "approval" | "evidence";

export interface WatchActivity extends ActivityLike {
  workstream: string;
  approval_required: string | null;
  human_only: boolean;
  blocked_reason: string | null;
}
export interface WatchState {
  acquisition: { id: string; name: string; leader_crew_id: string | null; sponsor_crew_id: string | null };
  activities: WatchActivity[];
  deps: DependencyLike[];
  synergies: SynergyLike[];
  actuals: ActualLike[];
  crew: Array<{ id: string; full_name: string; title: string; user_id: string | null; reports_to: string | null }>;
}

export const activityRef = (acqId: string, a: { id: string; title: string }): SourceRef => ({ type: "integration_activity", id: a.id, label: a.title, path: `/integrations/${acqId}?tab=plan#${a.id}` });
const fmt = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "no date");
const first = (n: string) => n.split(" ")[0];

export interface Impact {
  dependents: WatchActivity[];
  criticalDependents: WatchActivity[];
  synergies: SynergyLike[];
  workstreams: string[];
  material: boolean;
}

/** What else is affected if this activity is late: transitive dependents and the synergies they deliver. */
export function impactOf(s: WatchState, activityId: string): Impact {
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const dependents = downstream(activityId, s.deps).map((id) => byId.get(id)).filter((x): x is WatchActivity => !!x && x.status !== "done" && x.status !== "not_needed");
  const ids = new Set([activityId, ...dependents.map((d) => d.id)]);
  const synergies = s.synergies.filter((x) => x.supporting_activity_ids.some((id) => ids.has(id)));
  const self = byId.get(activityId);
  const criticalDependents = dependents.filter((d) => d.critical);
  return {
    dependents,
    criticalDependents,
    synergies,
    workstreams: [...new Set(dependents.map((d) => d.workstream))],
    material: Boolean(self?.critical) || criticalDependents.length > 0 || synergies.length > 0,
  };
}

/** Would a revised date for this activity push a dependent past its start or due date? */
export function dateImpact(s: WatchState, activityId: string, newDate: string) {
  const imp = impactOf(s, activityId);
  const direct = s.deps.filter((d) => d.from_activity_id === activityId).map((d) => s.activities.find((a) => a.id === d.to_activity_id)).filter((x): x is WatchActivity => !!x);
  const squeezed = direct.filter((d) => (d.start_date && newDate > d.start_date) || (d.due_date && newDate >= d.due_date));
  const breaches = direct.filter((d) => d.due_date && newDate >= d.due_date);
  return { ...imp, squeezed, breaches, material: imp.material && squeezed.length > 0 };
}

export function recipientFor(s: WatchState, a: WatchActivity, trigger: WatchTrigger) {
  const crew = new Map(s.crew.map((c) => [c.id, c]));
  const withLogin = (id: string | null | undefined) => (id ? crew.get(id) : undefined)?.user_id ? crew.get(id!)! : null;
  if (trigger === "evidence") return withLogin(s.acquisition.leader_crew_id) ?? withLogin(s.acquisition.sponsor_crew_id);
  if (trigger === "approval") {
    const role = (a.approval_required ?? "").toLowerCase();
    const approver = s.crew.find((c) => c.user_id && role && (c.title.toLowerCase().includes(role) || (role === "ceo" && /chief executive/i.test(c.title))));
    return approver ?? withLogin(s.acquisition.sponsor_crew_id);
  }
  return withLogin(a.owner_crew_id) ?? withLogin(s.acquisition.leader_crew_id) ?? withLogin(s.acquisition.sponsor_crew_id);
}

export function watchFindings(s: WatchState, a: WatchActivity, trigger: WatchTrigger, today: string, dependent?: WatchActivity | null): Finding[] {
  const ref = activityRef(s.acquisition.id, a);
  const f: Finding[] = [];
  const imp = impactOf(s, a.id);
  if (trigger === "dependency" && dependent) {
    f.push({ kind: "confirmed", text: `"${dependent.title}" is due ${fmt(dependent.due_date)} (${daysBetween(today, dependent.due_date!)} days) but depends on "${a.title}", which is ${a.status.replace("_", " ")}${a.due_date ? ` and due ${fmt(a.due_date)}` : ""}.`, sources: [ref, activityRef(s.acquisition.id, dependent)] });
  }
  if (a.due_date && a.due_date < today && a.status !== "done") f.push({ kind: "confirmed", text: `"${a.title}" is ${daysBetween(a.due_date, today)} days overdue.`, sources: [ref] });
  if (a.status === "blocked") f.push({ kind: "confirmed", text: `"${a.title}" is marked blocked${a.blocked_reason ? `: ${a.blocked_reason}` : ""}.`, sources: [ref] });
  if (trigger === "approval") f.push({ kind: "confirmed", text: `"${a.title}" needs approval (${a.approval_required}) and is due ${fmt(a.due_date)}; no approval is recorded.`, sources: [ref] });
  if (trigger === "evidence") f.push({ kind: "confirmed", text: `"${a.title}" is marked done, but its completion criteria have not been verified: ${a.completion_criteria}`, sources: [ref] });
  if (imp.dependents.length) f.push({ kind: "confirmed", text: `${imp.dependents.length} activities depend on it, directly or indirectly: ${imp.dependents.slice(0, 5).map((d) => `"${d.title}" (${d.workstream})`).join(", ")}.`, sources: imp.dependents.slice(0, 5).map((d) => activityRef(s.acquisition.id, d)) });
  if (imp.criticalDependents.length) f.push({ kind: "confirmed", text: `${imp.criticalDependents.length} of them are on the critical path.` });
  if (imp.synergies.length) {
    const byId = new Map(s.activities.map((x) => [x.id, x]));
    for (const syn of imp.synergies.slice(0, 3)) {
      const r = assessSynergy(syn, s.actuals, byId, today);
      f.push({ kind: "hypothesis", text: `A delay here may defer the synergy "${syn.description}" (target ${syn.target.toLocaleString("en-GB")}; currently ${r.status.replace("_", " ")}).` });
    }
  }
  if (!a.owner_crew_id) f.push({ kind: "missing", text: `No owner is recorded for "${a.title}".` });
  if (a.status === "not_started" && a.start_date && a.start_date < today) f.push({ kind: "missing", text: `No progress has been recorded since its planned start (${fmt(a.start_date)}).` });
  return f;
}

export function followupMessage(s: WatchState, a: WatchActivity, trigger: WatchTrigger, to: { full_name: string }, dependent?: WatchActivity | null) {
  const imp = impactOf(s, a.id);
  const why =
    trigger === "dependency" && dependent
      ? `"${dependent.title}" is due on ${fmt(dependent.due_date)} and cannot finish until this is done.`
      : trigger === "approval"
        ? `It needs approval (${a.approval_required}) before ${fmt(a.due_date)}.`
        : trigger === "evidence"
          ? `It is marked done; please confirm the completion criteria are met: ${a.completion_criteria}`
          : `It was due on ${fmt(a.due_date)}.`;
  const affects = imp.dependents.length ? `\nIt affects: ${imp.dependents.slice(0, 4).map((d) => d.title).join("; ")}.` : "";
  const ask = trigger === "evidence" ? "Please reply with done (criteria met), or an update on what is outstanding." : "Please reply in Omni OS with one of: it is done; a new completion date; or what is blocking it.";
  return {
    subject: `${s.acquisition.name} integration: ${a.title}`.slice(0, 200),
    body: `${first(to.full_name)}, an update is needed on "${a.title}" (${a.workstream}). ${why}${affects}\n\n${ask}`.slice(0, 3000),
  };
}

export function escalationProposal(s: WatchState, a: WatchActivity, reason: string, revisedDate: string | null, today: string) {
  const imp = impactOf(s, a.id);
  const plus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const leader = s.acquisition.leader_crew_id ?? s.acquisition.sponsor_crew_id ?? a.owner_crew_id;
  const owner = a.owner_crew_id ?? leader;
  const crit = imp.criticalDependents[0] ?? imp.dependents[0];
  const synergy = imp.synergies[0];
  const actions = [
    { title: `Agree a recovery plan for "${a.title}"`, description: `${reason}${revisedDate ? ` Revised date offered: ${fmt(revisedDate)}.` : ""}`, owner_id: owner, due_date: plus(5), integration_activity_id: a.id },
    ...(crit ? [{ title: `Confirm the revised timetable for "${crit.title}" and dependent work`, description: `Affected workstreams: ${imp.workstreams.join(", ") || crit.workstream}.`, owner_id: leader, due_date: plus(7), integration_activity_id: crit.id }] : []),
    ...(synergy ? [{ title: `Re-forecast "${synergy.description}" for the delay`, description: "Update the synergy forecast (not the realised figure) so the variance is visible.", owner_id: leader, due_date: plus(10), integration_activity_id: a.id }] : []),
  ].filter((x) => x.owner_id);
  return {
    issue: {
      title: `${s.acquisition.name} integration: "${a.title}" is putting ${crit ? `"${crit.title}"` : "the plan"} at risk`.slice(0, 300),
      description: `Raised by the M&A Integration Agent. ${reason} ${imp.dependents.length ? `Dependent work: ${imp.dependents.slice(0, 5).map((d) => d.title).join("; ")}.` : ""} ${synergy ? `Synergy at risk: ${synergy.description}.` : ""}`.replace(/\s+/g, " ").trim().slice(0, 2000),
      priority: imp.criticalDependents.length || a.critical ? "high" : "medium",
      owner_id: leader,
    },
    actions,
  };
}

/** Earliest moment a follow-up may be sent: inside working hours (company local time). */
export function nextWorkingTime(now: Date, wh: { start: number; end: number; weekdays_only: boolean } = { start: 8, end: 18, weekdays_only: true }, tz = "Europe/London") {
  const parts = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(d);
    return { hour: Number(p.find((x) => x.type === "hour")!.value), weekday: p.find((x) => x.type === "weekday")!.value };
  };
  let t = new Date(now);
  for (let i = 0; i < 24 * 8; i++) {
    const { hour, weekday } = parts(t);
    const workday = !wh.weekdays_only || !["Sat", "Sun"].includes(weekday);
    if (workday && hour >= wh.start && hour < wh.end) return t;
    t = new Date(Math.floor(t.getTime() / 3600000) * 3600000 + 3600000);
  }
  return now;
}

export function verifiedDone(a: ActivityLike) {
  return verifiedComplete(a);
}
