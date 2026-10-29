import type { Metadata } from "next";
import Link from "next/link";
import { loadIntelligence, savedViews } from "@/lib/data/intelligence";
import { loadRevenueBase, provenance } from "@/lib/analytics/revenue-service";
import { keepParams, viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt } from "@/lib/analytics/format";
import { addMonths, monthLabel, monthsBetween } from "@/lib/analytics/period";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton, FilterBar, ParamSelect, PeriodControls, SavedViews } from "@/components/intelligence/controls";
import { TimeSeries } from "@/components/intelligence/charts";
import { CohortHeatmap } from "@/components/intelligence/panels";
import { MetricInfo } from "@/components/intelligence/provenance";

export const metadata: Metadata = { title: "Cohorts" };

const DIMENSIONS = [
  { value: "", label: "Acquisition date" },
  { value: "product", label: "Product (first purchased)" },
  { value: "business_unit", label: "Business unit" },
  { value: "sector", label: "Sector" },
  { value: "geography", label: "Region" },
  { value: "size_band", label: "Customer size" },
  { value: "origin", label: "Acquisition origin" },
  { value: "contract_type", label: "Contract type" },
  { value: "segment", label: "Segment" },
];
const STEP = { month: 1, quarter: 3, year: 12 } as const;

export default async function CohortsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadRevenueBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "month");
  const base = `${i.base}/revenue`;
  const dimension = typeof sp.dim === "string" && DIMENSIONS.some((d) => d.value === sp.dim) ? sp.dim : "";
  const cohortGrain = sp.cohort === "year" ? "year" : "quarter";
  const age = sp.age === "year" ? "year" : sp.age === "month" ? "month" : "quarter";
  const basis = sp.basis === "logo" ? "logo" : "revenue";
  const end = q.end;
  const [cells, views] = await Promise.all([
    b.src.cohorts({ last: end, cohort: cohortGrain, dimension: dimension || null, filters: q.filters, age }),
    savedViews(i, "revenue"),
  ]);
  const byCohort = new Map<string, typeof cells>();
  for (const c of cells) byCohort.set(c.cohort, [...(byCohort.get(c.cohort) ?? []), c]);
  const label = (k: string) => (dimension === "product" ? b.products.find((x) => x.key === k)?.name : dimension ? b.dims.find((d) => d.key === dimension)?.values.find((v) => v.key === k)?.label : null) ?? k;
  const rows = [...byCohort.entries()]
    .map(([cohort, cs]) => {
      const a0 = cs.find((c) => c.age === 0);
      const members = a0?.members ?? 0;
      return {
        cohort: label(cohort), key: cohort, members, initial: a0?.initial_arr ?? 0,
        cells: cs.map((c) => ({ age: c.age, members: c.members, partial: c.members < members, value: basis === "revenue" ? (c.initial_arr ? c.arr / c.initial_arr : null) : c.members ? c.active / c.members : null })),
        latest: cs.reduce((m, c) => (c.age > m.age ? c : m), cs[0]),
      };
    })
    .filter((r) => r.members > 0)
    .sort((x, y) => (dimension ? y.initial - x.initial : x.key.localeCompare(y.key)));
  const maxAge = Math.max(0, ...cells.map((c) => c.age));
  const ages = Array.from({ length: Math.min(maxAge, age === "month" ? 24 : age === "quarter" ? 14 : 4) + 1 }, (_, k) => k);
  const ageLabel = age === "month" ? "M" : age === "quarter" ? "Q" : "Y";
  const keep = Object.fromEntries(new URLSearchParams(keepParams(sp)));
  const drill = (cohort: string, a: number) => {
    const key = rows.find((r) => r.cohort === cohort)?.key ?? cohort;
    return `${base}/cohorts/members?${new URLSearchParams({ ...keep, ...(dimension ? { dim: dimension } : {}), cohort: key, cgrain: cohortGrain, age: String(a), step: String(STEP[age]) })}`;
  };
  // retention curves: the most recent cohorts (or every dimension value)
  const curveRows = (dimension ? rows.slice(0, 6) : rows.slice(-8)).map((r) => ({ key: r.key, label: r.cohort, cells: r.cells }));
  const curveData = ages.map((a) => Object.fromEntries([["label", `${ageLabel}${a}`], ...curveRows.map((r) => [r.key, r.cells.find((c) => c.age === a && !c.partial)?.value ?? null])]));
  const months = [...b.status.keys()].sort().reverse();
  const prov = provenance(b, basis === "revenue" ? "nrr" : "logo_retention", `Cohorts to ${monthLabel(end, true)}`, [end]);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Revenue Intelligence" title="Cohort analysis" description="How ARR and customer counts evolve for cohorts of customers. Membership is assigned once, with attributes frozen at assignment; changes need an explicit, recorded restatement." actions={<SavedViews companyId={i.ctx.company.companyId} module="revenue" path={`${base}/cohorts`} views={views} />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControls grains={["month"]} grain="month" end={end} months={months} showCompare={false} />
          <ParamSelect name="dim" label="Cohorts by" value={dimension} options={DIMENSIONS} />
          {!dimension && <ParamSelect name="cohort" label="Grouped by" value={cohortGrain} options={[{ value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }]} />}
          <ParamSelect name="age" label="Age in" value={age} options={[{ value: "month", label: "Months" }, { value: "quarter", label: "Quarters" }, { value: "year", label: "Years" }]} />
          <div role="radiogroup" aria-label="Basis" className="flex rounded-md border bg-card p-0.5">
            {(["revenue", "logo"] as const).map((x) => (
              <Link key={x} role="radio" aria-checked={basis === x} href={`${base}/cohorts?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(keepParams(sp, ["basis"]))), ...(dimension ? { dim: dimension } : {}), cohort: cohortGrain, age, basis: x })}`} className={`h-7 rounded px-2.5 text-[12.5px] leading-7 font-medium ${basis === x ? "bg-brand-subtle text-brand-ink" : "text-muted-foreground"}`}>
                {x === "revenue" ? "Revenue retention" : "Logo retention"}
              </Link>
            ))}
          </div>
        </div>
        <FilterBar dims={b.dims} active={q.chips} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {basis === "revenue" ? "Revenue retention: cohort ARR as a share of its initial ARR" : "Logo retention: share of cohort customers still holding ARR"}
            <MetricInfo p={prov} />
          </CardTitle>
          <ExportButton href={`${base}/export?dataset=cohorts&${new URLSearchParams({ ...keep, ...(dimension ? { dim: dimension } : {}), cohort: cohortGrain, age, basis })}`} />
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <CohortHeatmap rows={rows} ages={ages} basis={basis} ageLabel={ageLabel} drill={drill} />
          ) : (
            <p className="text-sm text-muted-foreground">No cohorts start within the governed data coverage for these filters.</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {basis === "revenue" ? "Above 100% (brand tint) the cohort has grown through expansion; below, it has contracted or churned." : "Logo retention can be lower than revenue retention when small customers leave."} Hatched cells include only the members that have reached that age. Customers acquired before {monthLabel(b.coverage.start, true)} pre-date the governed history and are not shown as cohorts. Click any cell for its customers.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Retention curves</CardTitle><span className="text-xs text-muted-foreground">{dimension ? "Largest groups" : "Most recent cohorts"}; complete ages only</span></CardHeader>
          <CardContent>
            <TimeSeries unit="percent" data={curveData} series={curveRows.map((r) => ({ key: r.key, label: r.label }))} reference={basis === "revenue" ? { value: 1, label: "100%" } : null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cohort summary</CardTitle></CardHeader>
          <div className="max-h-[340px] overflow-auto">
            <table className="w-full text-[12.5px] whitespace-nowrap tabular">
              <thead className="sticky top-0 border-b bg-card text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium">Cohort</th><th className="px-2 text-right font-medium">Customers</th><th className="px-2 text-right font-medium">Initial ARR</th><th className="px-2 text-right font-medium">Current ARR</th><th className="px-2 text-right font-medium">Net retention</th><th className="px-2 text-right font-medium">Still active</th><th className="px-4 text-right font-medium">Age</th></tr></thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-accent/40">
                    <td className="px-4 py-1.5 font-medium"><Link href={drill(r.cohort, r.latest.age)} className="hover:underline">{r.cohort}</Link></td>
                    <td className="px-2 text-right">{r.members}</td>
                    <td className="px-2 text-right">{fmt(r.initial, "currency")}</td>
                    <td className="px-2 text-right">{fmt(r.latest.arr, "currency")}</td>
                    <td className="px-2 text-right">{fmt(r.latest.initial_arr ? r.latest.arr / r.latest.initial_arr : null, "percent")}</td>
                    <td className="px-2 text-right">{r.latest.active} / {r.latest.members}</td>
                    <td className="px-4 text-right text-muted-foreground">{ageLabel}{r.latest.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">Coverage {monthLabel(b.coverage.start, true)} – {monthLabel(b.coverage.end, true)} ({monthsBetween(b.coverage.start, b.coverage.end) + 1} months). Age is measured from each customer&apos;s own first month of ARR. {addMonths(end, 0) !== b.coverage.end ? `Showing cohorts as at ${monthLabel(end, true)}.` : ""}</p>
    </div>
  );
}
