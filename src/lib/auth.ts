import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, type Supabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type CompanyRole = Database["public"]["Enums"]["company_role"];
export type PlatformRole = Database["public"]["Enums"]["platform_role"];
export type PermissionLevel = "read" | "write" | "admin" | "omni";

export interface CompanyBranding {
  primary: string | null;
  secondary: string | null;
  accent: string | null;
  /** URL of the company logo (versioned), or null to use the company mark */
  logoUrl: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
}

export interface CompanyAccess {
  companyId: string;
  slug: string;
  name: string;
  sector: string | null;
  brandColor: string;
  isDemo: boolean;
  role: CompanyRole;
  branding: CompanyBranding;
}

export interface Viewer {
  id: string;
  email: string;
  fullName: string;
  title: string | null;
  platformRole: PlatformRole | null;
  isOmniStaff: boolean;
  isPlatformAdmin: boolean;
  companies: CompanyAccess[];
}

export class PermissionError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "PermissionError";
  }
}

const RANK: Record<CompanyRole, number> = { observer: 0, executive: 1, company_admin: 2, ceo: 2, omni: 3 };

export function roleAllows(role: CompanyRole, level: PermissionLevel): boolean {
  switch (level) {
    case "read":
      return true;
    case "write":
      return RANK[role] >= RANK.executive;
    case "admin":
      return role === "company_admin" || role === "ceo" || role === "omni";
    case "omni":
      return role === "omni";
  }
}

export const roleLabel: Record<CompanyRole, string> = {
  omni: "Omni team",
  ceo: "CEO",
  company_admin: "Company administrator",
  executive: "Executive",
  observer: "Chair / Board observer",
};

/** Loads the signed-in user and their company access. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, title, platform_role")
    .eq("id", auth.user.id)
    .single();
  if (!profile) return null;

  const isPlatformAdmin = profile.platform_role === "platform_admin";
  const { data: memberships } = await supabase
    .from("company_memberships")
    .select("role, company_id")
    .eq("user_id", profile.id);
  // RLS returns every company the user may see (all companies for platform admins).
  const { data: companies } = await supabase
    .from("companies")
    .select("id, slug, name, sector, brand_color, is_demo")
    .order("name");

  const { data: brandings } = await supabase
    .from("company_branding")
    .select("company_id, primary_color, secondary_color, accent_color, logo_mime, logo_updated_at, logo_width, logo_height");
  const brandingBy = new Map((brandings ?? []).map((b) => [b.company_id, b]));
  const roleByCompany = new Map((memberships ?? []).map((m) => [m.company_id, m.role]));
  const access: CompanyAccess[] = (companies ?? []).flatMap((c) => {
    const role = roleByCompany.get(c.id) ?? (isPlatformAdmin ? ("omni" as const) : undefined);
    if (!role) return [];
    const b = brandingBy.get(c.id);
    const branding: CompanyBranding = {
      primary: b?.primary_color ?? null,
      secondary: b?.secondary_color ?? null,
      accent: b?.accent_color ?? null,
      logoUrl: b?.logo_mime ? `/brand/logo/${c.id}?v=${encodeURIComponent(b.logo_updated_at ?? "1")}` : null,
      logoWidth: b?.logo_width ?? null,
      logoHeight: b?.logo_height ?? null,
    };
    return [{ companyId: c.id, slug: c.slug, name: c.name, sector: c.sector, brandColor: b?.primary_color ?? c.brand_color, isDemo: c.is_demo, role, branding }];
  });

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    title: profile.title,
    platformRole: profile.platform_role,
    isOmniStaff: profile.platform_role !== null,
    isPlatformAdmin,
    companies: access,
  };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export interface CompanyContext {
  viewer: Viewer;
  company: CompanyAccess;
  supabase: Supabase;
  can: Record<PermissionLevel, boolean>;
}

function contextFor(viewer: Viewer, company: CompanyAccess, supabase: Supabase): CompanyContext {
  return {
    viewer,
    company,
    supabase,
    can: {
      read: true,
      write: roleAllows(company.role, "write"),
      admin: roleAllows(company.role, "admin"),
      omni: roleAllows(company.role, "omni") && viewer.isOmniStaff,
    },
  };
}

/** For pages: resolves a company by slug or 404s when the viewer has no access. */
export const getCompanyContext = cache(async (slug: string): Promise<CompanyContext> => {
  const viewer = await requireViewer();
  const company = viewer.companies.find((c) => c.slug === slug);
  if (!company) notFound();
  return contextFor(viewer, company, await createClient());
});

/**
 * For server actions: server-side permission check performed in addition to
 * RLS. Throws PermissionError when the viewer lacks the required level.
 */
export async function requireCompanyPermission(companyId: string, level: PermissionLevel): Promise<CompanyContext> {
  const viewer = await getViewer();
  if (!viewer) throw new PermissionError("Your session has expired. Please sign in again.");
  const company = viewer.companies.find((c) => c.companyId === companyId);
  if (!company) throw new PermissionError();
  const ctx = contextFor(viewer, company, await createClient());
  if (!ctx.can[level]) throw new PermissionError();
  return ctx;
}
