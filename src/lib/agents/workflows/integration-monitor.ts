// M&A Integration Agent — execution. Once a plan is approved and the transaction has
// completed, the agent watches the plan: dependencies that threaten upcoming milestones,
// overdue activities, missing approvals, unverified completion criteria and synergies that
// fall short. It follows up with owners through authorised channels (respecting working
// hours and cooldowns), records responses, proposes revised dates, escalates material
// issues into Mission Control for approval, tracks the agreed corrective actions and
// measures the result. It never changes a commitment, status or owner itself.
import { assessSynergy, daysBetween, summariseIntegration, SYNERGY_STATUS_LABEL, type ActivityLike } from "@/lib/domain/integration";
import { activityRef, dateImpact, escalationProposal, followupMessage, impactOf, nextWorkingTime, recipientFor, watchFindings, type WatchActivity, type WatchState, type WatchTrigger } from "@/lib/integration/monitor";
import type { Runtime, StepOutcome, WorkflowDef } from "../runtime";
import { applyApproval, markExecuted, sendMessage } from "../tools/mission-control";
import { delegate } from "../tools/orchestration";
import { readPlan, type PlanState } from "../tools/integration";

type S = {
  trigger?: WatchTrigger;
  dependentId?: string | null;
  recipientCrewId?: string;
  messageId?: string;
  sentAt?: string;
  reminders?: number;
  handledResponse?: string;
  followupApproval?: string;
  dateApproval?: string;
  escalationApproval?: string;
  escalated?: boolean;
  actionIds?: string[];
  issueId?: string | null;
  revisedDate?: string | null;
  childId?: string;
  delegatedAt?: string;
  monitorStarted?: string;
};
const st = (rt: Runtime) => rt.state as S;
const esc = (rt: Runtime) => rt.config?.escalation;

async function load(rt: Runtime) {
  const trig = rt.inv.trigger as { acquisition_id?: string };
  const state = await rt.tool(readPlan, { acquisitionId: trig.acquisition_id! });
  return { state, ws: toWatch(state) };
}
function toWatch(p: PlanState): WatchState {
  return { acquisition: p.acquisition, activities: p.activities as WatchActivity[], deps: p.deps, synergies: p.synergies, actuals: p.actuals, crew: p.crew };
}

/** Paused or no longer active: stop working on it, without losing the case. */
function paused(rt: Runtime, p: PlanState): StepOutcome | null {
  if (p.acquisition.agent_paused) return { next: rt.run.step, wait: { reason: "timer", label: "Agent paused for this integration", until: rt.daysFromNow(1) } };
  if (p.acquisition.status === "completed" || p.acquisition.status === "cancelled") return { done: { status: "closed", summary: `The integration is ${p.acquisition.status}.` } };
  return null;
}

/** Hold messages outside working hours and within the per-person cooldown. */
async function sendWindow(rt: Runtime, toCrewId: string, critical: boolean): Promise<Date | null> {
  const e = esc(rt);
  const open = nextWorkingTime(rt.now, e?.working_hours);
  if (open.getTime() > rt.now.getTime() + 60_000) return open;
  const cooldown = e?.cooldown_days ?? 2;
  const since = new Date(rt.now.getTime() - cooldown * 86400000).toISOString();
  const { data } = await rt.db.from("agent_messages").select("created_at, investigation_id").eq("company_id", rt.companyId).eq("agent_key", "integration").eq("to_crew_id", toCrewId).in("kind", ["followup", "reminder"]).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  const last = data?.[0];
  if (last && last.investigation_id !== rt.inv.id) {
    const wait = critical ? 1 : cooldown;
    const until = new Date(Date.parse(last.created_at) + wait * 86400000);
    if (until > rt.now) return until;
  }
  return null;
}

async function resolvedIfDone(rt: Runtime, ws: WatchState, a: WatchActivity): Promise<StepOutcome | null> {
  const s = st(rt);
  if (a.status === "not_needed") return { done: { status: "resolved", summary: `"${a.title}" was marked not needed.`, outcome: { resolved: true, not_needed: true } } };
  if (a.status !== "done") return null;
  if (a.completion_criteria.trim() && a.criteria_met === null && s.trigger !== "evidence") {
    // done is not complete: hand over to verification
    s.trigger = "evidence";
    s.messageId = undefined;
    s.reminders = 0;
    await rt.finding({ kind: "confirmed", text: `"${a.title}" was marked done on ${a.completed_at?.slice(0, 10)}; its completion criteria still need to be verified.`, sources: [activityRef(ws.acquisition.id, a)] });
    return { next: "follow_up" };
  }
  if (a.criteria_met === false) {
    await rt.finding({ kind: "confirmed", text: `"${a.title}" was marked done but its completion criteria were judged not met.`, sources: [activityRef(ws.acquisition.id, a)] });
    if (!s.escalated) return { next: "escalate" };
  }
  const openActions = await openCorrective(rt);
  if (openActions.length) return null;
  const baseline = rt.inv.baseline as { due_date?: string | null };
  const lateBy = a.completed_at && (a.baseline_due_date ?? baseline.due_date) ? daysBetween((a.baseline_due_date ?? baseline.due_date)!, a.completed_at.slice(0, 10)) : null;
  const dependent = s.dependentId ? ws.activities.find((x) => x.id === s.dependentId) : null;
  const outcome = {
    resolved: true,
    completed_at: a.completed_at,
    criteria_met: a.criteria_met,
    days_late: lateBy !== null ? Math.max(0, lateBy) : null,
    dependent: dependent ? { title: dependent.title, due_date: dependent.due_date, still_on_time: !dependent.due_date || (a.completed_at ?? "").slice(0, 10) < dependent.due_date } : null,
    escalated: Boolean(s.escalated),
    corrective_actions: s.actionIds?.length ?? 0,
  };
  await rt.event("outcome", `"${a.title}" completed${a.criteria_met ? " and verified" : ""}${outcome.days_late ? `, ${outcome.days_late} days after the approved date` : ""}${dependent ? `; "${dependent.title}" ${outcome.dependent!.still_on_time ? "can still finish on time" : "will be late"}` : ""}`, outcome, [activityRef(ws.acquisition.id, a)]);
  return { done: { status: "resolved", summary: `"${a.title}" is complete${a.criteria_met ? " and its criteria verified" : ""}.${dependent ? ` "${dependent.title}" ${outcome.dependent!.still_on_time ? "remains on schedule" : "has slipped"}.` : ""}`, outcome } };
}

async function openCorrective(rt: Runtime) {
  const ids = st(rt).actionIds ?? [];
  if (!ids.length) return [];
  const { data } = await rt.db.from("actions").select("id, title, status, due_date, owner_id").eq("company_id", rt.companyId).in("id", ids);
  return (data ?? []).filter((x) => x.status === "open");
}

async function waitApproval(rt: Runtime, field: "followupApproval" | "dateApproval" | "escalationApproval", id: string, label: string): Promise<StepOutcome> {
  st(rt)[field] = id;
  await rt.updateInvestigation({ status: "awaiting_approval" });
  return { next: "await_approval", wait: { reason: "approval", label, until: rt.daysFromNow(1) } };
}

export const integrationActivityWatch: WorkflowDef = {
  key: "integration.activity_watch",
  agent: "integration",
  title: "Integration follow-through",
  description: "Investigates an at-risk, overdue, unapproved or unverified integration activity, follows up, escalates material issues into Mission Control and tracks the agreed actions.",
  steps: {
    async start(rt) {
      await rt.updateInvestigation({ status: "investigating" });
      const s = st(rt);
      const trig = rt.inv.trigger as { kind?: WatchTrigger; dependent_id?: string | null };
      s.trigger ??= trig.kind ?? "overdue";
      s.dependentId ??= trig.dependent_id ?? null;
      const { state, ws } = await load(rt);
      const hold = paused(rt, state);
      if (hold) return hold;
      const a = ws.activities.find((x) => x.id === rt.inv.subject_id);
      if (!a) return { done: { status: "closed", summary: "The activity is no longer in the plan." } };
      const dependent = s.dependentId ? ws.activities.find((x) => x.id === s.dependentId) ?? null : null;
      await rt.event("context", `Read the ${ws.acquisition.name} plan: ${ws.activities.length} activities, ${ws.deps.length} dependencies, ${ws.synergies.length} synergies`, {}, [activityRef(ws.acquisition.id, a)]);
      for (const f of watchFindings(ws, a, s.trigger, rt.today, dependent)) await rt.finding(f);
      // shared action records: if the Execution Agent is already chasing a linked action, do not chase twice
      const linked = state.actions.filter((x) => x.integration_activity_id === a.id && x.status === "open").map((x) => x.id);
      if (linked.length) {
        const { data: chasing } = await rt.db.from("agent_investigations").select("id").eq("company_id", rt.companyId).eq("agent_key", "execution").in("subject_id", linked).in("status", ["investigating", "awaiting_response", "awaiting_approval", "escalated", "monitoring"]).limit(1);
        if (chasing?.length) {
          await rt.event("step", "The Execution Agent is already following up the linked Mission Control action; not sending a second reminder");
          return { next: "monitor", wait: { reason: "review", label: "Execution Agent is following up", until: rt.daysFromNow(2) } };
        }
      }
      const imp = impactOf(ws, a.id);
      await rt.updateInvestigation({
        baseline: { due_date: a.due_date, status: a.status, dependent: dependent?.title ?? null, dependent_due: dependent?.due_date ?? null, dependents: imp.dependents.length },
        expected_outcome: s.trigger === "evidence" ? "Completion criteria verified by the integration leader." : `"${a.title}" completed${dependent ? ` before "${dependent.title}" is due` : ""}, or a revised plan agreed by management.`,
        severity: imp.material ? "high" : "medium",
        summary:
          s.trigger === "dependency" && dependent
            ? `"${dependent.title}" (due ${dependent.due_date}) depends on "${a.title}", which is not finished.`
            : s.trigger === "approval" ? `"${a.title}" needs ${a.approval_required} approval before ${a.due_date}.`
            : s.trigger === "evidence" ? `"${a.title}" is marked done; completion criteria not yet verified.`
            : `"${a.title}" is overdue (due ${a.due_date}).`,
      });
      return (await resolvedIfDone(rt, ws, a)) ?? { next: "follow_up" };
    },

    async follow_up(rt) {
      const s = st(rt);
      const { state, ws } = await load(rt);
      const hold = paused(rt, state);
      if (hold) return hold;
      const a = ws.activities.find((x) => x.id === rt.inv.subject_id)!;
      if (s.trigger !== "evidence") {
        const done = await resolvedIfDone(rt, ws, a);
        if (done) return done;
      } else if (a.criteria_met !== null) return { next: "track" };
      const to = recipientFor(ws, a, s.trigger!);
      if (!to) {
        await rt.finding({ kind: "missing", text: `Nobody with an Omni OS login is responsible for "${a.title}", so the agent cannot follow up; the integration leader needs to assign an owner.` });
        return { next: "escalate" };
      }
      const imp = impactOf(ws, a.id);
      const window = await sendWindow(rt, to.id, imp.material);
      if (window) {
        await rt.updateInvestigation({ status: "monitoring", next_review_at: window.toISOString() });
        return { next: "follow_up", wait: { reason: "timer", label: `Holding the follow-up until ${window.toISOString().slice(0, 16).replace("T", " ")} (working hours / cooldown)`, until: window } };
      }
      const dependent = s.dependentId ? ws.activities.find((x) => x.id === s.dependentId) : null;
      const msg = followupMessage(ws, a, s.trigger!, to, dependent);
      const kind = s.messageId ? "reminder" : "followup";
      const mode = rt.mode("internal_followup");
      if (mode === "off") {
        await rt.event("step", "Internal follow-ups are switched off; monitoring only");
        return { next: "monitor", wait: { reason: "review", label: "Follow-ups off — monitoring", until: rt.daysFromNow(1) } };
      }
      const n = s.reminders ?? 0;
      let approvalId: string | undefined;
      if (mode === "approval") {
        approvalId = await rt.propose(`approval:followup:${s.trigger}:${n}`, {
          category: "internal_followup", action_type: "send_followup",
          title: `Ask ${to.full_name} for an update: ${a.title}`,
          rationale: rt.findings.filter((f) => f.kind === "confirmed").slice(0, 2).map((f) => f.text).join(" "),
          payload: { integration_activity_id: a.id, acquisition_id: ws.acquisition.id, to_crew_id: to.id, kind, subject: msg.subject, body: msg.body },
          evidence: [activityRef(ws.acquisition.id, a)], affected: [{ type: "person", id: to.id, label: to.full_name }],
          implications: "An internal message in Omni OS. Nothing in the plan changes.", reversible: false,
        });
        const ap = await rt.approval(approvalId);
        if (ap.status === "pending") return waitApproval(rt, "followupApproval", approvalId, `Waiting for approval to contact ${to.full_name}`);
        if (ap.status !== "approved" && ap.status !== "executed") {
          await rt.event("approval", `Follow-up ${ap.status.replace("_", " ")}${ap.decision_note ? `: "${ap.decision_note}"` : ""}`);
          return { next: "monitor", wait: { reason: "review", label: "Follow-up not approved — monitoring", until: rt.daysFromNow(2) } };
        }
      }
      const sent = await rt.tool(sendMessage, { key: `${s.trigger}:${n}`, kind, toCrewId: to.id, subject: msg.subject, body: msg.body, context: { acquisition_id: ws.acquisition.id, integration_activity_id: a.id, trigger: s.trigger }, approvalId });
      if (approvalId) await rt.tool(markExecuted, { approvalId, result: { message_id: sent.id } });
      s.messageId = sent.id;
      s.sentAt = rt.now.toISOString();
      s.recipientCrewId = to.id;
      await rt.event("message", `${kind === "reminder" ? "Reminder" : "Follow-up"} sent to ${to.full_name}`, { message_id: sent.id });
      await rt.updateInvestigation({ status: "awaiting_response", next_review_at: rt.daysFromNow(esc(rt)?.reminder_after_days ?? 2).toISOString() });
      return { next: "await_response", wait: { reason: "response", label: `Waiting for ${to.full_name}`, until: rt.daysFromNow(esc(rt)?.reminder_after_days ?? 2) } };
    },

    async await_approval(rt) {
      const s = st(rt);
      if (s.followupApproval && !s.messageId) {
        const ap = await rt.approval(s.followupApproval);
        if (ap.status === "pending") return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval to send the follow-up", until: rt.daysFromNow(1) } };
        return { next: "follow_up" };
      }
      // a revised date and an escalation may both be outstanding: settle each as it is decided
      let pending = false;
      if (s.dateApproval) {
        const ap = await rt.approval(s.dateApproval);
        if (ap.status === "pending") pending = true;
        else {
          if (ap.status === "approved") {
            const r = await rt.tool(applyApproval, { approvalId: ap.id });
            await rt.event("outcome", r.stale ? "The revised date was not applied: the activity changed after the proposal" : "Revised date applied after approval", r);
          } else await rt.event("approval", `Revised date ${ap.status.replace("_", " ")}${ap.decision_note ? `: "${ap.decision_note}"` : ""}`);
          s.dateApproval = undefined;
        }
      }
      if (s.escalationApproval && !s.escalated) {
        const ap = await rt.approval(s.escalationApproval);
        if (ap.status === "pending") pending = true;
        else {
          s.escalated = true; // management has decided on it either way
          if (ap.status === "approved") {
            const r = (await rt.tool(applyApproval, { approvalId: ap.id })) as { stale?: boolean; issue_id?: string; action_ids?: string[]; action_id?: string };
            s.issueId = r.issue_id ?? null;
            s.actionIds = r.action_ids ?? (r.action_id ? [r.action_id] : []);
            await rt.event("escalation", r.stale ? "Escalation not applied: circumstances changed" : `Escalated into Mission Control: issue raised and ${s.actionIds.length} corrective actions agreed`, r);
          } else await rt.event("approval", `Escalation ${ap.status.replace("_", " ")}${ap.decision_note ? `: "${ap.decision_note}"` : ""}`);
        }
      }
      if (pending) return { next: "await_approval", wait: { reason: "approval", label: "Waiting for a management decision", until: rt.daysFromNow(1) } };
      await rt.updateInvestigation({ status: s.escalated && s.actionIds?.length ? "escalated" : "monitoring" });
      return { next: "track" };
    },

    async await_response(rt) {
      const s = st(rt);
      const { data: m } = await rt.db.from("agent_messages").select("id, response_kind, response_text, response_date, responded_at").eq("company_id", rt.companyId).eq("id", s.messageId!).single();
      const { state, ws } = await load(rt);
      const hold = paused(rt, state);
      if (hold) return hold;
      const a = ws.activities.find((x) => x.id === rt.inv.subject_id)!;
      if (m?.responded_at && s.handledResponse !== m.id) {
        s.handledResponse = m.id;
        await rt.event("response", `Reply: ${m.response_kind?.replace("_", " ")}${m.response_date ? ` (${m.response_date})` : ""}${m.response_text ? ` — "${m.response_text}"` : ""}`, { kind: m.response_kind, date: m.response_date });
        return { next: "handle_response" };
      }
      // the owner may have updated the plan directly
      if (s.trigger === "evidence" ? a.criteria_met !== null : a.status === "done" || a.status === "not_needed") return s.trigger === "evidence" ? { next: "track" } : ((await resolvedIfDone(rt, ws, a)) ?? { next: "track" });
      const e = esc(rt);
      const sentDays = (rt.now.getTime() - Date.parse(s.sentAt!)) / 86400000;
      if (sentDays < (e?.reminder_after_days ?? 2)) return { next: "await_response", wait: { reason: "response", label: "Waiting for a reply", until: new Date(Date.parse(s.sentAt!) + (e?.reminder_after_days ?? 2) * 86400000) } };
      if ((s.reminders ?? 0) < (e?.max_reminders ?? 1)) {
        s.reminders = (s.reminders ?? 0) + 1;
        return { next: "follow_up" };
      }
      await rt.finding({ kind: "confirmed", text: `No reply after ${s.reminders} reminder${s.reminders === 1 ? "" : "s"}.` });
      return impactOf(ws, a.id).material || s.trigger === "approval" ? { next: "escalate" } : { next: "monitor", wait: { reason: "review", label: "No reply — monitoring", until: rt.daysFromNow(2) } };
    },

    async handle_response(rt) {
      const s = st(rt);
      const { data: m } = await rt.db.from("agent_messages").select("response_kind, response_text, response_date").eq("company_id", rt.companyId).eq("id", s.messageId!).single();
      const { ws } = await load(rt);
      const a = ws.activities.find((x) => x.id === rt.inv.subject_id)!;
      const kind = m?.response_kind;
      if (kind === "done") {
        return (await resolvedIfDone(rt, ws, a)) ?? { next: "track", wait: { reason: "review", label: "Waiting for the plan to show it complete", until: rt.daysFromNow(1) } };
      }
      if (kind === "update") return { next: "monitor", wait: { reason: "review", label: "Update received — monitoring", until: rt.daysFromNow(esc(rt)?.reminder_after_days ?? 2) } };
      if (kind === "new_date" && m?.response_date) {
        s.revisedDate = m.response_date;
        const imp = dateImpact(ws, a.id, m.response_date);
        if (imp.squeezed.length) await rt.finding({ kind: "confirmed", text: `A completion date of ${m.response_date} would push ${imp.squeezed.map((d) => `"${d.title}" (due ${d.due_date})`).join(", ")} past ${imp.breaches.length ? "its due date" : "its planned start"}.` });
        for (const syn of imp.synergies.slice(0, 2)) await rt.finding({ kind: "hypothesis", text: `This is likely to defer "${syn.description}".` });
        if (rt.mode("commitment_change") !== "off") {
          const dateId = await rt.propose(`approval:date:${m.response_date}`, {
            category: "commitment_change", action_type: "change_integration_activity",
            title: `Move "${a.title}" to ${m.response_date}`,
            rationale: `${m.response_text ? `The owner says: "${m.response_text}". ` : ""}${imp.squeezed.length ? `This affects ${imp.squeezed.map((d) => d.title).join(", ")}.` : "No dependent milestone is affected."}`,
            payload: { activity_id: a.id, acquisition_id: ws.acquisition.id, expected_due_date: a.due_date, new_due_date: m.response_date, activity_title: a.title },
            evidence: [activityRef(ws.acquisition.id, a)], affected: [{ type: "integration_activity", id: a.id, label: a.title }, ...imp.squeezed.map((d) => ({ type: "integration_activity", id: d.id, label: d.title }))],
            implications: "Changes the activity's due date in the integration plan. The approved baseline date is kept for variance reporting.", reversible: true,
          });
          s.dateApproval = dateId;
        }
        if (imp.material) return { next: "escalate" };
        return s.dateApproval ? waitApproval(rt, "dateApproval", s.dateApproval, "Waiting for approval of the revised date") : { next: "track" };
      }
      // blocked
      await rt.finding({ kind: "confirmed", text: `${a.title} is blocked${m?.response_text ? `: "${m.response_text}"` : ""}.` });
      return { next: "escalate" };
    },

    async escalate(rt) {
      const s = st(rt);
      const { ws } = await load(rt);
      const a = ws.activities.find((x) => x.id === rt.inv.subject_id)!;
      if (s.escalated) return { next: "track" };
      if (s.escalationApproval) return { next: "await_approval", wait: { reason: "approval", label: "Waiting for a decision on the escalation", until: rt.daysFromNow(1) } };
      if (rt.mode("propose_issue") === "off") {
        await rt.event("step", "Raising Mission Control issues is switched off; findings recorded for the integration leader");
        return { next: "track" };
      }
      const reason = rt.findings.filter((f) => f.kind === "confirmed").slice(-3).map((f) => f.text).join(" ");
      const p = escalationProposal(ws, a, reason, s.revisedDate ?? null, rt.today);
      if (!p.issue.owner_id || !p.actions.length) {
        await rt.finding({ kind: "missing", text: "No integration leader, sponsor or owner is recorded, so the escalation has no accountable owner." });
        return { next: "monitor", wait: { reason: "review", label: "No accountable owner — monitoring", until: rt.daysFromNow(2) } };
      }
      const owners = new Map(ws.crew.map((c) => [c.id, c.full_name]));
      s.escalationApproval = await rt.propose("approval:escalation", {
        category: "propose_issue", action_type: "create_corrective_action",
        title: `Escalate to Mission Control: ${a.title}`,
        rationale: reason || `"${a.title}" is unresolved and affects dependent work.`,
        payload: {
          acquisition_id: ws.acquisition.id, integration_activity_id: a.id,
          issue: p.issue,
          actions: p.actions.map((x) => ({ ...x, owner_name: owners.get(x.owner_id!) ?? "" })),
        },
        evidence: [activityRef(ws.acquisition.id, a), ...impactOf(ws, a.id).dependents.slice(0, 3).map((d) => activityRef(ws.acquisition.id, d))],
        affected: [{ type: "acquisition", id: ws.acquisition.id, label: ws.acquisition.name }],
        implications: "Raises an issue for the weekly ELT meeting and creates the listed corrective actions in Mission Control, linked to this integration. The agent then tracks them.",
        reversible: true,
      });
      await rt.event("escalation", `Proposed escalation into Mission Control for "${a.title}"`);
      return waitApproval(rt, "escalationApproval", s.escalationApproval, "Waiting for management to agree the escalation");
    },

    async track(rt) {
      const s = st(rt);
      const { state, ws } = await load(rt);
      const hold = paused(rt, state);
      if (hold) return hold;
      const a = ws.activities.find((x) => x.id === rt.inv.subject_id)!;
      if (s.trigger === "evidence") {
        if (a.criteria_met === false) {
          s.trigger = "overdue";
          await rt.finding({ kind: "confirmed", text: `The completion criteria for "${a.title}" were judged not met.` });
          return { next: "escalate" };
        }
      }
      const done = await resolvedIfDone(rt, ws, a);
      if (done) return done;
      // the agreed corrective actions: one reminder each when they fall overdue
      for (const x of await openCorrective(rt)) {
        if (x.due_date && x.due_date < rt.today) {
          const owner = ws.crew.find((c) => c.id === x.owner_id);
          if (owner?.user_id && rt.mode("internal_followup") === "auto") {
            await rt.tool(sendMessage, { key: `corrective:${x.id}`, kind: "reminder", toCrewId: owner.id, subject: `${ws.acquisition.name} integration: agreed action overdue`.slice(0, 200), body: `${owner.full_name.split(" ")[0]}, the agreed corrective action "${x.title}" was due on ${x.due_date}. It is linked to "${a.title}". Please complete it or reply with a new date.`, context: { acquisition_id: ws.acquisition.id, integration_activity_id: a.id, action_id: x.id } });
          }
        }
      }
      await rt.updateInvestigation({ status: s.escalated ? "escalated" : "monitoring", next_review_at: rt.daysFromNow(2).toISOString() });
      return { next: "track", wait: { reason: "review", label: s.actionIds?.length ? "Tracking the agreed corrective actions" : "Monitoring until complete", until: rt.daysFromNow(2) } };
    },

    async monitor(rt) {
      const s = st(rt);
      const { state, ws } = await load(rt);
      const hold = paused(rt, state);
      if (hold) return hold;
      const a = ws.activities.find((x) => x.id === rt.inv.subject_id);
      if (!a) return { done: { status: "closed", summary: "The activity is no longer in the plan." } };
      const done = await resolvedIfDone(rt, ws, a);
      if (done) return done;
      const overdue = a.due_date && a.due_date < rt.today;
      if (overdue && s.trigger !== "overdue") {
        s.trigger = "overdue";
        s.reminders = 0;
        return { next: "follow_up" };
      }
      if (overdue && a.due_date && daysBetween(a.due_date, rt.today) >= (esc(rt)?.escalate_after_days ?? 5) && impactOf(ws, a.id).material) return { next: "escalate" };
      await rt.updateInvestigation({ status: "monitoring", next_review_at: rt.daysFromNow(1).toISOString() });
      return { next: "monitor", wait: { reason: "review", label: "Monitoring", until: rt.daysFromNow(1) } };
    },
  },
};

// ---------------------------------------------------------------------------
// Synergy shortfall: completed work that has not produced the expected benefit
// ---------------------------------------------------------------------------
export const integrationSynergy: WorkflowDef = {
  key: "integration.synergy_shortfall",
  agent: "integration",
  title: "Synergy shortfall",
  description: "Investigates a synergy below plan, examines the evidence and the integration work behind it, proposes corrective interventions and keeps measuring.",
  steps: {
    async start(rt) {
      await rt.updateInvestigation({ status: "investigating" });
      const s = st(rt);
      const { state } = await load(rt);
      const syn = state.synergies.find((x) => x.id === rt.inv.subject_id);
      if (!syn) return { done: { status: "closed", summary: "The synergy no longer exists." } };
      const byId = new Map(state.activities.map((a) => [a.id, a as ActivityLike]));
      const r = assessSynergy(syn, state.actuals, byId, rt.today);
      const ref = { type: "synergy", id: syn.id, label: syn.description, path: `/integrations/${state.acquisition.id}?tab=synergies` };
      if (r.status !== "off_track" && r.status !== "at_risk") return { done: { status: "resolved", summary: `"${syn.description}" is ${SYNERGY_STATUS_LABEL[r.status].toLowerCase()}.`, outcome: { shortfall: false } } };
      await rt.finding({ kind: "confirmed", text: `"${syn.description}": ${Math.round(r.realised ?? 0).toLocaleString("en-GB")} realised (verified) by ${r.realisedPeriod} against ${Math.round(r.expectedByNow).toLocaleString("en-GB")} expected by then — ${Math.round((r.attainment ?? 0) * 100)}% of plan.`, sources: [ref] });
      if (r.forecast !== null) await rt.finding({ kind: "confirmed", text: `The latest forecast is ${Math.round(r.forecast).toLocaleString("en-GB")}; forecasts are not counted as realised.`, sources: [ref] });
      if (r.unverifiedActuals) await rt.finding({ kind: "missing", text: `${r.unverifiedActuals} reported results have not been verified and are excluded.` });
      const supporting = syn.supporting_activity_ids.map((id) => state.activities.find((a) => a.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
      if (supporting.length && r.supportingDone === r.supportingTotal)
        await rt.finding({ kind: "confirmed", text: `All ${r.supportingTotal} activities intended to deliver it are complete (${supporting.map((a) => a.title).join("; ")}), so completing the plan has not on its own produced the benefit.` });
      else if (supporting.length) await rt.finding({ kind: "confirmed", text: `${r.supportingDone} of ${r.supportingTotal} supporting activities are complete; outstanding: ${supporting.filter((a) => a.status !== "done").map((a) => a.title).join("; ")}.` });
      if (syn.category === "cross_sell" || syn.category === "revenue") await rt.finding({ kind: "hypothesis", text: "Account owners may not yet be selling into acquired customers, or the offer may not fit their needs; deal-level evidence is needed." });
      else await rt.finding({ kind: "hypothesis", text: "The savings may depend on contract notice periods or volumes not yet reached." });
      await rt.updateInvestigation({
        baseline: { realised: r.realised, expected: Math.round(r.expectedByNow), attainment: r.attainment, period: r.realisedPeriod },
        expected_outcome: `"${syn.description}" back to at least 90% of plan.`,
        severity: r.status === "off_track" ? "high" : "medium",
        summary: `"${syn.description}" at ${Math.round((r.attainment ?? 0) * 100)}% of plan.`,
      });
      if ((syn.category === "cross_sell" || syn.category === "revenue") && !s.childId) {
        const d = await rt.tool(delegate, { to: "commercial", workflow: "commercial.pipeline_review", title: `Commercial evidence: ${syn.description}`.slice(0, 300), question: `Cross-selling to ${state.acquisition.name} customers is below plan. Which opportunities, segments and owners explain it?`, subjectType: "pipeline" });
        if (d.delegated) {
          s.childId = d.childId;
          s.delegatedAt = rt.now.toISOString();
          await rt.event("delegation", "Asked the Commercial Agent for deal-level evidence");
          return { next: "await_child", wait: { reason: "child", label: "Waiting for the Commercial Agent", until: rt.daysFromNow(1) } };
        }
        await rt.finding({ kind: "missing", text: `Deal-level evidence not available: ${d.reason}.` });
      }
      return { next: "propose" };
    },

    async await_child(rt) {
      const s = st(rt);
      const { data } = await rt.db.from("agent_investigations").select("status, findings").eq("company_id", rt.companyId).eq("id", s.childId!).maybeSingle();
      const findings = ((data?.findings ?? []) as Array<{ kind: string; text: string }>).filter((f) => f.kind === "confirmed");
      const waited = (rt.now.getTime() - Date.parse(s.delegatedAt!)) / 86400000;
      if (data && ["open", "investigating"].includes(data.status) && findings.length < 3 && waited < 2) return { next: "await_child", wait: { reason: "child", label: "Waiting for the Commercial Agent", until: rt.daysFromNow(1) } };
      for (const f of findings.slice(0, 3)) await rt.finding({ kind: "confirmed", text: `Commercial Agent: ${f.text}`, sources: [{ type: "investigation", id: s.childId!, label: "Commercial investigation", path: `/agents/investigations/${s.childId}` }] });
      return { next: "propose" };
    },

    async propose(rt) {
      const s = st(rt);
      const { state } = await load(rt);
      const syn = state.synergies.find((x) => x.id === rt.inv.subject_id)!;
      if (rt.mode("propose_issue") === "off") return { next: "monitor" };
      const owner = state.acquisition.leader_crew_id ?? state.acquisition.sponsor_crew_id;
      const synOwner = (await rt.db.from("integration_synergies").select("owner_crew_id").eq("company_id", rt.companyId).eq("id", syn.id).single()).data?.owner_crew_id ?? owner;
      if (!owner || !synOwner) return { next: "monitor" };
      const plus = (n: number) => new Date(rt.now.getTime() + n * 86400000).toISOString().slice(0, 10);
      const facts = rt.findings.filter((f) => f.kind === "confirmed").slice(0, 3).map((f) => f.text).join(" ");
      s.escalationApproval = await rt.propose("approval:synergy", {
        category: "propose_issue", action_type: "create_corrective_action",
        title: `Synergy below plan: ${syn.description}`.slice(0, 300),
        rationale: facts,
        payload: {
          acquisition_id: state.acquisition.id,
          issue: { title: `${state.acquisition.name}: "${syn.description}" below plan`.slice(0, 300), description: `Raised by the M&A Integration Agent. ${facts}`.slice(0, 2000), priority: "high", owner_id: owner },
          actions: [
            { title: `Review the ${syn.category === "cross_sell" ? "cross-sell pipeline with account owners" : "savings delivery with the CFO"} and identify the cause`, description: facts.slice(0, 1500), owner_id: synOwner, due_date: plus(10) },
            { title: `Agree a recovery plan and revised forecast for "${syn.description}"`.slice(0, 300), description: "Forecasts are tracked separately from realised benefits.", owner_id: owner, due_date: plus(21) },
          ],
        },
        evidence: [{ type: "synergy", id: syn.id, label: syn.description, path: `/integrations/${state.acquisition.id}?tab=synergies` }],
        affected: [{ type: "acquisition", id: state.acquisition.id, label: state.acquisition.name }],
        implications: "Raises an issue for the ELT and creates two corrective actions linked to this integration.", reversible: true,
      });
      await rt.updateInvestigation({ status: "awaiting_approval" });
      return { next: "await_approval", wait: { reason: "approval", label: "Waiting for management to agree the intervention", until: rt.daysFromNow(2) } };
    },

    async await_approval(rt) {
      const s = st(rt);
      const ap = await rt.approval(s.escalationApproval!);
      if (ap.status === "pending") return { next: "await_approval", wait: { reason: "approval", label: "Waiting for management to agree the intervention", until: rt.daysFromNow(2) } };
      if (ap.status === "approved") {
        const r = (await rt.tool(applyApproval, { approvalId: ap.id })) as { issue_id?: string; action_ids?: string[] };
        s.actionIds = r.action_ids ?? [];
        s.issueId = r.issue_id ?? null;
        await rt.event("outcome", `Intervention agreed: issue raised and ${s.actionIds.length} corrective actions created`, r);
      } else await rt.event("approval", `Intervention ${ap.status.replace("_", " ")}${ap.decision_note ? `: "${ap.decision_note}"` : ""}`);
      return { next: "monitor" };
    },

    async monitor(rt) {
      const s = st(rt);
      s.monitorStarted ??= rt.now.toISOString();
      const { state } = await load(rt);
      const syn = state.synergies.find((x) => x.id === rt.inv.subject_id);
      if (!syn) return { done: { status: "closed", summary: "The synergy no longer exists." } };
      const byId = new Map(state.activities.map((a) => [a.id, a as ActivityLike]));
      const r = assessSynergy(syn, state.actuals, byId, rt.today);
      const base = rt.inv.baseline as { period?: string | null };
      if (r.realisedPeriod && r.realisedPeriod !== base.period && (r.status === "on_track" || r.status === "achieved")) {
        const outcome = { resolved: true, recovered: true, attainment: r.attainment, period: r.realisedPeriod, intervention: Boolean(s.actionIds?.length) };
        await rt.event("outcome", `"${syn.description}" back on plan (${Math.round((r.attainment ?? 0) * 100)}%) in ${r.realisedPeriod}`, outcome);
        return { done: { status: "resolved", summary: `"${syn.description}" is back on plan. Recovery is recorded, not attributed to the intervention.`, outcome } };
      }
      if ((rt.now.getTime() - Date.parse(s.monitorStarted)) / 86400000 > 120) {
        const outcome = { resolved: false, recovered: false, attainment: r.attainment };
        return { done: { status: "resolved", summary: `"${syn.description}" has not recovered after four months; for the steering committee.`, outcome } };
      }
      await rt.updateInvestigation({ status: "monitoring", next_review_at: rt.daysFromNow(7).toISOString() });
      return { next: "monitor", wait: { reason: "review", label: "Checking each new result", until: rt.daysFromNow(7) } };
    },
  },
};

// ---------------------------------------------------------------------------
// Weekly status: an evidence-backed summary for the integration leader and sponsor
// ---------------------------------------------------------------------------
export const integrationWeeklyStatus: WorkflowDef = {
  key: "integration.weekly_status",
  agent: "integration",
  title: "Weekly integration status",
  description: "Prepares the weekly status of an integration from its records and sends it to the leader and sponsor.",
  steps: {
    async start(rt) {
      const { state } = await load(rt);
      if (state.acquisition.agent_paused) return { done: { status: "closed", summary: "Agent paused for this integration." } };
      const sum = summariseIntegration(state.activities, state.deps, rt.today, esc(rt)?.lead_days ?? 10);
      const byId = new Map(state.activities.map((a) => [a.id, a as ActivityLike]));
      const syn = state.synergies.map((x) => ({ x, r: assessSynergy(x, state.actuals, byId, rt.today) }));
      const lines = [
        `Overall: ${sum.health.replace("_", " ")}. Milestones verified ${sum.milestonesVerified}/${sum.milestonesTotal}${sum.progress !== null ? ` (${Math.round(sum.progress * 100)}% of those due)` : ""}.`,
        sum.overdue.length ? `Overdue: ${sum.overdue.slice(0, 5).map((a) => a.title).join("; ")}.` : "Nothing overdue.",
        sum.atRisk.length ? `At risk (dependencies): ${sum.atRisk.slice(0, 5).map((a) => a.title).join("; ")}.` : "",
        sum.unverified.length ? `Done but not verified: ${sum.unverified.slice(0, 5).map((a) => a.title).join("; ")}.` : "",
        sum.pendingApprovals.length ? `Approvals outstanding: ${sum.pendingApprovals.slice(0, 5).map((a) => a.title).join("; ")}.` : "",
        sum.nextMilestone ? `Next milestone: ${sum.nextMilestone.title} (${sum.nextMilestone.due_date}).` : "",
        ...syn.map(({ x, r }) => `Synergy "${x.description}": ${SYNERGY_STATUS_LABEL[r.status]}${r.realised !== null ? ` — ${Math.round(r.realised).toLocaleString("en-GB")} realised` : ""}.`),
      ].filter(Boolean);
      await rt.updateInvestigation({ summary: lines[0], baseline: { health: sum.health, overdue: sum.overdue.length, at_risk: sum.atRisk.length } });
      for (const l of lines) await rt.finding({ kind: "confirmed", text: l });
      const recipients = [...new Set([state.acquisition.leader_crew_id, state.acquisition.sponsor_crew_id].filter((x): x is string => !!x))];
      let sent = 0;
      if (rt.mode("internal_followup") === "auto") {
        for (const id of recipients) {
          const c = state.crew.find((x) => x.id === id);
          if (!c?.user_id) continue;
          await rt.tool(sendMessage, { key: `status:${id}`, kind: "notice", toCrewId: id, subject: `${state.acquisition.name} integration — weekly status`.slice(0, 200), body: lines.join("\n").slice(0, 3000), context: { acquisition_id: state.acquisition.id, report: "weekly_status" } });
          sent++;
        }
      }
      return { done: { status: "resolved", summary: `Weekly status prepared${sent ? ` and sent to ${sent} people` : " (sending reports needs automatic internal follow-ups)"}.`, outcome: { health: sum.health, sent } } };
    },
  },
};
