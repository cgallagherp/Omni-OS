import type { Metadata } from "next";
import Link from "next/link";
import { crewOptions, linkedInvestigations, linkedRecords, loadIntelligence, savedViews, strategicContext } from "@/lib/data/intelligence";
import { costOverview, costTrend, loadCostBase } from "@/lib/analytics/cost-service";
import { costExceptions } from "@/lib/analytics/exceptions";
import { lineLabel } from "@/lib/analytics/calc/cost";
import { gbp } from "@/lib/analytics/calc/revenue";
import { viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt, delta } from "@/lib/analytics/format";
import { monthLabel } from "@/lib/analytics/period";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar, PeriodControls, SavedViews } from "@/components/intelligence/controls";
import { TimeSeries } from "@/components/intelligence/charts";
import { ExceptionsPanel, KpiTile, LinkedRecords } from "@/components/intelligence/panels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cost Intelligence" };

export default async function CostOverview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadCostBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "quarter");
  const base = `${i.base}/cost`;
  const filtered = Object.keys(q.filters).length > 0;
  const [ov, trend, exceptions, linked, invs, crew, views, strat] = await Promise.all([
    costOverview(b, q.period, q.filters, q.compare, base),
    costTrend(b, q.end, 24, q.filters),
    filtered ? Promise.resolve([]) : costExceptions(b, b.coverage.end, i.base),
    linkedRecords(i, { module: "cost" }),
    linkedInvestigations(i),
    crewOptions(i),
    savedViews(i, "cost"),
    strategicContext(i, ["gross_margin", "ebitda", "revenue"]),
  ]);
  const months = [...b.status.keys()].sort().reverse();
  const cmpLabel = q.compare === "year" ? "Same period last year" : "Prior period";
  const lines = trend.lines.sort((a, c) => (trend.points.at(-1)?.[c as never] ?? 0) - (trend.points.at(-1)?.[a as never] ?? 0));
  const scenario = [
    { label: "Recognised revenue", f: (x: typeof ov.actual) => x.revenue, kind: "income" },
    { label: "Cost of sales", f: (x: typeof ov.actual) => x.cogs, kind: "cost" },
    { label: "Gross profit", f: (x: typeof ov.actual) => x.grossProfit, kind: "income" },
    { label: "Operating expenses", f: (x: typeof ov.actual) => x.opex, kind: "cost" },
    { label: "EBITDA", f: (x: typeof ov.actual) => x.ebitda, kind: "income" },
  ] as const;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Intelligence" title="Cost Intelligence" description="Where money is spent, what drives margin and why profitability differs from plan — from governed finance data. Accounting stays in the finance system." actions={<SavedViews companyId={i.ctx.company.companyId} module="cost" path={base} views={views} />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodControls grains={["month", "quarter", "ytd", "ltm"]} grain={q.grain} end={q.end} months={months} compare={q.compare} />
        <FilterBar dims={b.dims} active={q.chips} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{q.period.label}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {ov.kpis.map((k) => (
          <KpiTile key={k.key} label={k.label} value={k.value} unit={k.unit} compare={{ label: cmpLabel, value: k.prior }} target={{ label: "Budget", value: k.budget }} direction={k.kind === "cost" ? "lower_is_better" : "higher_is_better"} provenance={k.provenance} href={k.href} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Actual vs budget vs forecast — {q.period.short}</CardTitle><Link href={`${base}/analysis`} className="text-xs text-brand-ink hover:underline">Variance analysis →</Link></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] whitespace-nowrap tabular">
              <thead className="border-b text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium" /><th className="px-2 text-right font-medium">Actual</th><th className="px-2 text-right font-medium">Budget</th><th className="px-2 text-right font-medium">vs budget</th><th className="px-2 text-right font-medium">Forecast</th><th className="px-2 text-right font-medium">vs forecast</th><th className="px-4 text-right font-medium">{cmpLabel}</th></tr></thead>
              <tbody className="divide-y">
                {scenario.map((s) => {
                  const a = gbp(s.f(ov.actual)), bu = ov.budget ? gbp(s.f(ov.budget)) : null, fc = ov.forecast ? gbp(s.f(ov.forecast)) : null, pr = ov.prior ? gbp(s.f(ov.prior)) : null;
                  const fav = (x: number | null) => (x === null ? null : s.kind === "cost" ? a <= x : a >= x);
                  return (
                    <tr key={s.label} className={cn((s.label === "Gross profit" || s.label === "EBITDA") && "font-semibold")}>
                      <td className="px-4 py-1.5">{s.label}</td>
                      <td className="px-2 text-right">{fmt(a, "currency")}</td>
                      <td className="px-2 text-right text-muted-foreground">{fmt(bu, "currency")}</td>
                      <td className={cn("px-2 text-right", fav(bu) === false && "text-[var(--status-off-ink)]", fav(bu) && "text-[var(--status-on-ink)]")}>{bu === null ? "—" : fmt(a - bu, "currency", { signed: true })}</td>
                      <td className="px-2 text-right text-muted-foreground">{fmt(fc, "currency")}</td>
                      <td className={cn("px-2 text-right", fav(fc) === false && "text-[var(--status-off-ink)]")}>{fc === null ? "—" : fmt(a - fc, "currency", { signed: true })}</td>
                      <td className="px-4 text-right text-muted-foreground">{delta(a, pr, "currency")?.text ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CardContent className="grid gap-3 border-t pt-3 text-[13px] sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Fixed and variable costs (as defined in the chart of accounts)</p>
              {ov.fixedVariable.filter((x) => x.amount).map((x) => (
                <p key={x.key} className="flex justify-between"><span>{x.key.replace("_", "-")}</span><span className="tabular">{fmt(x.amount, "currency")} · {fmt(x.amount / (gbp(ov.actual.totalCosts) || 1), "percent", { decimals: 0 })}</span></p>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Cost growth vs revenue growth{ov.growthVs ? ` (vs ${ov.growthVs.period})` : ""}</p>
              {ov.growthVs ? (
                <>
                  <p className="flex justify-between"><span>Revenue</span><span className="tabular">{fmt(ov.growthVs.revenue, "percent", { signed: true })}</span></p>
                  <p className="flex justify-between"><span>Total operating costs</span><span className={cn("tabular", (ov.growthVs.costs ?? 0) > (ov.growthVs.revenue ?? 0) && "text-[var(--status-off-ink)]")}>{fmt(ov.growthVs.costs, "percent", { signed: true })}</span></p>
                  <p className="text-xs text-muted-foreground">{(ov.growthVs.costs ?? 0) > (ov.growthVs.revenue ?? 0) ? "Costs are growing faster than revenue." : "Revenue is growing faster than costs."}</p>
                </>
              ) : <p className="text-muted-foreground">No comparable period in the governed data.</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Gross margin and EBITDA</CardTitle><span className="text-xs text-muted-foreground">Monthly, vs budget</span></CardHeader>
          <CardContent>
            <TimeSeries unit="percent" height={150} data={trend.points.map((p) => ({ label: monthLabel(p.month), gm: p.grossMargin, budget: p.budgetGrossMargin }))} series={[{ key: "gm", label: "Gross margin" }, { key: "budget", label: "Budget", dashed: true, color: "var(--chart-muted)" }]} />
            <TimeSeries height={150} data={trend.points.map((p) => ({ label: monthLabel(p.month), ebitda: p.ebitda, budget: p.budgetEbitda }))} series={[{ key: "ebitda", label: "EBITDA", type: "bar", color: "var(--chart-2)" }, { key: "budget", label: "Budget", dashed: true, color: "var(--chart-muted)" }]} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Monthly operating costs by P&amp;L line</CardTitle><Link href={`${base}/trends`} className="text-xs text-brand-ink hover:underline">Trends →</Link></CardHeader>
        <CardContent>
          <TimeSeries data={trend.points.map((p) => ({ ...p, label: monthLabel(p.month) }))} series={[...lines.map((l) => ({ key: l, label: lineLabel(l), type: "bar" as const, stack: "c" })), { key: "budget", label: "Budget (total)", dashed: true, color: "var(--foreground)" }]} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        {!filtered ? (
          <ExceptionsPanel title="Cost and margin exceptions" exceptions={exceptions} companyId={i.ctx.company.companyId} slug={slug} crew={crew} investigations={invs} canWrite={i.ctx.can.write} />
        ) : (
          <Card><CardContent className="text-sm text-muted-foreground">Exceptions are assessed on the whole company; clear the filters to see them.</CardContent></Card>
        )}
        <div className="space-y-4">
          {ov.people && (
            <Card>
              <CardHeader><CardTitle>People</CardTitle><Link href={`${base}/people`} className="text-xs text-brand-ink hover:underline">People & productivity →</Link></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-[13px]">
                <p><span className="block text-xs text-muted-foreground">Headcount</span>{ov.people.headcount}{ov.people.budgetHeadcount !== null && <span className="text-xs text-muted-foreground"> / {ov.people.budgetHeadcount} budget</span>}</p>
                <p><span className="block text-xs text-muted-foreground">Employment cost</span>{fmt(ov.people.employmentCost, "currency")} ({fmt(ov.people.employmentCostPct, "percent", { decimals: 0 })} of revenue)</p>
                <p><span className="block text-xs text-muted-foreground">Revenue per FTE (annualised)</span>{fmt(ov.people.revenuePerFte, "currency")}</p>
                <p><span className="block text-xs text-muted-foreground">Cost per FTE (annualised)</span>{fmt(ov.people.costPerFte, "currency")}</p>
              </CardContent>
            </Card>
          )}
          {strat.ambition && <Card><CardContent className="text-[13px]"><span className="text-muted-foreground">North Star:</span> {strat.ambition}{strat.items.map((x) => <span key={x.title} className="mt-1 block"><span className="text-muted-foreground">{x.kind}:</span> <Link className="hover:underline" href={x.href}>{x.title}</Link></span>)}</CardContent></Card>}
          <LinkedRecords slug={slug} issues={linked.issues} actions={linked.actions} />
        </div>
      </div>
    </div>
  );
}
