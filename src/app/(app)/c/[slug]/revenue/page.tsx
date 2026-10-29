import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { crewOptions, linkedInvestigations, linkedRecords, loadIntelligence, savedViews, strategicContext } from "@/lib/data/intelligence";
import { arrTrend, loadRevenueBase, retentionTrend, revenueOverview } from "@/lib/analytics/revenue-service";
import { revenueExceptions } from "@/lib/analytics/exceptions";
import { viewQuery, type SearchParams } from "@/lib/analytics/query";
import { addMonths, monthLabel, monthRange } from "@/lib/analytics/period";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar, PeriodControls, SavedViews } from "@/components/intelligence/controls";
import { TimeSeries } from "@/components/intelligence/charts";
import { ExceptionsPanel, KpiTile, LinkedRecords } from "@/components/intelligence/panels";

export const metadata: Metadata = { title: "Revenue Intelligence" };

export default async function RevenueOverview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadRevenueBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "quarter");
  const base = `${i.base}/revenue`;
  const filtered = Object.keys(q.filters).length > 0;
  const trendEnds = monthRange(addMonths(q.end, -17), q.end);
  const [ov, trend, ret, exceptions, linked, invs, crew, views, strat] = await Promise.all([
    revenueOverview(b, q.period, q.filters, q.compare, base),
    arrTrend(b, q.end, 24, q.filters),
    retentionTrend(b, trendEnds, q.filters),
    filtered ? Promise.resolve([]) : revenueExceptions(b, b.coverage.end, i.base),
    linkedRecords(i, { module: "revenue" }),
    linkedInvestigations(i),
    crewOptions(i),
    savedViews(i, "revenue"),
    strategicContext(i, ["arr_total", "nrr", "grr"]),
  ]);
  const months = [...b.status.keys()].sort().reverse();
  const target = (await b.src.targets("nrr")).get(q.end)?.target ?? null;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Intelligence"
        title="Revenue Intelligence"
        description="Where recurring revenue comes from, how it behaves and why customers expand, contract or leave — from governed ARR data."
        actions={<SavedViews companyId={i.ctx.company.companyId} module="revenue" path={base} views={views} />}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodControls grains={["month", "quarter", "ytd", "ltm"]} grain={q.grain} end={q.end} months={months} compare={q.compare} />
        <FilterBar dims={b.dims} active={q.chips} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {q.period.label} · movements for the period; retention over the {b.policy.window_months} months to {monthLabel(q.end, true)}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        {ov.kpis.map((k) => (
          <KpiTile key={k.key} label={k.label} value={k.value} unit={k.unit} compare={k.compare} target={k.target} direction={k.direction} provenance={k.provenance} href={k.href + (k.href.includes("?") ? "&" : "?") + new URLSearchParams(Object.entries(sp).filter(([key]) => key === "g" || key === "end" || key.startsWith("f_")).map(([key, v]) => [key, String(v)])).toString()} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ARR — organic and acquired</CardTitle>
            <span className="text-xs text-muted-foreground">Month end, 24 months{filtered ? "" : " · budget dashed"}</span>
          </CardHeader>
          <CardContent>
            <TimeSeries
              data={trend.map((t) => ({ label: monthLabel(t.month), organic: t.organic, acquired: t.acquired, budget: t.budget }))}
              series={[{ key: "organic", label: "Organic ARR", type: "area", stack: "a" }, { key: "acquired", label: "Acquired ARR", type: "area", stack: "a", color: "var(--chart-2)" }, ...(filtered ? [] : [{ key: "budget", label: "Budget", dashed: true, color: "var(--chart-muted)" }])]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly ARR movements</CardTitle>
            <Link href={`${base}/bridge?g=month`} className="text-xs text-brand-ink hover:underline">ARR bridge →</Link>
          </CardHeader>
          <CardContent>
            <TimeSeries
              data={trend.map((t) => ({ label: monthLabel(t.month), new: t.new, expansion: t.expansion, reactivation: t.reactivation, contraction: t.contraction, churn: t.churn, acquired: t.acquiredMove }))}
              series={[
                { key: "new", label: "New", type: "bar", stack: "m", color: "var(--chart-1)" },
                { key: "expansion", label: "Expansion", type: "bar", stack: "m", color: "var(--status-on)" },
                { key: "reactivation", label: "Reactivation", type: "bar", stack: "m", color: "var(--chart-3)" },
                { key: "acquired", label: "Acquired / disposed", type: "bar", stack: "m", color: "var(--chart-2)" },
                { key: "contraction", label: "Contraction", type: "bar", stack: "m", color: "var(--status-risk)" },
                { key: "churn", label: "Churn", type: "bar", stack: "m", color: "var(--status-off)" },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Retention — trailing {b.policy.window_months} months</CardTitle>
            <Link href={`${base}/retention`} className="text-xs text-brand-ink hover:underline">Retention analysis →</Link>
          </CardHeader>
          <CardContent>
            <TimeSeries
              unit="percent"
              height={220}
              reference={target ? { value: target, label: `NRR target ${(target * 100).toFixed(0)}%` } : null}
              data={ret.map((r) => ({ label: monthLabel(r.end), nrr: r.ret.nrr, grr: r.ret.grr, logo: r.ret.logoRetention }))}
              series={[{ key: "nrr", label: "NRR" }, { key: "grr", label: "GRR", color: "var(--chart-2)" }, { key: "logo", label: "Logo retention", color: "var(--chart-muted)", dashed: true }]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        {!filtered ? (
          <ExceptionsPanel title="Revenue exceptions" exceptions={exceptions} companyId={i.ctx.company.companyId} slug={slug} crew={crew} investigations={invs} canWrite={i.ctx.can.write} />
        ) : (
          <Card><CardContent className="text-sm text-muted-foreground">Exceptions are assessed on the whole company; clear the filters to see them.</CardContent></Card>
        )}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5"><Compass className="size-3.5" /> Strategic context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[13px]">
              {strat.ambition && <p><span className="text-muted-foreground">North Star:</span> {strat.ambition}</p>}
              {strat.items.map((x) => (
                <p key={x.title}><span className="text-muted-foreground">{x.kind}:</span> <Link href={x.href} className="hover:underline">{x.title}</Link></p>
              ))}
              {strat.kpis.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Bound KPIs (same governed numbers in Mission Control): {strat.kpis.map((k) => `${k.name}${k.scorecard ? " (Monday scorecard)" : ""}`).join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
          <LinkedRecords slug={slug} issues={linked.issues} actions={linked.actions} investigations={invs.filter((v) => !["resolved", "closed", "failed"].includes(v.status)).slice(0, 5)} />
        </div>
      </div>
    </div>
  );
}
