import Papa from "papaparse";
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/data/snapshot";
import { evaluateMetric } from "@/lib/domain/metrics";
import { ruleFor } from "@/lib/domain/metric-view";

/** CSV export of all KPI observations for a company (RLS-scoped to the requesting user). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  const company = viewer?.companies.find((c) => c.slug === slug);
  if (!viewer || !company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: metrics } = await supabase.from("metrics").select("*").eq("company_id", company.companyId).eq("archived", false);
  const byId = new Map((metrics ?? []).map((m) => [m.id, m]));
  const values = await fetchAll((from, to) =>
    supabase.from("metric_values").select("metric_id, period_start, value, target, note, source").eq("company_id", company.companyId).order("period_start").order("id").range(from, to),
  );
  const rows = values
    .filter((v) => byId.has(v.metric_id) && v.value !== null)
    .map((v) => {
      const m = byId.get(v.metric_id)!;
      return {
        metric: m.name,
        category: m.category,
        frequency: m.frequency,
        period: v.period_start,
        value: v.value,
        target: v.target ?? m.target_value ?? "",
        status: evaluateMetric(v.value === null ? null : Number(v.value), ruleFor({ ...m, tolerance_pct: Number(m.tolerance_pct) }, v.target)),
        note: v.note ?? "",
        source: v.source,
      };
    });
  const csv = Papa.unparse(rows);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-scoreboard-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
