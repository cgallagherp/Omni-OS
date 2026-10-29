"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { insertScoped, revalidateCompany } from "./common";
import { ActionError, dbError, formObject, run, zDate, zOptional, zRequired, zUuid, type ActionResult } from "./result";

const zHref = z.string().max(2000).regex(/^\/c\/[a-z0-9-]+\/(revenue|cost)(\/[A-Za-z0-9_-]+)*(\?[^\s<>"]*)?$/, "Invalid link");

const refSchema = z.object({
  module: z.enum(["revenue", "cost"]),
  exception_key: z.string().max(200).optional(),
  metric_key: z.string().min(1).max(80),
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(300),
  href: zHref,
  values: z.object({ actual: z.number().nullable(), comparison: z.number().nullable(), unit: z.string().max(30) }).optional(),
  filters: z.record(z.string(), z.array(z.string().max(100)).max(50)).optional(),
  customer_id: z.string().uuid().optional(),
});

/**
 * Raise a Mission Control issue (and, optionally, an agreed corrective action) from an
 * analytical exception. The record keeps a link back to the governed figure that raised it.
 */
export async function raiseAnalyticsIssue(companyId: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = z.object({
      title: zRequired("Title"), description: zOptional(), priority: z.enum(["critical", "high", "medium", "low"]), owner_id: zUuid,
      metric_id: z.string().optional().transform((v) => (v ? v : null)),
      action_title: zOptional(300), action_owner_id: z.string().optional().transform((v) => (v ? v : null)), action_due: zDate,
      ref: z.string().transform((s, c) => { try { return refSchema.parse(JSON.parse(s)); } catch { c.addIssue({ code: "custom", message: "Invalid reference" }); return z.NEVER; } }),
    }).parse(formObject(fd));
    if (!data.ref.href.startsWith(`/c/${ctx.company.slug}/`)) throw new ActionError("That link belongs to another company.");
    const issueId = await insertScoped(ctx, "issues", {
      title: data.title, description: data.description, priority: data.priority, status: "open", owner_id: data.owner_id, metric_id: data.metric_id, analytics_ref: data.ref as never,
    });
    if (data.action_title) {
      if (!data.action_owner_id) throw new ActionError("Choose an owner for the corrective action.");
      await insertScoped(ctx, "actions", {
        title: data.action_title, owner_id: data.action_owner_id, due_date: data.action_due, status: "open", issue_id: issueId, metric_id: data.metric_id, analytics_ref: data.ref as never, created_by: ctx.viewer.id,
      });
    }
    revalidateCompany(ctx);
    return { ok: true, message: data.action_title ? "Issue and corrective action added to Mission Control" : "Issue added to Mission Control", data: { id: issueId } };
  });
}

export async function saveView(companyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "read");
    const d = z.object({ name: zRequired("Name", 80), module: z.enum(["revenue", "cost"]), path: z.string().regex(/^\/c\/[a-z0-9-]+\/(revenue|cost)(\/[a-z-]+)*$/), params: z.string().max(2000).default(""), shared: z.string().optional().transform((v) => v === "on") }).parse(formObject(fd));
    if (!d.path.startsWith(`/c/${ctx.company.slug}/`)) throw new ActionError("Invalid view.");
    const { error } = await ctx.supabase.from("an_saved_views").insert({ company_id: companyId, user_id: ctx.viewer.id, module: d.module, name: d.name, path: d.path, params: d.params, shared: d.shared });
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "View saved" };
  });
}

export async function deleteView(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "read");
    const { error } = await ctx.supabase.from("an_saved_views").delete().eq("company_id", companyId).eq("id", id).eq("user_id", ctx.viewer.id);
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "View removed" };
  });
}

const DOMAIN = z.enum(["revenue", "cost", "people", "transactions"]);
export async function setDomainGrant(companyId: string, userId: string, domain: string, granted: boolean): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const d = DOMAIN.parse(domain);
    z.string().uuid().parse(userId);
    const { error } = granted
      ? await ctx.supabase.from("an_grants").upsert({ company_id: companyId, user_id: userId, domain: d, granted_by: ctx.viewer.id }, { onConflict: "company_id,user_id,domain" })
      : await ctx.supabase.from("an_grants").delete().eq("company_id", companyId).eq("user_id", userId).eq("domain", d);
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: granted ? "Access granted" : "Access removed" };
  });
}

export async function setAgentDomains(companyId: string, agent: string, domains: string[]): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const a = z.enum(["ceo", "commercial", "execution", "ma", "integration"]).parse(agent);
    const ds = z.array(DOMAIN).max(4).parse(domains);
    const { error } = await ctx.supabase.from("agent_configs").update({ data_domains: ds }).eq("company_id", companyId).eq("agent_key", a);
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Agent data access updated" };
  });
}

/** A recorded, versioned change to a metric's governed policy (e.g. reactivation treatment). */
export async function changeMetricPolicy(companyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const d = z.object({
      key: z.enum(["grr", "nrr", "logo_retention"]),
      reactivation: z.enum(["include_in_nrr", "exclude"]),
      transfers: z.enum(["neutral", "count_as_churn"]),
      acquired_wait_months: z.coerce.number().int().min(0).max(36),
      note: zRequired("Reason", 500),
    }).parse(formObject(fd));
    const { data: cur } = await ctx.supabase.from("an_metric_definitions").select("policy").eq("company_id", companyId).eq("key", d.key).eq("status", "active").maybeSingle();
    if (!cur) throw new ActionError("Unknown metric.");
    const policy = { ...(cur.policy as Record<string, unknown>), reactivation: d.reactivation, transfers: d.transfers, acquired_wait_months: d.acquired_wait_months };
    // retention metrics share one cohort policy so GRR, NRR and logo retention stay consistent
    for (const key of ["grr", "nrr", "logo_retention"]) {
      const { error } = await ctx.supabase.rpc("an_new_definition_version", { p_company: companyId, p_key: key, p_policy: policy as never, p_definition: "", p_note: d.note });
      dbError(error);
    }
    revalidateCompany(ctx);
    return { ok: true, message: "New definition version recorded" };
  });
}

/**
 * Ask the CEO Agent to investigate an analytical exception. The exception is recomputed
 * from governed data on the server; nothing the browser sends is taken as evidence.
 */
export async function investigateException(companyId: string, key: string): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    z.string().min(3).max(200).parse(key);
    const { findException } = await import("@/lib/analytics/exception-lookup");
    const e = await findException(ctx.supabase, companyId, ctx.company.slug, key);
    if (!e) throw new ActionError("That exception is no longer present in the latest governed data.");
    const { data: cfg } = await ctx.supabase.from("agent_configs").select("enabled").eq("company_id", companyId).eq("agent_key", "ceo").maybeSingle();
    if (!cfg?.enabled) throw new ActionError("The CEO Agent is switched off. An administrator can enable it in Agents → Configuration.");
    const dedupeKey = `analytics:${e.key}:${e.period}`;
    const { data: live } = await ctx.supabase.from("agent_investigations").select("id").eq("company_id", companyId).eq("dedupe_key", dedupeKey).not("status", "in", "(resolved,closed,failed)").maybeSingle();
    if (live) return { ok: true, message: "Already under investigation", data: { id: live.id } };
    const { data: inv, error } = await ctx.supabase.from("agent_investigations").insert({
      company_id: companyId, agent_key: "ceo", workflow: "ceo.financial_variance", title: e.title, dedupe_key: dedupeKey, subject_type: "analytics_exception", subject_id: null, requested_by: ctx.viewer.id,
      trigger: { type: "manual", summary: `Requested by ${ctx.viewer.fullName}`, by: ctx.viewer.id, exception_key: e.key, exception: e } as never,
    }).select("id").single();
    dbError(error);
    await ctx.supabase.from("agent_events").insert({ company_id: companyId, investigation_id: inv!.id, agent_key: "ceo", kind: "trigger", actor_id: ctx.viewer.id, summary: `Requested by ${ctx.viewer.fullName}: ${e.title}` });
    const { error: re } = await ctx.supabase.from("agent_runs").insert({ company_id: companyId, investigation_id: inv!.id, agent_key: "ceo", workflow: "ceo.financial_variance" });
    dbError(re);
    revalidateCompany(ctx);
    return { ok: true, message: "The CEO Agent will start shortly", data: { id: inv!.id } };
  });
}
