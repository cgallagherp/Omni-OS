// Execution Agent — overdue management action.
// detect → gather context → check for recent updates → follow up (within authority)
// → capture the owner's response → propose changes for approval → escalate if
// unresolved → monitor until the action is resolved or management closes the case.
import { assessOverdue, escalationMessage, followupMessage, type OverdueInput } from "../analysis/execution";
import { modeFor } from "../registry";
import type { Runtime, StepOutcome, WorkflowDef } from "../runtime";
import { applyApproval, markExecuted, readAction, readDependencies, ref, sendMessage, type ActionContext } from "../tools/mission-control";

type S = {
  cycle?: number;
  reminders?: number;
  recipientCrewId?: string;
  recipientName?: string;
  messageId?: string;
  sentAt?: string;
  escalated?: boolean;
  escalationMessageId?: string;
  awaiting?: string; // approval id
  afterApproval?: string; // step to go to once approved
  handledResponse?: string; // message id already handled
};

const st = (rt: Runtime) => rt.state as S;

async function load(rt: Runtime) {
  const ctx = await rt.tool(readAction, { actionId: rt.inv.subject_id! });
  const deps = await rt.tool(readDependencies, { ids: [ctx.action.id, ...(ctx.priority ? [ctx.priority.id] : [])] });
  const { data: company } = await rt.db.from("companies").select("name").eq("id", rt.companyId).single();
  const input: OverdueInput = {
    today: rt.today,
    companyName: company?.name ?? "",
    action: ctx.action,
    owner: ctx.owner,
    manager: ctx.manager,
    ceo: ctx.ceo,
    priority: ctx.priority,
    issue: ctx.issue,
    metric: ctx.metric,
    comments: ctx.comments,
    audit: ctx.audit,
    dependencies: deps,
    siblings: ctx.siblings,
  };
  const refs = {
    action: ref.action(ctx.action.id, ctx.action.title),
    priority: ctx.priority ? ref.priority(ctx.priority.id, ctx.priority.title) : undefined,
    issue: ctx.issue ? ref.issue(ctx.issue.id, ctx.issue.title) : undefined,
    metric: ctx.metric ? ref.metric(ctx.metric.id, ctx.metric.name) : undefined,
  };
  return { ctx, input, refs, assessment: assessOverdue(input, refs) };
}

/** Resolve when the action is no longer open. */
async function resolvedIfClosed(rt: Runtime, ctx: ActionContext): Promise<StepOutcome | null> {
  if (ctx.action.status === "open") return null;
  const s = st(rt);
  const baseline = rt.inv.baseline as { due_date?: string; days_overdue?: number };
  const outcome = {
    final_status: ctx.action.status,
    completed_at: ctx.action.completed_at,
    days_overdue_at_detection: baseline.days_overdue ?? null,
    follow_ups_sent: (s.cycle ?? 0) + (s.reminders ?? 0),
    escalated: Boolean(s.escalated),
  };
  await rt.event("outcome", `Action ${ctx.action.status === "done" ? "completed" : "cancelled"}${ctx.action.completed_at ? ` on ${ctx.action.completed_at.slice(0, 10)}` : ""}; case resolved`, outcome, [ref.action(ctx.action.id, ctx.action.title)]);
  return { done: { status: "resolved", summary: `"${ctx.action.title}" is ${ctx.action.status === "done" ? "done" : "cancelled"}.`, outcome } };
}

async function waitForApproval(rt: Runtime, approvalId: string, then: string, label: string): Promise<StepOutcome> {
  const s = st(rt);
  s.awaiting = approvalId;
  s.afterApproval = then;
  await rt.updateInvestigation({ status: "awaiting_approval" });
  return { next: "await_approval", wait: { reason: "approval", label, until: rt.daysFromNow(1) } };
}

export const executionOverdue: WorkflowDef = {
  key: "execution.overdue_action",
  agent: "execution",
  title: "Overdue action follow-through",
  description: "Detects an overdue management action, follows up with its owner, records the response and keeps monitoring until it is resolved.",
  steps: {
    async start(rt) {
      await rt.updateInvestigation({ status: "investigating" });
      const { ctx, assessment, refs } = await load(rt);
      const closed = await resolvedIfClosed(rt, ctx);
      if (closed) return closed;
      await rt.event("context", "Retrieved the action, its owner, linked priority, issue and KPI, recent updates, change history and dependencies", {
        owner: ctx.owner?.full_name, priority: ctx.priority?.title ?? null, updates: ctx.comments.length, changes: ctx.audit.length,
      }, assessment.sources);
      for (const f of assessment.findings) await rt.finding(f);
      if (!assessment.overdue) return { next: "monitor" };
      await rt.updateInvestigation({
        baseline: { due_date: ctx.action.due_date, days_overdue: assessment.daysOverdue, status: ctx.action.status },
        expected_outcome: "The action is completed, or a revised date is agreed by management.",
        severity: assessment.daysOverdue > 14 || ctx.metric || ctx.priority ? "high" : "medium",
        summary: `"${ctx.action.title}" is ${assessment.daysOverdue} days overdue (owner ${ctx.owner?.full_name ?? "unassigned"}).`,
      });
      void refs;
      return { next: "follow_up" };
    },

    async follow_up(rt) {
      const s = st(rt);
      const { ctx, input, assessment } = await load(rt);
      const closed = await resolvedIfClosed(rt, ctx);
      if (closed) return closed;
      if (!assessment.overdue) return { next: "monitor" };
      if (assessment.recentlyUpdated && !s.messageId) {
        await rt.event("step", `Holding the follow-up: the action was updated recently (${assessment.recentlyUpdated.what})`);
        await rt.updateInvestigation({ status: "monitoring", next_review_at: rt.daysFromNow(2).toISOString() });
        return { next: "follow_up", wait: { reason: "timer", label: "Recently updated — checking again in 2 days", until: rt.daysFromNow(2) } };
      }
      if (!assessment.recipient) {
        await rt.updateInvestigation({ status: "monitoring", next_review_at: rt.daysFromNow(1).toISOString() });
        return { next: "monitor", wait: { reason: "review", label: "No internal channel — monitoring", until: rt.daysFromNow(1) } };
      }
      const kind = s.messageId ? "reminder" : "followup";
      const msg = followupMessage(input, assessment.recipient.name, kind, assessment.daysOverdue);
      const mode = rt.mode("internal_followup");
      if (mode === "off") {
        await rt.event("step", "Internal follow-ups are switched off for this agent; monitoring only");
        await rt.updateInvestigation({ status: "monitoring", next_review_at: rt.daysFromNow(1).toISOString() });
        return { next: "monitor", wait: { reason: "review", label: "Follow-ups off — monitoring", until: rt.daysFromNow(1) } };
      }
      s.recipientCrewId = assessment.recipient.crewId;
      s.recipientName = assessment.recipient.name;
      const n = (s.cycle ?? 0) + (s.reminders ?? 0);
      if (mode === "approval") {
        const id = await rt.propose(`approval:followup:${n}`, {
          category: "internal_followup",
          action_type: "send_followup",
          title: `${kind === "reminder" ? "Send a reminder" : "Ask for an update"} to ${assessment.recipient.name}: ${ctx.action.title}`,
          rationale: `The action is ${assessment.daysOverdue} days overdue with no recent update. ${assessment.recipient.name} is the ${assessment.recipient.reason}.`,
          payload: { action_id: ctx.action.id, to_crew_id: assessment.recipient.crewId, kind, subject: msg.subject, body: msg.body },
          evidence: assessment.sources,
          affected: [{ type: "person", id: assessment.recipient.crewId, label: assessment.recipient.name }],
          implications: "An internal message in Omni OS (and the connected channel, if configured). No change to the action itself.",
          reversible: false,
        });
        return waitForApproval(rt, id, "send_follow_up", "Waiting for approval to send the follow-up");
      }
      return { next: "send_follow_up" };
    },

    async send_follow_up(rt) {
      const s = st(rt);
      const { ctx, input, assessment } = await load(rt);
      const closed = await resolvedIfClosed(rt, ctx);
      if (closed) return closed;
      const n = (s.cycle ?? 0) + (s.reminders ?? 0);
      const kind = s.messageId ? "reminder" : "followup";
      const approvalId = rt.state[`approval:followup:${n}`] as string | undefined;
      let subject: string;
      let body: string;
      if (approvalId) {
        // Send exactly what was approved
        const ap = await rt.approval(approvalId);
        const p = ap.payload as { subject: string; body: string; to_crew_id: string };
        subject = p.subject;
        body = p.body;
        s.recipientCrewId = p.to_crew_id;
      } else ({ subject, body } = followupMessage(input, s.recipientName ?? assessment.recipient?.name ?? "", kind, assessment.daysOverdue));
      const sent = await rt.tool(sendMessage, {
        key: `${kind}:${n}`,
        kind,
        toCrewId: s.recipientCrewId!,
        subject,
        body,
        context: { action_id: ctx.action.id, due_date: ctx.action.due_date },
        approvalId,
      });
      if (approvalId) await rt.tool(markExecuted, { approvalId, result: { message_id: sent.id } });
      if (kind === "followup") s.cycle = (s.cycle ?? 0) + 1;
      else s.reminders = (s.reminders ?? 0) + 1;
      s.messageId = sent.id;
      s.sentAt = rt.now.toISOString();
      await rt.event("message", `${kind === "reminder" ? "Reminder" : "Follow-up"} sent to ${s.recipientName} (${sent.delivery_status})`, { message_id: sent.id, channel: sent.delivery_status });
      const wait = rt.config?.escalation.reminder_after_days ?? 2;
      await rt.updateInvestigation({ status: "awaiting_response", next_review_at: rt.daysFromNow(wait).toISOString() });
      return { next: "await_response", wait: { reason: "response", label: `Waiting for ${s.recipientName}'s reply`, until: rt.daysFromNow(wait) } };
    },

    async await_approval(rt) {
      const s = st(rt);
      const ap = await rt.approval(s.awaiting!);
      if (ap.status === "pending") return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval", until: rt.daysFromNow(1) } };
      if (ap.status === "approved" || ap.status === "executed") {
        await rt.event("approval", `Approved by the ${ap.approver_role === "ceo" ? "CEO" : ap.approver_role}: ${ap.title}`, { approval_id: ap.id });
        return { next: s.afterApproval! };
      }
      await rt.event("approval", `Not approved (${ap.status.replace("_", " ")}): ${ap.title}${ap.decision_note ? ` — "${ap.decision_note}"` : ""}`, { approval_id: ap.id });
      await rt.updateInvestigation({ status: "monitoring", next_review_at: rt.daysFromNow(1).toISOString() });
      s.awaiting = undefined;
      return { next: "monitor", wait: { reason: "review", label: "Monitoring the action", until: rt.daysFromNow(1) } };
    },

    async await_response(rt) {
      const s = st(rt);
      const { ctx } = await load(rt);
      const closed = await resolvedIfClosed(rt, ctx);
      if (closed) return closed;
      const ids = [s.messageId, s.escalationMessageId].filter(Boolean) as string[];
      const { data: msgs } = await rt.db.from("agent_messages").select("*").eq("company_id", rt.companyId).in("id", ids).not("responded_at", "is", null).order("responded_at", { ascending: false });
      const reply = (msgs ?? []).find((m) => m.id !== s.handledResponse);
      if (reply) return { next: "handle_response" };
      // Due date moved by management since we asked? Re-check later rather than chase.
      if (ctx.action.due_date && ctx.action.due_date >= rt.today) {
        await rt.event("monitoring", `The due date is now ${ctx.action.due_date}; monitoring instead of chasing`);
        return { next: "monitor" };
      }
      const due = new Date(new Date(s.sentAt!).getTime() + (rt.config?.escalation.reminder_after_days ?? 2) * 86400000);
      if (rt.now < due) return { next: "await_response", wait: { reason: "response", label: `Waiting for ${s.recipientName}'s reply`, until: due } };
      if ((s.reminders ?? 0) < (rt.config?.escalation.max_reminders ?? 1) && !s.escalated) {
        await rt.event("step", "No reply within the reminder period; sending a reminder");
        return { next: "follow_up" };
      }
      if (!s.escalated) return { next: "escalate" };
      await rt.updateInvestigation({ status: "escalated", next_review_at: rt.daysFromNow(1).toISOString() });
      return { next: "await_response", wait: { reason: "response", label: "Escalated — waiting for a reply", until: rt.daysFromNow(1) } };
    },

    async handle_response(rt) {
      const s = st(rt);
      const ids = [s.messageId, s.escalationMessageId].filter(Boolean) as string[];
      const { data: msgs } = await rt.db.from("agent_messages").select("*").eq("company_id", rt.companyId).in("id", ids).not("responded_at", "is", null).order("responded_at", { ascending: false });
      const reply = (msgs ?? []).find((m) => m.id !== s.handledResponse);
      if (!reply) return { next: "await_response" };
      s.handledResponse = reply.id;
      const { ctx } = await load(rt);
      await rt.event("response", `${s.recipientName ?? "Recipient"} replied: ${reply.response_kind?.replace("_", " ")}${reply.response_date ? ` (${reply.response_date})` : ""}${reply.response_text ? ` — "${reply.response_text}"` : ""}`, {
        message_id: reply.id, kind: reply.response_kind, date: reply.response_date,
      });
      const closed = await resolvedIfClosed(rt, ctx);
      if (closed) return closed;

      if (reply.response_kind === "done") {
        // The owner marks it done from their reply; if it is still open, monitor briefly
        return { next: "monitor", wait: { reason: "review", label: "Checking the action is marked done", until: rt.daysFromNow(1) } };
      }
      if (reply.response_kind === "new_date" && reply.response_date) {
        if (modeFor(rt.config, "commitment_change") === "off") return { next: "monitor" };
        const id = await rt.propose(`approval:due:${reply.id}`, {
          category: "commitment_change",
          action_type: "change_action_due_date",
          title: `Move "${ctx.action.title}" to ${reply.response_date}`,
          rationale: `${s.recipientName} replied with a new completion date${reply.response_text ? `: "${reply.response_text}"` : ""}. Agreed commitments only change with management approval.`,
          payload: { action_id: ctx.action.id, expected_status: ctx.action.status, expected_due_date: ctx.action.due_date, new_due_date: reply.response_date },
          evidence: [ref.action(ctx.action.id, ctx.action.title)],
          affected: [{ type: "action", id: ctx.action.id, label: ctx.action.title }, ...(ctx.priority ? [{ type: "quarterly_priority", id: ctx.priority.id, label: ctx.priority.title }] : [])],
          implications: ctx.priority?.due_date && reply.response_date > ctx.priority.due_date ? `The new date is after the priority's deadline (${ctx.priority.due_date}).` : "The due date of the action changes; the change is audited.",
          reversible: true,
        });
        return waitForApproval(rt, id, "apply_date_change", "Waiting for approval of the revised date");
      }
      if (reply.response_kind === "blocked") return { next: "escalate" };
      // a general update: note it and keep monitoring
      return { next: "await_response", wait: { reason: "response", label: "Update noted — waiting for completion", until: rt.daysFromNow(rt.config?.escalation.reminder_after_days ?? 2) } };
    },

    async apply_date_change(rt) {
      const s = st(rt);
      const res = await rt.tool(applyApproval, { approvalId: s.awaiting! });
      if (res.stale) await rt.event("step", "The revised date was not applied: the action changed after the proposal was raised");
      else await rt.event("outcome", "Revised due date applied after approval", { approval_id: s.awaiting });
      s.awaiting = undefined;
      // new cycle starts if the new date is missed
      s.messageId = undefined;
      s.reminders = 0;
      return { next: "monitor" };
    },

    async escalate(rt) {
      const s = st(rt);
      const { ctx, input, assessment } = await load(rt);
      const closed = await resolvedIfClosed(rt, ctx);
      if (closed) return closed;
      const rule = rt.config?.escalation ?? { escalate_to: "manager" as const, escalate_after_days: 5 };
      const target = rule.escalate_to === "manager" && ctx.manager?.user_id && ctx.manager.id !== s.recipientCrewId ? ctx.manager : ctx.ceo;
      const { data: replies } = await rt.db.from("agent_messages").select("response_kind, response_text").eq("company_id", rt.companyId).eq("investigation_id", rt.inv.id).eq("response_kind", "blocked").order("responded_at", { ascending: false }).limit(1);
      const blocker = replies?.[0]?.response_text ?? null;
      const reason = blocker ? "the owner reported a blocker" : `no reply after ${(s.reminders ?? 0) + 1} follow-up${(s.reminders ?? 0) ? "s" : ""}`;
      if (!target?.user_id || target.id === s.recipientCrewId) {
        await rt.finding({ kind: "missing", text: "There is nobody further to escalate to through an internal channel." });
        await rt.updateInvestigation({ status: "escalated" });
        s.escalated = true;
        return { next: "monitor" };
      }
      const mode = rt.mode("escalation");
      const msg = escalationMessage(input, target.full_name, reason, assessment.daysOverdue, blocker);
      if (mode === "off") {
        await rt.event("escalation", `Escalation needed (${reason}) but escalations are switched off for this agent`);
        s.escalated = true;
        await rt.updateInvestigation({ status: "escalated" });
        return { next: "monitor" };
      }
      let approvalId: string | undefined;
      if (mode === "approval") {
        approvalId = rt.state["approval:escalation"] as string | undefined;
        if (!approvalId) {
          const id = await rt.propose("approval:escalation", {
            category: "escalation",
            action_type: "send_escalation",
            title: `Escalate "${ctx.action.title}" to ${target.full_name}`,
            rationale: `Escalation rule: ${reason}; the action is ${assessment.daysOverdue} days overdue.`,
            payload: { action_id: ctx.action.id, to_crew_id: target.id, subject: msg.subject, body: msg.body },
            evidence: assessment.sources,
            affected: [{ type: "person", id: target.id, label: target.full_name }],
            implications: "An internal escalation message.",
            reversible: false,
          });
          return waitForApproval(rt, id, "escalate", "Waiting for approval to escalate");
        }
      }
      const sent = await rt.tool(sendMessage, { key: "escalation", kind: "escalation", toCrewId: target.id, subject: msg.subject, body: msg.body, context: { action_id: ctx.action.id }, approvalId });
      if (approvalId) await rt.tool(markExecuted, { approvalId, result: { message_id: sent.id } });
      s.escalated = true;
      s.escalationMessageId = sent.id;
      await rt.event("escalation", `Escalated to ${target.full_name} (${reason})`, { message_id: sent.id });
      // A reported blocker is proposed as an issue for the leadership team
      if (blocker && modeFor(rt.config, "propose_issue") !== "off" && !rt.state["approval:issue"]) {
        await rt.propose("approval:issue", {
          category: "propose_issue",
          action_type: "create_issue",
          title: `Raise an issue: ${ctx.action.title} is blocked`,
          rationale: `The owner reported a blocker: "${blocker}".`,
          payload: { title: `Blocked: ${ctx.action.title}`.slice(0, 300), description: `Blocker reported to the Execution Agent: ${blocker}`, priority: "high", owner_id: ctx.action.owner_id, quarterly_priority_id: ctx.priority?.id ?? "", metric_id: ctx.metric?.id ?? "" },
          evidence: assessment.sources,
          affected: [{ type: "issue", label: "New Mission Control issue" }],
          implications: "Creates an issue that will appear on the next weekly ELT agenda.",
          reversible: true,
        });
      }
      await rt.updateInvestigation({ status: "escalated", next_review_at: rt.daysFromNow(1).toISOString() });
      return { next: "await_response", wait: { reason: "response", label: `Escalated to ${target.full_name}`, until: rt.daysFromNow(1) } };
    },

    async monitor(rt) {
      const s = st(rt);
      const { ctx, assessment } = await load(rt);
      const closed = await resolvedIfClosed(rt, ctx);
      if (closed) return closed;
      // proposals raised along the way (e.g. issue) — apply any that were approved
      const issueApproval = rt.state["approval:issue"] as string | undefined;
      if (issueApproval && !rt.state["issue_applied"]) {
        const ap = await rt.approval(issueApproval);
        if (ap.status === "approved") {
          const r = await rt.tool(applyApproval, { approvalId: issueApproval });
          rt.state["issue_applied"] = true;
          await rt.event("outcome", "Issue raised in Mission Control after approval", r);
        } else if (ap.status !== "pending") rt.state["issue_applied"] = true;
      }
      if (assessment.overdue && !s.messageId && rt.mode("internal_followup") !== "off" && assessment.recipient) {
        // overdue again (e.g. after a revised date): new follow-up cycle
        return { next: "follow_up" };
      }
      if (assessment.overdue && s.messageId && !s.escalated && assessment.daysOverdue >= (rt.config?.escalation.escalate_after_days ?? 5) && rt.mode("escalation") !== "off") {
        return { next: "escalate" };
      }
      const next = ctx.action.due_date && ctx.action.due_date >= rt.today ? new Date(`${ctx.action.due_date}T00:00:00Z`).getTime() + 86400000 : rt.daysFromNow(1).getTime();
      await rt.updateInvestigation({ status: s.escalated ? "escalated" : "monitoring", next_review_at: new Date(next).toISOString() });
      return { next: s.messageId ? "await_response" : "monitor", wait: { reason: "review", label: "Monitoring the action", until: new Date(next) } };
    },
  },
};
