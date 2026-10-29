import type { Metadata } from "next";
import Link from "next/link";
import { loadIntelligence, savedViews } from "@/lib/data/intelligence";
import { loadCostBase, supplierAnalysis } from "@/lib/analytics/cost-service";
import { keepParams, viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt } from "@/lib/analytics/format";
import { formatDate } from "@/lib/domain/format";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton, FilterBar, PeriodControls, SavedViews } from "@/components/intelligence/controls";
import { CompareBars } from "@/components/intelligence/charts";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Suppliers" };

export default async function Suppliers({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadCostBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "quarter");
  const base = `${i.base}/cost`;
  const [s, views] = await Promise.all([supplierAnalysis(b, q.period, q.filters), savedViews(i, "cost")]);
  const highlight = typeof sp.supplier === "string" ? sp.supplier : null;
  const kp = keepParams(sp, ["supplier"]);
  const months = [...b.status.keys()].sort().reverse();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Cost Intelligence" title="Supplier analysis" description="Third-party spend by supplier: concentration, growth and contract dates. Contracts are never changed or cancelled from here." actions={<SavedViews companyId={i.ctx.company.companyId} module="cost" path={`${base}/suppliers`} views={views} />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodControls grains={["month", "quarter", "ytd", "ltm"]} grain={q.grain} end={q.end} months={months} showCompare={false} />
        <div className="flex items-center gap-2"><FilterBar dims={b.dims} active={q.chips} /><ExportButton href={`${base}/export?dataset=suppliers&${kp}`} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Supplier spend", fmt(s.concentration.total, "currency")], ["Suppliers", String(s.suppliers.length)], ["Largest supplier", fmt(s.concentration.top1, "percent", { decimals: 0 })], ["Top five", fmt(s.concentration.top5, "percent", { decimals: 0 })], ["Concentration (HHI)", s.concentration.hhi?.toLocaleString("en-GB") ?? "—"]].map(([l, v]) => (
          <Card key={l} className="p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-[19px] font-semibold tabular">{v}</p></Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader><CardTitle>By category</CardTitle></CardHeader>
          <CardContent><CompareBars unit="currency" rows={s.byCategory.map((c) => ({ key: c.category, label: c.category, value: c.amount }))} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{q.period.label}</CardTitle><span className="text-xs text-muted-foreground">Change vs prior period and same period last year</span></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] whitespace-nowrap tabular">
              <thead className="border-b text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium">Supplier</th><th className="px-2 text-left font-medium">Category</th><th className="px-2 text-right font-medium">Spend</th><th className="px-2 text-right font-medium">Share</th><th className="px-2 text-right font-medium">Budget</th><th className="px-2 text-right font-medium">vs prior</th><th className="px-2 text-right font-medium">Year on year</th><th className="px-4 text-left font-medium">Contract end</th></tr></thead>
              <tbody className="divide-y">
                {s.suppliers.map((x) => (
                  <tr key={x.id} className={cn("hover:bg-accent/40", highlight === x.id && "bg-brand-subtle")}>
                    <td className="px-4 py-1.5 font-medium"><Link href={`${base}/analysis?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(kp)), group: "supplier", key: x.id })}`} className="hover:underline">{x.name}</Link>{x.origin !== "organic" && <span className="ml-1.5 rounded bg-muted px-1 text-[10.5px] text-muted-foreground">{x.origin}</span>}</td>
                    <td className="px-2">{x.category}</td>
                    <td className="px-2 text-right">{fmt(x.amount, "currency")}</td>
                    <td className="px-2 text-right text-muted-foreground">{fmt(x.share, "percent", { decimals: 1 })}</td>
                    <td className="px-2 text-right text-muted-foreground">{x.budget ? fmt(x.budget, "currency") : "—"}</td>
                    <td className={cn("px-2 text-right", (x.change ?? 0) > 0.2 && "text-[var(--status-off-ink)]")}>{fmt(x.change, "percent", { signed: true })}</td>
                    <td className={cn("px-2 text-right", (x.yoy ?? 0) > 0.2 && "text-[var(--status-off-ink)]")}>{fmt(x.yoy, "percent", { signed: true })}</td>
                    <td className="px-4">{x.contractEnd ? formatDate(x.contractEnd) : <span className="text-muted-foreground">Not recorded</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
