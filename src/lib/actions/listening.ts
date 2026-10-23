"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { deleteScoped, insertScoped, revalidateCompany, updateScoped } from "./common";
import { formObject, run, zDate, zNumber, zOptional, type ActionResult } from "./result";

const pct = zNumber.pipe(z.number().min(0, "0–100").max(100, "0–100").nullable());
const score = zNumber.pipe(z.number().min(-100, "−100 to 100").max(100, "−100 to 100").nullable());

/**
 * Aggregate listening results only. Raw or identifiable responses are never
 * stored in Omni OS.
 */
const schema = z.object({
  kind: z.enum(["employee", "customer"]),
  held_on: zDate.refine((v) => v !== null, "Date is required"),
  method: zOptional(200),
  responses: zNumber.pipe(z.number().int().min(0).nullable()),
  engagement: pct,
  enps: score,
  leadership_confidence: pct,
  strategy_confidence: pct,
  clarity_accountability: pct,
  nps: score,
  satisfaction: pct,
  retention: pct,
  churn: pct,
  themes: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((s) => s.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 12),
    ),
  issues: zOptional(2000),
  summary: zOptional(2000),
});

export async function saveListeningRound(companyId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const d = schema.parse(formObject(fd));
    const row = { ...d, held_on: d.held_on! };
    if (id) await updateScoped(ctx, "listening_rounds", id, row);
    else await insertScoped(ctx, "listening_rounds", { ...row, created_by: ctx.viewer.id });
    revalidateCompany(ctx);
    return { ok: true, message: "Listening round saved" };
  });
}

export async function deleteListeningRound(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    await deleteScoped(ctx, "listening_rounds", id);
    revalidateCompany(ctx);
    return { ok: true, message: "Removed" };
  });
}
