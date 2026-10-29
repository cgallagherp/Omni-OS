/**
 * M&A Integration Agent — the full vertical workflow on real data, real worker ticks and
 * real user sessions (RLS): connect knowledge → generate the master playbook → review and
 * approve → create an acquisition → generate and approve the tailored plan → the agent
 * detects a dependency threatening the CRM migration → follows up → records the response →
 * escalates into Mission Control for approval → tracks the agreed actions → measures the
 * synergy → proposes playbook improvements that publish only after approval.
 * Plus tenant isolation, authority, duplicate prevention and recovery after interruption.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, as, companyId, type Client } from "./helpers";
import { tick } from "@/lib/agents/engine";
import { agentClient } from "@/lib/agents/principal";
import { ingestDocument } from "@/lib/integration/ingest";
import { applyChange, changeOp } from "@/lib/integration/learning";
import { planContent, playbookContent, type PlanContent, type PlaybookContent } from "@/lib/integration/schema";
import { quoteSupported } from "@/lib/integration/grounding";
import { recommendPlaybook } from "@/lib/domain/integration";

process.env.SUPABASE_JWT_SECRET ??= "super-secret-jwt-token-with-at-least-32-characters-long";

let clinara: string;
let kestrel: string;
let daniel: Client; // CEO (approver)
let marcus: Client; // CRO, executive
let rachel: Client; // CFO, integration leader
let sarah: Client; // Kestrel CEO
let helen: Client; // Clinara observer
let playbookId: string;
let acqId: string;
let planId: string;
const run = (now?: Date) => tick({ admin, workerId: "integration-test", companies: [clinara], now, maxRuns: 50 });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => iso(new Date(Date.now() + n * 86400000));

async function crew(email: string) {
  return (await admin.from("crew_members").select("id").eq("company_id", clinara).eq("email", email).single()).data!.id;
}
async function queue(c: Client, workflow: string, subjectType: string, subjectId: string, trigger: Record<string, unknown> = {}) {
  const { data: inv, error } = await c.from("agent_investigations").insert({ company_id: clinara, agent_key: "integration", workflow, title: workflow, dedupe_key: `${workflow}:${subjectId}`, subject_type: subjectType, subject_id: subjectId, trigger: { type: "manual", summary: "test", ...trigger } as never }).select("id").single();
  expect(error).toBeNull();
  expect((await c.from("agent_runs").insert({ company_id: clinara, investigation_id: inv!.id, agent_key: "integration", workflow })).error).toBeNull();
  return inv!.id;
}
async function due(invId: string) {
  await admin.from("agent_runs").update({ run_after: new Date(Date.now() - 1000).toISOString() }).eq("investigation_id", invId).in("status", ["waiting", "queued"]);
}
async function activity(title: RegExp) {
  const { data } = await admin.from("integration_activities").select("*").eq("acquisition_id", acqId);
  const a = data!.find((x) => title.test(x.title));
  if (!a) throw new Error(`no activity ${title}: ${data!.map((x) => x.title).join("; ")}`);
  return a;
}

beforeAll(async () => {
  clinara = await companyId("clinara");
  kestrel = await companyId("kestrel");
  [daniel, marcus, rachel, sarah, helen] = await Promise.all(["daniel@clinara.demo", "marcus@clinara.demo", "rachel@clinara.demo", "sarah@kestrel.demo", "helen@clinara.demo"].map(as));
  // deterministic follow-up timing for tests: any hour, no cooldown carry-over between runs
  const { data: cfg } = await admin.from("agent_configs").select("escalation").eq("company_id", clinara).eq("agent_key", "integration").single();
  await admin.from("agent_configs").update({ escalation: { ...(cfg!.escalation as object), working_hours: { start: 0, end: 24, weekdays_only: false } } }).eq("company_id", clinara).eq("agent_key", "integration");
});

describe("1. Connect knowledge", () => {
  it("holds the company's own integration documents, indexed for retrieval", async () => {
    const { data } = await daniel.from("knowledge_sources").select("id, title, doc_type, status").eq("company_id", clinara);
    expect(data!.length).toBe(7);
    expect(data!.every((s) => s.status === "ready")).toBe(true);
    const { count } = await daniel.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("company_id", clinara);
    expect(count).toBeGreaterThan(20);
  });

  it("accepts uploads, records unsupported files visibly and never duplicates a document", async () => {
    const bytes = new Uint8Array(readFileSync("scripts/seed/integration-docs/lessons-learned-optibook-carenotes.md"));
    const dup = await ingestDocument(daniel, { companyId: clinara, title: "Again", filename: "lessons.md", mime: "text/markdown", bytes, docType: "lessons_learned", origin: "upload" });
    expect(dup.duplicate).toBe(true);
    const bad = await ingestDocument(daniel, { companyId: clinara, title: "Old deck", filename: "old.ppt", mime: null, bytes: new Uint8Array([1, 2, 3]), docType: "other", origin: "upload" });
    expect(bad.status).toBe("unsupported");
    await admin.from("knowledge_sources").delete().eq("id", bad.id);
  });

  it("keeps knowledge inside the company: other tenants, observers and restricted documents", async () => {
    expect((await sarah.from("knowledge_sources").select("id").eq("company_id", clinara)).data).toEqual([]);
    expect((await sarah.from("knowledge_chunks").select("id").eq("company_id", clinara)).data).toEqual([]);
    expect((await helen.from("knowledge_sources").select("id").eq("company_id", clinara)).data).toEqual([]);
    const conf = await ingestDocument(daniel, { companyId: clinara, title: "SPA disclosure letter", filename: "disclosure.md", mime: "text/markdown", bytes: new TextEncoder().encode("# Disclosure letter\nConfidential transaction terms for the acquisition, including warranties and the earn-out."), docType: "contract", origin: "upload", restricted: true });
    expect((await marcus.from("knowledge_sources").select("id").eq("id", conf.id)).data).toEqual([]);
    expect((await marcus.from("knowledge_chunks").select("id").eq("source_id", conf.id)).data).toEqual([]);
    expect((await daniel.from("knowledge_sources").select("id").eq("id", conf.id)).data).toHaveLength(1);
    // executives cannot add confidential material
    const denied = await marcus.from("knowledge_sources").insert({ company_id: clinara, title: "x", doc_type: "contract", restricted: true });
    expect(denied.error).not.toBeNull();
    await admin.from("knowledge_sources").delete().eq("id", conf.id);
  });
});

describe("2–3. Generate, review and approve the master playbook", () => {
  it("the agent analyses the selected documents and drafts a structured, source-cited playbook", async () => {
    const { data: srcs } = await daniel.from("knowledge_sources").select("id").eq("company_id", clinara);
    playbookId = crypto.randomUUID();
    expect((await daniel.from("integration_playbooks").insert({ id: playbookId, company_id: clinara, lineage_id: playbookId, name: "Clinara full integration playbook", status: "generating", source_ids: srcs!.map((s) => s.id), content: { workstreams: [] } })).error).toBeNull();
    const inv = await queue(daniel, "integration.generate_playbook", "playbook", playbookId);
    const r = await run();
    expect(r.errors).toEqual([]);
    const { data: pb } = await daniel.from("integration_playbooks").select("*").eq("id", playbookId).single();
    expect(pb!.status).toBe("draft");
    const c = playbookContent.parse(pb!.content);
    expect(c.workstreams.length).toBeGreaterThanOrEqual(5);
    expect(c.workstreams.map((w) => w.name)).toEqual(expect.arrayContaining(["Finance", "Commercial", "Technology"]));
    const acts = c.workstreams.flatMap((w) => w.activities);
    expect(acts.length).toBeGreaterThan(15);
    expect((await admin.from("agent_investigations").select("status").eq("id", inv).single()).data!.status).toBe("resolved");
  });

  it("every established or inferred requirement traces to a passage that really says it", async () => {
    const { data: pb } = await daniel.from("integration_playbooks").select("content").eq("id", playbookId).single();
    const c = playbookContent.parse(pb!.content);
    const items = [...c.workstreams.flatMap((w) => w.activities), ...c.philosophy, ...c.risks, ...c.kpis];
    const grounded = items.filter((x) => x.basis !== "recommended");
    expect(grounded.length).toBeGreaterThan(15);
    const chunkIds = [...new Set(grounded.flatMap((x) => x.citations.map((ci) => ci.chunk_id!)))];
    const { data: chunks } = await daniel.from("knowledge_chunks").select("id, text").in("id", chunkIds);
    const text = new Map(chunks!.map((ch) => [ch.id, ch.text]));
    for (const x of grounded) {
      expect(x.citations.length).toBeGreaterThan(0);
      for (const ci of x.citations) expect(quoteSupported(ci.quote, text.get(ci.chunk_id!)!)).toBe(true);
    }
    // recommendations are clearly separated and wait for a decision
    const recs = c.workstreams.flatMap((w) => w.activities).filter((a) => a.basis === "recommended");
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((a) => a.decision === "pending")).toBe(true);
  });

  it("flags conflicting sources and gaps instead of silently choosing", async () => {
    const c = playbookContent.parse((await daniel.from("integration_playbooks").select("content").eq("id", playbookId).single()).data!.content);
    expect(c.conflicts.length).toBeGreaterThan(0);
    expect(c.conflicts.some((x) => /announcement|data cleansing/i.test(x.topic))).toBe(true);
    for (const x of c.conflicts) expect(x.positions.length).toBeGreaterThanOrEqual(2);
    expect(c.gaps.length).toBeGreaterThan(0);
    expect(c.lessons.length).toBeGreaterThan(3);
  });

  it("cannot be approved with unresolved conflicts or undecided suggestions, nor by an executive", async () => {
    const first = await daniel.rpc("approve_playbook", { p_playbook: playbookId });
    expect(first.error?.message).toMatch(/conflict/i);
    const exec = await marcus.rpc("approve_playbook", { p_playbook: playbookId });
    expect(exec.error?.code).toBe("42501");
  });

  it("management edits the draft, resolves conflicts, decides suggestions and approves it", async () => {
    const { data: pb } = await daniel.from("integration_playbooks").select("content, updated_at").eq("id", playbookId).single();
    const c: PlaybookContent = playbookContent.parse(pb!.content);
    // keep current practice for the data work (the agent will learn otherwise later)
    for (const x of c.conflicts) x.resolution = /data cleansing/i.test(x.topic) ? "Keep it in the first 30 days for now." : "Announce on Day 1 unless customers are on annual contracts.";
    for (const w of c.workstreams) for (const a of w.activities) if (a.basis === "recommended") a.decision = /post-integration review|baseline/i.test(a.title) ? "accepted" : "rejected";
    const comm = c.workstreams.find((w) => w.name === "Commercial")!;
    comm.activities.find((a) => /account owners/i.test(a.title))!.completion_criteria = "Every active customer has a named account owner in the CRM.";
    const saved = await daniel.from("integration_playbooks").update({ content: playbookContent.parse(c) as never, acquisition_types: ["Full integration"], applies_when: "Specialist clinic software migrated onto the Clinara platform." }).eq("id", playbookId).select("id");
    expect(saved.error).toBeNull();
    expect((await daniel.rpc("approve_playbook", { p_playbook: playbookId, p_note: "Approved at ELT" })).error).toBeNull();
    const { data } = await daniel.from("integration_playbooks").select("status, approved_by, version").eq("id", playbookId).single();
    expect(data!.status).toBe("approved");
    expect(data!.approved_by).not.toBeNull();
  });

  it("an approved version is frozen (version history is preserved)", async () => {
    const tamper = await daniel.from("integration_playbooks").update({ content: { workstreams: [] } }).eq("id", playbookId).select();
    expect(tamper.error).not.toBeNull();
    const { data: audit } = await admin.from("audit_log").select("action").eq("entity_id", playbookId);
    expect(audit!.length).toBeGreaterThan(1);
  });

  it("supports a second, different playbook and recommends the right one for an acquisition", async () => {
    const p2 = crypto.randomUUID();
    const base = playbookContent.parse((await daniel.from("integration_playbooks").select("content").eq("id", playbookId).single()).data!.content);
    const partial = { ...base, workstreams: base.workstreams.filter((w) => ["Finance", "People", "Strategy and governance"].includes(w.name)) };
    await daniel.from("integration_playbooks").insert({ id: p2, company_id: clinara, lineage_id: p2, name: "Partial integration playbook", status: "draft", acquisition_types: ["Partial integration"], applies_when: "Capability acquisitions that keep their brand and product.", content: partial as never, generator: "manual" });
    expect((await daniel.rpc("approve_playbook", { p_playbook: p2 })).error).toBeNull();
    const { data: pbs } = await daniel.from("integration_playbooks").select("id, name, applies_when, acquisition_types").eq("company_id", clinara).eq("status", "approved");
    expect(pbs!.length).toBe(2);
    expect(recommendPlaybook(pbs!, { rationale: "Veterinary practice software", operating_model: "Full integration onto the Clinara platform", integration_model: "Full integration", objectives: "" })!.p.id).toBe(playbookId);
    expect(recommendPlaybook(pbs!, { rationale: "Capability", operating_model: "Keep the product and brand", integration_model: "Partial integration", objectives: "" })!.p.id).toBe(p2);
  });
});

describe("4–5. Create the acquisition and approve its tailored plan", () => {
  it("adapts the playbook to the acquisition and explains every deviation", async () => {
    const completion = plus(-52); // the CRM migration (day 60) is due in 8 days
    const { data: a, error } = await daniel.from("acquisitions").insert({
      company_id: clinara, name: "Vetora", completion_date: completion, integration_model: "Full integration",
      rationale: "Veterinary practice-management software: 1,400 clinics, adjacent vertical in the buy-and-build strategy.",
      objectives: "Migrate Vetora customers onto Clinara Pay and cross-sell Engage within 18 months.",
      operating_model: "Retain the Vetora brand for 12 months; integrate finance, CRM and sales onto Clinara.",
      expected_synergies: "£1m annual cross-selling revenue by month 18",
      key_risks: "Key engineers may leave after the earn-out",
      diligence_findings: "Weak cybersecurity: no MFA on administrator accounts. Customer data quality is poor: many duplicate clinic records in the CRM.",
      commitments: "Earn-out payable on ARR at month 12.",
      systems_info: "Salesforce CRM, Xero, AWS hosting.",
      sponsor_crew_id: await crew("daniel@clinara.demo"), leader_crew_id: await crew("rachel@clinara.demo"),
    }).select("id").single();
    expect(error).toBeNull();
    acqId = a!.id;
    planId = crypto.randomUUID();
    await daniel.from("integration_plans").insert({ id: planId, company_id: clinara, acquisition_id: acqId, playbook_id: playbookId, status: "generating", content: { workstreams: [] } });
    await queue(daniel, "integration.generate_plan", "plan", planId, { acquisition_id: acqId });
    expect((await run()).errors).toEqual([]);
    const { data: plan } = await daniel.from("integration_plans").select("status, content").eq("id", planId).single();
    expect(plan!.status).toBe("draft");
    const c = planContent.parse(plan!.content);
    const acts = c.workstreams.flatMap((w) => w.activities);
    // brand retained → no brand migration, with the reason
    expect(acts.some((x) => /retire .*brand/i.test(x.title))).toBe(false);
    // diligence → cybersecurity remediation, acquisition-specific and critical
    const cyber = acts.find((x) => /cybersecurity/i.test(x.title))!;
    expect(cyber.origin).toBe("acquisition");
    expect(cyber.critical).toBe(true);
    expect(cyber.deviation_note).toMatch(/MFA/);
    // synergy target from the stated expectation, linked to the commercial work
    expect(c.synergies[0]).toMatchObject({ category: "cross_sell", target: 1_000_000 });
    expect(c.synergies[0].supporting_activity_keys.length).toBeGreaterThan(0);
    // data migration is done by people, never the agent
    expect(acts.find((x) => /migrate customer records/i.test(x.title))!.human_only).toBe(true);
    expect(c.deviations.length).toBeGreaterThan(2);
    expect(c.deviations.every((d) => d.reason.length > 10)).toBe(true);
    expect((await daniel.from("acquisitions").select("status").eq("id", acqId).single()).data!.status).toBe("plan_in_review");
  });

  it("is approved by management, then materialised into execution records", async () => {
    const { data: plan } = await daniel.from("integration_plans").select("content").eq("id", planId).single();
    const c: PlanContent = planContent.parse(plan!.content);
    if (c.workstreams.some((w) => w.activities.some((a) => a.origin === "recommended" && a.decision === "pending"))) {
      expect((await daniel.rpc("approve_integration_plan", { p_plan: planId })).error?.message).toMatch(/suggested/);
    }
    for (const w of c.workstreams) for (const a of w.activities) if (a.origin === "recommended") a.decision = "rejected";
    expect((await daniel.from("integration_plans").update({ content: planContent.parse(c) as never }).eq("id", planId)).error).toBeNull();
    expect((await marcus.rpc("approve_integration_plan", { p_plan: planId })).error?.code).toBe("42501");
    expect((await daniel.rpc("approve_integration_plan", { p_plan: planId, p_note: "Approved" })).error).toBeNull();
    const { data: acq } = await daniel.from("acquisitions").select("status").eq("id", acqId).single();
    expect(acq!.status).toBe("active");
    const crm = await activity(/migrate customer records/i);
    expect(crm.due_date).toBe(plus(8));
    expect(crm.baseline_due_date).toBe(crm.due_date);
    const { count } = await daniel.from("integration_dependencies").select("id", { count: "exact", head: true }).eq("acquisition_id", acqId);
    expect(count).toBeGreaterThan(0);
    const { data: syn } = await daniel.from("integration_synergies").select("target, supporting_activity_ids").eq("acquisition_id", acqId);
    expect(Number(syn![0].target)).toBe(1_000_000);
    // an approved plan is executed through its records, not edited as a draft
    expect((await daniel.from("integration_plans").update({ content: { workstreams: [] } }).eq("id", planId).select()).error).not.toBeNull();
  });
});

describe("6–12. The agent drives execution", () => {
  let caseId: string;
  let cleansing: { id: string; due_date: string | null };

  it("detects that the CRM migration depends on unfinished data cleansing and follows up the owner", async () => {
    // the plan's other overdue work is already in hand, so the test watches one thread
    const crm = await activity(/migrate customer records/i);
    const { data: prereqs } = await admin.from("integration_dependencies").select("from_activity_id").eq("to_activity_id", crm.id);
    const cleanId = prereqs!.map((p) => p.from_activity_id)[0];
    await admin.from("integration_activities").update({ status: "done", completed_at: new Date().toISOString(), criteria_met: true }).eq("acquisition_id", acqId).lt("due_date", iso(new Date())).neq("id", cleanId);
    await admin.from("integration_activities").update({ status: "in_progress", owner_crew_id: await crew("marcus@clinara.demo") }).eq("id", cleanId);
    const r = await run();
    expect(r.errors).toEqual([]);
    const { data: inv } = await admin.from("agent_investigations").select("*").eq("company_id", clinara).eq("workflow", "integration.activity_watch").eq("subject_id", cleanId).single();
    caseId = inv!.id;
    cleansing = (await admin.from("integration_activities").select("id, due_date, title").eq("id", cleanId).single()).data!;
    expect(inv!.trigger).toMatchObject({ kind: "dependency", dependent_id: crm.id });
    const f = inv!.findings as Array<{ kind: string; text: string }>;
    expect(f.some((x) => x.kind === "confirmed" && /depends on/.test(x.text))).toBe(true);
    expect(f.some((x) => x.kind === "hypothesis" && /synergy/i.test(x.text))).toBe(true);
    const { data: msgs } = await admin.from("agent_messages").select("*").eq("investigation_id", caseId);
    expect(msgs).toHaveLength(1);
    expect(msgs![0].to_user_id).toBe((await marcus.auth.getUser()).data.user!.id);
    expect(msgs![0].context).toMatchObject({ acquisition_id: acqId, integration_activity_id: cleanId });
    expect(inv!.status).toBe("awaiting_response");
  });

  it("does not duplicate: another tick opens no second case and sends nothing new", async () => {
    await run();
    const { count: cases } = await admin.from("agent_investigations").select("id", { count: "exact", head: true }).eq("subject_id", cleansing.id).in("status", ["investigating", "awaiting_response", "awaiting_approval", "monitoring", "escalated"]);
    const { count: msgs } = await admin.from("agent_messages").select("id", { count: "exact", head: true }).eq("investigation_id", caseId);
    expect(cases).toBe(1);
    expect(msgs).toBe(1);
  });

  it("records the owner's revised date, sees the impact and escalates for approval — changing nothing itself", async () => {
    const { data: msg } = await marcus.from("agent_messages").select("id").eq("investigation_id", caseId).single();
    expect((await marcus.from("agent_messages").update({ response_kind: "new_date", response_date: plus(14), response_text: "Duplicate clinic records are taking longer than planned", responded_at: new Date().toISOString() }).eq("id", msg!.id)).error).toBeNull();
    await run();
    const { data: aps } = await admin.from("agent_approvals").select("*").eq("investigation_id", caseId).order("created_at");
    expect(aps!.map((x) => x.action_type).sort()).toEqual(["change_integration_activity", "create_corrective_action"]);
    expect(aps!.every((x) => x.status === "pending")).toBe(true);
    const esc = aps!.find((x) => x.action_type === "create_corrective_action")!;
    expect((esc.payload as { acquisition_id: string }).acquisition_id).toBe(acqId);
    expect(((esc.payload as { actions: unknown[] }).actions).length).toBeGreaterThan(1);
    // nothing has changed yet
    expect((await admin.from("integration_activities").select("due_date").eq("id", cleansing.id).single()).data!.due_date).toBe(cleansing.due_date);
    expect((await admin.from("issues").select("id").eq("acquisition_id", acqId)).data).toEqual([]);
    const f = (await admin.from("agent_investigations").select("findings").eq("id", caseId).single()).data!.findings as Array<{ text: string }>;
    expect(f.some((x) => /would push/.test(x.text))).toBe(true);
  });

  it("the agent cannot change commitments or apply an unapproved proposal", async () => {
    const { data: m } = await admin.from("company_memberships").select("user_id").eq("company_id", clinara).eq("role", "agent").single();
    const agent = agentClient(m!.user_id);
    const change = await agent.from("integration_activities").update({ due_date: plus(30) }).eq("id", cleansing.id).select();
    expect(change.error?.code).toBe("42501");
    const done = await agent.from("integration_activities").update({ status: "done" }).eq("id", cleansing.id).select();
    expect(done.error?.code).toBe("42501");
    const { data: ap } = await admin.from("agent_approvals").select("id").eq("investigation_id", caseId).eq("action_type", "create_corrective_action").single();
    expect((await agent.rpc("agent_apply_approval", { p_approval: ap!.id })).error?.code).toBe("42501");
    expect((await agent.rpc("approve_playbook", { p_playbook: playbookId })).error).not.toBeNull();
    // an executive is not the approver
    const denied = await marcus.from("agent_approvals").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", ap!.id).select();
    expect(denied.error !== null || (denied.data ?? []).length === 0).toBe(true);
  });

  it("after the CEO approves, applies both, escalating into Mission Control with linked corrective actions", async () => {
    const me = (await daniel.auth.getUser()).data.user!.id;
    const { data: aps } = await admin.from("agent_approvals").select("id").eq("investigation_id", caseId);
    for (const a of aps!) expect((await daniel.from("agent_approvals").update({ status: "approved", decided_by: me, decided_at: new Date().toISOString() }).eq("id", a.id)).error).toBeNull();
    await run();
    await run();
    expect((await admin.from("integration_activities").select("due_date, baseline_due_date").eq("id", cleansing.id).single()).data).toMatchObject({ due_date: plus(14), baseline_due_date: cleansing.due_date });
    const { data: issues } = await daniel.from("issues").select("id, title, acquisition_id").eq("acquisition_id", acqId);
    expect(issues).toHaveLength(1);
    const { data: actions } = await daniel.from("actions").select("id, acquisition_id, integration_activity_id, status").eq("acquisition_id", acqId);
    expect(actions!.length).toBeGreaterThan(1);
    expect(actions!.every((x) => x.integration_activity_id)).toBe(true);
    expect((await admin.from("agent_approvals").select("status").eq("investigation_id", caseId)).data!.every((x) => x.status === "executed")).toBe(true);
    expect(["escalated", "monitoring"]).toContain((await admin.from("agent_investigations").select("status").eq("id", caseId).single()).data!.status);
  });

  it("shares action records with the Execution Agent without competing reminders", async () => {
    const { data: actions } = await admin.from("actions").select("id").eq("acquisition_id", acqId);
    await admin.from("actions").update({ due_date: plus(-2) }).eq("id", actions![0].id);
    await run();
    const { data: exec } = await admin.from("agent_investigations").select("id").eq("agent_key", "execution").eq("subject_id", actions![0].id);
    expect(exec).toEqual([]);
    await admin.from("actions").update({ due_date: plus(5) }).eq("id", actions![0].id);
  });

  it("done is not complete: it asks the leader to verify the completion criteria, then resolves when the agreed actions are done", async () => {
    await marcus.from("integration_activities").update({ status: "done" }).eq("id", cleansing.id);
    await due(caseId);
    await run();
    const { data: verify } = await admin.from("agent_messages").select("to_user_id, context").eq("investigation_id", caseId).eq("to_user_id", (await rachel.auth.getUser()).data.user!.id);
    expect(verify!.length).toBe(1);
    expect(verify![0].context).toMatchObject({ trigger: "evidence" });
    await rachel.from("integration_activities").update({ criteria_met: true }).eq("id", cleansing.id);
    await daniel.from("actions").update({ status: "done" }).eq("acquisition_id", acqId);
    await due(caseId);
    await run();
    const { data: inv } = await admin.from("agent_investigations").select("status, outcome").eq("id", caseId).single();
    expect(inv!.status).toBe("resolved");
    expect(inv!.outcome).toMatchObject({ resolved: true, criteria_met: true, escalated: true });
  });

  it("identifies when completed work has not produced the expected synergy, and proposes an intervention", async () => {
    const { data: syn } = await admin.from("integration_synergies").select("id, supporting_activity_ids, start_date").eq("acquisition_id", acqId).single();
    await admin.from("integration_activities").update({ status: "done", criteria_met: true, completed_at: new Date().toISOString() }).in("id", syn!.supporting_activity_ids);
    // five months in, only £30k of run-rate cross-sell revenue, verified
    await admin.from("integration_synergies").update({ start_date: plus(-150), expected_realisation_date: plus(390) }).eq("id", syn!.id);
    expect((await daniel.from("synergy_actuals").insert({ company_id: clinara, synergy_id: syn!.id, period_start: iso(new Date()).slice(0, 8) + "01", value: 30000, kind: "actual", verified: true, source: "Invoiced cross-sell revenue (billing)" })).error).toBeNull();
    await daniel.from("synergy_actuals").insert({ company_id: clinara, synergy_id: syn!.id, period_start: plus(30).slice(0, 8) + "01", value: 400000, kind: "forecast", source: "Sales forecast" });
    await run();
    const { data: inv } = await admin.from("agent_investigations").select("*").eq("subject_id", syn!.id).single();
    const f = inv!.findings as Array<{ kind: string; text: string }>;
    expect(f.some((x) => /All \d+ activities intended to deliver it are complete/.test(x.text))).toBe(true);
    expect(f.some((x) => /forecasts are not counted as realised/i.test(x.text))).toBe(true);
    await due(inv!.id);
    await run();
    // the Commercial Agent's case is still open: after two days the agent proceeds with what it has
    await due(inv!.id);
    await run(new Date(Date.now() + 3 * 86400000));
    const { data: ap } = await admin.from("agent_approvals").select("action_type, status, payload").eq("investigation_id", inv!.id);
    expect(ap!.some((x) => x.action_type === "create_corrective_action" && x.status === "pending")).toBe(true);
  });

  it("can be paused for one integration", async () => {
    await daniel.from("acquisitions").update({ agent_paused: true }).eq("id", acqId);
    await admin.from("integration_activities").update({ status: "in_progress", criteria_met: null, completed_at: null, due_date: plus(-3) }).eq("id", (await activity(/cybersecurity/i)).id);
    await run();
    const { data } = await admin.from("agent_investigations").select("id").eq("workflow", "integration.activity_watch").eq("subject_id", (await activity(/cybersecurity/i)).id);
    expect(data).toEqual([]);
    await daniel.from("acquisitions").update({ agent_paused: false }).eq("id", acqId);
  });
});

describe("13. Learn and improve", () => {
  it("reviews the integration and proposes evidence-backed playbook changes, publishing nothing", async () => {
    const reviewId = crypto.randomUUID();
    expect((await daniel.from("integration_reviews").insert({ id: reviewId, company_id: clinara, acquisition_id: acqId, status: "generating" })).error).toBeNull();
    await queue(daniel, "integration.review", "review", reviewId, { acquisition_id: acqId });
    expect((await run()).errors).toEqual([]);
    const { data: rev } = await daniel.from("integration_reviews").select("status, content").eq("id", reviewId).single();
    expect(rev!.status).toBe("ready");
    const c = rev!.content as { delays: unknown[]; patterns: Array<{ occurrences: number }>; proposals: unknown[] };
    expect(c.delays.length).toBeGreaterThan(0);
    expect(c.patterns.some((p) => p.occurrences >= 3)).toBe(true);
    const { data: props } = await daniel.from("playbook_change_proposals").select("*").eq("review_id", reviewId);
    const move = props!.find((p) => /before completion/i.test(p.title))!;
    expect(move).toBeTruthy();
    expect((move.evidence as unknown[]).length).toBeGreaterThan(1);
    expect(move.status).toBe("pending");
    // nothing published
    expect((await daniel.from("integration_playbooks").select("id").eq("lineage_id", playbookId)).data).toHaveLength(1);
  });

  it("an accepted change becomes a new draft version; publishing needs approval and active plans are untouched", async () => {
    const { data: prop } = await daniel.from("playbook_change_proposals").select("*").eq("playbook_id", playbookId).ilike("title", "%before completion%").single();
    const { data: v1 } = await daniel.from("integration_playbooks").select("*").eq("id", playbookId).single();
    const next = applyChange(playbookContent.parse(v1!.content), changeOp.parse(prop!.change));
    const v2 = crypto.randomUUID();
    expect((await daniel.from("integration_playbooks").insert({ id: v2, company_id: clinara, lineage_id: v1!.lineage_id, version: 2, name: v1!.name, status: "draft", content: next as never, based_on_id: v1!.id, generator: "revision" })).error).toBeNull();
    const before = (await daniel.from("integration_activities").select("id, due_date").eq("acquisition_id", acqId)).data!;
    expect((await daniel.rpc("approve_playbook", { p_playbook: v2 })).error).toBeNull();
    expect((await daniel.from("integration_playbooks").select("status").eq("id", playbookId).single()).data!.status).toBe("superseded");
    const moved = playbookContent.parse((await daniel.from("integration_playbooks").select("content").eq("id", v2).single()).data!.content).workstreams.flatMap((w) => w.activities).find((a) => a.key === (changeOp.parse(prop!.change) as { activity_key: string }).activity_key)!;
    expect(moved.timing.anchor).toBe("pre_completion");
    expect((await daniel.from("integration_activities").select("id, due_date").eq("acquisition_id", acqId)).data).toEqual(before);
  });
});

describe("isolation and resilience", () => {
  it("another company cannot see or touch Clinara's playbooks, acquisitions or plans", async () => {
    for (const t of ["integration_playbooks", "acquisitions", "integration_plans", "integration_activities", "integration_synergies", "playbook_change_proposals"] as const)
      expect((await sarah.from(t).select("id").eq("company_id", clinara)).data).toEqual([]);
    const { data: m } = await admin.from("company_memberships").select("user_id").eq("company_id", kestrel).eq("role", "agent").single();
    const kAgent = agentClient(m!.user_id);
    expect((await kAgent.from("knowledge_chunks").select("id").eq("company_id", clinara)).data).toEqual([]);
    expect((await kAgent.rpc("agent_save_draft", { p_kind: "playbook", p_id: playbookId, p_content: {}, p_meta: {} })).error).not.toBeNull();
    expect((await sarah.from("acquisitions").update({ agent_paused: true }).eq("id", acqId).select()).data ?? []).toEqual([]);
  });

  it("recovers from a crash after a follow-up is sent, without sending it twice", async () => {
    const pen = await activity(/cybersecurity/i);
    await admin.from("agent_investigations").update({ status: "closed" }).eq("subject_id", pen.id);
    await admin.from("agent_runs").update({ status: "cancelled" }).in("investigation_id", (await admin.from("agent_investigations").select("id").eq("subject_id", pen.id)).data!.map((x) => x.id));
    const inv = await queue(daniel, "integration.activity_watch", "integration_activity", pen.id, { kind: "overdue", acquisition_id: acqId });
    process.env.AGENT_FAULT_AFTER_SIDE_EFFECT = `inbox.send_message@msg:${inv}`;
    // the owner was contacted about this activity two days ago: the cooldown holds the follow-up, so step past it
    const later = new Date(Date.now() + 2.5 * 86400000);
    for (let i = 0; i < 5 && process.env.AGENT_FAULT_AFTER_SIDE_EFFECT; i++) {
      await run(later);
      await due(inv);
    }
    expect(process.env.AGENT_FAULT_AFTER_SIDE_EFFECT).toBe(""); // the crash happened
    const { count: first } = await admin.from("agent_messages").select("id", { count: "exact", head: true }).eq("investigation_id", inv);
    expect(first).toBe(1);
    await due(inv);
    await run(later);
    const { count: after } = await admin.from("agent_messages").select("id", { count: "exact", head: true }).eq("investigation_id", inv);
    expect(after).toBe(1);
    const { data: ev } = await admin.from("agent_events").select("summary").eq("investigation_id", inv).ilike("summary", "Recovered after interruption%");
    expect(ev!.length).toBe(1);
    expect((await admin.from("agent_investigations").select("status").eq("id", inv).single()).data!.status).toBe("awaiting_response");
  });

});
