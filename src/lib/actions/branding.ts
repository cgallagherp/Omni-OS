"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { normalizeHex } from "@/lib/domain/brand";
import { validateLogo } from "@/lib/domain/logo-image";
import { revalidateCompany } from "./common";
import { ActionError, dbError, run, type ActionResult } from "./result";

const hex = z
  .string()
  .trim()
  .regex(/^#?[0-9a-fA-F]{6}$/, "Use a six-digit hex colour such as #F54E00")
  .transform((v) => normalizeHex(v));
const optionalHex = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(hex.optional());

/**
 * Saves a company's appearance. Company administrators, the CEO and Omni can
 * change it; the check runs here and again in RLS (app.can_admin), so an admin
 * of one company can never write another company's branding.
 */
export async function saveBranding(companyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const colours = z
      .object({ primary_color: hex, secondary_color: optionalHex, accent_color: optionalHex, remove_logo: z.string().optional() })
      .parse({
        primary_color: fd.get("primary_color") ?? "",
        secondary_color: fd.get("secondary_color") ?? undefined,
        accent_color: fd.get("accent_color") ?? undefined,
        remove_logo: fd.get("remove_logo") ?? undefined,
      });

    const row: Record<string, unknown> = {
      company_id: companyId,
      primary_color: colours.primary_color,
      secondary_color: colours.secondary_color ?? null,
      accent_color: colours.accent_color ?? null,
      updated_by: ctx.viewer.id,
      updated_at: new Date().toISOString(),
    };

    const file = fd.get("logo");
    if (file instanceof File && file.size > 0) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const checked = validateLogo(bytes);
      if ("error" in checked) return { ok: false, error: checked.error, fieldErrors: { logo: checked.error } };
      Object.assign(row, {
        logo_data: Buffer.from(bytes).toString("base64"),
        logo_mime: checked.info.mime,
        logo_width: checked.info.width,
        logo_height: checked.info.height,
        logo_updated_at: new Date().toISOString(),
      });
    } else if (colours.remove_logo === "true") {
      Object.assign(row, { logo_data: null, logo_mime: null, logo_width: null, logo_height: null, logo_updated_at: new Date().toISOString() });
    }

    const { data, error } = await ctx.supabase
      .from("company_branding")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(row as any, { onConflict: "company_id" })
      .select("company_id");
    dbError(error);
    if (!data?.length) throw new ActionError("Branding could not be saved.");
    revalidateCompany(ctx);
    return { ok: true, message: "Branding saved" };
  });
}

/** Removes the company's customisation so the workspace uses the Omni identity again. */
export async function restoreOmniBranding(companyId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { error } = await ctx.supabase.from("company_branding").delete().eq("company_id", companyId);
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Omni defaults restored" };
  });
}
