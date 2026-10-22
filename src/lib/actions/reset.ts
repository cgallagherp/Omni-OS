"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { nextQuarterOf, quarterDates } from "@/lib/domain/quarters";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { insertScoped, revalidateCompany, updateScoped } from "./common";
import { ActionError, dbError, formObject, run, zOptional, type ActionResult } from "./result";

/** Starts the reset for the active quarter: creates the next quarter (planning) and a draft reset. */
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
    return { ok: true, message: "Quarterly reset started", data: { id } };
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

/** Approves the new quarterly plan atomically (see approve_quarterly_reset SQL function). */
export async function approveReset(companyId: string, resetId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const snap = await loadCompanySnapshot(ctx.supabase, companyId);
    if (!snap) throw new ActionError("Company not found");
    const ps = snap.priorities;
    const snapshot = {
      completed: ps.filter((p) => p.status === "done").length,
      missed: ps.filter((p) => p.status !== "done").length,
      total: ps.length,
      kpi: { on_track: snap.kpi.on_track, at_risk: snap.kpi.at_risk, off_track: snap.kpi.off_track, total: snap.kpi.total },
      revenue_variance: snap.financials.revenue?.variancePct ?? null,
      ebitda_variance: snap.financials.ebitda?.variancePct ?? null,
      priorities: ps.map((p) => ({ id: p.id, title: p.title, status: p.status, progress: p.progress, owner: snap.crewById.get(p.owner_id)?.full_name })),
    };
    const { error } = await ctx.supabase.rpc("approve_quarterly_reset", { p_reset_id: resetId, p_snapshot: snapshot });
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "New quarterly plan approved" };
  });
}
