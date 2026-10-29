// The durable agent engine. One `tick` processes change signals, runs the event and
// scheduled triggers, then claims due runs from the Postgres-backed queue and executes
// them step by step, persisting state after every step. A crashed worker's lease
// expires and another tick resumes the run from its last saved step; side effects are
// protected by the idempotency ledger, so nothing is sent twice.
import type { Json } from "@/lib/supabase/database.types";
type J = NonNullable<Json>;
import { agentClient, ensureAgentPrincipal, type Db } from "./principal";
import { ACTIVE_STATUSES, AGENTS, type AgentConfig, type AgentKey } from "./registry";
import { Runtime, ToolError, UncertainSideEffect, type InvestigationRow, type RunRow, type WorkflowDef } from "./runtime";
import { WORKFLOWS } from "./workflows";
import { DETECTORS } from "./detectors";

export interface TickOptions {
  admin: Db; // service role: queue, signals and principal provisioning only
  workerId: string;
  now?: Date;
  maxRuns?: number;
  maxStepsPerRun?: number;
  companies?: string[]; // restrict (tests)
  log?: (msg: string) => void;
}

export interface TickReport {
  signals: number;
  opened: number;
  runs: number;
  steps: number;
  errors: string[];
}

const principals = new Map<string, string>();

export async function principalFor(admin: Db, companyId: string): Promise<string> {
  const cached = principals.get(companyId);
  if (cached) return cached;
  const { data: c } = await admin.from("companies").select("slug").eq("id", companyId).single();
  const id = await ensureAgentPrincipal(admin, companyId, c!.slug);
  principals.set(companyId, id);
  return id;
}

export async function loadConfigs(db: Db, companyId: string): Promise<Map<AgentKey, AgentConfig>> {
  const { data } = await db.from("agent_configs").select("*").eq("company_id", companyId);
  return new Map((data ?? []).map((c) => [c.agent_key as AgentKey, c as unknown as AgentConfig]));
}

/** Open an investigation and queue its first run, unless one is already live for the same subject. */
export async function openInvestigation(
  db: Db,
  p: { companyId: string; agent: AgentKey; workflow: string; title: string; dedupeKey: string; subjectType?: string; subjectId?: string; trigger: Record<string, unknown>; parentId?: string; requestedBy?: string; severity?: string; runAfter?: Date },
): Promise<{ id: string; created: boolean }> {
  const { data: live } = await db.from("agent_investigations").select("id").eq("company_id", p.companyId).eq("dedupe_key", p.dedupeKey).in("status", ACTIVE_STATUSES).maybeSingle();
  if (live) return { id: live.id, created: false };
  const { data, error } = await db
    .from("agent_investigations")
    .insert({
      company_id: p.companyId, agent_key: p.agent, workflow: p.workflow, title: p.title, dedupe_key: p.dedupeKey,
      subject_type: p.subjectType ?? null, subject_id: p.subjectId ?? null, trigger: p.trigger as J,
      parent_id: p.parentId ?? null, requested_by: p.requestedBy ?? null, severity: p.severity ?? "medium",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: again } = await db.from("agent_investigations").select("id").eq("company_id", p.companyId).eq("dedupe_key", p.dedupeKey).in("status", ACTIVE_STATUSES).maybeSingle();
      return { id: again!.id, created: false };
    }
    throw new Error(error.message);
  }
  await db.from("agent_events").insert({
    company_id: p.companyId, investigation_id: data.id, agent_key: p.agent, kind: "trigger",
    summary: String(p.trigger.summary ?? "Investigation opened"), data: p.trigger as J,
  });
  const { error: re } = await db.from("agent_runs").insert({ company_id: p.companyId, investigation_id: data.id, agent_key: p.agent, workflow: p.workflow, run_after: (p.runAfter ?? new Date()).toISOString() });
  if (re) throw new Error(re.message);
  return { id: data.id, created: true };
}

/** Change signals wake waiting runs (replies, approvals) and mark companies for trigger evaluation. */
async function processSignals(admin: Db, now: Date): Promise<{ count: number; companies: Set<string> }> {
  const companies = new Set<string>();
  let count = 0;
  for (let batch = 0; batch < 20; batch++) {
    const n = await processSignalBatch(admin, now, companies);
    count += n;
    if (n < 500) break;
  }
  return { count, companies };
}

async function processSignalBatch(admin: Db, now: Date, companies: Set<string>): Promise<number> {
  const { data: signals } = await admin.from("agent_signals").select("*").is("processed_at", null).order("id").limit(500);
  if (!signals?.length) return 0;
  const wakeInvestigations = new Set<string>();
  for (const s of signals) {
    companies.add(s.company_id);
    if ((s.entity_type === "agent_messages" || s.entity_type === "agent_approvals") && s.kind === "update" && s.entity_id) {
      const table = s.entity_type as "agent_messages" | "agent_approvals";
      const { data } = await admin.from(table).select("investigation_id").eq("id", s.entity_id).maybeSingle();
      if (data) wakeInvestigations.add(data.investigation_id);
    }
    if (s.entity_type === "actions" && s.entity_id) {
      const { data } = await admin.from("agent_investigations").select("id").eq("subject_id", s.entity_id).in("status", ACTIVE_STATUSES);
      for (const i of data ?? []) wakeInvestigations.add(i.id);
      // corrective actions linked to an integration activity wake the case tracking them
      const { data: act } = await admin.from("actions").select("integration_activity_id").eq("id", s.entity_id).maybeSingle();
      if (act?.integration_activity_id) {
        const { data: w } = await admin.from("agent_investigations").select("id").eq("subject_id", act.integration_activity_id).in("status", ACTIVE_STATUSES);
        for (const i of w ?? []) wakeInvestigations.add(i.id);
      }
    }
    if (s.entity_type === "integration_activities" && s.entity_id) {
      const { data } = await admin.from("agent_investigations").select("id").eq("company_id", s.company_id).in("status", ACTIVE_STATUSES).or(`subject_id.eq.${s.entity_id},trigger->>dependent_id.eq.${s.entity_id}`);
      for (const i of data ?? []) wakeInvestigations.add(i.id);
    }
    if (s.entity_type === "synergy_actuals" && s.entity_id) {
      const { data: a } = await admin.from("synergy_actuals").select("synergy_id").eq("id", s.entity_id).maybeSingle();
      if (a) {
        const { data } = await admin.from("agent_investigations").select("id").eq("subject_id", a.synergy_id).in("status", ACTIVE_STATUSES);
        for (const i of data ?? []) wakeInvestigations.add(i.id);
      }
    }
  }
  if (wakeInvestigations.size) {
    // Wake on the wall clock (the queue is claimed against the database clock); never postpone a run
    const wall = new Date().toISOString();
    await admin.from("agent_runs").update({ run_after: wall }).in("investigation_id", [...wakeInvestigations]).eq("status", "waiting").gt("run_after", wall);
  }
  await admin.from("agent_signals").update({ processed_at: now.toISOString() }).in("id", signals.map((s) => s.id));
  return signals.length;
}

const lastDetection = new Map<string, number>();

async function runDetectors(admin: Db, companyIds: string[], dirty: Set<string>, now: Date, report: TickReport) {
  for (const cid of companyIds) {
    const last = lastDetection.get(cid) ?? 0;
    if (!dirty.has(cid) && now.getTime() - last < 15 * 60000) continue;
    lastDetection.set(cid, now.getTime());
    const userId = await principalFor(admin, cid);
    const configs = await loadConfigs(agentClient(userId), cid);
    const clients = new Map<AgentKey, Db>();
    for (const d of DETECTORS) {
      const cfg = configs.get(d.agent);
      if (!cfg?.enabled || cfg.schedules[d.schedule]?.enabled === false) continue;
      // each detector runs as its own agent, with that agent's data domains
      if (!clients.has(d.agent)) clients.set(d.agent, agentClient(userId, d.agent));
      const db = clients.get(d.agent)!;
      try {
        const opened = await d.detect({ db, companyId: cid, config: cfg, now });
        report.opened += opened;
      } catch (e) {
        report.errors.push(`${AGENTS[d.agent].name} trigger (${d.schedule}) for ${cid}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}

export async function tick(o: TickOptions): Promise<TickReport> {
  const now = o.now ?? new Date();
  const report: TickReport = { signals: 0, opened: 0, runs: 0, steps: 0, errors: [] };
  const { count, companies: dirty } = await processSignals(o.admin, now);
  report.signals = count;
  let companyIds = o.companies;
  if (!companyIds) companyIds = ((await o.admin.from("companies").select("id")).data ?? []).map((c) => c.id);
  await runDetectors(o.admin, companyIds, dirty, now, report);

  const { data: claimed, error } = await o.admin.rpc("claim_agent_runs", { p_worker: o.workerId, p_limit: o.maxRuns ?? 10, p_lease_seconds: 120, p_companies: o.companies });
  if (error) throw new Error(`claim: ${error.message}`);
  for (const run of claimed ?? []) {
    report.runs += 1;
    report.steps += await executeRun(o.admin, run as RunRow, now, o.maxStepsPerRun ?? 12, report, o.log);
  }
  return report;
}

async function executeRun(admin: Db, run: RunRow, now: Date, maxSteps: number, report: TickReport, log?: (m: string) => void): Promise<number> {
  const userId = await principalFor(admin, run.company_id);
  const db = agentClient(userId, run.agent_key);
  const wf: WorkflowDef | undefined = WORKFLOWS[run.workflow];
  const { data: inv } = await db.from("agent_investigations").select("*").eq("company_id", run.company_id).eq("id", run.investigation_id).maybeSingle();
  if (!wf || !inv) {
    await db.from("agent_runs").update({ status: "failed", last_error: !wf ? `Unknown workflow ${run.workflow}` : "Investigation not found", finished_at: now.toISOString() }).eq("id", run.id);
    return 0;
  }
  if (!ACTIVE_STATUSES.includes(inv.status as never)) {
    await db.from("agent_runs").update({ status: "cancelled", finished_at: now.toISOString(), wait_reason: null }).eq("id", run.id);
    return 0;
  }
  const configs = await loadConfigs(db, run.company_id);
  const config = configs.get(run.agent_key as AgentKey) ?? null;
  if (!config?.enabled) {
    // Paused: keep the case and pick it up again when management re-enables the agent
    await db.from("agent_runs").update({ status: "waiting", run_after: new Date(now.getTime() + 3600000).toISOString(), wait_reason: "Agent disabled", lease_owner: null }).eq("id", run.id);
    return 0;
  }
  // daily run limit
  const { data: usage } = await db.from("agent_usage").select("steps").eq("company_id", run.company_id).eq("agent_key", run.agent_key).eq("day", now.toISOString().slice(0, 10)).maybeSingle();
  if ((usage?.steps ?? 0) >= config.limits.max_runs_per_day * 10) {
    await db.from("agent_runs").update({ status: "waiting", run_after: new Date(now.getTime() + 3600000).toISOString(), wait_reason: "Daily activity limit reached", lease_owner: null }).eq("id", run.id);
    return 0;
  }

  const rt = new Runtime(db, run, inv as InvestigationRow, config, userId, now);
  let steps = 0;
  let step = run.step;
  try {
    while (steps < maxSteps) {
      const fn = wf.steps[step];
      if (!fn) throw new ToolError(`Unknown step ${step}`);
      log?.(`[${AGENTS[rt.agent].name}] ${inv.title} → ${step}`);
      const out = await fn(rt);
      steps += 1;
      await rt.bumpUsage("steps");
      if ("done" in out) {
        await rt.updateInvestigation({ status: out.done.status, summary: out.done.summary, outcome: (out.done.outcome ?? null) as unknown as J, resolved_at: now.toISOString(), next_review_at: null });
        await db.from("agent_runs").update({ status: out.done.status === "failed" ? "failed" : "succeeded", step, state: rt.state as J, finished_at: now.toISOString(), wait_reason: null, lease_owner: null, last_error: null }).eq("id", run.id);
        await notifyParent(db, rt);
        return steps;
      }
      if ("wait" in out) {
        const nextStep = out.next ?? step;
        await db.from("agent_runs").update({ status: "waiting", step: nextStep, state: rt.state as J, run_after: (out.wait.until ?? new Date(now.getTime() + 86400000)).toISOString(), wait_reason: out.wait.label, lease_owner: null, last_error: null, attempts: 0 }).eq("id", run.id);
        return steps;
      }
      // checkpoint before the next step
      step = out.next;
      await db.from("agent_runs").update({ step, state: rt.state as J, lease_until: new Date(Date.now() + 120000).toISOString() }).eq("id", run.id);
    }
    await db.from("agent_runs").update({ status: "queued", step, state: rt.state as J, run_after: now.toISOString(), lease_owner: null }).eq("id", run.id);
    return steps;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.errors.push(`${inv.title}: ${msg}`);
    const permanent = e instanceof UncertainSideEffect || (e instanceof ToolError && !e.retryable);
    const exhausted = run.attempts >= run.max_attempts;
    await rt.event("error", permanent ? `Stopped: ${msg}` : exhausted ? `Failed after ${run.attempts} attempts: ${msg}` : `Attempt ${run.attempts} failed, will retry: ${msg}`, { step, permanent }).catch(() => {});
    if (permanent || exhausted) {
      await db.from("agent_runs").update({ status: "failed", last_error: msg, lease_owner: null, finished_at: now.toISOString() }).eq("id", run.id);
      await rt.updateInvestigation({ status: "failed", summary: `Stopped at "${step}": ${msg}` }).catch(() => {});
    } else {
      const backoff = Math.min(60, 2 ** run.attempts) * 60000;
      await db.from("agent_runs").update({ status: "queued", last_error: msg, lease_owner: null, run_after: new Date(now.getTime() + backoff).toISOString() }).eq("id", run.id);
    }
    return steps;
  }
}

/** A delegated investigation reports back to the agent that commissioned it. */
async function notifyParent(db: Db, rt: Runtime) {
  if (!rt.inv.parent_id) return;
  await db.from("agent_events").insert({
    company_id: rt.companyId, investigation_id: rt.inv.parent_id, agent_key: rt.agent, kind: "delegation",
    summary: `${AGENTS[rt.agent].name} completed the commissioned investigation: ${rt.inv.summary ?? rt.inv.title}`,
    data: { child_id: rt.inv.id, findings: rt.findings.length } as J,
  });
  await db.from("agent_runs").update({ run_after: new Date().toISOString() }).eq("investigation_id", rt.inv.parent_id).eq("status", "waiting");
}
