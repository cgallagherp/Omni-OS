// Commercial Agent — pipeline review.
// read the CRM → find the stalled and slipped opportunities and the segment driving them
// → propose (or, where authorised, create) follow-up tasks in the CRM → measure whether
// the follow-ups happen and the pipeline re-engages.
import { formatMoney } from "@/lib/domain/format";
import { assessPipeline, crmTaskFor } from "../analysis/commercial";
import { companySnapshot } from "../context";
import type { Runtime, WorkflowDef } from "../runtime";
import { ref } from "../tools/mission-control";
import { createCrmTask, crmTaskStatus, listOpportunities } from "../tools/crm";

type Task = ReturnType<typeof crmTaskFor>;
type S = { tasks?: Task[]; approvalId?: string; created?: string[]; createdAt?: string; coverageBefore?: number | null };
const st = (rt: Runtime) => rt.state as S;
const addWorkingDays = (d: Date, n: number) => {
  const x = new Date(d);
  while (n > 0) {
    x.setUTCDate(x.getUTCDate() + 1);
    if (x.getUTCDay() % 6 !== 0) n--;
  }
  return x.toISOString().slice(0, 10);
};

async function coverageKpi(rt: Runtime) {
  const s = await companySnapshot(rt);
  const v = s.metrics.find((m) => /pipeline coverage/i.test(m.metric.name) || m.metric.comparable_key === "pipeline_coverage");
  if (!v) return null;
  return { name: v.metric.name, value: v.latest?.value ?? null, target: v.latest?.target ?? v.metric.target_value, ref: ref.metric(v.metric.id, v.metric.name) };
}

export const commercialPipeline: WorkflowDef = {
  key: "commercial.pipeline_review",
  agent: "commercial",
  title: "Pipeline review",
  description: "Finds stalled and slipped opportunities in the CRM, creates follow-up tasks within authority and measures whether pipeline re-engages.",
  steps: {
    async start(rt) {
      await rt.updateInvestigation({ status: "investigating" });
      let data;
      try {
        data = await rt.tool(listOpportunities, {});
      } catch (e) {
        await rt.finding({ kind: "missing", text: e instanceof Error ? e.message : "The CRM could not be read." });
        return { done: { status: "resolved", summary: "No CRM is connected for the Commercial Agent, so the pipeline could not be examined.", outcome: { crm_connected: false } } };
      }
      const s = await companySnapshot(rt);
      const coverage = await coverageKpi(rt);
      const a = assessPipeline({ today: rt.today, opportunities: data.opportunities, coverage, fmtMoney: (v) => formatMoney(v, s.company.currency), crmLabel: data.crm.label });
      await rt.event("context", `Read ${data.opportunities.length} opportunities from ${data.crm.label}${coverage ? ` and the ${coverage.name} KPI` : ""}`, {}, coverage ? [coverage.ref] : []);
      for (const f of a.findings) await rt.finding(f);
      const tasks = a.flagged.slice(0, 15).map((f) => crmTaskFor(f, addWorkingDays(rt.now, 3)));
      st(rt).tasks = tasks;
      st(rt).coverageBefore = coverage?.value ?? null;
      await rt.updateInvestigation({
        baseline: { open_value: a.openValue, stalled_value: a.staleValue, flagged: a.flagged.length, coverage: coverage?.value ?? null },
        expected_outcome: `Each stalled opportunity has an agreed next step${coverage ? `, and ${coverage.name} moves towards ${coverage.target}x` : ""}.`,
        summary: `${a.flagged.length} opportunities need a next step (${formatMoney(a.staleValue, s.company.currency)} stalled)${a.topSegment ? `, concentrated in ${a.topSegment}` : ""}.`,
        severity: a.staleValue > a.openValue * 0.3 ? "high" : "medium",
      });
      if (!tasks.length) return { done: { status: "resolved", summary: "No stalled or slipped opportunities; no follow-up needed.", outcome: { flagged: 0 } } };
      const mode = rt.mode("internal_task");
      if (mode === "off") return { done: { status: "resolved", summary: `${tasks.length} opportunities need follow-up; creating tasks is switched off, so findings are for management.`, outcome: { flagged: tasks.length } } };
      if (mode === "approval") {
        st(rt).approvalId = await rt.propose("approval:tasks", {
          category: "internal_task",
          action_type: "crm_create_tasks",
          title: `Create ${tasks.length} CRM follow-up tasks for stalled opportunities`,
          rationale: a.findings.filter((f) => f.kind === "confirmed").slice(1, 3).map((f) => f.text).join(" "),
          payload: { connection: data.crm.label, tasks: tasks.map((t) => ({ ...t, due: t.due })) },
          evidence: coverage ? [coverage.ref] : [],
          affected: [...new Set(tasks.map((t) => t.owner ?? "Unassigned"))].map((o) => ({ type: "crm_owner", label: o })),
          implications: "Internal tasks in the CRM for the opportunity owners. No customer is contacted and no deal values, stages or terms change.",
          reversible: true,
        });
        await rt.updateInvestigation({ status: "awaiting_approval" });
        return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval to create CRM tasks", until: rt.daysFromNow(2) } };
      }
      return { next: "create_tasks" };
    },

    async await_approval(rt) {
      const ap = await rt.approval(st(rt).approvalId!);
      if (ap.status === "pending") return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval to create CRM tasks", until: rt.daysFromNow(2) } };
      if (ap.status !== "approved") {
        await rt.event("approval", `CRM tasks ${ap.status.replace("_", " ")}${ap.decision_note ? `: "${ap.decision_note}"` : ""}`);
        return { done: { status: "resolved", summary: "Management did not approve the CRM follow-ups; findings recorded.", outcome: { approved: false } } };
      }
      // Execute exactly the approved tasks
      st(rt).tasks = (ap.payload as { tasks: Task[] }).tasks;
      return { next: "create_tasks" };
    },

    async create_tasks(rt) {
      const s = st(rt);
      s.created ??= [];
      for (const t of s.tasks ?? []) {
        const r = await rt.tool(createCrmTask, { key: t.opportunityId, task: t, approvalId: s.approvalId });
        if (!s.created.includes(r.id)) s.created.push(r.id);
      }
      s.createdAt = rt.now.toISOString();
      if (s.approvalId) await rt.db.rpc("agent_mark_executed", { p_approval: s.approvalId, p_result: { tasks: s.created } as never });
      await rt.event("outcome", `Created ${s.created.length} follow-up tasks in the CRM`, { tasks: s.created.length });
      await rt.updateInvestigation({ status: "monitoring", next_review_at: rt.daysFromNow(7).toISOString() });
      return { next: "measure", wait: { reason: "review", label: "Checking follow-through in a week", until: rt.daysFromNow(7) } };
    },

    async measure(rt) {
      const s = st(rt);
      const statuses = await rt.tool(crmTaskStatus, { ids: s.created ?? [] });
      const completed = statuses.filter((t) => t.status === "completed").length;
      const data = await rt.tool(listOpportunities, {});
      const since = (s.createdAt ?? rt.now.toISOString()).slice(0, 10);
      const ids = new Set((s.tasks ?? []).map((t) => t.opportunityId));
      const reengaged = data.opportunities.filter((o) => ids.has(o.id) && o.lastActivityOn && o.lastActivityOn >= since).length;
      const coverage = await coverageKpi(rt);
      const days = (rt.now.getTime() - new Date(s.createdAt!).getTime()) / 86400000;
      const outcome = { tasks_created: s.created?.length ?? 0, tasks_completed: completed, opportunities_reengaged: reengaged, coverage_before: s.coverageBefore ?? null, coverage_after: coverage?.value ?? null };
      await rt.event("monitoring", `${completed} of ${outcome.tasks_created} follow-ups completed; ${reengaged} opportunities have new activity`, outcome);
      if (completed === outcome.tasks_created || days >= 14) {
        return { done: { status: "resolved", summary: `${completed}/${outcome.tasks_created} CRM follow-ups completed and ${reengaged} opportunities re-engaged${coverage?.value != null ? `; ${coverage.name} now ${coverage.value}x` : ""}. Activity is recorded; pipeline changes are not attributed to the agent without further evidence.`, outcome } };
      }
      await rt.updateInvestigation({ outcome, next_review_at: rt.daysFromNow(3).toISOString() });
      return { next: "measure", wait: { reason: "review", label: "Checking follow-through", until: rt.daysFromNow(3) } };
    },
  },
};
