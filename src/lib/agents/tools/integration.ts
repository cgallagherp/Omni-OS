import { z } from "zod";
import type { SourceChunk } from "@/lib/integration/grounding";
import type { ActivityLike, ActualLike, DependencyLike, SynergyLike } from "@/lib/domain/integration";
import { defineTool, ToolError } from "../runtime";

/** Read the passages of the documents management selected (RLS-scoped to this company). */
export const readKnowledge = defineTool({
  name: "integration.read_knowledge",
  description: "Read the selected integration documents' indexed passages.",
  sideEffect: "read",
  input: z.object({ sourceIds: z.array(z.string().uuid()).max(200) }),
  run: async (rt, i: { sourceIds: string[] }): Promise<SourceChunk[]> => {
    if (!i.sourceIds.length) return [];
    const { data: sources, error } = await rt.db.from("knowledge_sources").select("id, title, doc_type, status").eq("company_id", rt.companyId).in("id", i.sourceIds);
    if (error) throw new ToolError(error.message, true);
    const ready = (sources ?? []).filter((s) => s.status === "ready");
    if (!ready.length) return [];
    const out: SourceChunk[] = [];
    for (const s of ready) {
      const { data: chunks, error: ce } = await rt.db.from("knowledge_chunks").select("id, source_id, heading, text, ordinal").eq("company_id", rt.companyId).eq("source_id", s.id).order("ordinal");
      if (ce) throw new ToolError(ce.message, true);
      for (const c of chunks ?? []) out.push({ ...c, source_title: s.title, doc_type: s.doc_type });
    }
    return out;
  },
  summarise: (i, o) => `${o.length} passages from ${new Set(o.map((c) => c.source_id)).size} of ${i.sourceIds.length} documents`,
});

/** Save a generated draft into the row a person asked for (database-checked). */
export const saveDraft = defineTool({
  name: "integration.save_draft",
  description: "Save a generated playbook, plan or review as a draft for management review.",
  sideEffect: "internal",
  input: z.object({ kind: z.enum(["playbook", "plan", "review"]), id: z.string().uuid(), content: z.unknown(), meta: z.record(z.string(), z.unknown()) }),
  run: async (rt, i: { kind: "playbook" | "plan" | "review"; id: string; content: unknown; meta: Record<string, unknown> }) => {
    const save = async () => {
      const { error } = await rt.db.rpc("agent_save_draft", { p_kind: i.kind, p_id: i.id, p_content: i.content as never, p_meta: i.meta as never });
      if (error) throw new ToolError(error.message, error.code !== "42501");
      return { saved: true };
    };
    const table = i.kind === "playbook" ? "integration_playbooks" : i.kind === "plan" ? "integration_plans" : "integration_reviews";
    // a retried save after an interruption finds the draft already saved
    const reconcile = async () => {
      const { data } = await rt.db.from(table).select("status").eq("company_id", rt.companyId).eq("id", i.id).maybeSingle();
      return data && data.status !== "generating" ? { saved: true } : null;
    };
    return rt.once(`draft:${i.kind}:${i.id}:${i.meta.failed ? "failed" : "ok"}`, "integration.save_draft", save, reconcile);
  },
  summarise: (i) => (i.meta.failed ? `Recorded that the ${i.kind} could not be generated` : `Saved the ${i.kind} draft for management review`),
});

export interface PlanState {
  acquisition: { id: string; name: string; status: string; completion_date: string | null; leader_crew_id: string | null; sponsor_crew_id: string | null; agent_paused: boolean; annual_goal_id: string | null; quarterly_priority_id: string | null };
  activities: Array<ActivityLike & { description: string; accountable_function: string; evidence_required: string; approval_required: string | null; human_only: boolean; workstream: string; blocked_reason: string | null }>;
  deps: DependencyLike[];
  synergies: SynergyLike[];
  actuals: ActualLike[];
  crew: Array<{ id: string; full_name: string; title: string; user_id: string | null; reports_to: string | null; email: string | null }>;
  actions: Array<{ id: string; title: string; status: string; due_date: string | null; owner_id: string; integration_activity_id: string | null; issue_id: string | null }>;
  issues: Array<{ id: string; title: string; status: string }>;
}

/** Everything about one integration the agent may read: plan, dependencies, synergies, linked Mission Control records. */
export const readPlan = defineTool({
  name: "integration.read_plan",
  description: "Read an integration's activities, dependencies, synergies and linked Mission Control records.",
  sideEffect: "read",
  input: z.object({ acquisitionId: z.string().uuid() }),
  run: async (rt, i: { acquisitionId: string }): Promise<PlanState> => {
    const cid = rt.companyId;
    const { data: acq } = await rt.db.from("acquisitions").select("id, name, status, completion_date, leader_crew_id, sponsor_crew_id, agent_paused, annual_goal_id, quarterly_priority_id").eq("company_id", cid).eq("id", i.acquisitionId).maybeSingle();
    if (!acq) throw new ToolError("Acquisition not found");
    const [acts, ws, deps, syn, crew, actions, issues] = await Promise.all([
      rt.db.from("integration_activities").select("*").eq("company_id", cid).eq("acquisition_id", acq.id),
      rt.db.from("integration_workstreams").select("id, name").eq("company_id", cid).eq("acquisition_id", acq.id),
      rt.db.from("integration_dependencies").select("from_activity_id, to_activity_id").eq("company_id", cid).eq("acquisition_id", acq.id),
      rt.db.from("integration_synergies").select("*").eq("company_id", cid).eq("acquisition_id", acq.id),
      rt.db.from("crew_members").select("id, full_name, title, user_id, reports_to, email").eq("company_id", cid),
      rt.db.from("actions").select("id, title, status, due_date, owner_id, integration_activity_id, issue_id").eq("company_id", cid).eq("acquisition_id", acq.id),
      rt.db.from("issues").select("id, title, status").eq("company_id", cid).eq("acquisition_id", acq.id),
    ]);
    const synIds = (syn.data ?? []).map((s) => s.id);
    const actuals = synIds.length ? ((await rt.db.from("synergy_actuals").select("synergy_id, period_start, value, kind, verified").eq("company_id", cid).in("synergy_id", synIds)).data ?? []) : [];
    const wsName = new Map((ws.data ?? []).map((w) => [w.id, w.name]));
    return {
      acquisition: acq,
      activities: (acts.data ?? []).map((a) => ({ ...a, status: a.status as ActivityLike["status"], approval_status: a.approval_status as ActivityLike["approval_status"], workstream: wsName.get(a.workstream_id) ?? "" })),
      deps: deps.data ?? [],
      synergies: (syn.data ?? []).map((s) => ({ ...s, baseline: Number(s.baseline), target: Number(s.target) })),
      actuals: actuals.map((x) => ({ ...x, value: Number(x.value), kind: x.kind as "actual" | "forecast" })),
      crew: crew.data ?? [],
      actions: actions.data ?? [],
      issues: issues.data ?? [],
    };
  },
  summarise: (_i, o) => `${o.acquisition.name}: ${o.activities.length} activities, ${o.deps.length} dependencies, ${o.synergies.length} synergies`,
});

export const activateIntegrations = defineTool({
  name: "integration.activate",
  description: "Activate approved plans whose transaction has completed.",
  sideEffect: "internal",
  input: z.object({}),
  run: async (rt) => {
    const { data, error } = await rt.db.rpc("agent_activate_integrations", { p_company: rt.companyId });
    if (error) throw new ToolError(error.message, true);
    return { activated: data as number };
  },
});

export const proposePlaybookChange = defineTool({
  name: "integration.propose_playbook_change",
  description: "Propose an evidence-backed change to the approved master playbook (management decides).",
  sideEffect: "internal",
  input: z.object({ reviewId: z.string().uuid(), playbookId: z.string().uuid(), title: z.string().max(300), what: z.string().max(3000), evidence: z.array(z.unknown()).max(20), change: z.record(z.string(), z.unknown()), benefit: z.string().max(1500), appliesTo: z.string().max(300) }),
  run: async (rt, i: { reviewId: string; playbookId: string; title: string; what: string; evidence: unknown[]; change: Record<string, unknown>; benefit: string; appliesTo: string }) =>
    rt.once(`pbchange:${i.reviewId}:${i.title}`.slice(0, 200), "integration.propose_playbook_change", async () => {
      const { data, error } = await rt.db.rpc("agent_propose_playbook_change", { p_review: i.reviewId, p_playbook: i.playbookId, p_title: i.title, p_what: i.what, p_evidence: i.evidence as never, p_change: i.change as never, p_benefit: i.benefit, p_applies: i.appliesTo });
      if (error) throw new ToolError(error.message, error.code !== "42501");
      return { id: data as string };
    }),
  summarise: (i) => `Proposed: ${i.title}`,
});
