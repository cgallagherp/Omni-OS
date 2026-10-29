"use server";
// People's side of the agentic layer: replying to an agent's follow-up, deciding a
// proposal, asking an agent to investigate, closing a case and configuring agents.
// Every write runs in the user's own session (RLS); the database additionally checks
// that only the configured approver decides a proposal and that configuration never
// exceeds the category caps.
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { AGENTS, CATEGORIES, type AgentKey, type Category } from "@/lib/agents/registry";
import { encryptSecret } from "@/lib/agents/connectors/secrets";
import { revalidateCompany, updateScoped } from "./common";
import { ActionError, dbError, formObject, run, zDate, zOptional, type ActionResult } from "./result";

const agentKey = z.enum(["ceo", "commercial", "ma", "execution"]);

/** The recipient replies to an agent's follow-up. "Done" also marks their action done. */
export async function respondToAgent(companyId: string, messageId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "read");
    const d = z
      .object({ kind: z.enum(["done", "new_date", "blocked", "update"]), date: zDate, text: zOptional(1000) })
      .superRefine((v, c) => {
        if (v.kind === "new_date" && !v.date) c.addIssue({ code: "custom", path: ["date"], message: "Give the new completion date" });
        if (v.kind === "blocked" && !v.text) c.addIssue({ code: "custom", path: ["text"], message: "Say what is blocking it" });
        if (v.kind === "update" && !v.text) c.addIssue({ code: "custom", path: ["text"], message: "Add a short update" });
      })
      .parse(formObject(fd));
    const { data: msg, error } = await ctx.supabase.from("agent_messages").select("*").eq("company_id", companyId).eq("id", messageId).maybeSingle();
    dbError(error);
    if (!msg || msg.to_user_id !== ctx.viewer.id) throw new ActionError("This request is not addressed to you.");
    if (d.kind === "new_date" && d.date! <= new Date().toISOString().slice(0, 10)) throw new ActionError("The new date must be in the future.");
    const { error: e2 } = await ctx.supabase
      .from("agent_messages")
      .update({ response_kind: d.kind, response_text: d.text, response_date: d.date, responded_at: new Date().toISOString(), read_at: msg.read_at ?? new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", messageId);
    dbError(e2);
    const actionId = (msg.context as { action_id?: string })?.action_id;
    if (d.kind === "done" && actionId) {
      if (!ctx.can.write) throw new ActionError("Your reply was recorded, but you cannot mark the action done; its owner or the CEO can.");
      await updateScoped(ctx, "actions", actionId, { status: "done" });
    }
    const ictx = msg.context as { integration_activity_id?: string; trigger?: string };
    if (ictx?.integration_activity_id && d.kind === "done" && !actionId) {
      // a reply to the M&A Integration Agent updates the plan: done, or criteria verified
      if (!ctx.can.write) throw new ActionError("Your reply was recorded, but only the integration team can update the plan.");
      const patch = ictx.trigger === "evidence" ? { criteria_met: true, evidence_note: d.text ?? "Verified in reply to the M&A Integration Agent" } : { status: "done", evidence_note: d.text ?? null };
      const { error: e3 } = await ctx.supabase.from("integration_activities").update(patch as never).eq("company_id", companyId).eq("id", ictx.integration_activity_id);
      dbError(e3);
    } else if (ictx?.integration_activity_id && d.text) {
      const patch = d.kind === "blocked" && ctx.can.write ? { status: "blocked", blocked_reason: d.text, evidence_note: `Blocked: ${d.text}` } : { evidence_note: d.text };
      await ctx.supabase.from("integration_activities").update(patch as never).eq("company_id", companyId).eq("id", ictx.integration_activity_id);
    }
    if (actionId && d.text) {
      await ctx.supabase.from("comments").insert({ company_id: companyId, entity_type: "action", entity_id: actionId, kind: "update", body: `Reply to the Execution Agent: ${d.text}`, author_id: ctx.viewer.id });
    }
    revalidateCompany(ctx);
    return { ok: true, message: d.kind === "done" ? "Marked done — thank you" : d.kind === "new_date" ? "New date sent for approval" : "Reply recorded" };
  });
}

export async function markAgentMessageRead(companyId: string, messageId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "read");
    await ctx.supabase.from("agent_messages").update({ read_at: new Date().toISOString() }).eq("company_id", companyId).eq("id", messageId).eq("to_user_id", ctx.viewer.id).is("read_at", null);
  });
}

/** Approve, reject or request changes to one specific proposal. */
export async function decideApproval(companyId: string, approvalId: string, decision: "approved" | "rejected" | "changes_requested", note?: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "read");
    const d = z.object({ decision: z.enum(["approved", "rejected", "changes_requested"]), note: z.string().trim().max(1000).optional() }).parse({ decision, note: note || undefined });
    if (d.decision !== "approved" && !d.note) throw new ActionError("Add a short note so the agent and the team know why.");
    const { data, error } = await ctx.supabase
      .from("agent_approvals")
      .update({ status: d.decision, decision_note: d.note ?? null })
      .eq("company_id", companyId)
      .eq("id", approvalId)
      .eq("status", "pending")
      .select("id, investigation_id, title");
    dbError(error);
    if (!data?.length) throw new ActionError("This proposal has already been decided or withdrawn.");
    await ctx.supabase.from("agent_events").insert({
      company_id: companyId, investigation_id: data[0].investigation_id, kind: "approval", actor_id: ctx.viewer.id,
      summary: `${ctx.viewer.fullName} ${d.decision === "approved" ? "approved" : d.decision === "rejected" ? "rejected" : "requested changes to"}: ${data[0].title}${d.note ? ` — "${d.note}"` : ""}`,
      data: { approval_id: approvalId, decision: d.decision },
    });
    revalidateCompany(ctx);
    return { ok: true, message: d.decision === "approved" ? "Approved — the agent will carry it out and record the result" : d.decision === "rejected" ? "Rejected" : "Changes requested" };
  });
}

/** Ask an agent to start a specific investigation now. */
export async function requestInvestigation(companyId: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const d = z
      .object({ agent: agentKey, workflow: z.string(), subject_type: z.enum(["action", "metric", "thesis", "pipeline", "integration_activity", "synergy", "acquisition"]), subject_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)), note: zOptional(500) })
      .parse(formObject(fd));
    const { WORKFLOW_SUBJECTS } = await import("@/lib/agents/manual");
    const spec = WORKFLOW_SUBJECTS[d.workflow];
    if (!spec || spec.agent !== d.agent || spec.subject !== d.subject_type) throw new ActionError("That agent cannot run that investigation.");
    const { data: cfg } = await ctx.supabase.from("agent_configs").select("enabled").eq("company_id", companyId).eq("agent_key", d.agent).maybeSingle();
    if (!cfg?.enabled) throw new ActionError(`${AGENTS[d.agent].name} is switched off. An administrator can enable it in Agents → Configuration.`);
    const subjectId = d.subject_id;
    if (spec.subject !== "pipeline" && !subjectId) throw new ActionError("Choose what to investigate.");
    const { title, dedupeKey, trigger: extra } = await spec.describe(ctx.supabase, companyId, subjectId, new Date());
    const { data: live } = await ctx.supabase.from("agent_investigations").select("id").eq("company_id", companyId).eq("dedupe_key", dedupeKey).not("status", "in", "(resolved,closed,failed)").maybeSingle();
    if (live) return { ok: true, message: "Already under investigation", data: { id: live.id } };
    const { data: inv, error } = await ctx.supabase
      .from("agent_investigations")
      .insert({ company_id: companyId, agent_key: d.agent, workflow: d.workflow, title, dedupe_key: dedupeKey, subject_type: spec.subject, subject_id: subjectId ?? null, requested_by: ctx.viewer.id, trigger: { ...(extra ?? {}), type: "manual", summary: `Requested by ${ctx.viewer.fullName}${d.note ? `: ${d.note}` : ""}`, by: ctx.viewer.id } as never })
      .select("id")
      .single();
    dbError(error);
    await ctx.supabase.from("agent_events").insert({ company_id: companyId, investigation_id: inv!.id, agent_key: d.agent, kind: "trigger", actor_id: ctx.viewer.id, summary: `Requested by ${ctx.viewer.fullName}${d.note ? `: ${d.note}` : ""}` });
    const { error: re } = await ctx.supabase.from("agent_runs").insert({ company_id: companyId, investigation_id: inv!.id, agent_key: d.agent, workflow: d.workflow });
    dbError(re);
    revalidateCompany(ctx);
    return { ok: true, message: `${AGENTS[d.agent].name} will start shortly`, data: { id: inv!.id } };
  });
}

/** Management closes a case; the agent stops working on it. */
export async function closeInvestigation(companyId: string, id: string, note: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const n = z.string().trim().min(3, "Say why it is being closed").max(500).parse(note);
    const { data, error } = await ctx.supabase
      .from("agent_investigations")
      .update({ status: "closed", closed_by: ctx.viewer.id, close_note: n, resolved_at: new Date().toISOString(), next_review_at: null })
      .eq("company_id", companyId)
      .eq("id", id)
      .not("status", "in", "(resolved,closed,failed)")
      .select("id");
    dbError(error);
    if (!data?.length) throw new ActionError("This investigation is already finished.");
    await ctx.supabase.from("agent_approvals").update({ status: "withdrawn" }).eq("company_id", companyId).eq("investigation_id", id).eq("status", "pending");
    await ctx.supabase.from("agent_events").insert({ company_id: companyId, investigation_id: id, kind: "note", actor_id: ctx.viewer.id, summary: `Closed by ${ctx.viewer.fullName}: ${n}` });
    revalidateCompany(ctx);
    return { ok: true, message: "Investigation closed" };
  });
}

const modeEnum = z.enum(["off", "approval", "auto"]);
const approverEnum = z.enum(["ceo", "company_admin", "leadership", "omni"]);

/** Administrators configure an agent. The database rejects anything above a category's cap. */
export async function saveAgentConfig(companyId: string, agent: AgentKey, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const key = agentKey.parse(agent);
    const def = AGENTS[key];
    const o = formObject(fd);
    const modes: Partial<Record<Category, string>> = {};
    const approvers: Partial<Record<Category, string>> = {};
    for (const c of def.categories) {
      if (o[`mode_${c}`]) {
        const m = modeEnum.parse(o[`mode_${c}`]);
        const cap = CATEGORIES[c].cap;
        if ((cap === "approval" && m === "auto") || (cap === "off" && m !== "off")) throw new ActionError(`${CATEGORIES[c].label} can be at most "${cap}".`);
        modes[c] = m;
      }
      if (o[`approver_${c}`]) approvers[c] = approverEnum.parse(o[`approver_${c}`]);
    }
    const num = (k: string, min: number, max: number) => z.coerce.number().int().min(min).max(max).parse(o[k]);
    const schedules = Object.fromEntries(def.schedules.map((s) => [s.key, { enabled: o[`schedule_${s.key}`] === "on" }]));
    const allowed = fd.getAll("connection").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v));
    const patch = {
      enabled: o.enabled === "on",
      category_modes: modes,
      approvers,
      schedules,
      escalation: {
        reminder_after_days: num("reminder_after_days", 1, 14),
        max_reminders: num("max_reminders", 0, 5),
        escalate_after_days: num("escalate_after_days", 1, 60),
        escalate_to: z.enum(["manager", "ceo"]).parse(o.escalate_to),
      },
      limits: {
        max_runs_per_day: num("max_runs_per_day", 1, 500),
        max_actions_per_day: num("max_actions_per_day", 0, 200),
        max_messages_per_day: num("max_messages_per_day", 0, 200),
        monthly_ai_budget_gbp: num("monthly_ai_budget_gbp", 0, 10000),
      },
      notifications: { approvals: z.enum(["in_app", "in_app_and_email"]).parse(o.notify_approvals ?? "in_app"), escalations: z.enum(["in_app", "in_app_and_email"]).parse(o.notify_escalations ?? "in_app") },
      allowed_connections: allowed,
      instructions: z.string().max(2000).parse(o.instructions ?? ""),
      allow_external_ai: o.allow_external_ai === "on",
    };
    const { data: before } = await ctx.supabase.from("agent_configs").select("*").eq("company_id", companyId).eq("agent_key", key).maybeSingle();
    const { error } = await ctx.supabase.from("agent_configs").upsert({ company_id: companyId, agent_key: key, ...patch }, { onConflict: "company_id,agent_key" });
    dbError(error);
    const changed = Object.keys(patch).filter((k) => JSON.stringify((before as Record<string, unknown> | null)?.[k]) !== JSON.stringify((patch as Record<string, unknown>)[k]));
    await ctx.supabase.from("agent_events").insert({ company_id: companyId, agent_key: key, kind: "config", actor_id: ctx.viewer.id, summary: `${ctx.viewer.fullName} changed the ${def.name} configuration${changed.length ? `: ${changed.join(", ").replace(/_/g, " ")}` : ""}`, data: { changed, before: before ?? null, after: patch } as never });
    revalidateCompany(ctx);
    return { ok: true, message: `${def.name} configuration saved` };
  });
}

const PROVIDERS = {
  email_resend: { name: "Email (Resend)", secret: "API key", live: true },
  microsoft_outlook: { name: "Microsoft Outlook", secret: "OAuth access token (from your Entra app registration)", live: true },
  microsoft_teams: { name: "Microsoft Teams", secret: "OAuth access token", live: true },
  hubspot: { name: "HubSpot CRM", secret: "Private app access token", live: true },
  salesforce: { name: "Salesforce", secret: "OAuth access token", live: true },
  companies_house: { name: "Companies House", secret: "API key", live: true },
  sharepoint: { name: "SharePoint", secret: "Microsoft Graph access token (read-only)", live: true },
  onedrive: { name: "OneDrive", secret: "Microsoft Graph access token (read-only)", live: true },
  google_drive: { name: "Google Drive", secret: "Google Drive access token (drive.readonly)", live: true },
  crm_sandbox: { name: "Sandbox CRM (fictional data)", secret: null, live: false },
  ma_sandbox: { name: "Sandbox market-intelligence dataset (fictional)", secret: null, live: false },
} as const;

/** Add or update a connection. Credentials are encrypted before they reach the database and cannot be read back. */
export async function saveConnection(companyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const o = formObject(fd);
    const provider = z.enum(Object.keys(PROVIDERS) as [keyof typeof PROVIDERS, ...Array<keyof typeof PROVIDERS>]).parse(o.provider);
    const meta = PROVIDERS[provider];
    const mode = meta.live ? z.enum(["sandbox", "live"]).parse(o.mode ?? "sandbox") : "sandbox";
    const secret = (o.secret ?? "").trim();
    const config: Record<string, string> = {};
    if (provider === "email_resend") config.from = z.string().trim().email("A verified sender address is required").parse(o.from);
    if (provider === "sharepoint") config.site_id = z.string().trim().min(3, "The SharePoint site ID is required").max(300).parse(o.site_id);
    const status = meta.secret && !secret ? "needs_authorisation" : "connected";
    const { data: existing } = await ctx.supabase.from("integration_connections").select("id, status").eq("company_id", companyId).eq("provider", provider).maybeSingle();
    let id = existing?.id;
    if (existing) {
      const { error } = await ctx.supabase.from("integration_connections").update({ mode, config, ...(secret || !meta.secret ? { status } : {}), connected_by: ctx.viewer.id }).eq("id", existing.id).eq("company_id", companyId);
      dbError(error);
    } else {
      const { data, error } = await ctx.supabase.from("integration_connections").insert({ company_id: companyId, provider, display_name: meta.name, mode, status, config, connected_by: ctx.viewer.id }).select("id").single();
      dbError(error);
      id = data!.id;
    }
    if (secret) {
      const ciphertext = encryptSecret(secret);
      const { error } = await ctx.supabase.from("integration_secrets").upsert({ company_id: companyId, connection_id: id!, ciphertext, updated_at: new Date().toISOString() }, { onConflict: "connection_id" });
      dbError(error);
    }
    await ctx.supabase.from("agent_events").insert({ company_id: companyId, kind: "config", actor_id: ctx.viewer.id, summary: `${ctx.viewer.fullName} ${existing ? "updated" : "added"} the ${meta.name} connection (${mode}${secret ? ", credentials updated" : ""})` });
    revalidateCompany(ctx);
    return { ok: true, message: status === "needs_authorisation" ? `${meta.name} added — add credentials to activate it` : `${meta.name} connected (${mode})` };
  });
}

export async function disconnectConnection(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { data, error } = await ctx.supabase.from("integration_connections").update({ status: "disconnected" }).eq("company_id", companyId).eq("id", id).select("display_name");
    dbError(error);
    if (!data?.length) throw new ActionError("Connection not found");
    await ctx.supabase.from("integration_secrets").delete().eq("company_id", companyId).eq("connection_id", id);
    await ctx.supabase.from("agent_events").insert({ company_id: companyId, kind: "config", actor_id: ctx.viewer.id, summary: `${ctx.viewer.fullName} disconnected ${data[0].display_name}` });
    revalidateCompany(ctx);
    return { ok: true, message: "Disconnected" };
  });
}

export async function approveThesis(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { data, error } = await ctx.supabase.from("ma_theses").update({ status: "approved", approved_by: ctx.viewer.id, approved_at: new Date().toISOString() }).eq("company_id", companyId).eq("id", id).select("id");
    dbError(error);
    if (!data?.length) throw new ActionError("Thesis not found");
    revalidateCompany(ctx);
    return { ok: true, message: "Acquisition thesis approved" };
  });
}

export async function setTargetStage(companyId: string, id: string, stage: string, reason?: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const s = z.enum(["identified", "researching", "shortlisted", "approach_prepared", "approached", "in_discussion", "diligence", "rejected", "closed"]).parse(stage);
    if (s === "rejected" && !reason) throw new ActionError("Give a reason so the agent does not propose it again.");
    await updateScoped(ctx, "ma_targets", id, { stage: s, rejection_reason: s === "rejected" ? reason! : null, last_activity_at: new Date().toISOString() });
    revalidateCompany(ctx);
    return { ok: true, message: "Pipeline updated" };
  });
}

export async function completeCrmTask(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const { data: task } = await ctx.supabase.from("crm_sandbox_tasks").select("opportunity_id").eq("company_id", companyId).eq("id", id).maybeSingle();
    await updateScoped(ctx, "crm_sandbox_tasks", id, { status: "completed", completed_at: new Date().toISOString() });
    if (task?.opportunity_id) await ctx.supabase.from("crm_sandbox_opportunities").update({ last_activity_on: new Date().toISOString().slice(0, 10) }).eq("company_id", companyId).eq("id", task.opportunity_id);
    revalidateCompany(ctx);
    return { ok: true, message: "Task completed" };
  });
}

