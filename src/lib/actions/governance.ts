"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { nextDueAfter, onboardingPlan } from "@/lib/domain/operating-system";
import { deleteScoped, insertScoped, revalidateCompany, updateScoped } from "./common";
import { ActionError, dbError, formObject, run, zDate, zOptional, zRequired, type ActionResult } from "./result";

// --- First 100 days ---------------------------------------------------------

export async function updateOnboardingMilestone(companyId: string, id: string, patch: { status?: string; owner_id?: string | null; due_date?: string | null }): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const p = z
      .object({
        status: z.enum(["not_started", "in_progress", "done"]).optional(),
        owner_id: z.string().uuid().nullable().optional(),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
      .parse(patch);
    await updateScoped(ctx, "onboarding_milestones", id, {
      ...p,
      ...(p.status ? { completed_at: p.status === "done" ? new Date().toISOString() : null } : {}),
    });
    revalidateCompany(ctx);
  });
}

/** Creates the first-100-days plan from the Omni template (for companies set up before it existed). */
export async function setUpOnboarding(companyId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { count } = await ctx.supabase.from("onboarding_milestones").select("id", { count: "exact", head: true }).eq("company_id", companyId);
    if (count) throw new ActionError("The 100-day plan already exists.");
    const { data: company } = await ctx.supabase.from("companies").select("acquired_on").eq("id", companyId).single();
    const start = company?.acquired_on ? new Date(`${company.acquired_on}T00:00:00Z`) : new Date();
    const { error } = await ctx.supabase.from("onboarding_milestones").insert(onboardingPlan(start).map((m) => ({ ...m, company_id: companyId })));
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "100-day plan created" };
  });
}

// --- Investor governance ----------------------------------------------------

export async function completeGovernanceItem(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const { data: item } = await ctx.supabase.from("governance_items").select("cadence_months").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (!item) throw new ActionError("Requirement not found");
    const today = new Date().toISOString().slice(0, 10);
    await updateScoped(ctx, "governance_items", id, { last_completed_on: today, next_due: nextDueAfter(today, item.cadence_months) });
    revalidateCompany(ctx);
    return { ok: true, message: "Marked complete" };
  });
}

const itemSchema = z.object({
  title: zRequired("Requirement", 200),
  requirement: zOptional(2000),
  owner_label: zOptional(120),
  cadence_label: zOptional(200),
  cadence_months: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1).max(36).nullable()),
  next_due: zDate,
  notes: zOptional(2000),
});

/**
 * Adds or edits a governance requirement. Company-specific requirements (for
 * example consent matters under the investment agreement) are configured per
 * company here — Omni OS has no built-in thresholds.
 */
export async function saveGovernanceItem(companyId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const d = itemSchema.parse(formObject(fd));
    const row = { ...d, requirement: d.requirement ?? "", owner_label: d.owner_label ?? "", cadence_label: d.cadence_label ?? "" };
    if (id) await updateScoped(ctx, "governance_items", id, row);
    else await insertScoped(ctx, "governance_items", { ...row, sort_order: 99 });
    revalidateCompany(ctx);
    return { ok: true, message: "Saved" };
  });
}

export async function deleteGovernanceItem(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    await deleteScoped(ctx, "governance_items", id);
    revalidateCompany(ctx);
    return { ok: true, message: "Removed" };
  });
}
