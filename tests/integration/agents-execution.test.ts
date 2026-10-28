/**
 * Execution Agent acceptance: real data, real worker ticks, real user sessions.
 * Overdue action → detected autonomously → context and dependencies → follow-up
 * through the Omni OS inbox (within authority) → owner replies → revised date
 * proposed → only the configured approver can approve → applied after re-checking
 * → monitored until done. Plus approval gating, tenant isolation, authority caps,
 * and crash recovery without repeated side effects.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { admin, as, companyId, type Client } from "./helpers";
import { tick } from "@/lib/agents/engine";
import { agentClient } from "@/lib/agents/principal";

process.env.SUPABASE_JWT_SECRET ??= "super-secret-jwt-token-with-at-least-32-characters-long";

let clinara: string;
let kestrel: string;
let pciAction: string;
let investigation: string;
let daniel: Client; // Clinara CEO
let marcus: Client; // Clinara executive
let aisha: Client; // owner of the PCI action

const run = (companies: string[], workerId = "test-worker") => tick({ admin, workerId, companies });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => iso(new Date(Date.now() + n * 86400000));

async function invFor(actionId: string) {
  const { data } = await admin.from("agent_investigations").select("*").eq("subject_id", actionId).order("opened_at", { ascending: false }).limit(1).single();
  return data!;
}
async function runFor(invId: string) {
  return (await admin.from("agent_runs").select("*").eq("investigation_id", invId).single()).data!;
}
/** Make a waiting run due now (instead of waiting days in real time). */
async function due(invId: string) {
  await admin.from("agent_runs").update({ run_after: new Date(Date.now() - 1000).toISOString() }).eq("investigation_id", invId).in("status", ["waiting", "queued"]);
}

beforeAll(async () => {
  clinara = await companyId("clinara");
  kestrel = await companyId("kestrel");
  [daniel, marcus, aisha] = await Promise.all([as("daniel@clinara.demo"), as("marcus@clinara.demo"), as("aisha@clinara.demo")]);
  pciAction = (await admin.from("actions").select("id").eq("company_id", clinara).ilike("title", "Submit PCI remediation evidence%").single()).data!.id;
});

describe("Execution Agent — overdue action follow-through", () => {
  it("detects the overdue action by itself and follows up through the authorised internal channel", async () => {
    const r = await run([clinara]);
    expect(r.errors).toEqual([]);
    expect(r.opened).toBeGreaterThan(0);
    const inv = await invFor(pciAction);
    investigation = inv.id;
    expect(inv.agent_key).toBe("execution");
    expect(inv.status).toBe("awaiting_response");
    expect(inv.trigger).toMatchObject({ type: "event" });
    const findings = inv.findings as Array<{ kind: string; text: string }>;
    expect(findings.some((f) => f.kind === "confirmed" && /days? overdue/.test(f.text))).toBe(true);
    expect(findings.some((f) => /90-day priority/.test(f.text))).toBe(true);
    expect(findings.some((f) => /Monday scorecard/.test(f.text))).toBe(true);
    const { data: msgs } = await admin.from("agent_messages").select("*").eq("investigation_id", investigation);
    expect(msgs).toHaveLength(1);
    expect(msgs![0].kind).toBe("followup");
    expect(msgs![0].body).toMatch(/Please reply in Omni OS/);
    const { data: owner } = await admin.from("profiles").select("full_name").eq("id", msgs![0].to_user_id!).single();
    expect(owner!.full_name).toBe("Aisha Khan");
    const { data: events } = await admin.from("agent_events").select("kind").eq("investigation_id", investigation);
    const kinds = new Set(events!.map((e) => e.kind));
    for (const k of ["trigger", "context", "finding", "tool_call", "message"]) expect(kinds.has(k)).toBe(true);
  });

  it("does not repeat itself: a second tick opens no duplicate case and sends nothing new", async () => {
    await run([clinara]);
    const { count: invs } = await admin.from("agent_investigations").select("id", { count: "exact", head: true }).eq("subject_id", pciAction);
    const { count: msgs } = await admin.from("agent_messages").select("id", { count: "exact", head: true }).eq("investigation_id", investigation);
    expect(invs).toBe(1);
    expect(msgs).toBe(1);
  });

  it("the owner can only record a response — not rewrite the agent's message", async () => {
    const { data: msg } = await aisha.from("agent_messages").select("id").eq("investigation_id", investigation).single();
    const tamper = await aisha.from("agent_messages").update({ body: "changed" }).eq("id", msg!.id).select();
    expect(tamper.error).not.toBeNull();
    const other = await marcus.from("agent_messages").update({ response_kind: "done", responded_at: new Date().toISOString() }).eq("id", msg!.id).select();
    expect(other.data ?? []).toEqual([]); // not the recipient
    const ok = await aisha.from("agent_messages").update({ response_kind: "new_date", response_date: inDays(10), response_text: "Waiting on the QSA's slot", responded_at: new Date().toISOString() }).eq("id", msg!.id).select();
    expect(ok.error).toBeNull();
  });

  it("captures the reply and proposes the revised date for approval instead of changing the commitment", async () => {
    const r = await run([clinara]); // the reply's signal wakes the run
    expect(r.errors).toEqual([]);
    const { data: approvals } = await admin.from("agent_approvals").select("*").eq("investigation_id", investigation);
    expect(approvals).toHaveLength(1);
    expect(approvals![0]).toMatchObject({ action_type: "change_action_due_date", category: "commitment_change", status: "pending", approver_role: "ceo" });
    const { data: action } = await admin.from("actions").select("due_date").eq("id", pciAction).single();
    expect(action!.due_date).not.toBe(inDays(10)); // unchanged until approved
    expect((await invFor(pciAction)).status).toBe("awaiting_approval");
  });

  it("only the configured approver can approve, and an approved proposal cannot be altered", async () => {
    const { data: ap } = await admin.from("agent_approvals").select("id").eq("investigation_id", investigation).single();
    const byExec = await marcus.from("agent_approvals").update({ status: "approved" }).eq("id", ap!.id).select();
    expect(byExec.error).not.toBeNull();
    const tamper = await daniel.from("agent_approvals").update({ payload: { action_id: pciAction, new_due_date: "2099-01-01" } }).eq("id", ap!.id).select();
    expect(tamper.error).not.toBeNull();
    const ok = await daniel.from("agent_approvals").update({ status: "approved" }).eq("id", ap!.id).select("status, decided_by").single();
    expect(ok.error).toBeNull();
    expect(ok.data!.decided_by).not.toBeNull();
  });

  it("applies the approved change after re-checking it, then keeps monitoring", async () => {
    const r = await run([clinara]);
    expect(r.errors).toEqual([]);
    const { data: action } = await admin.from("actions").select("due_date").eq("id", pciAction).single();
    expect(action!.due_date).toBe(inDays(10));
    const { data: ap } = await admin.from("agent_approvals").select("status").eq("investigation_id", investigation).single();
    expect(ap!.status).toBe("executed");
    expect((await invFor(pciAction)).status).toBe("monitoring");
  });

  it("resolves the case with an outcome when the action is completed", async () => {
    await aisha.from("actions").update({ status: "done" }).eq("id", pciAction);
    await due(investigation);
    await run([clinara]);
    const inv = await invFor(pciAction);
    expect(inv.status).toBe("resolved");
    expect(inv.outcome).toMatchObject({ final_status: "done", follow_ups_sent: 1 });
    expect((await runFor(investigation)).status).toBe("succeeded");
  });
});

describe("approval-gated follow-ups (Kestrel)", () => {
  it("raises a proposal and sends nothing until the CEO approves; then sends exactly what was approved", async () => {
    await run([kestrel]);
    const { data: inv } = await admin.from("agent_investigations").select("id, status").eq("company_id", kestrel).eq("workflow", "execution.overdue_action").limit(1).single();
    expect(inv!.status).toBe("awaiting_approval");
    expect((await admin.from("agent_messages").select("id").eq("investigation_id", inv!.id)).data).toEqual([]);
    const { data: ap } = await admin.from("agent_approvals").select("id, payload").eq("investigation_id", inv!.id).single();
    const sarah = await as("sarah@kestrel.demo");
    expect((await sarah.from("agent_approvals").update({ status: "approved" }).eq("id", ap!.id).select()).error).toBeNull();
    const r = await run([kestrel]);
    expect(r.errors).toEqual([]);
    const { data: msgs } = await admin.from("agent_messages").select("body, approval_id").eq("investigation_id", inv!.id);
    expect(msgs).toHaveLength(1);
    expect(msgs![0].approval_id).toBe(ap!.id);
    expect(msgs![0].body).toBe((ap!.payload as { body: string }).body);
  });

  it("the database refuses an unapproved message even if the agent tries to send one directly", async () => {
    const { data: m } = await admin.from("company_memberships").select("user_id").eq("company_id", kestrel).eq("role", "agent").single();
    const agent = agentClient(m!.user_id);
    const { data: inv } = await admin.from("agent_investigations").select("id").eq("company_id", kestrel).limit(1).single();
    const { data: crew } = await admin.from("crew_members").select("id, user_id").eq("company_id", kestrel).not("user_id", "is", null).limit(1).single();
    const res = await agent.from("agent_messages").insert({ company_id: kestrel, investigation_id: inv!.id, agent_key: "execution", kind: "followup", to_crew_id: crew!.id, to_user_id: crew!.user_id, subject: "x", body: "unapproved message body", idempotency_key: "forged-1" });
    expect(res.error?.code).toBe("42501");
  });
});

describe("agent tenant isolation and authority", () => {
  it("an agent operating for Clinara cannot read or act on Kestrel's records", async () => {
    const { data: m } = await admin.from("company_memberships").select("user_id").eq("company_id", clinara).eq("role", "agent").single();
    const agent = agentClient(m!.user_id);
    expect((await agent.from("actions").select("id").eq("company_id", kestrel)).data).toEqual([]);
    expect((await agent.from("agent_investigations").select("id").eq("company_id", kestrel)).data).toEqual([]);
    const { data: owner } = await admin.from("crew_members").select("id").eq("company_id", kestrel).limit(1).single();
    const create = await agent.rpc("agent_create_action", { p_company: kestrel, p_agent: "execution", p_title: "x", p_description: "", p_owner: owner!.id, p_due: inDays(3) });
    expect(create.error?.code).toBe("42501");
    const { data: kap } = await admin.from("agent_approvals").select("id").eq("company_id", kestrel).limit(1).single();
    expect((await agent.rpc("agent_apply_approval", { p_approval: kap!.id })).error?.code).toBe("42501");
    // the agent principal also cannot read Omni-only data in its own company
    expect((await agent.from("investment_cases").select("company_id").eq("company_id", clinara)).data).toEqual([]);
  });

  it("the agent principal cannot change management records directly", async () => {
    const { data: m } = await admin.from("company_memberships").select("user_id").eq("company_id", clinara).eq("role", "agent").single();
    const agent = agentClient(m!.user_id);
    const { data: a } = await admin.from("actions").select("id, due_date").eq("company_id", clinara).eq("status", "open").limit(1).single();
    expect((await agent.from("actions").update({ due_date: "2099-01-01" }).eq("id", a!.id).select()).data ?? []).toEqual([]);
    expect((await agent.from("quarterly_priorities").update({ status: "on_track" }).eq("company_id", clinara).select()).data ?? []).toEqual([]);
  });

  it("nobody can give a Level 5 category automatic authority, and only administrators configure agents", async () => {
    const up = await daniel.from("agent_configs").update({ category_modes: { external_communication: "auto" } }).eq("company_id", clinara).eq("agent_key", "commercial").select();
    expect(up.error?.code).toBe("42501");
    const terms = await daniel.from("agent_configs").update({ category_modes: { commercial_terms: "approval" } }).eq("company_id", clinara).eq("agent_key", "commercial").select();
    expect(terms.error?.code).toBe("42501");
    const exec = await marcus.from("agent_configs").update({ enabled: false }).eq("company_id", clinara).eq("agent_key", "execution").select();
    expect(exec.data ?? []).toEqual([]);
    // and people cannot hand themselves the agent role
    const { data: me } = await marcus.auth.getUser();
    expect((await daniel.from("company_memberships").update({ role: "agent" }).eq("company_id", clinara).eq("user_id", me.user!.id).select()).error).not.toBeNull();
  });

  it("the agent's ledger is append-only", async () => {
    const { data: e } = await admin.from("agent_events").select("id").eq("investigation_id", investigation).limit(1).single();
    expect((await daniel.from("agent_events").update({ summary: "rewritten" }).eq("id", e!.id).select()).data ?? []).toEqual([]);
    expect((await daniel.from("agent_events").delete().eq("id", e!.id).select()).data ?? []).toEqual([]);
  });
});

describe("resilience", () => {
  it("recovers from a crash after sending, without sending the follow-up twice", async () => {
    const { data: owner } = await admin.from("crew_members").select("id").eq("company_id", clinara).eq("full_name", "Marcus Webb").single();
    const { data: a } = await admin.from("actions").insert({ company_id: clinara, title: "Send revised enterprise pricing to procurement", owner_id: owner!.id, due_date: inDays(-3), status: "open" }).select("id").single();
    process.env.AGENT_FAULT_AFTER_SIDE_EFFECT = "inbox.send_message";
    const first = await run([clinara]);
    expect(first.errors.some((e) => /simulated crash/.test(e))).toBe(true);
    const inv = await invFor(a!.id);
    expect((await admin.from("agent_messages").select("id").eq("investigation_id", inv.id)).data).toHaveLength(1);
    expect((await runFor(inv.id)).status).toBe("queued"); // will retry
    await due(inv.id);
    const second = await run([clinara], "restarted-worker");
    expect(second.errors).toEqual([]);
    expect((await admin.from("agent_messages").select("id").eq("investigation_id", inv.id)).data).toHaveLength(1);
    expect((await runFor(inv.id)).status).toBe("waiting");
    const { data: notes } = await admin.from("agent_events").select("summary").eq("investigation_id", inv.id).eq("kind", "note");
    expect(notes!.some((n) => /not repeated/.test(n.summary))).toBe(true);
  });

  it("resumes a run abandoned by a crashed worker (expired lease) from its last saved step", async () => {
    const { data: owner } = await admin.from("crew_members").select("id").eq("company_id", clinara).eq("full_name", "Marcus Webb").single();
    const { data: a } = await admin.from("actions").insert({ company_id: clinara, title: "Confirm Q1 partner event budget", owner_id: owner!.id, due_date: inDays(-2), status: "open" }).select("id").single();
    await run([clinara]);
    const inv = await invFor(a!.id);
    const before = await runFor(inv.id);
    // simulate: a worker claimed it and died mid-step
    await admin.from("agent_runs").update({ status: "running", lease_owner: "dead-worker", lease_until: new Date(Date.now() - 60000).toISOString(), step: "await_response" }).eq("id", before.id);
    const r = await run([clinara], "new-worker");
    expect(r.errors).toEqual([]);
    const after = await runFor(inv.id);
    expect(after.status).toBe("waiting");
    expect(after.lease_owner).toBeNull();
    expect((await admin.from("agent_messages").select("id").eq("investigation_id", inv.id)).data).toHaveLength(1);
  });
});

// ─── Specialist agents (same file so the shared seeded state is used in a fixed order) ───

describe("CEO Agent — KPI deviation → intervention → recovery", () => {
  let metricId: string;
  let inv: string;
  let approvalId: string;
  const month = (back: number) => {
    const d = new Date();
    return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1)));
  };

  beforeAll(async () => {
    const { data: owner } = await admin.from("crew_members").select("id").eq("company_id", clinara).eq("email", "marcus@clinara.demo").single();
    const { data: m } = await admin
      .from("metrics")
      .insert({ company_id: clinara, name: "Clinic onboarding NPS", category: "customer", unit: "number", frequency: "monthly", direction: "higher_is_better", target_value: 50, owner_id: owner!.id, is_key: true, in_weekly_scorecard: true, sort_order: -10 })
      .select("id")
      .single();
    metricId = m!.id;
    await admin.from("metric_values").insert([4, 3, 2, 1].map((b, k) => ({ company_id: clinara, metric_id: metricId, period_start: month(b), value: [38, 36, 35, 34][k], source: "manual" })));
  });

  it("opens a strategic investigation by itself and separates findings, hypotheses and missing evidence", async () => {
    const r = await run([clinara]);
    expect(r.errors).toEqual([]);
    const { data } = await admin.from("agent_investigations").select("*").eq("subject_id", metricId).single();
    inv = data!.id;
    expect(data!.agent_key).toBe("ceo");
    const f = data!.findings as Array<{ kind: string; text: string }>;
    expect(f.some((x) => x.kind === "confirmed" && /off track for \d+ consecutive/.test(x.text))).toBe(true);
    expect(f.some((x) => x.kind === "missing")).toBe(true);
    expect(data!.status).toBe("awaiting_approval");
    const { data: ap } = await admin.from("agent_approvals").select("*").eq("investigation_id", inv).single();
    approvalId = ap!.id;
    expect(ap!.action_type).toBe("create_corrective_action");
    expect(ap!.status).toBe("pending");
  });

  it("the Monday scorecard shows no agent recommendation until management approves it", async () => {
    const { count } = await admin.from("actions").select("id", { count: "exact", head: true }).eq("metric_id", metricId);
    expect(count).toBe(0);
    // An executive is not the configured approver (CEO)
    const denied = await marcus.from("agent_approvals").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", approvalId).select();
    expect(denied.error !== null || (denied.data ?? []).length === 0).toBe(true);
  });

  it("applies the intervention after the CEO approves: issue raised and corrective action agreed against the KPI", async () => {
    const { data: me } = await daniel.auth.getUser();
    const ok = await daniel.from("agent_approvals").update({ status: "approved", decided_by: me.user!.id, decided_at: new Date().toISOString() }).eq("id", approvalId).select();
    expect(ok.error).toBeNull();
    await run([clinara]);
    const { data: ap } = await admin.from("agent_approvals").select("status, result").eq("id", approvalId).single();
    expect(ap!.status).toBe("executed");
    const { data: action } = await admin.from("actions").select("id, metric_id, issue_id, status").eq("id", (ap!.result as { action_id: string }).action_id).single();
    expect(action!.metric_id).toBe(metricId);
    expect(action!.issue_id).not.toBeNull();
    expect((await admin.from("agent_investigations").select("status").eq("id", inv).single()).data!.status).toBe("monitoring");
  });

  it("records recovery when the KPI comes back on target — without claiming credit for it", async () => {
    await admin.from("metric_values").insert({ company_id: clinara, metric_id: metricId, period_start: month(0), value: 56, source: "manual" });
    await due(inv);
    // A week into next month, this month's result is the latest completed period
    const later = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 7));
    await tick({ admin, workerId: "test-worker", companies: [clinara], now: later });
    const { data } = await admin.from("agent_investigations").select("status, outcome, summary").eq("id", inv).single();
    expect(data!.status).toBe("resolved");
    expect(data!.outcome).toMatchObject({ recovered: true, intervention_applied: true, value: 56 });
    expect(data!.summary).toMatch(/not attributed/);
  });
});

describe("Commercial Agent — pipeline review in the sandbox CRM", () => {
  let inv: string;
  let approvalId: string;
  let taskCount: number;

  it("analyses the CRM, finds the stalled segment and proposes internal follow-up tasks only", async () => {
    await run([clinara]);
    const { data } = await admin.from("agent_investigations").select("*").eq("company_id", clinara).eq("workflow", "commercial.pipeline_review").single();
    inv = data!.id;
    const f = data!.findings as Array<{ kind: string; text: string }>;
    expect(f.some((x) => /Enterprise/.test(x.text) && /stalled/.test(x.text))).toBe(true);
    expect(f.some((x) => x.kind === "hypothesis")).toBe(true);
    expect(f.some((x) => x.kind === "missing" && /stage history/.test(x.text))).toBe(true);
    const { data: ap } = await admin.from("agent_approvals").select("*").eq("investigation_id", inv).single();
    approvalId = ap!.id;
    expect(ap!.action_type).toBe("crm_create_tasks");
    taskCount = (ap!.payload as { tasks: unknown[] }).tasks.length;
    expect(taskCount).toBeGreaterThan(0);
    const { count } = await admin.from("crm_sandbox_tasks").select("id", { count: "exact", head: true }).eq("company_id", clinara).eq("created_by_agent", true);
    expect(count).toBe(0);
  });

  it("the CEO Agent's commissioned question joined this case rather than duplicating it", async () => {
    const { count } = await admin.from("agent_investigations").select("id", { count: "exact", head: true }).eq("company_id", clinara).eq("workflow", "commercial.pipeline_review");
    expect(count).toBe(1);
  });

  it("creates exactly the approved tasks once, and measures follow-through", async () => {
    const { data: me } = await daniel.auth.getUser();
    await daniel.from("agent_approvals").update({ status: "approved", decided_by: me.user!.id, decided_at: new Date().toISOString() }).eq("id", approvalId);
    await run([clinara]);
    await run([clinara]);
    const { data: tasks } = await admin.from("crm_sandbox_tasks").select("id").eq("company_id", clinara).eq("created_by_agent", true);
    expect(tasks).toHaveLength(taskCount);
    expect((await admin.from("agent_approvals").select("status").eq("id", approvalId).single()).data!.status).toBe("executed");
    // The owners work the tasks in the CRM
    await admin.from("crm_sandbox_tasks").update({ status: "completed" }).in("id", tasks!.map((t) => t.id));
    await due(inv);
    await run([clinara]);
    const { data } = await admin.from("agent_investigations").select("status, outcome").eq("id", inv).single();
    expect(data!.status).toBe("resolved");
    expect(data!.outcome).toMatchObject({ tasks_created: taskCount, tasks_completed: taskCount });
  });
});

describe("M&A Agent — thesis-led sourcing", () => {
  let inv: string;
  let sarah: Client;
  beforeAll(async () => {
    sarah = await as("sarah@kestrel.demo");
  });

  it("dedupes, excludes rejected and excluded companies, and never invents financials", async () => {
    const r = await run([kestrel]);
    expect(r.errors).toEqual([]);
    const { data } = await admin.from("agent_investigations").select("*").eq("company_id", kestrel).eq("workflow", "ma.sourcing").single();
    inv = data!.id;
    const { data: targets } = await admin.from("ma_targets").select("name, normalized_name, stage, revenue, ebitda, fit_breakdown, added_by_agent").eq("company_id", kestrel);
    const names = targets!.map((t) => t.name);
    expect(names.filter((n) => /Aquila/.test(n))).toHaveLength(1); // already in diligence: not duplicated
    expect(targets!.find((t) => t.name === "Beacon Alarms")!.stage).toBe("rejected"); // still rejected
    expect(names).not.toContain("Highland Safety Engineering"); // in administration: excluded
    expect(names).not.toContain("Kent Fire Extinguisher Co"); // outside the thesis regions
    const pennine = targets!.find((t) => t.name === "Pennine Alarm Services")!;
    expect(pennine.added_by_agent).toBe(true);
    expect(pennine.revenue).toBeNull();
    expect(pennine.ebitda).toBeNull();
    expect((pennine.fit_breakdown as Array<{ key: string; result: string }>).find((c) => c.key === "revenue")!.result).toBe("unknown");
  });

  it("prepares approaches for approval only — nothing is sent and the agent cannot apply them itself", async () => {
    const { data: aps } = await admin.from("agent_approvals").select("*").eq("investigation_id", inv).eq("action_type", "send_external_message");
    expect(aps!.length).toBe(2);
    expect(aps!.every((a) => a.status === "pending" && a.category === "external_communication")).toBe(true);
    const agent = agentClient((await admin.from("company_memberships").select("user_id").eq("company_id", kestrel).eq("role", "agent").single()).data!.user_id);
    const forced = await agent.rpc("agent_apply_approval", { p_approval: aps![0].id });
    expect(forced.error?.code).toBe("42501");
    const { count } = await admin.from("agent_messages").select("id", { count: "exact", head: true }).eq("investigation_id", inv);
    expect(count).toBe(0);
  });

  it("on approval hands the approved draft to the deal lead; a rejection is respected", async () => {
    const { data: aps } = await admin.from("agent_approvals").select("id, payload").eq("investigation_id", inv).eq("action_type", "send_external_message").order("created_at");
    const { data: me } = await sarah.auth.getUser();
    const now = new Date().toISOString();
    expect((await sarah.from("agent_approvals").update({ status: "approved", decided_by: me.user!.id, decided_at: now }).eq("id", aps![0].id).select()).error).toBeNull();
    expect((await sarah.from("agent_approvals").update({ status: "rejected", decided_by: me.user!.id, decided_at: now, decision_note: "Not this year" }).eq("id", aps![1].id).select()).error).toBeNull();
    await due(inv);
    await run([kestrel]);
    const { data: ap } = await admin.from("agent_approvals").select("status, result").eq("id", aps![0].id).single();
    expect(ap!.status).toBe("executed");
    const { data: action } = await admin.from("actions").select("title, owner_id").eq("id", (ap!.result as { action_id: string }).action_id).single();
    const { data: grace } = await admin.from("crew_members").select("id").eq("company_id", kestrel).eq("email", "grace@kestrel.demo").single();
    expect(action!.owner_id).toBe(grace!.id);
    expect(action!.title).toMatch(/^Send introductory approach to /);
    const { data } = await admin.from("agent_investigations").select("status, outcome").eq("id", inv).single();
    expect(data!.status).toBe("resolved");
    expect(data!.outcome).toMatchObject({ approaches_prepared: 2, approaches_approved: 1 });
  });
});
