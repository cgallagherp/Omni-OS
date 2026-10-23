import type { Metadata } from "next";
import { getCompanyContext } from "@/lib/auth";
import { BrandingEditor } from "@/components/settings/branding-editor";
import { formatDate } from "@/lib/domain/format";

export const metadata: Metadata = { title: "Appearance & Branding" };

export default async function BrandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const { data: row } = await ctx.supabase
    .from("company_branding")
    .select("primary_color, secondary_color, accent_color, logo_mime, logo_width, logo_height, updated_at, profiles:updated_by(full_name)")
    .eq("company_id", cid)
    .maybeSingle();
  const updatedBy = (row?.profiles as unknown as { full_name: string } | null)?.full_name;
  return (
    <BrandingEditor
      companyId={cid}
      companyName={ctx.company.name}
      saved={{
        primary: row?.primary_color ?? null,
        secondary: row?.secondary_color ?? null,
        accent: row?.accent_color ?? null,
        logoUrl: ctx.company.branding.logoUrl,
        logoWidth: row?.logo_width ?? null,
        logoHeight: row?.logo_height ?? null,
      }}
      lastChanged={row ? `Last changed ${formatDate(row.updated_at)}${updatedBy ? ` by ${updatedBy}` : ""}` : null}
    />
  );
}
