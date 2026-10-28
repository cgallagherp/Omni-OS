// Mission Control tools. Reads run under the agent principal (RLS); writes go through
// the authority-checked database functions — never direct table updates.
import { z } from "zod";
import { defineTool, ToolError, type Runtime } from "../runtime";
import type { SourceRef } from "../registry";
import { deliverExternally } from "../connectors/channels";

const uuid = z.string().uuid();

export const ref = {
  action: (id: string, label: string): SourceRef => ({ type: "action", id, label, path: `/execution?view=actions&highlight=${id}` }),
  priority: (id: string, label: string): SourceRef => ({ type: "quarterly_priority", id, label, path: `/flight-plan/quarterly_priority/${id}` }),
  issue: (id: string, label: string): SourceRef => ({ type: "issue", id, label, path: `/execution/issue/${id}` }),
  metric: (id: string, label: string): SourceRef => ({ type: "metric", id, label, path: `/scoreboard/${id}` }),
  goal: (id: string, label: string): SourceRef => ({ type: "annual_goal", id, label, path: `/flight-plan/annual_goal/${id}` }),
  move: (id: string, label: string): SourceRef => ({ type: "winning_move", id, label, path: `/flight-plan/winning_move/${id}` }),
  meeting: (id: string, label: string): SourceRef => ({ type: "meeting", id, label, path: `/meetings/${id}` }),
  decision: (id: string, label: string): SourceRef => ({ type: "decision", id, label, path: `/execution?view=decisions` }),
  northStar: (id: string): SourceRef => ({ type: "north_star", id, label: "North Star", path: `/north-star` }),
};

export type ActionContext = Awaited<ReturnType<typeof readActionContext>>;

async function readActionContext(rt: Runtime, actionId: string) {
  const db = rt.db;
  const cid = rt.companyId;
  const { data: action, error: ae } = await db.from("actions").select("*").eq("company_id", cid).eq("id", actionId).maybeSingle();
  if (ae) throw new ToolError(`action: ${ae.message}`, true);
  if (!action) throw new ToolError("action: not found (it may have been deleted)");
  const { data: crewRows, error: ce } = await db.from("crew_members").select("id, full_name, title, user_id, reports_to, is_open_seat, seat").eq("company_id", cid);
  if (ce) throw new ToolError(`crew: ${ce.message}`, true);
  const crew = crewRows ?? [];
  const owner = crew.find((c) => c.id === action.owner_id) ?? null;
  const manager = owner?.reports_to ? (crew.find((c) => c.id === owner.reports_to) ?? null) : null;
  const ceo = crew.find((c) => !c.reports_to && !c.is_open_seat) ?? null;
  const [priority, issue, metric, decision, meeting, comments, audit] = await Promise.all([
    action.quarterly_priority_id ? db.from("quarterly_priorities").select("id, title, status, due_date, owner_id, annual_goal_id").eq("id", action.quarterly_priority_id).maybeSingle() : null,
    action.issue_id ? db.from("issues").select("id, title, status, priority").eq("id", action.issue_id).maybeSingle() : null,
    action.metric_id ? db.from("metrics").select("id, name").eq("id", action.metric_id).maybeSingle() : null,
    action.decision_id ? db.from("decisions").select("id, title, decided_on").eq("id", action.decision_id).maybeSingle() : null,
    action.meeting_id ? db.from("meetings").select("id, title, scheduled_at").eq("id", action.meeting_id).maybeSingle() : null,
    db.from("comments").select("id, body, kind, created_at, author_id").eq("company_id", cid).eq("entity_type", "action").eq("entity_id", actionId).order("created_at", { ascending: false }).limit(10),
    db.from("audit_log").select("action, changes, created_at, actor_id").eq("company_id", cid).eq("entity_type", "actions").eq("entity_id", actionId).order("created_at", { ascending: false }).limit(10),
  ]);
  const siblings = action.quarterly_priority_id
    ? ((await db.from("actions").select("id, title, status, due_date, owner_id").eq("company_id", cid).eq("quarterly_priority_id", action.quarterly_priority_id).neq("id", actionId)).data ?? [])
    : [];
  return {
    action,
    owner,
    manager,
    ceo,
    crew,
    priority: priority?.data ?? null,
    issue: issue?.data ?? null,
    metric: metric?.data ?? null,
    decision: decision?.data ?? null,
    meeting: meeting?.data ?? null,
    comments: comments.data ?? [],
    audit: audit.data ?? [],
    siblings,
  };
}

export const readAction = defineTool({
  name: "mission_control.read_action",
  description: "Read an action with its owner, linked priority/issue/KPI/decision/meeting, recent updates and change history.",
  sideEffect: "read",
  input: z.object({ actionId: uuid }),
  run: (rt, i: { actionId: string }) => readActionContext(rt, i.actionId),
  summarise: (_i, o) => `read "${o.action.title}" (${o.comments.length} updates, ${o.audit.length} changes)`,
});

export const readDependencies = defineTool({
  name: "mission_control.read_dependencies",
  description: "Dependencies recorded against an action or priority, in both directions.",
  sideEffect: "read",
  input: z.object({ ids: z.array(uuid).max(20) }),
  run: async (rt, i: { ids: string[] }) => {
    if (!i.ids.length) return [];
    const list = i.ids.join(",");
    const { data, error } = await rt.db.from("dependencies").select("*").eq("company_id", rt.companyId).or(`from_id.in.(${list}),to_id.in.(${list})`);
    if (error) throw new ToolError(error.message, true);
    return data ?? [];
  },
  summarise: (_i, o) => `${o.length} dependenc${o.length === 1 ? "y" : "ies"}`,
});

export const sendMessage = defineTool({
  name: "inbox.send_message",
  description: "Send an internal message to a crew member's Omni OS inbox (and their connected channel where configured). Authority is enforced by the database.",
  sideEffect: "internal",
  input: z.object({
    key: z.string().min(8),
    kind: z.enum(["followup", "reminder", "escalation", "notice"]),
    toCrewId: uuid,
    subject: z.string().min(3).max(200),
    body: z.string().min(10).max(3000),
    context: z.record(z.string(), z.unknown()).default({}),
    approvalId: uuid.optional(),
  }),
  run: async (rt, i: { key: string; kind: "followup" | "reminder" | "escalation" | "notice"; toCrewId: string; subject: string; body: string; context: Record<string, unknown>; approvalId?: string }) => {
    const { data: crew } = await rt.db.from("crew_members").select("id, full_name, user_id, email").eq("company_id", rt.companyId).eq("id", i.toCrewId).maybeSingle();
    if (!crew) throw new ToolError("Recipient not found in this company");
    if (!crew.user_id) throw new ToolError(`${crew.full_name} has no Omni OS login, so there is no internal channel to reach them`);
    await rt.checkLimit("messages");
    const key = `msg:${rt.inv.id}:${i.key}`;
    const lookup = async () => {
      const { data } = await rt.db.from("agent_messages").select("id, delivery_status").eq("company_id", rt.companyId).eq("idempotency_key", key).maybeSingle();
      return data ? { id: data.id, delivery_status: data.delivery_status, recovered: true } : null;
    };
    return rt.once(key, "inbox.send_message", async () => {
      const external = await deliverExternally(rt, { to: crew, subject: i.subject, body: i.body, idempotencyKey: key });
      const { data, error } = await rt.db
        .from("agent_messages")
        .insert({
          company_id: rt.companyId,
          investigation_id: rt.inv.id,
          agent_key: rt.agent,
          approval_id: i.approvalId ?? null,
          kind: i.kind,
          to_crew_id: crew.id,
          to_user_id: crew.user_id,
          channel: external.channel,
          subject: i.subject,
          body: i.body,
          context: i.context as never,
          delivery_status: external.status,
          delivery_detail: external.detail,
          idempotency_key: key,
        })
        .select("id, delivery_status")
        .single();
      if (error) {
        if (error.code === "42501") throw new ToolError(`Not authorised: ${error.message}`);
        if (error.code === "23505") return (await lookup())!;
        throw new ToolError(error.message, true);
      }
      await rt.bumpUsage("messages");
      return { id: data.id, delivery_status: data.delivery_status, recovered: false };
    }, lookup);
  },
  summarise: (i, o) => `${i.kind} to recipient (${o.delivery_status}${o.recovered ? ", recovered" : ""})`,
});

export const applyApproval = defineTool({
  name: "mission_control.apply_approval",
  description: "Execute one approved proposal. The database re-checks approval, approver and preconditions immediately before executing.",
  sideEffect: "internal",
  input: z.object({ approvalId: uuid }),
  run: async (rt, i: { approvalId: string }) => {
    const { data, error } = await rt.db.rpc("agent_apply_approval", { p_approval: i.approvalId });
    if (error) throw new ToolError(error.message, error.code !== "42501");
    return (data ?? {}) as { stale?: boolean; action_id?: string; issue_id?: string; authorised?: boolean };
  },
  summarise: (_i, o) => (o.stale ? "proposal no longer valid — circumstances changed" : "executed"),
});

export const markExecuted = defineTool({
  name: "mission_control.mark_executed",
  description: "Record that an authorised proposal was carried out.",
  sideEffect: "internal",
  input: z.object({ approvalId: uuid, result: z.record(z.string(), z.unknown()) }),
  run: async (rt, i: { approvalId: string; result: Record<string, unknown> }) => {
    const { error } = await rt.db.rpc("agent_mark_executed", { p_approval: i.approvalId, p_result: i.result as never });
    if (error) throw new ToolError(error.message);
    return true;
  },
});

export const createAction = defineTool({
  name: "mission_control.create_action",
  description: "Create an internal Mission Control action (Level 4 when enabled, otherwise only with an approved proposal).",
  sideEffect: "internal",
  input: z.object({ key: z.string(), title: z.string().min(3).max(300), description: z.string().max(2000).optional(), ownerId: uuid, due: z.string(), priorityId: uuid.optional(), metricId: uuid.optional(), approvalId: uuid.optional() }),
  run: async (rt, i: { key: string; title: string; description?: string; ownerId: string; due: string; priorityId?: string; metricId?: string; approvalId?: string }) => {
    await rt.checkLimit("actions");
    const key = `action:${rt.inv.id}:${i.key}`;
    return rt.once(key, "mission_control.create_action", async () => {
      const { data, error } = await rt.db.rpc("agent_create_action", {
        p_company: rt.companyId, p_agent: rt.agent, p_title: i.title, p_description: i.description ?? "", p_owner: i.ownerId, p_due: i.due,
        p_priority: i.priorityId ?? undefined, p_metric: i.metricId ?? undefined, p_approval: i.approvalId ?? undefined,
      });
      if (error) throw new ToolError(error.message, error.code !== "42501");
      await rt.bumpUsage("actions");
      return { actionId: data as string };
    });
  },
  summarise: (i) => `created "${i.title}"`,
});

export const MISSION_CONTROL_TOOLS = [readAction, readDependencies, sendMessage, applyApproval, markExecuted, createAction];
