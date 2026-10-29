// Commercial Agent — retention review, usually commissioned by the CEO Agent.
// segments responsible for the change in NRR → the customers and contracts behind the losses
// → CRM context for them (health, owners, renewals) → confirmed drivers vs hypotheses →
// recommended interventions for the CEO Agent's proposal → CRM follow-ups on at-risk renewals
// (within authority, approval-gated) → measure follow-through and the segment's retention.
import { fmt } from "@/lib/analytics/format";
import type { SourceRef } from "../registry";
import type { Runtime, WorkflowDef } from "../runtime";
import { crmAccounts, revenueDrivers } from "../tools/analytics";
import { createCrmTask, crmTaskStatus } from "../tools/crm";

type Task = { opportunityId: string; subject: string; notes: string; owner: string | null; due: string; account: string };
type S = { recommendations?: string[]; tasks?: Task[]; approvalId?: string; created?: string[]; createdAt?: string; segment?: { dimension: string; key: string; label: string; nrr: number | null }; nrrBefore?: number | null };
const st = (rt: Runtime) => rt.state as S;
const pct = (v: number | null | undefined) => fmt(v ?? null, "percent");

export const commercialRetention: WorkflowDef = {
  key: "commercial.retention_review",
  agent: "commercial",
  title: "Retention review",
  description: "Identifies the segments and customers driving a change in GRR/NRR from governed data, adds CRM context, separates observed drivers from hypotheses, recommends interventions and follows up at-risk renewals in the CRM within authority.",
  steps: {
    async start(rt) {
      const s = st(rt);
      await rt.updateInvestigation({ status: "investigating" });
      const filters = ((rt.inv.trigger as { filters?: Record<string, string[]> }).filters ?? {}) as Record<string, string[]>;
      let d;
      try {
        d = await rt.tool(revenueDrivers, { filters });
      } catch (e) {
        await rt.finding({ kind: "missing", text: e instanceof Error ? e.message : "Governed revenue data could not be read." });
        return { done: { status: "resolved", summary: "The Commercial Agent could not read governed revenue data (not connected, or not authorised for the revenue domain).", outcome: { recommendations: [] } } };
      }
      const base = `/revenue`;
      const ret: SourceRef = { type: "analytics", id: "retention", label: "Retention analysis", path: `${base}/retention` };
      s.nrrBefore = d.nrr;
      await rt.finding({ kind: "confirmed", text: `NRR is ${pct(d.nrr)} (GRR ${pct(d.grr)}) for the ${d.windowLabel}, against ${pct(d.nrrBefore)} (GRR ${pct(d.grrBefore)}) a year earlier.`, sources: [ret] });
      // the segments that explain the change, by contribution to company NRR
      const drivers = d.dims.flatMap((dim) => dim.rows.slice(0, 2).map((r) => ({ ...r, dimension: dim.dimension, dimLabel: dim.label }))).filter((r) => (r.contribution ?? 0) < -0.005).sort((a, b) => (a.contribution ?? 0) - (b.contribution ?? 0));
      const top = drivers[0];
      for (const r of drivers.filter((x) => x.dimension === "sector" || x.dimension === "product").slice(0, 3)) {
        await rt.finding({ kind: "confirmed", text: `${r.dimLabel} — ${r.label}: NRR ${pct(r.nrr)} vs ${pct(r.nrrBefore)} a year earlier (${Math.round(r.weight * 100)}% of opening ARR), contributing ${fmt(r.contribution, "pp", { signed: true })} to the change${Object.keys(filters).length ? " within the filtered scope" : " in company NRR"}; contraction ${fmt(r.contraction, "currency")}, churn ${fmt(r.churn, "currency")}.`, sources: [{ type: "analytics", id: `${r.dimension}:${r.key}`, label: r.label, path: `${base}/retention?group=${r.dimension}` }] });
      }
      if (top) s.segment = { dimension: top.dimension, key: top.key, label: top.label, nrr: top.nrr };
      const losers = [...d.contraction.rows, ...d.churn.rows].sort((a, b) => a.amount - b.amount).slice(0, 8);
      if (losers.length) await rt.finding({ kind: "confirmed", text: `Largest losses in the window: ${losers.slice(0, 6).map((c) => `${c.name} ${fmt(c.amount, "currency")}`).join("; ")}. ${d.contraction.total} customers contracted (${fmt(d.contraction.totalAmount ?? 0, "currency")}) and ${d.churn.total} churned (${fmt(d.churn.totalAmount ?? 0, "currency")}).`, sources: losers.slice(0, 6).map((c) => ({ type: "customer", id: c.id, label: c.name, path: `${base}/customers/${c.id}` })) });
      // CRM context for the customers behind the losses
      const crmIds = losers.map((c) => d.crmIds[c.id]).filter(Boolean) as string[];
      const unlinked = losers.filter((c) => !d.crmIds[c.id]);
      const crm = await rt.tool(crmAccounts, { crmIds });
      const red = crm.accounts.filter((a) => a.health === "red" || a.health === "amber");
      if (crm.accounts.length) await rt.finding({ kind: "confirmed", text: `In the CRM, ${red.length} of ${crm.accounts.length} of these accounts are flagged amber or red; ${crm.opportunities.length} have an open renewal opportunity.` });
      if (unlinked.length) await rt.finding({ kind: "missing", text: `${unlinked.length} of the customers behind the losses are not matched to a CRM account, so their CRM history is unavailable.` });
      await rt.finding({ kind: "missing", text: "Customer-success notes and product-usage data are not connected, so reasons for contraction cannot be confirmed from evidence." });
      const loserMonths = d.contraction.rows.length + d.churn.rows.length;
      if (top && loserMonths) await rt.finding({ kind: "hypothesis", text: `Losses concentrate in ${top.label}; reductions happen at renewal, which is consistent with budget-driven scope cuts or supplier consolidation in that segment. This needs confirming with the account owners.` });
      const recommendations = [
        top ? `Agree a renewal plan, with an executive sponsor, for every ${top.label} account renewing in the next 120 days` : "Agree a renewal plan for every at-risk account renewing in the next 120 days",
        "Review each contraction and churn case with its account owner and record the agreed root cause",
        "Re-forecast ARR and NRR with the revised renewal outcomes",
      ];
      s.recommendations = recommendations;
      await rt.updateInvestigation({
        summary: `NRR ${pct(d.nrr)} vs ${pct(d.nrrBefore)} a year earlier${top ? `, driven mainly by ${top.label}` : ""}.`,
        baseline: { nrr: pct(d.nrr), nrr_a_year_earlier: pct(d.nrrBefore), main_driver: s.segment?.label ?? "—", scope: Object.keys(filters).length ? Object.entries(filters).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ") : "whole company" },
        outcome: { recommendations },
        expected_outcome: "Renewal plans for at-risk accounts, and segment retention back towards the company level.",
        severity: (d.nrr ?? 1) < (d.nrrBefore ?? 1) - 0.05 ? "high" : "medium",
      });
      // CRM follow-ups: open renewals of the at-risk accounts behind the losses and in the segment driving them
      const seg = s.segment?.dimension === "sector" ? await rt.tool(crmAccounts, { crmIds: [], segment: s.segment.key }) : { accounts: [], opportunities: [] };
      if (seg.accounts.length) await rt.finding({ kind: "confirmed", text: `${seg.accounts.length} ${s.segment!.label} accounts are amber or red in the CRM; ${seg.opportunities.length} have an open renewal.` });
      const due = new Date(rt.now.getTime() + 5 * 86400000).toISOString().slice(0, 10);
      const accById = new Map([...crm.accounts, ...seg.accounts].map((a) => [a.id, a]));
      const opps = [...new Map([...crm.opportunities, ...seg.opportunities].map((o) => [o.id, o])).values()].sort((a, b) => String(a.close_date).localeCompare(String(b.close_date)));
      const tasks: Task[] = opps.slice(0, 10).map((o) => {
        const a = accById.get(o.account_id!);
        return { opportunityId: o.id, account: a?.name ?? o.name, owner: o.owner_name ?? a?.owner_name ?? null, due, subject: `Renewal plan: ${a?.name ?? o.name}`.slice(0, 200), notes: `ARR has contracted or is at risk (CRM health ${a?.health ?? "unknown"}). Agree scope, budget and an executive sponsor before ${o.close_date}. Raised by the Commercial Agent from the retention review; no customer has been contacted.` };
      });
      s.tasks = tasks;
      if (!tasks.length) return { done: { status: "resolved", summary: "Drivers and recommendations recorded for the CEO Agent; no open renewal needs a CRM follow-up.", outcome: { recommendations, tasks: 0 } } };
      const mode = rt.mode("internal_task");
      if (mode === "off") return { done: { status: "resolved", summary: `${tasks.length} renewals need follow-up; creating CRM tasks is switched off, so findings are for management.`, outcome: { recommendations, flagged: tasks.length } } };
      if (mode === "approval") {
        s.approvalId = await rt.propose("approval:tasks", {
          category: "internal_task", action_type: "crm_create_tasks",
          title: `Create ${tasks.length} CRM renewal follow-ups for accounts behind the NRR decline`,
          rationale: `These accounts have contracted or are at risk and have an open renewal${top ? ` (mainly ${top.label})` : ""}.`,
          payload: { tasks },
          affected: [...new Set(tasks.map((t) => t.owner ?? "Unassigned"))].map((o) => ({ type: "crm_owner", label: o })),
          implications: "Internal tasks for the account owners in the CRM. No customer is contacted; no price, scope or contract term changes.",
          reversible: true,
        });
        await rt.updateInvestigation({ status: "awaiting_approval" });
        return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval to create CRM follow-ups", until: rt.daysFromNow(2) } };
      }
      return { next: "create_tasks" };
    },

    async await_approval(rt) {
      const ap = await rt.approval(st(rt).approvalId!);
      if (ap.status === "pending") return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval to create CRM follow-ups", until: rt.daysFromNow(2) } };
      if (ap.status !== "approved") {
        await rt.event("approval", `CRM follow-ups ${ap.status.replace("_", " ")}${ap.decision_note ? `: "${ap.decision_note}"` : ""}`);
        return { done: { status: "resolved", summary: "Management did not approve the CRM follow-ups; findings and recommendations recorded.", outcome: { approved: false, recommendations: st(rt).recommendations ?? [] } } };
      }
      st(rt).tasks = (ap.payload as { tasks: Task[] }).tasks; // exactly the approved tasks
      return { next: "create_tasks" };
    },

    async create_tasks(rt) {
      const s = st(rt);
      s.created ??= [];
      for (const t of s.tasks ?? []) {
        const r = await rt.tool(createCrmTask, { key: `ret:${t.opportunityId}`, task: { opportunityId: t.opportunityId, subject: t.subject, notes: t.notes, owner: t.owner, due: t.due }, approvalId: s.approvalId });
        if (!s.created.includes(r.id)) s.created.push(r.id);
      }
      s.createdAt = rt.now.toISOString();
      if (s.approvalId) await rt.db.rpc("agent_mark_executed", { p_approval: s.approvalId, p_result: { tasks: s.created } as never });
      await rt.event("outcome", `Created ${s.created.length} renewal follow-ups in the CRM`, { tasks: s.created.length });
      await rt.updateInvestigation({ status: "monitoring", next_review_at: rt.daysFromNow(7).toISOString() });
      return { next: "measure", wait: { reason: "review", label: "Checking follow-through in a week", until: rt.daysFromNow(7) } };
    },

    async measure(rt) {
      const s = st(rt);
      const statuses = await rt.tool(crmTaskStatus, { ids: s.created ?? [] });
      const completed = statuses.filter((t) => t.status === "completed").length;
      const days = (rt.now.getTime() - new Date(s.createdAt!).getTime()) / 86400000;
      const outcome = { tasks_created: s.created?.length ?? 0, tasks_completed: completed, nrr_at_start: s.nrrBefore ?? null, recommendations: s.recommendations ?? [] };
      await rt.event("monitoring", `${completed} of ${outcome.tasks_created} renewal follow-ups completed`, outcome);
      if (completed === outcome.tasks_created || days >= 30) {
        const d = await rt.tool(revenueDrivers, { filters: {} });
        return { done: { status: "resolved", summary: `${completed}/${outcome.tasks_created} renewal follow-ups completed; NRR now ${pct(d.nrr)} (was ${pct(s.nrrBefore)}). Changes are recorded, not attributed to the agent.`, outcome: { ...outcome, nrr_now: d.nrr } } };
      }
      await rt.updateInvestigation({ next_review_at: rt.daysFromNow(7).toISOString() });
      return { next: "measure", wait: { reason: "review", label: "Checking follow-through", until: rt.daysFromNow(7) } };
    },
  },
};
