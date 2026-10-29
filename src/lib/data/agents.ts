import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import { ACTIVE_STATUSES, AGENT_KEYS, type AgentConfig, type AgentKey } from "@/lib/agents/registry";

export async function loadAgentOverview(supabase: Supabase, cid: string) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [configs, investigations, approvals, events, connections, runs, messages] = await Promise.all([
    supabase.from("agent_configs").select("*").eq("company_id", cid),
    supabase.from("agent_investigations").select("*").eq("company_id", cid).order("updated_at", { ascending: false }).limit(300),
    supabase.from("agent_approvals").select("*").eq("company_id", cid).order("created_at", { ascending: false }).limit(200),
    supabase.from("agent_events").select("*").eq("company_id", cid).gte("created_at", since).order("id", { ascending: false }).limit(200),
    supabase.from("integration_connections").select("*").eq("company_id", cid).order("created_at"),
    supabase.from("agent_runs").select("id, investigation_id, agent_key, status, step, wait_reason, run_after, last_error, attempts, updated_at").eq("company_id", cid).in("status", ["queued", "running", "waiting", "failed"]),
    supabase.from("agent_messages").select("id, agent_key, kind, created_at, responded_at, response_kind, to_crew_id, investigation_id").eq("company_id", cid).gte("created_at", since),
  ]);
  const cfg = new Map((configs.data ?? []).map((c) => [c.agent_key as AgentKey, c as unknown as AgentConfig & { updated_at: string }]));
  const inv = investigations.data ?? [];
  const per = (k: AgentKey) => {
    const mine = inv.filter((i) => i.agent_key === k);
    const active = mine.filter((i) => ACTIVE_STATUSES.includes(i.status as never));
    const done = mine.filter((i) => i.status === "resolved");
    const ev = (events.data ?? []).filter((e) => e.agent_key === k);
    const pending = (approvals.data ?? []).filter((a) => a.agent_key === k && a.status === "pending");
    const failed = mine.filter((i) => i.status === "failed");
    const blockedRuns = (runs.data ?? []).filter((r) => r.agent_key === k && (r.status === "failed" || (r.attempts > 1 && r.last_error)));
    return { config: cfg.get(k) ?? null, all: mine, active, done, pending, failed, blockedRuns, lastEvent: ev[0] ?? null, events: ev };
  };
  return {
    now: Date.now(),
    configs: cfg,
    investigations: inv,
    approvals: approvals.data ?? [],
    events: events.data ?? [],
    connections: connections.data ?? [],
    runs: runs.data ?? [],
    messages: messages.data ?? [],
    byAgent: Object.fromEntries(AGENT_KEYS.map((k) => [k, per(k)])) as Record<AgentKey, ReturnType<typeof per>>,
  };
}

/** Outcome measures per agent — work completed and observed results, not message counts. */
export function agentOutcomes(o: Awaited<ReturnType<typeof loadAgentOverview>>, k: AgentKey) {
  const a = o.byAgent[k];
  const msgs = o.messages.filter((m) => m.agent_key === k);
  const executed = o.approvals.filter((x) => x.agent_key === k && x.status === "executed").length;
  const responded = msgs.filter((m) => m.responded_at).length;
  const outcome = (i: (typeof a.all)[number]) => (i.outcome ?? {}) as Record<string, unknown>;
  switch (k) {
    case "execution":
      return [
        { label: "Commitments followed up", value: new Set(msgs.map((m) => m.investigation_id)).size },
        { label: "Replies received", value: responded },
        { label: "Overdue actions resolved", value: a.done.filter((i) => outcome(i).final_status === "done").length },
        { label: "Escalations", value: msgs.filter((m) => m.kind === "escalation").length },
      ];
    case "ceo":
      return [
        { label: "Strategic investigations", value: a.all.length },
        { label: "Specialist investigations commissioned", value: o.investigations.filter((i) => i.parent_id && a.all.some((p) => p.id === i.parent_id)).length },
        { label: "Interventions approved", value: executed },
        { label: "KPIs recovered", value: a.done.filter((i) => outcome(i).recovered === true).length },
      ];
    case "commercial":
      return [
        { label: "Pipeline reviews", value: a.all.length },
        { label: "Opportunities flagged", value: a.all.reduce((n, i) => n + Number((i.baseline as Record<string, unknown>)?.flagged ?? 0), 0) },
        { label: "Approved actions executed", value: executed },
        { label: "Follow-ups completed", value: a.all.reduce((n, i) => n + Number(outcome(i).tasks_completed ?? 0), 0) },
      ];
    case "ma":
      return [
        { label: "Market scans", value: a.all.length },
        { label: "Qualified targets added", value: a.all.reduce((n, i) => n + Number(outcome(i).targets_added ?? (i.baseline as Record<string, unknown>)?.targets_added ?? 0), 0) },
        { label: "Approaches prepared", value: o.approvals.filter((x) => x.agent_key === "ma" && x.action_type === "send_external_message").length },
        { label: "Approaches approved", value: o.approvals.filter((x) => x.agent_key === "ma" && x.action_type === "send_external_message" && (x.status === "approved" || x.status === "executed")).length },
      ];
    case "integration":
      return [
        { label: "Drafts generated", value: a.all.filter((i) => i.workflow.startsWith("integration.generate") || i.workflow === "integration.review").length },
        { label: "Follow-ups sent", value: msgs.filter((m) => m.kind !== "escalation").length },
        { label: "Escalations agreed", value: executed },
        { label: "Issues resolved", value: a.done.filter((i) => outcome(i).resolved === true).length },
      ];
  }
}

/**
 * Agent work attached to Mission Control records, for the pages people already use.
 * Visible to leadership only (RLS); everyone else gets an empty result.
 */
export async function loadAgentWork(supabase: Supabase, cid: string, opts: { since?: string } = {}) {
  const since = opts.since ?? new Date(Date.now() - 14 * 86400000).toISOString();
  const [inv, aps] = await Promise.all([
    supabase.from("agent_investigations").select("id, agent_key, workflow, title, status, severity, summary, subject_type, subject_id, outcome, next_review_at, resolved_at, updated_at, opened_at").eq("company_id", cid).or(`status.in.(${ACTIVE_STATUSES.join(",")}),updated_at.gte.${since}`).order("updated_at", { ascending: false }).limit(200),
    supabase.from("agent_approvals").select("id, agent_key, title, investigation_id, created_at").eq("company_id", cid).eq("status", "pending").order("created_at", { ascending: false }),
  ]);
  const all = inv.data ?? [];
  const active = all.filter((i) => ACTIVE_STATUSES.includes(i.status as never));
  const bySubject = new Map<string, typeof active>();
  for (const i of active) if (i.subject_id) bySubject.set(i.subject_id, [...(bySubject.get(i.subject_id) ?? []), i]);
  return { all, active, recentlyResolved: all.filter((i) => i.status === "resolved" && i.updated_at >= since), pending: aps.data ?? [], bySubject };
}
export type AgentWork = Awaited<ReturnType<typeof loadAgentWork>>;
