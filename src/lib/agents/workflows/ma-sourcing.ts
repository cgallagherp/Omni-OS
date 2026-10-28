// M&A Agent — target sourcing against the approved thesis.
// read the thesis → search authorised sources → dedupe against the pipeline (including
// rejected companies) → score fit transparently, unknown financials stay unknown → add
// the shortlist to the pipeline within authority → prepare approaches for the strongest
// fits. An approach is never sent by the agent: approval hands the draft to the deal
// lead as a Mission Control action.
import { formatMoney } from "@/lib/domain/format";
import { approachDraft, screen, type Criterion, type Screened } from "../analysis/ma";
import { companySnapshot } from "../context";
import type { Runtime, WorkflowDef } from "../runtime";
import { applyApproval } from "../tools/mission-control";
import { addTarget, readPipeline, readThesis, searchSources, setTargetStage } from "../tools/ma";

type Short = { name: string; normalized: string; score: number; unknownFinancials: boolean; target: Record<string, unknown> };
type S = { shortlist?: Short[]; addApprovalId?: string; added?: Record<string, string>; approaches?: Record<string, string>; preparedAt?: string; leadId?: string | null };
const st = (rt: Runtime) => rt.state as S;

function targetRecord(thesisId: string, s: Screened) {
  const c = s.candidate;
  return {
    thesis_id: thesisId, name: c.name, normalized_name: s.normalized, registration_number: c.registrationNumber, source: c.source, source_ref: c.sourceId,
    website: c.website, sector: c.sector, geography: c.geography, description: c.description, ownership: c.ownership,
    revenue: c.revenue, ebitda: c.ebitda, employees: c.employees, financials_source: c.financialsSource, fit_score: s.fit.score,
    fit_breakdown: s.fit.criteria, evidence: [{ source: c.source, ref: c.sourceId, retrieved: new Date().toISOString().slice(0, 10) }], stage: "shortlisted",
  };
}

async function dealLead(rt: Runtime, pipeline: Array<{ owner_crew_id: string | null; stage: string }>) {
  const owner = pipeline.find((p) => p.owner_crew_id && p.stage !== "rejected")?.owner_crew_id;
  if (owner) return owner;
  const s = await companySnapshot(rt);
  return s.crew.find((c) => !c.reports_to && !c.is_open_seat)?.id ?? null;
}

export const maSourcing: WorkflowDef = {
  key: "ma.sourcing",
  agent: "ma",
  title: "Target sourcing",
  description: "Searches authorised sources against the approved thesis, dedupes, scores fit transparently, maintains the pipeline and prepares approaches for approval.",
  steps: {
    async start(rt) {
      await rt.updateInvestigation({ status: "investigating" });
      const thesis = await rt.tool(readThesis, { thesisId: rt.inv.subject_id! });
      const thesisRef = { type: "thesis", id: thesis.id, label: thesis.title, path: "/agents/ma" };
      let found;
      try {
        found = await rt.tool(searchSources, { keywords: thesis.keywords, sectors: thesis.sectors });
      } catch (e) {
        await rt.finding({ kind: "missing", text: e instanceof Error ? e.message : "No source could be searched." });
        return { done: { status: "resolved", summary: "No authorised market-intelligence source is connected, so no search was run.", outcome: { screened: 0 } } };
      }
      const pipeline = await rt.tool(readPipeline, {});
      const snap = await companySnapshot(rt);
      const r = screen(thesis, found.candidates, pipeline, (v) => formatMoney(v, snap.company.currency));
      await rt.event("context", `Searched ${found.sources.join(", ")} and read ${pipeline.length} pipeline records`, {}, [thesisRef]);
      for (const f of r.findings) await rt.finding({ ...f, sources: [thesisRef] });
      const s = st(rt);
      s.leadId = await dealLead(rt, pipeline);
      s.shortlist = r.shortlist.map((x) => ({ name: x.candidate.name, normalized: x.normalized, score: x.fit.score, unknownFinancials: x.fit.unknownFinancials, target: targetRecord(thesis.id, x) }));
      await rt.updateInvestigation({
        baseline: { screened: found.candidates.length, shortlisted: r.shortlist.length, pipeline_active: pipeline.filter((p) => !["rejected", "closed"].includes(p.stage)).length },
        expected_outcome: "Qualified targets in the pipeline with evidence, and management decisions on the strongest approaches.",
        summary: `${r.shortlist.length} of ${found.candidates.length} companies meet the thesis${r.shortlist.length ? `; strongest: ${r.shortlist.slice(0, 3).map((x) => x.candidate.name).join(", ")}` : ""}.`,
      });
      if (!s.shortlist.length) return { done: { status: "resolved", summary: "No new companies meet the thesis this week.", outcome: { screened: found.candidates.length, shortlisted: 0 } } };
      const mode = rt.mode("pipeline_update");
      if (mode === "off") return { done: { status: "resolved", summary: `${s.shortlist.length} companies meet the thesis; pipeline updates are switched off, so the shortlist is recorded here only.`, outcome: { shortlisted: s.shortlist.length } } };
      if (mode === "approval") {
        s.addApprovalId = await rt.propose("approval:add", {
          category: "pipeline_update", action_type: "add_ma_targets",
          title: `Add ${s.shortlist.length} researched targets to the acquisition pipeline`,
          rationale: r.findings[1].text,
          payload: { thesis: thesis.title, targets: s.shortlist.map((x) => x.target) },
          evidence: [thesisRef], affected: [{ type: "pipeline", label: "Acquisition pipeline" }],
          implications: "Internal pipeline records only. No company is contacted.", reversible: true,
        });
        await rt.updateInvestigation({ status: "awaiting_approval" });
        return { next: "await_add", wait: { reason: "approval", label: "Waiting for approval to update the pipeline", until: rt.daysFromNow(3) } };
      }
      return { next: "add_targets" };
    },

    async await_add(rt) {
      const ap = await rt.approval(st(rt).addApprovalId!);
      if (ap.status === "pending") return { next: "await_add", wait: { reason: "approval", label: "Waiting for approval to update the pipeline", until: rt.daysFromNow(3) } };
      if (ap.status !== "approved") return { done: { status: "resolved", summary: "Management did not approve the pipeline update; the shortlist is recorded here.", outcome: { approved: false } } };
      const approved = new Set(((ap.payload as { targets: Array<{ normalized_name: string }> }).targets).map((t) => t.normalized_name));
      st(rt).shortlist = st(rt).shortlist!.filter((x) => approved.has(x.normalized));
      return { next: "add_targets" };
    },

    async add_targets(rt) {
      const s = st(rt);
      s.added ??= {};
      for (const x of s.shortlist ?? []) {
        const r = await rt.tool(addTarget, { target: x.target, approvalId: s.addApprovalId });
        s.added[x.normalized] = r.id;
      }
      if (s.addApprovalId) await rt.db.rpc("agent_mark_executed", { p_approval: s.addApprovalId, p_result: { targets: Object.values(s.added) } as never });
      await rt.event("outcome", `Added ${Object.keys(s.added).length} targets to the pipeline with fit scores and evidence`, { targets_added: Object.keys(s.added).length });
      return { next: "prepare_approaches" };
    },

    async prepare_approaches(rt) {
      const s = st(rt);
      s.approaches ??= {};
      if (rt.mode("external_communication") === "off") {
        await rt.event("step", "Preparing approaches is switched off; the deal team decides on approaches");
        return { next: "conclude" };
      }
      const snap = await companySnapshot(rt);
      // Approaches only for the strongest fits whose financials are known
      const top = (s.shortlist ?? []).filter((x) => !x.unknownFinancials && s.added?.[x.normalized]).slice(0, 2);
      const due = new Date(rt.now.getTime() + 10 * 86400000).toISOString().slice(0, 10);
      for (const x of top) {
        const tid = s.added![x.normalized];
        const draft = approachDraft(snap.company.name, { name: x.name, sector: x.target.sector as string | null, geography: x.target.geography as string | null, criteria: x.target.fit_breakdown as Criterion[] });
        s.approaches[x.normalized] = await rt.propose(`approval:approach:${x.normalized}`, {
          category: "external_communication", action_type: "send_external_message",
          title: `Prepare an introductory approach to ${x.name}`,
          rationale: `${x.name} scores ${x.score}/100 against the approved thesis with known financials.`,
          payload: {
            target_id: tid, target_name: x.name, draft: { subject: draft.subject, body: draft.body },
            handoff_action: s.leadId ? { title: `Send introductory approach to ${x.name}`, description: `${draft.note}\n\nApproved draft:\n\n${draft.body}`.slice(0, 2000), owner_id: s.leadId, due_date: due } : null,
          },
          evidence: [{ type: "ma_target", id: tid, label: x.name, path: "/agents/ma" }],
          affected: [{ type: "ma_target", id: tid, label: x.name }],
          implications: "External and confidential. The agent will not send this. If approved, the draft is handed to the deal lead as a Mission Control action to review, personalise and send themselves.",
          reversible: false,
        });
        await rt.tool(setTargetStage, { targetId: tid, stage: "approach_prepared" });
      }
      s.preparedAt = rt.now.toISOString();
      if (!top.length) return { next: "conclude" };
      await rt.updateInvestigation({ status: "awaiting_approval" });
      return { next: "await_approaches", wait: { reason: "approval", label: "Waiting for decisions on approaches", until: rt.daysFromNow(3) } };
    },

    async await_approaches(rt) {
      const s = st(rt);
      const pending: string[] = [];
      for (const [name, id] of Object.entries(s.approaches ?? {})) {
        const ap = await rt.approval(id);
        if (ap.status === "pending") pending.push(name);
        else if (ap.status === "approved") {
          const r = await rt.tool(applyApproval, { approvalId: id });
          await rt.event("outcome", `Approach to ${(ap.payload as { target_name: string }).target_name} approved and handed to the deal lead`, r);
        }
      }
      const waited = (rt.now.getTime() - new Date(s.preparedAt!).getTime()) / 86400000;
      if (pending.length && waited < 14) return { next: "await_approaches", wait: { reason: "approval", label: "Waiting for decisions on approaches", until: rt.daysFromNow(3) } };
      return { next: "conclude" };
    },

    async conclude(rt) {
      const s = st(rt);
      const statuses = await Promise.all(Object.values(s.approaches ?? {}).map((id) => rt.approval(id).then((a) => a.status)));
      const outcome = {
        shortlisted: s.shortlist?.length ?? 0,
        targets_added: Object.keys(s.added ?? {}).length,
        approaches_prepared: statuses.length,
        approaches_approved: statuses.filter((x) => x === "approved" || x === "executed").length,
      };
      return { done: { status: "resolved", summary: `${outcome.targets_added} targets added to the pipeline; ${outcome.approaches_prepared} approaches prepared, ${outcome.approaches_approved} approved and handed to the deal lead.`, outcome } };
    },
  },
};
