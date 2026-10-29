// M&A Integration Agent — document intelligence workflows, run by the durable worker:
// master playbook generation, acquisition-plan generation and post-integration review.
// Each saves a draft into the row a person created; nothing is published without approval.
import { claudeConfigured, GenerationError } from "@/lib/integration/claude";
import { generatePlan } from "@/lib/integration/generate-plan";
import { generatePlaybook } from "@/lib/integration/generate-playbook";
import { reviewIntegration, reviewWithClaude } from "@/lib/integration/learning";
import { playbookContent, type PlaybookContent } from "@/lib/integration/schema";
import type { Runtime, StepOutcome, WorkflowDef } from "../runtime";
import { ToolError } from "../runtime";
import { proposePlaybookChange, readKnowledge, readPlan, saveDraft } from "../tools/integration";

const useClaude = (rt: Runtime) => Boolean(rt.config?.allow_external_ai) && claudeConfigured();

/** Retry transient AI failures; record permanent ones on the draft so people can see them. */
async function guarded(rt: Runtime, kind: "playbook" | "plan" | "review", id: string, work: () => Promise<StepOutcome>): Promise<StepOutcome> {
  try {
    return await work();
  } catch (e) {
    const retryable = e instanceof GenerationError ? e.retryable : e instanceof ToolError ? e.retryable : false;
    const lastTry = rt.run.attempts >= rt.run.max_attempts;
    if (retryable && !lastTry) throw new ToolError(e instanceof Error ? e.message : String(e), true);
    const message = e instanceof Error ? e.message : String(e);
    await rt.tool(saveDraft, { kind, id, content: {}, meta: { failed: true, note: `Generation failed: ${message}`.slice(0, 500) } });
    await rt.event("error", `Could not generate the ${kind}: ${message}`.slice(0, 500));
    return { done: { status: "failed", summary: `Generation failed: ${message}`.slice(0, 500) } };
  }
}

export const integrationGeneratePlaybook: WorkflowDef = {
  key: "integration.generate_playbook",
  agent: "integration",
  title: "Generate master playbook",
  description: "Analyses the selected company documents and drafts a structured, source-cited integration playbook for management review.",
  steps: {
    async start(rt) {
      const id = rt.inv.subject_id!;
      return guarded(rt, "playbook", id, async () => {
        await rt.updateInvestigation({ status: "investigating" });
        const { data: pb } = await rt.db.from("integration_playbooks").select("id, name, status, source_ids").eq("company_id", rt.companyId).eq("id", id).single();
        if (!pb || pb.status !== "generating") return { done: { status: "closed", summary: "The draft was no longer waiting to be generated." } };
        const chunks = await rt.tool(readKnowledge, { sourceIds: pb.source_ids });
        if (!chunks.length) throw new GenerationError("None of the selected documents has readable text.");
        await rt.event("context", `Analysing ${new Set(chunks.map((c) => c.source_id)).size} documents (${chunks.length} passages) ${useClaude(rt) ? "with Claude" : "with the rule-based extractor (no AI provider enabled)"}`);
        const d = await generatePlaybook(chunks, { useClaude: useClaude(rt), name: pb.name });
        await rt.tool(saveDraft, { kind: "playbook", id, content: d.content, meta: { generator: d.generator, model: d.model, note: d.note, name: d.name, applies_when: d.applies_when, acquisition_types: d.acquisition_types } });
        const acts = d.content.workstreams.reduce((n, w) => n + w.activities.length, 0);
        const outcome = { generator: d.generator, workstreams: d.content.workstreams.length, activities: acts, conflicts: d.content.conflicts.length, gaps: d.content.gaps.length, recommendations: d.content.workstreams.flatMap((w) => w.activities).filter((a) => a.basis === "recommended").length, citations_rejected: d.content.stats?.citations_rejected ?? 0 };
        await rt.event("outcome", `Drafted "${d.name}": ${outcome.workstreams} workstreams, ${acts} activities, ${outcome.conflicts} conflicts and ${outcome.gaps} questions for management`, outcome);
        return { done: { status: "resolved", summary: `Draft ready for review: ${outcome.workstreams} workstreams, ${acts} activities. ${d.note}`.slice(0, 1000), outcome } };
      });
    },
  },
};

export const integrationGeneratePlan: WorkflowDef = {
  key: "integration.generate_plan",
  agent: "integration",
  title: "Generate integration plan",
  description: "Adapts the selected approved playbook to an acquisition's rationale, operating model, diligence findings and synergies.",
  steps: {
    async start(rt) {
      const id = rt.inv.subject_id!;
      return guarded(rt, "plan", id, async () => {
        await rt.updateInvestigation({ status: "investigating" });
        const { data: plan } = await rt.db.from("integration_plans").select("id, status, playbook_id, acquisition_id").eq("company_id", rt.companyId).eq("id", id).single();
        if (!plan || plan.status !== "generating") return { done: { status: "closed", summary: "The plan was no longer waiting to be generated." } };
        const [{ data: pb }, { data: acq }, { data: crew }, { data: docs }] = await Promise.all([
          rt.db.from("integration_playbooks").select("content, status, name, version").eq("company_id", rt.companyId).eq("id", plan.playbook_id).single(),
          rt.db.from("acquisitions").select("*").eq("company_id", rt.companyId).eq("id", plan.acquisition_id).single(),
          rt.db.from("crew_members").select("id, full_name, title, seat, is_open_seat").eq("company_id", rt.companyId),
          rt.db.from("knowledge_sources").select("id").eq("company_id", rt.companyId).eq("acquisition_id", plan.acquisition_id).eq("status", "ready"),
        ]);
        if (!pb || pb.status !== "approved") throw new GenerationError("The selected playbook is not an approved version.");
        if (!acq) throw new GenerationError("Acquisition not found.");
        const chunks = await rt.tool(readKnowledge, { sourceIds: (docs ?? []).map((d) => d.id) });
        const playbook = playbookContent.parse(pb.content) as PlaybookContent;
        const g = await generatePlan(playbook, acq, (crew ?? []).filter((c) => !c.is_open_seat).map((c) => ({ id: c.id, full_name: c.full_name, title: c.title, seat: c.seat })), chunks, { useClaude: useClaude(rt) });
        await rt.tool(saveDraft, { kind: "plan", id, content: g.content, meta: { generator: g.generator, model: g.model, note: g.note } });
        const acts = g.content.workstreams.reduce((n, w) => n + w.activities.length, 0);
        const outcome = { generator: g.generator, workstreams: g.content.workstreams.length, activities: acts, deviations: g.content.deviations.length, synergies: g.content.synergies.length, missing: g.content.missing_information.length };
        await rt.event("outcome", `Drafted the ${acq.name} plan from "${pb.name}" v${pb.version}: ${acts} activities, ${outcome.deviations} deviations explained, ${outcome.synergies} synergy targets`, outcome);
        if (g.content.missing_information.length) await rt.finding({ kind: "missing", text: `Information still needed: ${g.content.missing_information.slice(0, 6).join("; ")}.` });
        return { done: { status: "resolved", summary: `Plan ready for review: ${acts} activities, ${outcome.deviations} deviations from the playbook explained.`, outcome } };
      });
    },
  },
};

export const integrationReview: WorkflowDef = {
  key: "integration.review",
  agent: "integration",
  title: "Post-integration review",
  description: "Compares the plan with what happened, finds patterns across integrations and proposes playbook improvements for management to decide.",
  steps: {
    async start(rt) {
      const id = rt.inv.subject_id!;
      return guarded(rt, "review", id, async () => {
        await rt.updateInvestigation({ status: "investigating" });
        const { data: rev } = await rt.db.from("integration_reviews").select("id, status, acquisition_id").eq("company_id", rt.companyId).eq("id", id).single();
        if (!rev || rev.status !== "generating") return { done: { status: "closed", summary: "The review was no longer waiting to be generated." } };
        const state = await rt.tool(readPlan, { acquisitionId: rev.acquisition_id });
        const [{ data: acq }, { data: history }, { data: plans }] = await Promise.all([
          rt.db.from("acquisitions").select("name, completion_date, integration_model, playbook_id").eq("company_id", rt.companyId).eq("id", rev.acquisition_id).single(),
          rt.db.from("knowledge_sources").select("id").eq("company_id", rt.companyId).is("acquisition_id", null).in("doc_type", ["post_acquisition_review", "lessons_learned", "integration_plan", "checklist"]).eq("status", "ready"),
          rt.db.from("integration_plans").select("playbook_id").eq("company_id", rt.companyId).eq("acquisition_id", rev.acquisition_id).eq("status", "approved").limit(1),
        ]);
        const pbId = plans?.[0]?.playbook_id ?? acq?.playbook_id;
        if (!acq || !pbId) throw new GenerationError("This integration has no approved plan to review.");
        // proposals go against the current approved version of the same playbook lineage
        const { data: used } = await rt.db.from("integration_playbooks").select("lineage_id").eq("company_id", rt.companyId).eq("id", pbId).single();
        const { data: current } = await rt.db.from("integration_playbooks").select("id, content").eq("company_id", rt.companyId).eq("lineage_id", used!.lineage_id).eq("status", "approved").maybeSingle();
        if (!current) throw new GenerationError("The playbook this integration used has no approved version to improve.");
        const playbook = playbookContent.parse(current.content);
        const { data: planActs } = await rt.db.from("integration_plans").select("content").eq("company_id", rt.companyId).eq("acquisition_id", rev.acquisition_id).eq("status", "approved").single();
        const pbKeyOf = new Map(((planActs?.content as { workstreams?: Array<{ activities: Array<{ key: string; playbook_activity_key: string | null }> }> })?.workstreams ?? []).flatMap((w) => w.activities.map((a) => [a.key, a.playbook_activity_key] as const)));
        const chunks = await rt.tool(readKnowledge, { sourceIds: (history ?? []).map((h) => h.id) });
        const input = {
          acquisition: acq, playbook,
          activities: state.activities.map((a) => ({ ...a, playbook_key: pbKeyOf.get(a.key) ?? null, origin: (a as unknown as { origin: string }).origin })),
          deps: state.deps, synergies: state.synergies, actuals: state.actuals,
          interventions: state.issues.map((x) => ({ title: x.title, status: x.status })), history: chunks, today: rt.today,
        };
        let content = reviewIntegration(input);
        if (useClaude(rt)) content = await reviewWithClaude(input, content, {});
        await rt.tool(saveDraft, { kind: "review", id, content, meta: { generator: content.generator, model: null, note: content.summary } });
        for (const p of content.proposals) {
          await rt.tool(proposePlaybookChange, { reviewId: id, playbookId: current.id, title: p.title, what: p.what_happened, evidence: p.evidence, change: p.change as unknown as Record<string, unknown>, benefit: p.expected_benefit, appliesTo: p.applies_to });
        }
        const outcome = { delays: content.delays.length, patterns: content.patterns.length, proposals: content.proposals.length };
        await rt.event("outcome", `Post-integration review: ${content.summary} ${content.proposals.length} playbook improvements proposed for management`, outcome);
        return { done: { status: "resolved", summary: `${content.summary} ${content.proposals.length} improvements proposed; the master playbook changes only if management approves.`, outcome } };
      });
    },
  },
};
