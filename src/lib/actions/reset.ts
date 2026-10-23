"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { nextQuarterOf, quarterDates } from "@/lib/domain/quarters";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { insertScoped, revalidateCompany, updateScoped } from "./common";
import { ActionError, dbError, formObject, run, zOptional, type ActionResult } from "./result";

/** Starts the quarterly offsite for the active quarter: creates the next quarter (planning) and a draft offsite record. */
export async function startQuarterlyReset(companyId: string): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const { data: active } = await ctx.supabase.from("quarters").select("*").eq("company_id", companyId).eq("status", "active").maybeSingle();
    if (!active) throw new ActionError("There is no active quarter to reset.");
    const { data: existing } = await ctx.supabase.from("quarterly_resets").select("id").eq("company_id", companyId).eq("from_quarter_id", active.id).maybeSingle();
    if (existing) return { ok: true, data: { id: existing.id } };
    const nq = nextQuarterOf(active.year, active.quarter);
    let { data: next } = await ctx.supabase.from("quarters").select("*").eq("company_id", companyId).eq("year", nq.year).eq("quarter", nq.quarter).maybeSingle();
    if (!next) {
      const id = await insertScoped(ctx, "quarters", { year: nq.year, quarter: nq.quarter, ...quarterDates(nq.year, nq.quarter), status: "planning" });
      next = (await ctx.supabase.from("quarters").select("*").eq("id", id).single()).data;
    }
    const id = await insertScoped(ctx, "quarterly_resets", { from_quarter_id: active.id, to_quarter_id: next!.id, status: "draft", created_by: ctx.viewer.id });
    revalidateCompany(ctx);
    return { ok: true, message: "Quarterly offsite started", data: { id } };
  });
}

export async function saveResetNotes(companyId: string, resetId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = z.object({ wins: zOptional(4000), misses: zOptional(4000), lessons: zOptional(4000), constraints_notes: zOptional(4000) }).parse(formObject(fd));
    await updateScoped(ctx, "quarterly_resets", resetId, data);
    revalidateCompany(ctx);
    return { ok: true, message: "Reflections saved" };
  });
}

/** Copies an unfinished priority into the next quarter, linked to the original. */
export async function carryForward(companyId: string, resetId: string, priorityId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const { data: reset } = await ctx.supabase.from("quarterly_resets").select("*").eq("company_id", companyId).eq("id", resetId).maybeSingle();
    if (!reset || reset.status !== "draft") throw new ActionError("This reset is not open for changes.");
    const { data: p } = await ctx.supabase.from("quarterly_priorities").select("*").eq("company_id", companyId).eq("id", priorityId).maybeSingle();
    if (!p || p.quarter_id !== reset.from_quarter_id) throw new ActionError("Priority not found in the quarter being reset.");
    const { data: dup } = await ctx.supabase.from("quarterly_priorities").select("id").eq("carried_from_id", priorityId).eq("quarter_id", reset.to_quarter_id);
    if (dup?.length) throw new ActionError("Already carried forward.");
    const { data: q } = await ctx.supabase.from("quarters").select("start_date, end_date").eq("id", reset.to_quarter_id).single();
    await insertScoped(ctx, "quarterly_priorities", {
      quarter_id: reset.to_quarter_id,
      annual_goal_id: p.annual_goal_id,
      title: p.title,
      description: p.description,
      measurable_outcome: p.measurable_outcome,
      success_criteria: p.success_criteria,
      owner_id: p.owner_id,
      status: "not_started",
      progress: p.progress,
      start_date: q!.start_date,
      due_date: q!.end_date,
      carried_from_id: p.id,
      sort_order: p.sort_order,
    });
    revalidateCompany(ctx);
    return { ok: true, message: "Carried into next quarter" };
  });
}

async function openReset(ctx: Awaited<ReturnType<typeof requireCompanyPermission>>, resetId: string) {
  const { data: reset, error } = await ctx.supabase.from("quarterly_resets").select("*").eq("company_id", ctx.company.companyId).eq("id", resetId).maybeSingle();
  dbError(error);
  if (!reset) throw new ActionError("Quarterly offsite not found.");
  if (reset.status !== "draft") throw new ActionError("This offsite has been approved and is now read-only.");
  return reset;
}

/** Stage 2: classify a priority from the last 90 days, with the rationale. */
export async function setPriorityOutcome(companyId: string, resetId: string, priorityId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const reset = await openReset(ctx, resetId);
    const data = z
      .object({ outcome: z.enum(["achieved", "partly_achieved", "missed", "stopped"], { message: "Choose a result" }), outcome_note: zOptional(1000) })
      .parse(formObject(fd));
    const { data: p } = await ctx.supabase.from("quarterly_priorities").select("id, quarter_id").eq("company_id", companyId).eq("id", priorityId).maybeSingle();
    if (!p || p.quarter_id !== reset.from_quarter_id) throw new ActionError("Priority not found in the quarter being reviewed.");
    await updateScoped(ctx, "quarterly_priorities", priorityId, data);
    revalidateCompany(ctx);
    return { ok: true, message: "Result recorded" };
  });
}

const patchSchema = z.object({
  north_star_confirmed: z.boolean().optional(),
  is_annual: z.boolean().optional(),
  company_update: z.string().max(8000).optional(),
  stage: z.object({ key: z.enum(["north_star", "scorecard", "employee", "customer", "crew", "annual"]), notes: z.string().max(4000) }).optional(),
  scorecard: z.object({ metricId: z.string().uuid(), decision: z.enum(["keep", "drop"]) }).optional(),
  strategic_questions: z.array(z.object({ question: z.string().trim().min(1).max(300), conclusion: z.string().max(2000) })).max(3, "Keep to two or three strategic issues").optional(),
});

/** Saves the offsite's stage notes, scorecard review, strategic issues and company update. */
export async function saveOffsite(companyId: string, resetId: string, patch: z.input<typeof patchSchema>): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const reset = await openReset(ctx, resetId);
    const p = patchSchema.parse(patch);
    const update: Record<string, unknown> = {};
    if (p.north_star_confirmed !== undefined) update.north_star_confirmed = p.north_star_confirmed;
    if (p.is_annual !== undefined) update.is_annual = p.is_annual;
    if (p.company_update !== undefined) update.company_update = p.company_update || null;
    if (p.stage) update.stage_notes = { ...((reset.stage_notes as Record<string, string>) ?? {}), [p.stage.key]: p.stage.notes };
    if (p.scorecard) {
      const { data: m } = await ctx.supabase.from("metrics").select("id").eq("company_id", companyId).eq("id", p.scorecard.metricId).maybeSingle();
      if (!m) throw new ActionError("KPI not found");
      update.scorecard_review = { ...((reset.scorecard_review as Record<string, string>) ?? {}), [p.scorecard.metricId]: p.scorecard.decision };
    }
    if (p.strategic_questions) update.strategic_questions = p.strategic_questions;
    await updateScoped(ctx, "quarterly_resets", resetId, update);
    revalidateCompany(ctx);
    return { ok: true }; // callers show their own confirmation
  });
}

/** Saves the CEO's company-wide update after the offsite (also allowed once approved). */
export async function saveCompanyUpdate(companyId: string, resetId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const text = z.string().max(8000).parse(fd.get("company_update") ?? "");
    await updateScoped(ctx, "quarterly_resets", resetId, { company_update: text || null });
    revalidateCompany(ctx);
    return { ok: true, message: "Company update saved" };
  });
}

/** Approves the next 90 days atomically (see approve_quarterly_reset SQL function). */
export async function approveReset(companyId: string, resetId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const snap = await loadCompanySnapshot(ctx.supabase, companyId);
    if (!snap) throw new ActionError("Company not found");
    const ps = snap.priorities;
    const count = (o: string) => ps.filter((p) => p.outcome === o).length;
    const snapshot = {
      achieved: count("achieved"),
      partly_achieved: count("partly_achieved"),
      missed: count("missed"),
      stopped: count("stopped"),
      total: ps.length,
      kpi: { on_track: snap.kpi.on_track, at_risk: snap.kpi.at_risk, off_track: snap.kpi.off_track, total: snap.kpi.total },
      revenue_variance: snap.financials.revenue?.variancePct ?? null,
      ebitda_variance: snap.financials.ebitda?.variancePct ?? null,
      priorities: ps.map((p) => ({ id: p.id, title: p.title, outcome: p.outcome, note: p.outcome_note, owner: snap.crewById.get(p.owner_id)?.full_name })),
    };
    const { error } = await ctx.supabase.rpc("approve_quarterly_reset", { p_reset_id: resetId, p_snapshot: snapshot });
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Next 90 days approved and now active" };
  });
}
