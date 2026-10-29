import type { Metadata } from "next";
import { loadIntelligence } from "@/lib/data/intelligence";
import { costProvenance, loadCostBase, peopleView } from "@/lib/analytics/cost-service";
import { viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt } from "@/lib/analytics/format";
import { monthLabel } from "@/lib/analytics/period";
import { EmptyState, PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton, PeriodControls } from "@/components/intelligence/controls";
import { TimeSeries } from "@/components/intelligence/charts";
import { KpiTile } from "@/components/intelligence/panels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "People and productivity" };

export default async function People({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadCostBase(i.src!, i.fyStart);
  if (!b.canPeople) return <EmptyState title="Restricted" description="People-cost analysis needs the people domain. It is aggregated by department; individual payroll stays in the HR and payroll systems." />;
  const q = viewQuery(sp, [], b.coverage, i.fyStart, "ltm");
  const base = `${i.base}/cost`;
  const v = await peopleView(b, q.period);
  const t = v.total, p = v.prior;
  const prov = (k: string) => costProvenance(b, k, q.period.label, q.period.months);
  const months = [...b.status.keys()].sort().reverse();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Cost Intelligence" title="People costs and productivity" description="Aggregated departmental headcount and employment cost. No individual pay, performance, psychometric, coaching or succession data is held here." />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodControls grains={["month", "quarter", "ytd", "ltm"]} grain={q.grain} end={q.end} months={months} showCompare={false} />
        <ExportButton href={`${base}/export?dataset=people&g=${q.grain}&end=${q.end.slice(0, 7)}`} label="Export (departmental)" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Employment cost" value={t.employmentCost} unit="currency" direction="neutral" compare={{ label: "A year earlier", value: p?.employmentCost ?? null }} provenance={prov("employment_cost")} />
        <KpiTile label="Headcount" value={t.headcount} unit="count" direction="neutral" compare={{ label: "A year earlier", value: p?.headcount ?? null }} target={{ label: "Budget", value: t.budgetHeadcount }} provenance={prov("headcount")} />
        <KpiTile label="Cost per FTE (annualised)" value={t.costPerFte} unit="currency" direction="neutral" compare={{ label: "A year earlier", value: p?.costPerFte ?? null }} provenance={prov("cost_per_fte")} />
        <KpiTile label="Revenue per FTE (annualised)" value={t.revenuePerFte} unit="currency" direction="higher_is_better" compare={{ label: "A year earlier", value: p?.revenuePerFte ?? null }} provenance={prov("revenue_per_fte")} />
        <KpiTile label="Gross profit per FTE" value={t.gpPerFte} unit="currency" direction="higher_is_better" compare={{ label: "A year earlier", value: p?.gpPerFte ?? null }} provenance={prov("revenue_per_fte")} />
        <KpiTile label="Employment cost % revenue" value={t.employmentCostPct} unit="percent" direction="lower_is_better" compare={{ label: "A year earlier", value: p?.employmentCostPct ?? null }} provenance={prov("employment_cost_pct")} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Headcount vs budget</CardTitle></CardHeader>
          <CardContent><TimeSeries unit="count" data={v.trend.map((x) => ({ label: monthLabel(x.month), actual: x.headcount, budget: x.budgetHeadcount }))} series={[{ key: "actual", label: "Headcount" }, { key: "budget", label: "Budget", dashed: true, color: "var(--chart-muted)" }]} height={220} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Revenue and gross profit per FTE (trailing 12 months)</CardTitle></CardHeader>
          <CardContent><TimeSeries data={v.trend.map((x) => ({ label: monthLabel(x.month), rev: x.revenuePerFte, gp: x.gpPerFte }))} series={[{ key: "rev", label: "Revenue per FTE" }, { key: "gp", label: "Gross profit per FTE", color: "var(--chart-2)" }]} height={220} /></CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Hiring plan vs actual recruitment</CardTitle></CardHeader>
          <CardContent><TimeSeries unit="count" data={v.trend.map((x) => ({ label: monthLabel(x.month), hires: x.hires, plan: x.plannedHires }))} series={[{ key: "hires", label: "Hires", type: "bar" }, { key: "plan", label: "Planned hires", dashed: true, color: "var(--chart-muted)" }]} height={180} /></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>By department — {q.period.label}</CardTitle><span className="text-xs text-muted-foreground">Department aggregates only</span></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] whitespace-nowrap tabular">
            <thead className="border-b text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium">Department</th><th className="px-2 text-right font-medium">Headcount</th><th className="px-2 text-right font-medium">Budget</th><th className="px-2 text-right font-medium">FTE (avg)</th><th className="px-2 text-right font-medium">Employment cost</th><th className="px-2 text-right font-medium">Cost per FTE</th><th className="px-2 text-right font-medium">Hires</th><th className="px-2 text-right font-medium">Planned</th><th className="px-2 text-right font-medium">Leavers</th><th className="px-4 text-right font-medium">Open roles</th></tr></thead>
            <tbody className="divide-y">
              {v.departments.map((d) => (
                <tr key={d.department}>
                  <td className="px-4 py-1.5 font-medium">{d.department}</td>
                  <td className="px-2 text-right">{d.headcount}</td>
                  <td className={cn("px-2 text-right", d.budgetHeadcount !== null && d.headcount > d.budgetHeadcount && "text-[var(--status-risk-ink)]")}>{d.budgetHeadcount ?? "—"}</td>
                  <td className="px-2 text-right">{d.avgFte}</td>
                  <td className="px-2 text-right">{fmt(d.employmentCost, "currency")}</td>
                  <td className="px-2 text-right">{fmt(d.costPerFte, "currency")}</td>
                  <td className="px-2 text-right">{d.hires}</td>
                  <td className="px-2 text-right text-muted-foreground">{d.plannedHires ?? "—"}</td>
                  <td className="px-2 text-right">{d.leavers}</td>
                  <td className="px-4 text-right">{d.openRoles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
