import type { Metadata } from "next";
import Link from "next/link";
import { loadIntelligence, savedViews } from "@/lib/data/intelligence";
import { loadRevenueBase, provenance, retentionAt, retentionTrend } from "@/lib/analytics/revenue-service";
import { keepParams, viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt } from "@/lib/analytics/format";
import { gbp } from "@/lib/analytics/calc/revenue";
import { addMonths, monthLabel, monthRange } from "@/lib/analytics/period";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartOrTable, ExportButton, FilterBar, ParamSelect, PeriodControls, SavedViews } from "@/components/intelligence/controls";
import { CompareBars, TimeSeries } from "@/components/intelligence/charts";
import { KpiTile } from "@/components/intelligence/panels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Retention" };

const GROUPS = [
  { value: "product", label: "Product" },
  { value: "business_unit", label: "Business unit" },
  { value: "sector", label: "Public-sector category" },
  { value: "segment", label: "Customer segment" },
  { value: "size_band", label: "Customer size" },
  { value: "cohort_year", label: "Acquisition cohort (year)" },
  { value: "origin", label: "Organic / acquired" },
  { value: "geography", label: "Region" },
  { value: "contract_type", label: "Contract type" },
];
const WINDOWS = [{ value: "12", label: "Rolling 12 months" }, { value: "3", label: "Quarter (3 months)" }, { value: "1", label: "Month" }];

export default async function RetentionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadRevenueBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "month");
  const base = `${i.base}/revenue`;
  const windowMonths = [1, 3, 12].includes(Number(sp.window)) ? Number(sp.window) : 12;
  const extraGroups = b.dims.filter((d) => d.key.startsWith("attr:")).map((d) => ({ value: d.key, label: d.label }));
  const groups = [...GROUPS.filter((g) => g.value === "cohort_year" || b.dims.some((d) => d.key === g.value)), ...extraGroups];
  const group = typeof sp.group === "string" && groups.some((g) => g.value === sp.group) ? sp.group : "sector";
  const end = q.end;
  const trendEnds = (windowMonths === 3 ? monthRange(addMonths(end, -33), end).filter((m) => (Number(m.slice(5, 7)) - i.fyStart + 12) % 3 === 2) : monthRange(addMonths(end, -23), end));
  const [trend, now, yearAgo, bySeg, bySegYear, nrrT, grrT, views] = await Promise.all([
    retentionTrend(b, trendEnds, q.filters, windowMonths),
    retentionAt(b, end, q.filters, null, windowMonths),
    addMonths(end, -12 - windowMonths) >= b.coverage.start ? retentionAt(b, addMonths(end, -12), q.filters, null, windowMonths) : Promise.resolve([]),
    retentionAt(b, end, q.filters, group, windowMonths),
    addMonths(end, -12 - windowMonths) >= b.coverage.start ? retentionAt(b, addMonths(end, -12), q.filters, group, windowMonths) : Promise.resolve([]),
    b.src.targets("nrr"),
    b.src.targets("grr"),
    savedViews(i, "revenue"),
  ]);
  const r = now[0]?.ret, ry = yearAgo[0]?.ret;
  const months = [...b.status.keys()].sort().reverse().filter((m) => addMonths(m, -windowMonths) >= b.coverage.start);
  const winLabel = windowMonths === 12 ? `12 months to ${monthLabel(end, true)}` : windowMonths === 3 ? `3 months to ${monthLabel(end, true)}` : monthLabel(end, true);
  const win = monthRange(addMonths(end, -windowMonths + 1), end);
  const prov = (k: string) => provenance(b, k, winLabel, win);
  const labelOf = (k: string) => (group === "product" ? b.products.find((x) => x.key === k)?.name : b.dims.find((d) => d.key === group)?.values.find((v) => v.key === k)?.label) ?? (k === "acquired" ? "Acquired" : k === "organic" ? "Organic" : k);
  const kp = keepParams(sp, ["group", "window"]);
  const fkey = `f_${group}`;
  const filterable = b.dims.some((d) => d.key === group);
  const rows = bySeg.filter((s) => s.inputs.opening_arr > 0).sort((x, y) => y.inputs.opening_arr - x.inputs.opening_arr);
  const total = rows.reduce((s, x) => s + x.inputs.opening_arr, 0);
  const pol = b.policy;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Revenue Intelligence" title="Gross and net revenue retention" description="Retention of the opening cohort's ARR. New customers in the window are excluded, so they cannot inflate NRR; acquired customers join the base after the policy period." actions={<SavedViews companyId={i.ctx.company.companyId} module="revenue" path={`${base}/retention`} views={views} />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControls grains={["month"]} grain="month" end={end} months={months} showCompare={false} />
          <ParamSelect name="window" label="Window" value={String(windowMonths)} options={WINDOWS} />
        </div>
        <FilterBar dims={b.dims} active={q.chips} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Net Revenue Retention" value={r?.nrr ?? null} unit="percent" direction="higher_is_better" compare={{ label: "A year earlier", value: ry?.nrr ?? null }} target={windowMonths === 12 ? { label: "Target", value: nrrT.get(end)?.target ?? null } : null} provenance={prov("nrr")} />
        <KpiTile label="Gross Revenue Retention" value={r?.grr ?? null} unit="percent" direction="higher_is_better" compare={{ label: "A year earlier", value: ry?.grr ?? null }} target={windowMonths === 12 ? { label: "Target", value: grrT.get(end)?.target ?? null } : null} provenance={prov("grr")} />
        <KpiTile label="Logo retention" value={r?.logoRetention ?? null} unit="percent" direction="higher_is_better" compare={{ label: "A year earlier", value: ry?.logoRetention ?? null }} provenance={prov("logo_retention")} />
        <KpiTile label="Opening cohort ARR" value={r ? gbp(r.opening) : null} unit="currency" direction="neutral" provenance={prov("arr_total")} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{windowMonths === 12 ? "Rolling 12-month" : windowMonths === 3 ? "Quarterly" : "Monthly"} retention trend</CardTitle>
          <ExportButton href={`${base}/export?dataset=retention_trend&window=${windowMonths}&${kp}`} />
        </CardHeader>
        <CardContent>
          <ChartOrTable
            chart={<TimeSeries unit="percent" data={trend.map((t) => ({ label: monthLabel(t.end), nrr: t.ret.nrr, grr: t.ret.grr, logo: t.ret.logoRetention }))} series={[{ key: "nrr", label: "NRR" }, { key: "grr", label: "GRR", color: "var(--chart-2)" }, { key: "logo", label: "Logo retention", color: "var(--chart-muted)", dashed: true }]} reference={windowMonths === 12 && nrrT.get(end)?.target ? { value: nrrT.get(end)!.target!, label: "NRR target" } : null} />}
            table={
              <table className="w-full text-[13px] tabular">
                <thead className="border-b text-xs text-muted-foreground"><tr><th className="py-1.5 text-left font-medium">Window ending</th><th className="text-right font-medium">Opening ARR</th><th className="text-right font-medium">GRR</th><th className="text-right font-medium">NRR</th><th className="text-right font-medium">Logo</th><th className="text-right font-medium">Status</th></tr></thead>
                <tbody className="divide-y">{trend.map((t) => <tr key={t.end}><td className="py-1">{monthLabel(t.end, true)}</td><td className="text-right">{fmt(gbp(t.ret.opening), "currency")}</td><td className="text-right">{fmt(t.ret.grr, "percent")}</td><td className="text-right">{fmt(t.ret.nrr, "percent")}</td><td className="text-right">{fmt(t.ret.logoRetention, "percent")}</td><td className="text-right text-xs text-muted-foreground">{t.status.status}</td></tr>)}</tbody>
              </table>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By {groups.find((g) => g.value === group)!.label.toLowerCase()} — {winLabel}</CardTitle>
          <ParamSelect name="group" label="Compare by" value={group} options={groups} />
        </CardHeader>
        <div className="grid gap-4 p-4 2xl:grid-cols-[1fr_1.8fr]">
          <CompareBars unit="percent" reference={r?.nrr ? { value: r.nrr, label: "Company NRR" } : undefined} rows={rows.map((s) => ({ key: s.grp, label: labelOf(s.grp), value: s.ret.nrr, tone: s.ret.nrr !== null && r?.nrr != null && s.ret.nrr < r.nrr - 0.03 ? "down" : "neutral", href: !filterable ? undefined : `${base}/retention?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(kp)), [fkey]: s.grp, group: group === "product" ? "sector" : "product", window: String(windowMonths) })}` }))} />
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] whitespace-nowrap tabular">
              <thead className="border-b text-[11px] text-muted-foreground">
                <tr><th className="py-1.5 text-left font-medium" /><th className="px-2 text-right font-medium">Opening ARR</th><th className="px-2 text-right font-medium">Share</th><th className="px-2 text-right font-medium">Customers</th><th className="px-2 text-right font-medium">GRR</th><th className="px-2 text-right font-medium">NRR</th><th className="px-2 text-right font-medium">NRR a year earlier</th><th className="px-2 text-right font-medium">Contraction</th><th className="px-2 text-right font-medium">Churn</th><th className="px-2 text-right font-medium">Expansion</th></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((s) => {
                  const y = bySegYear.find((x) => x.grp === s.grp)?.ret;
                  const drill = (t: string) => `${base}/bridge?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(kp)), g: windowMonths === 12 ? "ltm" : windowMonths === 3 ? "quarter" : "month", end: end.slice(0, 7), [fkey]: s.grp, drill: t })}#drill`;
                  return (
                    <tr key={s.grp} className="hover:bg-accent/40">
                      <td className="py-1.5 pr-2 font-medium">{labelOf(s.grp)}</td>
                      <td className="px-2 text-right">{fmt(s.inputs.opening_arr, "currency")}</td>
                      <td className="px-2 text-right text-muted-foreground">{fmt(total ? s.inputs.opening_arr / total : null, "percent", { decimals: 0 })}</td>
                      <td className="px-2 text-right">{s.inputs.opening_logos}</td>
                      <td className="px-2 text-right">{fmt(s.ret.grr, "percent")}</td>
                      <td className={cn("px-2 text-right font-medium", s.ret.nrr !== null && r?.nrr != null && s.ret.nrr < r.nrr - 0.03 && "text-[var(--status-off-ink)]")}>{fmt(s.ret.nrr, "percent")}</td>
                      <td className="px-2 text-right text-muted-foreground">{fmt(y?.nrr ?? null, "percent")}</td>
                      <td className="px-2 text-right"><Link className="hover:underline" href={drill("contraction")}>{fmt(gbp(s.ret.contraction), "currency")}</Link></td>
                      <td className="px-2 text-right"><Link className="hover:underline" href={drill("churn")}>{fmt(gbp(s.ret.churn), "currency")}</Link></td>
                      <td className="px-2 text-right"><Link className="hover:underline" href={drill("expansion")}>{fmt(gbp(s.ret.expansion), "currency")}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">Amounts link to the customers behind them. Segment rows use customers&apos; current attributes; cohort analyses use attributes frozen at assignment.</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>How retention is measured here</CardTitle><Link href={`${base}/definitions`} className="text-xs text-brand-ink hover:underline">Definitions and history →</Link></CardHeader>
        <CardContent className="grid gap-x-8 gap-y-1 text-[13px] md:grid-cols-2">
          <p><span className="text-muted-foreground">Cohort:</span> customers holding ARR at the start of the window{group === "product" || q.filters.product ? " (customer × product when products are compared)" : ""}</p>
          <p><span className="text-muted-foreground">New customers in the window:</span> excluded</p>
          <p><span className="text-muted-foreground">Acquired customers:</span> join the base after {pol.acquired_wait_months} months of ownership</p>
          <p><span className="text-muted-foreground">Disposed customers:</span> removed from the base</p>
          <p><span className="text-muted-foreground">Reactivation in the window:</span> {pol.reactivation === "include_in_nrr" ? "counts in NRR, not GRR" : "excluded"}</p>
          <p><span className="text-muted-foreground">Customer transfers (e.g. merged councils):</span> {pol.transfers === "neutral" ? "neutral — treated as retained" : "counted as churn"}</p>
          <p><span className="text-muted-foreground">Corrections and reclassifications:</span> excluded</p>
          <p><span className="text-muted-foreground">Currency:</span> {pol.currency}</p>
          <p className="md:col-span-2"><span className="text-muted-foreground">Reconciliation:</span> opening + every cohort movement = cohort ARR at the end — {r?.reconciles ? "holds for this window" : "does not hold; see Data quality"}. Expansion and contraction are netted per customer per month; product views use customer × product.</p>
          <p className="text-xs text-muted-foreground md:col-span-2">Definitions v{b.defs.get("nrr")?.version}: {b.defs.get("nrr")?.change_note}</p>
        </CardContent>
      </Card>
    </div>
  );
}
