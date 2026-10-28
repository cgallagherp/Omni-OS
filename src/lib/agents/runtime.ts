// Runtime for one step of a durable agent workflow. Every effect goes through here:
// the ledger, findings, proposals (approvals), authority checks and tool calls with
// idempotency. State is persisted by the engine after each step.
import type { Json } from "@/lib/supabase/database.types";
type J = NonNullable<Json>;
import type { Db } from "./principal";
import { AGENTS, approverFor, CATEGORIES, modeFor, type AgentConfig, type AgentKey, type ApproverRole, type Category, type Finding, type InvestigationStatus, type Mode, type SourceRef } from "./registry";

export interface RunRow {
  id: string;
  company_id: string;
  investigation_id: string;
  agent_key: string;
  workflow: string;
  step: string;
  state: J;
  attempts: number;
  max_attempts: number;
}

export interface InvestigationRow {
  id: string;
  company_id: string;
  agent_key: string;
  workflow: string;
  title: string;
  status: string;
  subject_type: string | null;
  subject_id: string | null;
  dedupe_key: string;
  trigger: J;
  baseline: J;
  findings: J;
  parent_id: string | null;
  next_review_at: string | null;
  summary: string | null;
}

export type StepOutcome =
  | { next: string }
  | { wait: { until?: Date; reason: "approval" | "response" | "timer" | "review" | "child"; label: string }; next?: string }
  | { done: { status: "resolved" | "closed" | "failed"; summary: string; outcome?: Record<string, unknown> } };

export type Step = (rt: Runtime) => Promise<StepOutcome>;

export interface WorkflowDef {
  key: string;
  agent: AgentKey;
  title: string;
  description: string;
  steps: Record<string, Step>;
}

export class ToolError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}
/** A side effect may have happened before a crash and cannot be verified automatically. */
export class UncertainSideEffect extends Error {}

const DAY = 86400000;

export class Runtime {
  readonly today: string;
  state: Record<string, unknown>;
  findings: Finding[];
  private toolCalls = 0;

  constructor(
    readonly db: Db,
    readonly run: RunRow,
    public inv: InvestigationRow,
    readonly config: AgentConfig | null,
    readonly agentUserId: string,
    readonly now: Date = new Date(),
  ) {
    this.today = now.toISOString().slice(0, 10);
    this.state = (run.state as Record<string, unknown>) ?? {};
    this.findings = Array.isArray(inv.findings) ? (inv.findings as unknown as Finding[]) : [];
  }

  get companyId() {
    return this.run.company_id;
  }
  get agent(): AgentKey {
    return this.run.agent_key as AgentKey;
  }
  daysFromNow(n: number) {
    return new Date(this.now.getTime() + n * DAY);
  }

  mode(category: Category): Mode {
    return modeFor(this.config, category);
  }
  approver(category: Category): ApproverRole {
    return approverFor(this.config, category);
  }

  /** Append to the evidence and activity ledger. */
  async event(kind: string, summary: string, data: Record<string, unknown> = {}, sources: SourceRef[] = []) {
    const { error } = await this.db.from("agent_events").insert({
      company_id: this.companyId,
      investigation_id: this.inv.id,
      run_id: this.run.id,
      agent_key: this.agent,
      kind,
      summary,
      data: data as J,
      sources: sources as unknown as J,
      actor_id: this.agentUserId,
    });
    if (error) throw new ToolError(`ledger: ${error.message}`, true);
  }

  /** Record a classified finding (deduplicated by text). */
  async finding(f: Finding) {
    if (this.findings.some((x) => x.text === f.text)) return;
    this.findings.push(f);
    await this.updateInvestigation({ findings: this.findings as unknown as J });
    await this.event("finding", `${f.kind === "confirmed" ? "Confirmed" : f.kind === "hypothesis" ? "Hypothesis" : "Missing evidence"}: ${f.text}`, { kind: f.kind, ...(f.data ?? {}) }, f.sources ?? []);
  }

  async updateInvestigation(patch: Partial<{ status: InvestigationStatus; title: string; summary: string; baseline: J; findings: J; expected_outcome: string; outcome: J | null; next_review_at: string | null; severity: string; resolved_at: string | null }>) {
    const { data, error } = await this.db.from("agent_investigations").update(patch).eq("company_id", this.companyId).eq("id", this.inv.id).select("*").single();
    if (error) throw new ToolError(`investigation: ${error.message}`, true);
    this.inv = data as InvestigationRow;
  }

  /**
   * Raise a proposal for a specific action. Idempotent per `stateKey`: a retried step
   * returns the proposal it already raised instead of raising another.
   */
  async propose(stateKey: string, p: {
    category: Category;
    action_type: string;
    title: string;
    rationale: string;
    payload: Record<string, unknown>;
    evidence?: SourceRef[];
    affected?: Array<{ type: string; id?: string; label: string }>;
    implications?: string;
    reversible?: boolean;
  }): Promise<string> {
    const existing = this.state[stateKey] as string | undefined;
    if (existing) return existing;
    const { data, error } = await this.db
      .from("agent_approvals")
      .insert({
        company_id: this.companyId,
        investigation_id: this.inv.id,
        agent_key: this.agent,
        category: p.category,
        action_type: p.action_type,
        title: p.title,
        rationale: p.rationale,
        payload: p.payload as J,
        evidence: (p.evidence ?? []) as unknown as J,
        affected: (p.affected ?? []) as unknown as J,
        implications: p.implications ?? null,
        reversible: p.reversible ?? true,
        approver_role: this.approver(p.category),
      })
      .select("id")
      .single();
    if (error) throw new ToolError(`proposal: ${error.message}`, true);
    this.state[stateKey] = data.id;
    await this.event("proposal", `Proposed: ${p.title}`, { approval_id: data.id, category: p.category, level: CATEGORIES[p.category].level, approver: this.approver(p.category) }, p.evidence ?? []);
    return data.id;
  }

  async approval(id: string) {
    const { data, error } = await this.db.from("agent_approvals").select("*").eq("company_id", this.companyId).eq("id", id).single();
    if (error) throw new ToolError(`approval: ${error.message}`, true);
    return data;
  }

  async bumpUsage(field: "steps" | "tool_calls" | "actions" | "messages" | "runs", n = 1) {
    const day = this.today;
    const { data } = await this.db.from("agent_usage").select("*").eq("company_id", this.companyId).eq("agent_key", this.agent).eq("day", day).maybeSingle();
    const row = { company_id: this.companyId, agent_key: this.agent, day, runs: data?.runs ?? 0, steps: data?.steps ?? 0, tool_calls: data?.tool_calls ?? 0, actions: data?.actions ?? 0, messages: data?.messages ?? 0 };
    row[field] += n;
    await this.db.from("agent_usage").upsert(row, { onConflict: "company_id,agent_key,day" });
    return row;
  }

  /** Enforce the configured daily limits before a side effect. */
  async checkLimit(kind: "actions" | "messages") {
    const { data } = await this.db.from("agent_usage").select(kind).eq("company_id", this.companyId).eq("agent_key", this.agent).eq("day", this.today).maybeSingle();
    const used = (data as Record<string, number> | null)?.[kind] ?? 0;
    const limit = kind === "messages" ? (this.config?.limits.max_messages_per_day ?? 20) : (this.config?.limits.max_actions_per_day ?? 20);
    if (used >= limit) throw new ToolError(`Daily ${kind} limit (${limit}) reached for the ${AGENTS[this.agent].name}`);
  }

  /**
   * Run a side effect exactly once per idempotency key. A key left 'pending' by a
   * crash is reconciled by `reconcile` (which looks for the effect's own record);
   * if that is impossible the effect is marked uncertain and not repeated.
   */
  async once<T>(key: string, tool: string, effect: () => Promise<T>, reconcile?: () => Promise<T | null>): Promise<T> {
    const { data: prior } = await this.db.from("agent_side_effects").select("*").eq("company_id", this.companyId).eq("idempotency_key", key).maybeSingle();
    if (prior?.status === "done") return prior.result as T;
    if (prior?.status === "uncertain") throw new UncertainSideEffect(`${tool} may already have run (key ${key}); a person needs to check before it is retried`);
    if (prior?.status === "pending") {
      const found = reconcile ? await reconcile() : null;
      if (found !== null && found !== undefined) {
        await this.db.from("agent_side_effects").update({ status: "done", result: found as J, completed_at: new Date().toISOString() }).eq("company_id", this.companyId).eq("idempotency_key", key);
        await this.event("note", `Recovered after interruption: ${tool} had already completed; not repeated`, { idempotency_key: key });
        return found;
      }
      if (!reconcile) {
        await this.db.from("agent_side_effects").update({ status: "uncertain" }).eq("company_id", this.companyId).eq("idempotency_key", key);
        throw new UncertainSideEffect(`${tool} was interrupted and cannot be verified automatically`);
      }
    } else {
      const { error } = await this.db.from("agent_side_effects").insert({ company_id: this.companyId, idempotency_key: key, tool, run_id: this.run.id });
      if (error && error.code !== "23505") throw new ToolError(`idempotency: ${error.message}`, true);
    }
    const result = await effect();
    await maybeFault(tool);
    await this.db.from("agent_side_effects").update({ status: "done", result: (result ?? null) as unknown as J, completed_at: new Date().toISOString() }).eq("company_id", this.companyId).eq("idempotency_key", key);
    return result;
  }

  /** Call a registered tool: validated input, limits, ledger entry. */
  async tool<I, O>(def: ToolDef<I, O>, input: I): Promise<O> {
    const parsed = def.input.parse(input) as I;
    this.toolCalls += 1;
    if (this.toolCalls > 40) throw new ToolError("Too many tool calls in one step");
    if (!AGENTS[this.agent].tools.includes(def.name)) throw new ToolError(`${AGENTS[this.agent].name} is not permitted to use ${def.name}`);
    const started = Date.now();
    try {
      const out = await def.run(this, parsed);
      await this.bumpUsage("tool_calls");
      await this.event("tool_call", `${def.name}: ${def.summarise ? def.summarise(parsed, out) : "ok"}`, { tool: def.name, side_effect: def.sideEffect, ms: Date.now() - started });
      return out;
    } catch (e) {
      await this.event("error", `${def.name} failed: ${e instanceof Error ? e.message : String(e)}`, { tool: def.name });
      throw e;
    }
  }
}

export interface ToolDef<I, O> {
  name: string;
  description: string;
  sideEffect: "read" | "internal" | "external";
  input: { parse: (v: unknown) => unknown };
  run: (rt: Runtime, input: I) => Promise<O>;
  summarise?: (input: I, out: O) => string;
}

export function defineTool<I, O>(t: ToolDef<I, O>): ToolDef<I, O> {
  return t;
}

/** Test hook: simulate a crash immediately after a side effect, before the step is saved. */
async function maybeFault(tool: string) {
  if (process.env.AGENT_FAULT_AFTER_SIDE_EFFECT && process.env.AGENT_FAULT_AFTER_SIDE_EFFECT === tool) {
    process.env.AGENT_FAULT_AFTER_SIDE_EFFECT = "";
    throw new Error(`simulated crash after ${tool}`);
  }
}
