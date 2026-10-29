import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import { assessSynergy, summariseIntegration, synergyTotals, type ActivityLike, type ActualLike, type SynergyLike } from "@/lib/domain/integration";
import { playbookContent, planContent } from "@/lib/integration/schema";

const ACT_COLS = "*";

export type ActivityRow = ActivityLike & {
  acquisition_id: string;
  plan_id: string;
  description: string;
  accountable_function: string;
  evidence_required: string;
  approval_required: string | null;
  human_only: boolean;
  human_only_reason: string | null;
  blocked_reason: string | null;
  evidence_note: string | null;
  origin: string;
  deviation_note: string | null;
  basis: string | null;
  citations: unknown;
  sort: number;
  verified_at: string | null;
};

function toSyn(s: { baseline: unknown; target: unknown } & Record<string, unknown>) {
  return { ...s, baseline: Number(s.baseline), target: Number(s.target) } as unknown as SynergyLike & { owner_crew_id: string | null; evidence_source: string; metric_id: string | null };
}
const toActual = (a: { value: unknown; kind: string } & Record<string, unknown>) => ({ ...a, value: Number(a.value), kind: a.kind as "actual" | "forecast" }) as unknown as ActualLike & { id: string; source: string; note: string | null; created_at: string };

/** Integrations dashboard: every acquisition with meaningful progress and synergy figures. */
export async function loadIntegrationHome(supabase: Supabase, cid: string, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const [acqs, acts, deps, syns, pbs, sources, proposals, crew, cases] = await Promise.all([
    supabase.from("acquisitions").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
    supabase.from("integration_activities").select(ACT_COLS).eq("company_id", cid),
    supabase.from("integration_dependencies").select("acquisition_id, from_activity_id, to_activity_id").eq("company_id", cid),
    supabase.from("integration_synergies").select("*").eq("company_id", cid),
    supabase.from("integration_playbooks").select("id, lineage_id, version, name, status, generator, applies_when, acquisition_types, approved_at, updated_at, created_at").eq("company_id", cid).neq("status", "archived").order("version", { ascending: false }),
    supabase.from("knowledge_sources").select("id, status", { count: "exact" }).eq("company_id", cid).is("acquisition_id", null),
    supabase.from("playbook_change_proposals").select("id, title, status, playbook_id, created_at").eq("company_id", cid).eq("status", "pending"),
    supabase.from("crew_members").select("id, full_name, title, avatar_color, is_open_seat").eq("company_id", cid),
    supabase.from("agent_investigations").select("id, status, trigger").eq("company_id", cid).eq("agent_key", "integration").in("status", ["investigating", "awaiting_response", "awaiting_approval", "monitoring", "escalated"]),
  ]);
  const synIds = (syns.data ?? []).map((s) => s.id);
  const actuals = synIds.length ? ((await supabase.from("synergy_actuals").select("*").eq("company_id", cid).in("synergy_id", synIds)).data ?? []).map(toActual) : [];
  const allActs = (acts.data ?? []) as unknown as ActivityRow[];
  const rows = (acqs.data ?? []).map((a) => {
    const mine = allActs.filter((x) => x.acquisition_id === a.id);
    const d = (deps.data ?? []).filter((x) => x.acquisition_id === a.id);
    const sum = summariseIntegration(mine, d, today);
    const s = (syns.data ?? []).filter((x) => x.acquisition_id === a.id).map(toSyn);
    const byId = new Map(mine.map((x) => [x.id, x as ActivityLike]));
    const assessed = new Map(s.map((x) => [x.id, assessSynergy(x, actuals, byId, today)]));
    const totals = synergyTotals(s, assessed);
    const atRiskWs = [...sum.workstreamHealth.entries()].filter(([, h]) => h === "at_risk" || h === "off_track").length;
    const live = (cases.data ?? []).filter((c) => (c.trigger as { acquisition_id?: string })?.acquisition_id === a.id).length;
    return { a, sum, synergies: s, assessed, totals, atRiskWs, activities: mine.length, agentCases: live };
  });
  // latest version per lineage
  const lineages = new Map<string, NonNullable<typeof pbs.data>[number][]>();
  for (const p of pbs.data ?? []) lineages.set(p.lineage_id, [...(lineages.get(p.lineage_id) ?? []), p]);
  return {
    rows,
    playbooks: [...lineages.values()].map((vs) => ({ latest: vs[0], approved: vs.find((v) => v.status === "approved") ?? null, versions: vs })),
    knowledgeCount: sources.count ?? 0,
    proposals: proposals.data ?? [],
    crew: new Map((crew.data ?? []).map((c) => [c.id, c])),
  };
}

export async function loadPlaybook(supabase: Supabase, cid: string, id: string) {
  const { data: pb } = await supabase.from("integration_playbooks").select("*").eq("company_id", cid).eq("id", id).maybeSingle();
  if (!pb) return null;
  const [versions, sources, proposals, run, approver] = await Promise.all([
    supabase.from("integration_playbooks").select("id, version, status, generator, model, approved_at, approved_by, approval_note, change_summary, created_at, profiles:approved_by(full_name)").eq("company_id", cid).eq("lineage_id", pb.lineage_id).order("version", { ascending: false }),
    pb.source_ids.length ? supabase.from("knowledge_sources").select("id, title, doc_type").eq("company_id", cid).in("id", pb.source_ids) : Promise.resolve({ data: [] as Array<{ id: string; title: string; doc_type: string }> }),
    supabase.from("playbook_change_proposals").select("*").eq("company_id", cid).eq("playbook_id", pb.id).order("created_at", { ascending: false }),
    supabase.from("agent_investigations").select("id, status, summary").eq("company_id", cid).eq("workflow", "integration.generate_playbook").eq("subject_id", pb.id).maybeSingle(),
    pb.approved_by ? supabase.from("profiles").select("full_name").eq("id", pb.approved_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const parsed = playbookContent.safeParse(pb.content);
  return { pb, content: parsed.success ? parsed.data : null, versions: versions.data ?? [], sources: sources.data ?? [], proposals: proposals.data ?? [], run: run.data, approverName: approver.data?.full_name ?? null };
}

export async function loadAcquisition(supabase: Supabase, cid: string, id: string, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const { data: a } = await supabase.from("acquisitions").select("*").eq("company_id", cid).eq("id", id).maybeSingle();
  if (!a) return null;
  const [plans, ws, acts, deps, syns, docs, issues, actions, cases, reviews, playbooks, crew, goals, priorities] = await Promise.all([
    supabase.from("integration_plans").select("*").eq("company_id", cid).eq("acquisition_id", id).order("version", { ascending: false }),
    supabase.from("integration_workstreams").select("*").eq("company_id", cid).eq("acquisition_id", id).order("sort"),
    supabase.from("integration_activities").select(ACT_COLS).eq("company_id", cid).eq("acquisition_id", id).order("sort"),
    supabase.from("integration_dependencies").select("from_activity_id, to_activity_id").eq("company_id", cid).eq("acquisition_id", id),
    supabase.from("integration_synergies").select("*").eq("company_id", cid).eq("acquisition_id", id),
    supabase.from("knowledge_sources").select("id, title, doc_type, status, error, restricted, created_at, char_count").eq("company_id", cid).eq("acquisition_id", id).order("created_at"),
    supabase.from("issues").select("id, title, status, priority, created_at").eq("company_id", cid).eq("acquisition_id", id).order("created_at", { ascending: false }),
    supabase.from("actions").select("id, title, status, due_date, owner_id, integration_activity_id, issue_id").eq("company_id", cid).eq("acquisition_id", id).order("due_date"),
    supabase.from("agent_investigations").select("id, title, status, severity, summary, workflow, updated_at, next_review_at, outcome, trigger").eq("company_id", cid).in("agent_key", ["integration", "ceo"]).filter("trigger->>acquisition_id", "eq", id).order("updated_at", { ascending: false }).limit(60),
    supabase.from("integration_reviews").select("*").eq("company_id", cid).eq("acquisition_id", id).order("created_at", { ascending: false }),
    supabase.from("integration_playbooks").select("id, name, version, applies_when, acquisition_types").eq("company_id", cid).eq("status", "approved"),
    supabase.from("crew_members").select("id, full_name, title, avatar_color, is_open_seat, user_id").eq("company_id", cid).order("sort_order"),
    supabase.from("annual_goals").select("id, title").eq("company_id", cid),
    supabase.from("quarterly_priorities").select("id, title").eq("company_id", cid),
  ]);
  const caseIds = (cases.data ?? []).map((c) => c.id);
  const [events, approvals, messages] = caseIds.length
    ? await Promise.all([
        supabase.from("agent_events").select("*").eq("company_id", cid).in("investigation_id", caseIds).order("id", { ascending: false }).limit(80),
        supabase.from("agent_approvals").select("*").eq("company_id", cid).in("investigation_id", caseIds).order("created_at", { ascending: false }),
        supabase.from("agent_messages").select("id, kind, subject, created_at, responded_at, response_kind, to_crew_id, investigation_id").eq("company_id", cid).in("investigation_id", caseIds).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const synIds = (syns.data ?? []).map((s) => s.id);
  const actuals = synIds.length ? ((await supabase.from("synergy_actuals").select("*").eq("company_id", cid).in("synergy_id", synIds).order("period_start")).data ?? []).map(toActual) : [];
  const activities = (acts.data ?? []) as unknown as ActivityRow[];
  const sum = summariseIntegration(activities, deps.data ?? [], today);
  const byId = new Map(activities.map((x) => [x.id, x as ActivityLike]));
  const synergies = (syns.data ?? []).map(toSyn);
  const assessed = new Map(synergies.map((s) => [s.id, assessSynergy(s, actuals, byId, today)]));
  const draft = (plans.data ?? []).find((p) => p.status === "draft" || p.status === "generating" || p.status === "failed") ?? null;
  const approved = (plans.data ?? []).find((p) => p.status === "approved") ?? null;
  const reviewIds = (reviews.data ?? []).map((r) => r.id);
  const proposals = reviewIds.length ? (await supabase.from("playbook_change_proposals").select("*").eq("company_id", cid).in("review_id", reviewIds)).data ?? [] : [];
  return {
    a,
    today,
    plans: plans.data ?? [],
    draft,
    draftContent: draft ? planContent.safeParse(draft.content).data ?? null : null,
    approved,
    approvedContent: approved ? planContent.safeParse(approved.content).data ?? null : null,
    workstreams: ws.data ?? [],
    activities,
    deps: deps.data ?? [],
    synergies,
    actuals,
    assessed,
    totals: synergyTotals(synergies, assessed),
    sum,
    docs: docs.data ?? [],
    issues: issues.data ?? [],
    actions: actions.data ?? [],
    cases: cases.data ?? [],
    events: events.data ?? [],
    approvals: approvals.data ?? [],
    messages: messages.data ?? [],
    reviews: reviews.data ?? [],
    proposals,
    playbooks: playbooks.data ?? [],
    crew: crew.data ?? [],
    crewById: new Map((crew.data ?? []).map((c) => [c.id, c])),
    goals: goals.data ?? [],
    priorities: priorities.data ?? [],
  };
}
export type AcquisitionBundle = NonNullable<Awaited<ReturnType<typeof loadAcquisition>>>;
