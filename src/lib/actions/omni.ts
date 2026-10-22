"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { insertScoped, revalidateCompany } from "./common";
import { formObject, run, zRequired, type ActionResult } from "./result";

/** Omni-only confidential note on a portfolio company. */
export async function addOmniNote(companyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "omni");
    const data = z.object({ body: zRequired("Note", 5000), intervention_level: z.enum(["none", "monitor", "support", "intervene"]) }).parse(formObject(fd));
    await insertScoped(ctx, "omni_notes", { ...data, author_id: ctx.viewer.id });
    revalidateCompany(ctx);
    return { ok: true, message: "Note added" };
  });
}
