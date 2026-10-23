import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Serves a company's logo. Read with the user's session, so RLS limits it to
 * users with access to that company. Only raster formats are stored (no SVG).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("company_branding").select("logo_data, logo_mime").eq("company_id", companyId).maybeSingle();
  if (!data?.logo_data || !data.logo_mime) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(data.logo_data, "base64"), {
    headers: {
      "content-type": data.logo_mime,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
