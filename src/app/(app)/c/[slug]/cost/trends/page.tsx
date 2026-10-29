import type { Metadata } from "next";
import { loadIntelligence, savedViews } from "@/lib/data/intelligence";
import { costSeries, costTrend, loadCostBase } from "@/lib/analytics/cost-service";
import { lineLabel, runRate } from "@/lib/analytics/calc/cost";
import { viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt, delta } from "@/lib/analytics/format";
import { monthLabel } from "@/lib/analytics/period";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartOrTable, FilterBar, ParamSelect, PeriodControls, SavedViews } from "@/components/intelligence/controls";
import { TimeSeries } from "@/components/intelligence/charts";

export const metadata: Metadata = { title: "Cost trends" };

export default async function CostTrends({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadCostBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "month");
  const base = `${i.base}/cost`;
  const range = [12, 24, 36].includes(Number(sp.range)) ? Number(sp.range) : 24;
  const trend = await costTrend(b, q.end, range, q.filters);
  const line = typeof sp.line === "string" && trend.lines.includes(sp.line) ? sp.line : null;
  const [series, views] = await Promise.all([costSeries(b, q.end, range, line ? "line" : null, line, q.filters), savedViews(i, "cost")]);
  const months = [...b.status.keys()].sort().reverse();
  const last12 = trend.points.slice(-12), prior12 = trend.points.slice(-24, -12);
  const lineRows = trend.lines.map((l) => {
    const cur = last12.reduce((s, p) => s + (p[l as never] as number), 0), prev = prior12.length === 12 ? prior12.reduce((s, p) => s + (p[l as never] as number), 0) : null;
    return { l, cur, prev, rr: runRate(trend.points.map((p) => p[l as never] as number)) };
  }).sort((a, c) => c.cur - a.cur);
  const revCur = last12.reduce((s, p) => s + p.revenue, 0), revPrev = prior12.length === 12 ? prior12.reduce((s, p) => s + p.revenue, 0) : null;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Cost Intelligence" title="Monthly cost trends" description="Actual, budget and forecast by month; run-rates and year-on-year change by P&L line." actions={<SavedViews companyId={i.ctx.company.companyId} module="cost" path={`${base}/trends`} views={views} />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControls grains={["month"]} grain="month" end={q.end} months={months} showCompare={false} />
          <ParamSelect name="range" label="Show" value={String(range)} options={[{ value: "12", label: "12 months" }, { value: "24", label: "24 months" }, { value: "36", label: "36 months" }]} />
          <ParamSelect name="line" label="Line" value={line ?? ""} options={[{ value: "", label: "All operating costs" }, ...trend.lines.map((l) => ({ value: l, label: lineLabel(l) }))]} />
        </div>
        <FilterBar dims={b.dims} active={q.chips} />
      </div>
      <Card>
        <CardHeader><CardTitle>{line ? lineLabel(line) : "Total operating costs"}: actual, budget and forecast</CardTitle></CardHeader>
        <CardContent>
          <ChartOrTable
            chart={<TimeSeries data={series.map((p) => ({ label: monthLabel(p.month), actual: p.actual, budget: p.budget, forecast: p.forecast }))} series={[{ key: "actual", label: "Actual", type: "bar" }, { key: "budget", label: "Budget", dashed: true, color: "var(--chart-muted)" }, { key: "forecast", label: "Forecast", color: "var(--chart-2)", dashed: true }]} />}
            table={
              <table className="w-full text-[13px] tabular">
                <thead className="border-b text-xs text-muted-foreground"><tr><th className="py-1.5 text-left font-medium">Month</th><th className="text-right font-medium">Actual</th><th className="text-right font-medium">Budget</th><th className="text-right font-medium">Forecast</th><th className="text-right font-medium">Status</th></tr></thead>
                <tbody className="divide-y">{series.map((p) => <tr key={p.month}><td className="py-1">{monthLabel(p.month, true)}</td><td className="text-right">{fmt(p.actual, "currency", { precise: true })}</td><td className="text-right">{fmt(p.budget, "currency", { precise: true })}</td><td className="text-right">{fmt(p.forecast, "currency", { precise: true })}</td><td className="text-right text-xs text-muted-foreground">{p.status}</td></tr>)}</tbody>
              </table>
            }
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>By P&amp;L line — 12 months to {monthLabel(q.end, true)}</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] whitespace-nowrap tabular">
            <thead className="border-b text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium" /><th className="px-2 text-right font-medium">Last 12 months</th><th className="px-2 text-right font-medium">Prior 12 months</th><th className="px-2 text-right font-medium">Year on year</th><th className="px-2 text-right font-medium">Run-rate (3-month, annualised)</th><th className="px-4 text-right font-medium">% of revenue</th></tr></thead>
            <tbody className="divide-y">
              {lineRows.map((r) => (
                <tr key={r.l}><td className="px-4 py-1.5 font-medium">{lineLabel(r.l)}</td><td className="px-2 text-right">{fmt(r.cur, "currency")}</td><td className="px-2 text-right text-muted-foreground">{fmt(r.prev, "currency")}</td><td className="px-2 text-right">{delta(r.cur, r.prev, "currency")?.text ?? "—"}</td><td className="px-2 text-right">{fmt(r.rr, "currency")}</td><td className="px-4 text-right">{fmt(revCur ? r.cur / revCur : null, "percent")}</td></tr>
              ))}
              <tr className="font-semibold"><td className="px-4 py-1.5">Recognised revenue</td><td className="px-2 text-right">{fmt(revCur, "currency")}</td><td className="px-2 text-right text-muted-foreground">{fmt(revPrev, "currency")}</td><td className="px-2 text-right">{delta(revCur, revPrev, "currency")?.text ?? "—"}</td><td /><td /></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
