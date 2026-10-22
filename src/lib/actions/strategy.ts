"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { deleteScoped, insertScoped, revalidateCompany, updateScoped } from "./common";
import { ActionError, dbError, formObject, run, zDate, zNumber, zOptional, zOptionalUuid, zRequired, type ActionResult } from "./result";

const northStarSchema = z.object({
  purpose: zOptional(2000),
  vision: zOptional(2000),
  five_year_ambition: zOptional(4000),
  three_year_destination: zOptional(4000),
  investment_thesis: zOptional(4000),
  exit_equity_story: zOptional(4000),
  buyer_proposition: zOptional(4000),
  target_year: z.coerce.number().int().min(2000).max(2100).nullable().optional(),
  target_revenue: zNumber,
  target_ebitda: zNumber,
  target_ev: zNumber,
  baseline_revenue: zNumber,
  baseline_ebitda: zNumber,
  assumptions: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((s) => s.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean),
    ),
  change_summary: zRequired("Summary of the change", 500),
});

/** Updates the North Star. A trigger stores every material change as a new permanent version. */
export async function updateNorthStar(companyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { change_summary, ...data } = northStarSchema.parse(formObject(fd));
    const row = {
      ...data,
      purpose: data.purpose ?? "",
      vision: data.vision ?? "",
      five_year_ambition: data.five_year_ambition ?? "",
      three_year_destination: data.three_year_destination ?? "",
      investment_thesis: data.investment_thesis ?? "",
      exit_equity_story: data.exit_equity_story ?? "",
      buyer_proposition: data.buyer_proposition ?? "",
      last_change_summary: change_summary,
      updated_by: ctx.viewer.id,
    };
    const { data: existing } = await ctx.supabase.from("north_stars").select("id").eq("company_id", companyId).maybeSingle();
    if (existing) await updateScoped(ctx, "north_stars", existing.id, row);
    else await insertScoped(ctx, "north_stars", row);
    revalidateCompany(ctx);
    return { ok: true, message: "North Star updated — new version saved" };
  });
}

const conditionSchema = z.object({
  title: zRequired("Condition"),
  description: zOptional(1000),
  status: z.enum(["on_track", "at_risk", "off_track", "done", "missed", "not_started"]),
  owner_id: zOptionalUuid,
});

export async function saveCondition(companyId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = conditionSchema.parse(formObject(fd));
    if (id) await updateScoped(ctx, "success_conditions", id, data);
    else await insertScoped(ctx, "success_conditions", { ...data, sort_order: 99 });
    revalidateCompany(ctx);
    return { ok: true, message: "Condition saved" };
  });
}

export async function deleteCondition(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    await deleteScoped(ctx, "success_conditions", id);
    revalidateCompany(ctx);
  });
}

const milestoneSchema = z.object({
  title: zRequired("Milestone"),
  description: zOptional(1000),
  target_date: zDate.refine((v) => v !== null, "Date is required"),
  status: z.enum(["on_track", "at_risk", "off_track", "done", "missed", "not_started"]),
  winning_move_id: zOptionalUuid,
});

export async function saveMilestone(companyId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = milestoneSchema.parse(formObject(fd));
    const row = { ...data, target_date: data.target_date! };
    if (id) await updateScoped(ctx, "milestones", id, row);
    else await insertScoped(ctx, "milestones", row);
    revalidateCompany(ctx);
    return { ok: true, message: "Milestone saved" };
  });
}

export async function deleteMilestone(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    await deleteScoped(ctx, "milestones", id);
    revalidateCompany(ctx);
  });
}

/** Company settings (Winning Move limit etc.). */
export async function updateCompanySettings(companyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const data = z
      .object({
        name: zRequired("Name", 120),
        sector: zOptional(120),
        description: zOptional(1000),
        headquarters: zOptional(120),
        brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #2563EB"),
        currency: z.enum(["GBP", "EUR", "USD"]),
        fiscal_year_start_month: z.coerce.number().int().min(1).max(12),
        max_winning_moves: z.coerce.number().int().min(1).max(10),
      })
      .parse(formObject(fd));
    const { data: company, error } = await ctx.supabase.from("companies").select("settings").eq("id", companyId).single();
    dbError(error);
    const { max_winning_moves, ...fields } = data;
    const { data: updated, error: e2 } = await ctx.supabase
      .from("companies")
      .update({ ...fields, settings: { ...((company?.settings as object) ?? {}), max_winning_moves } })
      .eq("id", companyId)
      .select("id");
    dbError(e2);
    if (!updated?.length) throw new ActionError("Company not found");
    revalidateCompany(ctx);
    return { ok: true, message: "Settings saved" };
  });
}
