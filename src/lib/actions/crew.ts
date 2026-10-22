"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { deleteScoped, insertScoped, revalidateCompany, updateScoped } from "./common";
import { ActionError, formObject, run, zDate, zOptional, zOptionalUuid, zRequired, zUuid, type ActionResult } from "./result";

const crewSchema = z.object({
  full_name: zRequired("Name", 120),
  title: zRequired("Title", 160),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.string().email("Invalid email").nullable()),
  seat: zOptional(120),
  responsibilities: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((s) => s.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 12),
    ),
  reports_to: zOptionalUuid,
  is_leadership: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  is_open_seat: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export async function saveCrewMember(companyId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = crewSchema.parse(formObject(fd));
    if (id && data.reports_to === id) throw new ActionError("A person cannot report to themselves.");
    if (id) await updateScoped(ctx, "crew_members", id, data);
    else await insertScoped(ctx, "crew_members", { ...data, sort_order: 99 });
    revalidateCompany(ctx);
    return { ok: true, message: id ? "Updated" : data.is_open_seat ? "Open seat added" : "Person added" };
  });
}

export async function removeCrewMember(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    try {
      await deleteScoped(ctx, "crew_members", id);
    } catch (e) {
      if (e instanceof ActionError && /references/.test(e.message)) throw new ActionError("This person still owns objectives, KPIs or actions. Reassign them first.");
      throw e;
    }
    revalidateCompany(ctx);
    return { ok: true, message: "Removed" };
  });
}

const gapSchema = z.object({
  type: z.enum(["hire", "capability", "development"]),
  title: zRequired("Title"),
  description: zOptional(2000),
  priority: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "in_progress", "closed"]),
  owner_id: zUuid,
  crew_member_id: zOptionalUuid,
  target_date: zDate,
});

export async function saveGap(companyId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = gapSchema.parse(formObject(fd));
    if (id) await updateScoped(ctx, "org_gaps", id, data);
    else await insertScoped(ctx, "org_gaps", data);
    revalidateCompany(ctx);
    return { ok: true, message: "Saved" };
  });
}
