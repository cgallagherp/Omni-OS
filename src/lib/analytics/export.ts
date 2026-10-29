import "server-only";
import type { IntelligenceContext } from "@/lib/data/intelligence";
import type { Domain } from "./contracts";
import { csv } from "./csv";

/** Returns the CSV response after checking the domain and recording the export. */
export async function exportResponse(i: IntelligenceContext, domain: Domain, dataset: string, params: string, rows: Array<Record<string, unknown>>, columns?: string[]) {
  if (!i.domains.includes(domain)) return new Response("Not authorised for this data.", { status: 403 });
  const { error } = await i.ctx.supabase.from("an_exports").insert({ company_id: i.ctx.company.companyId, user_id: i.ctx.viewer.id, dataset, domain, params: params.slice(0, 2000), row_count: rows.length });
  if (error) return new Response("Export could not be recorded, so it was not produced.", { status: 403 });
  const synthetic = i.src?.info.is_synthetic ? "# Synthetic demonstration data - not actual company performance\n" : "";
  return new Response(synthetic + csv(rows, columns), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${i.ctx.company.slug}-${dataset}.csv"`, "cache-control": "no-store" },
  });
}
