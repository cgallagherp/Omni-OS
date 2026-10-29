// CEO Agent — is an integration delivering what the acquisition was for? Reads the
// integration's progress and synergies against the North Star and Flight Plan item it
// serves, and raises it for the ELT only when it is materially off course.
import { assessSynergy, summariseIntegration, SYNERGY_STATUS_LABEL, synergyTotals, type ActivityLike } from "@/lib/domain/integration";
import type { WorkflowDef } from "../runtime";
import { applyApproval } from "../tools/mission-control";
import { readPlan } from "../tools/integration";
import { ref } from "../tools/mission-control";

type S = { approvalId?: string };

export const ceoIntegration: WorkflowDef = {
  key: "ceo.integration_review",
  agent: "ceo",
  title: "Integration strategic review",
  description: "Assesses whether an integration is progressing towards its strategic and financial objectives and raises material problems for the ELT.",
  steps: {
    async start(rt) {
      await rt.updateInvestigation({ status: "investigating" });
      const st = rt.state as S;
      const p = await rt.tool(readPlan, { acquisitionId: rt.inv.subject_id! });
      const sum = summariseIntegration(p.activities, p.deps, rt.today);
      const byId = new Map(p.activities.map((a) => [a.id, a as ActivityLike]));
      const assessed = new Map(p.synergies.map((s) => [s.id, assessSynergy(s, p.actuals, byId, rt.today)]));
      const totals = synergyTotals(p.synergies, assessed);
      const acqRef = { type: "acquisition", id: p.acquisition.id, label: p.acquisition.name, path: `/integrations/${p.acquisition.id}` };
      await rt.finding({ kind: "confirmed", text: `${p.acquisition.name}: integration ${sum.health.replace("_", " ")}; ${sum.milestonesVerified} of ${sum.milestonesTotal} milestones verified complete; ${sum.overdue.length} activities overdue; critical-path slip ${sum.criticalSlipDays} days.`, sources: [acqRef] });
      if (p.synergies.length) await rt.finding({ kind: "confirmed", text: `Synergies: ${Math.round(totals.realised).toLocaleString("en-GB")} realised (verified) against targets of ${Math.round(totals.target).toLocaleString("en-GB")}. ${p.synergies.map((s) => `"${s.description}" ${SYNERGY_STATUS_LABEL[assessed.get(s.id)!.status].toLowerCase()}`).join("; ")}.`, sources: [acqRef] });
      else await rt.finding({ kind: "missing", text: "No synergy targets are recorded, so financial delivery cannot be assessed." });
      const { data: ns } = await rt.db.from("north_stars").select("id, vision").eq("company_id", rt.companyId).maybeSingle();
      if (p.acquisition.annual_goal_id) {
        const { data: g } = await rt.db.from("annual_goals").select("id, title, status").eq("company_id", rt.companyId).eq("id", p.acquisition.annual_goal_id).maybeSingle();
        if (g) await rt.finding({ kind: "confirmed", text: `It serves the 12-Month Objective "${g.title}" (reported ${g.status.replace("_", " ")}).`, sources: [ref.goal(g.id, g.title)] });
      } else await rt.finding({ kind: "missing", text: "The integration is not linked to a 12-Month Objective, so its contribution to the Flight Plan cannot be traced." });
      if (ns) await rt.finding({ kind: "confirmed", text: "Acquisitions are part of the route to the North Star; a delayed integration delays that contribution.", sources: [ref.northStar(ns.id)] });
      const material = sum.health === "off_track" && (sum.criticalSlipDays >= 14 || [...assessed.values()].some((r) => r.status === "off_track"));
      await rt.updateInvestigation({ summary: `${p.acquisition.name}: ${sum.health.replace("_", " ")}, synergies ${Math.round(totals.realised).toLocaleString("en-GB")} of ${Math.round(totals.target).toLocaleString("en-GB")}.`, severity: material ? "high" : "medium", baseline: { health: sum.health, realised: totals.realised, target: totals.target } });
      const openIssue = p.issues.some((i) => i.status !== "resolved");
      if (!material || openIssue || rt.mode("propose_issue") === "off") {
        if (openIssue) await rt.finding({ kind: "confirmed", text: "An issue is already open for this integration in Mission Control; no second issue raised." });
        return { done: { status: "resolved", summary: material ? "Materially off course; already on the ELT agenda." : "No strategic intervention needed.", outcome: { material, health: sum.health } } };
      }
      const owner = p.acquisition.sponsor_crew_id ?? p.acquisition.leader_crew_id;
      if (!owner) return { done: { status: "resolved", summary: "Off course, but no sponsor is recorded to own the issue.", outcome: { material } } };
      st.approvalId = await rt.propose("approval:issue", {
        category: "propose_issue", action_type: "create_issue",
        title: `Put ${p.acquisition.name} on the ELT agenda: integration off course`,
        rationale: rt.findings.slice(0, 3).map((f) => f.text).join(" "),
        payload: { acquisition_id: p.acquisition.id, title: `${p.acquisition.name} integration off course against its objectives`, description: `Raised by the CEO Agent. ${rt.findings.slice(0, 3).map((f) => f.text).join(" ")}`.slice(0, 2000), priority: "high", owner_id: owner },
        evidence: [acqRef], affected: [acqRef], implications: "Raises one Mission Control issue linked to the integration.", reversible: true,
      });
      await rt.updateInvestigation({ status: "awaiting_approval" });
      return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval to raise it with the ELT", until: rt.daysFromNow(2) } };
    },
    async await_approval(rt) {
      const st = rt.state as S;
      const ap = await rt.approval(st.approvalId!);
      if (ap.status === "pending") return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval", until: rt.daysFromNow(2) } };
      if (ap.status === "approved") await rt.tool(applyApproval, { approvalId: ap.id });
      return { done: { status: "resolved", summary: ap.status === "approved" ? "Raised with the ELT." : "Management decided not to raise it.", outcome: { raised: ap.status === "approved" } } };
    },
  },
};
