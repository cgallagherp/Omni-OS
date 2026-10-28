// CEO Agent — strategic investigation of a KPI exception.
// read the KPI against the North Star and Flight Plan → classify findings → commission
// the Commercial Agent where deal-level evidence is needed → propose an intervention
// (issue + agreed corrective action) for approval → apply it → monitor recovery.
import { assessKpi, interventionProposal } from "../analysis/ceo";
import type { Finding } from "../registry";
import type { Runtime, StepOutcome, WorkflowDef } from "../runtime";
import { applyApproval } from "../tools/mission-control";
import { delegate, readKpiContext } from "../tools/orchestration";

type S = { childId?: string; delegatedAt?: string; approvalId?: string; applied?: boolean; baselinePeriod?: string; monitorStarted?: string };
const st = (rt: Runtime) => rt.state as S;

async function childFindings(rt: Runtime): Promise<{ done: boolean; texts: string[] }> {
  const s = st(rt);
  if (!s.childId) return { done: true, texts: [] };
  const { data } = await rt.db.from("agent_investigations").select("status, findings, summary").eq("company_id", rt.companyId).eq("id", s.childId).maybeSingle();
  if (!data) return { done: true, texts: [] };
  const confirmed = ((data.findings ?? []) as unknown as Finding[]).filter((f) => f.kind === "confirmed").map((f) => f.text);
  const done = !["open", "investigating"].includes(data.status) || confirmed.length >= 3;
  return { done, texts: confirmed.slice(0, 4) };
}

export const ceoKpi: WorkflowDef = {
  key: "ceo.kpi_deviation",
  agent: "ceo",
  title: "Strategic KPI investigation",
  description: "Investigates an off-track KPI against the North Star and Flight Plan, commissions specialists, proposes an intervention and monitors recovery.",
  steps: {
    async start(rt) {
      await rt.updateInvestigation({ status: "investigating" });
      const ctx = await rt.tool(readKpiContext, { metricId: rt.inv.subject_id! });
      const a = assessKpi(ctx);
      await rt.event("context", `Read ${ctx.metric.name} against the North Star, ${ctx.links.length} Flight Plan item${ctx.links.length === 1 ? "" : "s"}, ${ctx.related.length} related KPIs, ${ctx.correctiveActions.length} corrective actions and ${ctx.issues.length} open issues`, {}, [ctx.metricRef, ...ctx.links.map((l) => l.ref)]);
      for (const f of a.findings) await rt.finding(f);
      st(rt).baselinePeriod = a.latest?.period;
      await rt.updateInvestigation({
        baseline: { period: a.latest?.period ?? null, value: a.latest?.value ?? null, target: a.latest?.target ?? null, periods_off_track: a.offTrackRun },
        expected_outcome: `${ctx.metric.name} back on target, with an agreed corrective action owned by ${ctx.metric.owner_name}.`,
        severity: a.severity,
        summary: `${ctx.metric.name} ${ctx.fmt(a.latest?.value ?? null)} vs ${ctx.fmt(a.latest?.target ?? null)} — off track for ${a.offTrackRun} period${a.offTrackRun === 1 ? "" : "s"}${ctx.links.length ? `; measures "${ctx.links[0].title}"` : ""}.`,
      });
      if (!a.material) {
        await rt.event("step", "Within tolerance of a material deviation; monitoring rather than intervening");
        return { next: "monitor" };
      }
      if (a.delegateTo.includes("commercial")) {
        const r = await rt.tool(delegate, {
          to: "commercial",
          workflow: "commercial.pipeline_review",
          title: `Commercial drivers of ${ctx.metric.name}`,
          question: `${ctx.metric.name} has been off track for ${a.offTrackRun} periods. Which opportunities, segments and sources explain it, and what follow-up is needed?`,
          subjectType: "pipeline",
        });
        if (r.delegated) {
          st(rt).childId = r.childId;
          st(rt).delegatedAt = rt.now.toISOString();
          await rt.event("delegation", "Commissioned the Commercial Agent to examine the CRM", { child_id: r.childId });
          await rt.updateInvestigation({ status: "monitoring" });
          return { next: "await_child", wait: { reason: "child", label: "Waiting for the Commercial Agent's findings", until: rt.daysFromNow(1) } };
        }
        await rt.finding({ kind: "missing", text: `Deal-level evidence could not be gathered: ${r.reason}.` });
      }
      return { next: "propose" };
    },

    async await_child(rt) {
      const s = st(rt);
      const c = await childFindings(rt);
      const waited = (rt.now.getTime() - new Date(s.delegatedAt!).getTime()) / 86400000;
      if (!c.done && waited < 2) return { next: "await_child", wait: { reason: "child", label: "Waiting for the Commercial Agent's findings", until: rt.daysFromNow(1) } };
      for (const t of c.texts) await rt.finding({ kind: "confirmed", text: `Commercial Agent: ${t}`, sources: [{ type: "investigation", id: s.childId!, label: "Commercial investigation", path: `/agents/investigations/${s.childId}` }] });
      return { next: "propose" };
    },

    async propose(rt) {
      const s = st(rt);
      const ctx = await rt.tool(readKpiContext, { metricId: rt.inv.subject_id! });
      const a = assessKpi(ctx);
      if (!a.needsIntervention) {
        await rt.event("step", a.material ? "An agreed corrective action is already in place; monitoring whether it works" : "No intervention needed");
        return { next: "monitor" };
      }
      if (rt.mode("propose_issue") === "off") {
        await rt.event("step", "Raising issues is switched off for the CEO Agent; findings recorded for management");
        return { next: "monitor" };
      }
      const c = await childFindings(rt);
      const p = interventionProposal(ctx, a, c.texts);
      const { data: owner } = await rt.db.from("metrics").select("owner_id").eq("id", ctx.metric.id).single();
      const due = new Date(rt.now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
      s.approvalId = await rt.propose("approval:intervention", {
        category: "propose_issue",
        action_type: "create_corrective_action",
        title: `Intervene on ${ctx.metric.name}: raise an issue and agree a corrective action`,
        rationale: `${a.findings[0]?.text ?? ""} There is no agreed corrective action. ${ctx.links.length ? `It threatens "${ctx.links[0].title}".` : ""}`.trim(),
        payload: {
          issue: { title: p.issueTitle, description: p.issueDescription, priority: a.severity === "critical" ? "critical" : "high", owner_id: owner!.owner_id, metric_id: ctx.metric.id },
          action: { title: p.actionTitle, description: p.actionDescription, owner_id: owner!.owner_id, owner_name: ctx.metric.owner_name, due_date: due, metric_id: ctx.metric.id },
        },
        evidence: [ctx.metricRef, ...ctx.links.map((l) => l.ref)].slice(0, 6),
        affected: [{ type: "metric", id: ctx.metric.id, label: ctx.metric.name }, { type: "person", label: ctx.metric.owner_name }],
        implications: "Creates an issue for the weekly ELT agenda and an agreed corrective action, which then appears against this KPI on the Monday scorecard.",
        reversible: true,
      });
      await rt.updateInvestigation({ status: "awaiting_approval" });
      return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval of the intervention", until: rt.daysFromNow(2) } };
    },

    async await_approval(rt) {
      const s = st(rt);
      const ap = await rt.approval(s.approvalId!);
      if (ap.status === "pending") return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval of the intervention", until: rt.daysFromNow(2) } };
      if (ap.status === "approved") {
        const r = await rt.tool(applyApproval, { approvalId: ap.id });
        s.applied = !r.stale;
        await rt.event("outcome", r.stale ? "The intervention was not applied: circumstances changed" : "Intervention approved and applied: issue raised and corrective action agreed", r);
      } else await rt.event("approval", `Intervention ${ap.status.replace("_", " ")}${ap.decision_note ? `: "${ap.decision_note}"` : ""}`);
      return { next: "monitor" };
    },

    async monitor(rt): Promise<StepOutcome> {
      const s = st(rt);
      s.monitorStarted ??= rt.now.toISOString();
      const ctx = await rt.tool(readKpiContext, { metricId: rt.inv.subject_id! });
      const latest = ctx.points.filter((p) => p.value !== null).at(-1);
      const newPeriod = latest && latest.period !== s.baselinePeriod;
      if (newPeriod && latest.status === "on_track") {
        const outcome = { recovered: true, period: latest.period, value: latest.value, target: latest.target, intervention_applied: Boolean(s.applied) };
        await rt.event("outcome", `${ctx.metric.name} is back on target (${ctx.fmt(latest.value)} in ${latest.period})`, outcome, [ctx.metricRef]);
        return { done: { status: "resolved", summary: `${ctx.metric.name} recovered to ${ctx.fmt(latest.value)}${s.applied ? " after the approved intervention" : ""}. Recovery is recorded, not attributed: other factors may have contributed.`, outcome } };
      }
      const days = (rt.now.getTime() - new Date(s.monitorStarted).getTime()) / 86400000;
      if (days > 91) {
        const outcome = { recovered: false, period: latest?.period ?? null, value: latest?.value ?? null, intervention_applied: Boolean(s.applied) };
        await rt.event("outcome", `${ctx.metric.name} has not recovered after a quarter; for the quarterly offsite`, outcome);
        return { done: { status: "resolved", summary: `${ctx.metric.name} did not recover within a quarter — an item for the quarterly offsite.`, outcome } };
      }
      if (newPeriod) {
        await rt.event("monitoring", `${ctx.metric.name}: ${ctx.fmt(latest!.value)} in ${latest!.period} (${latest!.status.replace("_", " ")})`, { period: latest!.period, value: latest!.value }, [ctx.metricRef]);
        s.baselinePeriod = latest!.period;
      }
      await rt.updateInvestigation({ status: "monitoring", next_review_at: rt.daysFromNow(7).toISOString() });
      return { next: "monitor", wait: { reason: "review", label: "Weekly review of the KPI", until: rt.daysFromNow(7) } };
    },
  },
};
