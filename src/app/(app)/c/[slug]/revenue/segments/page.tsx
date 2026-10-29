import type { Metadata } from "next";
import Link from "next/link";
import { loadIntelligence, savedViews } from "@/lib/data/intelligence";
import { bridgeBySegment, loadRevenueBase, retentionAt } from "@/lib/analytics/revenue-service";
import { keepParams, viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt } from "@/lib/analytics/format";
import { gbp } from "@/lib/analytics/calc/revenue";
import { addMonths, monthLabel, monthRange } from "@/lib/analytics/period";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton, FilterBar, ParamSelect, PeriodControls, SavedViews } from "@/components/intelligence/controls";
import { TimeSeries } from "@/components/intelligence/charts";

export const metadata: Metadata = { title: "Segments" };

export default async function SegmentsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadRevenueBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "ltm");
  const base = `${i.base}/revenue`;
  const options = [...b.dims.filter((d) => d.key !== "tenure").map((d) => ({ value: d.key, label: d.label }))];
  const group = typeof sp.group === "string" && options.some((o) => o.value === sp.group) ? sp.group : "sector";
  const ms = monthRange(addMonths(q.end, -23), q.end).filter((m) => m >= b.coverage.start);
  const [segs, ret, mix, views] = await Promise.all([
    bridgeBySegment(b, q.period, group, q.filters),
    retentionAt(b, q.end, q.filters, group),
    b.src.arrAt(ms, q.filters, group, ms[0]),
    savedViews(i, "revenue"),
  ]);
  const label = (k: string) => (group === "product" ? b.products.find((x) => x.key === k)?.name : b.dims.find((d) => d.key === group)?.values.find((v) => v.key === k)?.label) ?? k;
  const total = segs.reduce((s, x) => s + x.bridge.closing, 0);
  const keys = [...new Set(mix.map((r) => r.grp))].sort((a, c) => (mix.filter((r) => r.grp === c && r.month === q.end)[0]?.arr ?? 0) - (mix.filter((r) => r.grp === a && r.month === q.end)[0]?.arr ?? 0)).slice(0, 8);
  const mixData = ms.map((m) => Object.fromEntries([["label", monthLabel(m)], ...keys.map((k) => [k, mix.find((r) => r.grp === k && r.month === m)?.arr ?? 0])]));
  const kp = keepParams(sp, ["group"]);
  const fkey = `f_${group}`;
  const months = [...b.status.keys()].sort().reverse();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Revenue Intelligence" title="Revenue segmentation" description="Compare segments to see where growth comes from and where it leaks. Select any segment to filter every analysis to it." actions={<SavedViews companyId={i.ctx.company.companyId} module="revenue" path={`${base}/segments`} views={views} />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControls grains={["month", "quarter", "ytd", "ltm"]} grain={q.grain} end={q.end} months={months} showCompare={false} />
          <ParamSelect name="group" label="Segment by" value={group} options={options} />
        </div>
        <FilterBar dims={b.dims} active={q.chips} />
      </div>
      <Card>
        <CardHeader><CardTitle>ARR by {options.find((o) => o.value === group)?.label.toLowerCase()} — 24 months</CardTitle></CardHeader>
        <CardContent>
          <TimeSeries data={mixData} series={keys.map((k) => ({ key: k, label: label(k), type: "area" as const, stack: "s" }))} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{q.period.label}</CardTitle>
          <ExportButton href={`${base}/export?dataset=segments&group=${group}&${kp}`} />
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] whitespace-nowrap tabular">
            <thead className="border-b text-[11px] text-muted-foreground">
              <tr><th className="px-4 py-2 text-left font-medium" /><th className="px-2 text-right font-medium">Closing ARR</th><th className="px-2 text-right font-medium">Share</th><th className="px-2 text-right font-medium">Net change</th><th className="px-2 text-right font-medium">Organic growth</th><th className="px-2 text-right font-medium">New</th><th className="px-2 text-right font-medium">Expansion</th><th className="px-2 text-right font-medium">Contraction</th><th className="px-2 text-right font-medium">Churn</th><th className="px-2 text-right font-medium">GRR (LTM)</th><th className="px-2 text-right font-medium">NRR (LTM)</th><th className="px-4 text-right font-medium">Customers</th></tr>
            </thead>
            <tbody className="divide-y">
              {segs.filter((s) => s.bridge.closing || s.bridge.opening).map((s) => {
                const r = ret.find((x) => x.grp === s.grp)?.ret;
                const it = (t: string) => gbp(s.bridge.items.find((x) => x.type === t)!.amount);
                const filterHref = (path: string) => `${base}${path}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(kp)), [fkey]: s.grp })}`;
                return (
                  <tr key={s.grp} className="hover:bg-accent/40">
                    <td className="px-4 py-1.5 font-medium"><Link href={filterHref("")} className="hover:underline">{label(s.grp)}</Link></td>
                    <td className="px-2 text-right">{fmt(gbp(s.bridge.closing), "currency")}</td>
                    <td className="px-2 text-right text-muted-foreground">{fmt(total ? s.bridge.closing / total : null, "percent", { decimals: 0 })}</td>
                    <td className="px-2 text-right">{fmt(gbp(s.bridge.closing - s.bridge.opening), "currency", { signed: true })}</td>
                    <td className="px-2 text-right">{s.bridge.opening ? fmt(s.bridge.organic / s.bridge.opening, "percent", { signed: true }) : "—"}</td>
                    <td className="px-2 text-right">{fmt(it("new"), "currency")}</td>
                    <td className="px-2 text-right">{fmt(it("expansion"), "currency")}</td>
                    <td className="px-2 text-right"><Link className="hover:underline" href={`${filterHref("/bridge")}&drill=contraction#drill`}>{fmt(it("contraction"), "currency")}</Link></td>
                    <td className="px-2 text-right"><Link className="hover:underline" href={`${filterHref("/bridge")}&drill=churn#drill`}>{fmt(it("churn"), "currency")}</Link></td>
                    <td className="px-2 text-right">{fmt(r?.grr ?? null, "percent")}</td>
                    <td className="px-2 text-right font-medium">{fmt(r?.nrr ?? null, "percent")}</td>
                    <td className="px-4 text-right"><Link className="hover:underline" href={filterHref("/customers")}>{mix.find((x) => x.grp === s.grp && x.month === q.end)?.customers ?? "—"}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
