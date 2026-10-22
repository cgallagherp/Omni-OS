"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer, PermissionError, requireCompanyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/config/brand";
import { templateByKey } from "@/lib/domain/templates";
import { quarterDates } from "@/lib/domain/quarters";
import { revalidateCompany } from "./common";
import { ActionError, dbError, formObject, run, zOptional, zRequired, type ActionResult } from "./result";

/**
 * Creates (or finds) an auth user. This is the only place the service role is used in
 * request paths, and only after an explicit permission check by the caller.
 * In demo mode a temporary password is generated and returned once; otherwise an
 * invitation email is sent by Supabase Auth.
 */
async function provisionUser(email: string, fullName: string, title: string | null) {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
  if (existing) return { userId: existing.id, tempPassword: null as string | null, created: false };
  let userId: string;
  let tempPassword: string | null = null;
  if (isDemoMode) {
    tempPassword = `Omni-${randomBytes(6).toString("base64url")}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error) throw new ActionError(error.message);
    userId = data.user.id;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName } });
    if (error) throw new ActionError(error.message);
    userId = data.user.id;
  }
  await admin.from("profiles").update({ full_name: fullName, title }).eq("id", userId);
  return { userId, tempPassword, created: true };
}

async function requirePlatformAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isPlatformAdmin) throw new PermissionError("Only platform administrators can do that.");
  return { viewer, supabase: await createClient() };
}

const companySchema = z.object({
  name: zRequired("Company name", 120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,48}$/, "Use 2–48 lowercase letters, numbers or hyphens"),
  sector: zOptional(120),
  description: zOptional(1000),
  headquarters: zOptional(120),
  currency: z.enum(["GBP", "EUR", "USD"]),
  fiscal_year_start_month: z.coerce.number().int().min(1).max(12),
  acquired_on: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  template: z.enum(["saas", "services", "blank"]),
  ceo_name: zRequired("CEO name", 120),
  ceo_title: z.string().trim().default("Chief Executive Officer"),
  ceo_email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .pipe(z.string().email("Invalid email").nullable()),
});

/** Onboards a new portfolio company from an Omni template. */
export async function createCompany(fd: FormData): Promise<ActionResult<{ slug: string; tempPassword: string | null }>> {
  return run(async () => {
    const { supabase } = await requirePlatformAdmin();
    const d = companySchema.parse(formObject(fd));
    const tpl = templateByKey(d.template);
    const { data: company, error } = await supabase
      .from("companies")
      .insert({
        name: d.name,
        slug: d.slug,
        sector: d.sector,
        description: d.description,
        headquarters: d.headquarters,
        currency: d.currency,
        fiscal_year_start_month: d.fiscal_year_start_month,
        acquired_on: d.acquired_on,
        brand_color: d.brand_color,
        is_demo: false,
      })
      .select()
      .single();
    if (error?.code === "23505") throw new ActionError("That URL slug is already taken.");
    dbError(error);
    const cid = company!.id;
    try {
      let tempPassword: string | null = null;
      let userId: string | null = null;
      if (d.ceo_email) {
        const p = await provisionUser(d.ceo_email, d.ceo_name, d.ceo_title);
        tempPassword = p.tempPassword;
        userId = p.userId;
        dbError((await supabase.from("company_memberships").insert({ company_id: cid, user_id: userId, role: "company_admin" })).error);
      }
      const { data: ceo, error: ce } = await supabase
        .from("crew_members")
        .insert({ company_id: cid, full_name: d.ceo_name, title: d.ceo_title, email: d.ceo_email, user_id: userId, seat: "Visionary & integrator", responsibilities: ["Value creation plan", "Leadership team", "Board & Omni relationship"] })
        .select("id")
        .single();
      dbError(ce);
      dbError((await supabase.from("north_stars").insert({ company_id: cid, last_change_summary: "Created at onboarding" })).error);

      const now = new Date();
      const q = Math.floor(now.getUTCMonth() / 3) + 1;
      dbError((await supabase.from("quarters").insert({ company_id: cid, year: now.getUTCFullYear(), quarter: q, ...quarterDates(now.getUTCFullYear(), q), status: "active", approved_at: now.toISOString() })).error);

      dbError(
        (
          await supabase.from("metrics").insert(
            tpl.metrics.map((m, i) => ({
              company_id: cid,
              name: m.name,
              category: m.category,
              unit: m.unit,
              frequency: m.frequency,
              direction: m.direction,
              target_value: m.target,
              target_min: m.min ?? null,
              target_max: m.max ?? null,
              tolerance_pct: m.tolerance,
              aggregation: m.aggregation ?? "stock",
              comparable_key: m.comparable ?? null,
              is_key: m.isKey ?? false,
              decimals: m.decimals ?? 0,
              owner_id: ceo!.id,
              sort_order: i,
            })),
          )
        ).error,
      );

      // Standard Omni operating cadence
      const nextMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ((8 - now.getUTCDay()) % 7 || 7), 9));
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 8, 13));
      const nq = q === 4 ? { y: now.getUTCFullYear() + 1, q: 1 } : { y: now.getUTCFullYear(), q: q + 1 };
      const nextQuarter = new Date(Date.UTC(nq.y, (nq.q - 1) * 3, 5, 9));
      dbError(
        (
          await supabase.from("meetings").insert([
            { company_id: cid, type: "weekly", title: "Weekly Leadership Meeting", scheduled_at: nextMonday.toISOString(), facilitator_id: ceo!.id },
            { company_id: cid, type: "monthly", title: "Monthly Operating Review", scheduled_at: nextMonth.toISOString(), facilitator_id: ceo!.id },
            { company_id: cid, type: "quarterly", title: "Quarterly Strategic Reset", scheduled_at: nextQuarter.toISOString(), facilitator_id: ceo!.id },
          ])
        ).error,
      );
      revalidatePath("/", "layout");
      return { ok: true, message: `${d.name} created`, data: { slug: d.slug, tempPassword } };
    } catch (e) {
      await supabase.from("companies").delete().eq("id", cid);
      throw e;
    }
  });
}

export async function setOmniAssignment(companyId: string, userId: string, assigned: boolean): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requirePlatformAdmin();
    if (assigned) dbError((await supabase.from("company_memberships").upsert({ company_id: companyId, user_id: userId, role: "omni" }, { onConflict: "company_id,user_id" })).error);
    else dbError((await supabase.from("company_memberships").delete().eq("company_id", companyId).eq("user_id", userId)).error);
    revalidatePath("/", "layout");
    return { ok: true, message: assigned ? "Access granted" : "Access removed" };
  });
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email"),
  full_name: zRequired("Name", 120),
  title: zOptional(160),
  role: z.enum(["company_admin", "executive", "observer"]),
  add_to_crew: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

/** Company admins invite executives and observers. The Omni role can only be granted by platform admins. */
export async function inviteMember(companyId: string, fd: FormData): Promise<ActionResult<{ tempPassword: string | null }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const d = inviteSchema.parse(formObject(fd));
    const { userId, tempPassword } = await provisionUser(d.email, d.full_name, d.title);
    const { data: staff } = await ctx.supabase.from("profiles").select("platform_role").eq("id", userId).maybeSingle();
    if (staff?.platform_role) throw new ActionError("Omni staff are assigned by a platform administrator.");
    dbError((await ctx.supabase.from("company_memberships").upsert({ company_id: companyId, user_id: userId, role: d.role }, { onConflict: "company_id,user_id" })).error);
    if (d.add_to_crew) {
      const { data: crew } = await ctx.supabase.from("crew_members").select("id").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
      if (!crew) dbError((await ctx.supabase.from("crew_members").insert({ company_id: companyId, user_id: userId, full_name: d.full_name, title: d.title ?? "Executive", email: d.email })).error);
    }
    revalidateCompany(ctx);
    return { ok: true, message: tempPassword ? "User created" : "Access granted", data: { tempPassword } };
  });
}

export async function setMemberRole(companyId: string, userId: string, role: "company_admin" | "executive" | "observer"): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    if (userId === ctx.viewer.id) throw new ActionError("You cannot change your own role.");
    const { data, error } = await ctx.supabase.from("company_memberships").update({ role }).eq("company_id", companyId).eq("user_id", userId).neq("role", "omni").select("user_id");
    dbError(error);
    if (!data?.length) throw new ActionError("Member not found.");
    revalidateCompany(ctx);
    return { ok: true, message: "Role updated" };
  });
}

export async function removeMember(companyId: string, userId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    if (userId === ctx.viewer.id) throw new ActionError("You cannot remove yourself.");
    const { data, error } = await ctx.supabase.from("company_memberships").delete().eq("company_id", companyId).eq("user_id", userId).neq("role", "omni").select("user_id");
    dbError(error);
    if (!data?.length) throw new ActionError("Member not found (Omni access is managed by platform administrators).");
    revalidateCompany(ctx);
    return { ok: true, message: "Access removed" };
  });
}
