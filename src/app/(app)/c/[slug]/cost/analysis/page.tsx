import type { Metadata } from "next";
import Link from "next/link";
import { crewOptions, loadIntelligence, savedViews } from "@/lib/data/intelligence";
import { costAnalysis, costSeries, groupLabel, loadCostBase } from "@/lib/analytics/cost-service";
import { keepParams, viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt } from "@/lib/analytics/format";
import { monthLabel } from "@/lib/analytics/period";
import { formatDate } from "@/lib/domain/format";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton, FilterBar, ParamSelect, PeriodControls, SavedViews } from "@/components/intelligence/controls";
import { TimeSeries } from "@/components/intelligence/charts";
import { RaiseIssueButton } from "@/components/intelligence/actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Budget vs actual" };

const GROUPS = [
  { value: "line", label: "P&L line" },
  { value: "department", label: "Department" },
  { value: "function", label: "Function" },
  { value: "cost_centre", label: "Cost centre" },
  { value: "account", label: "GL account" },
  { value: "supplier", label: "Supplier" },
  { value: "business_unit", label: "Business unit" },
  { value: "product", label: "Product" },
  { value: "location", label: "Location" },
  { value: "origin", label: "Acquisition origin" },
  { value: "behaviour", label: "Fixed / variable" },
  { value: "controllable", label: "Controllable" },
];
const NEXT: Record<string, string> = { line: "account", department: "account", function: "department", cost_centre: "account", account: "supplier", supplier: "account", business_unit: "line", product: "line", location: "department", origin: "line", behaviour: "account", controllable: "account" };
const FILTER_OF: Record<string, string> = { line: "line", department: "department", function: "function", cost_centre: "cost_centre", account: "account", supplier: "supplier", business_unit: "business_unit", product: "product", location: "location", origin: "origin" };

export default async function CostAnalysis({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadCostBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "quarter");
  const base = `${i.base}/cost`;
  const group = typeof sp.group === "string" && GROUPS.some((g) => g.value === sp.group) ? sp.group : "department";
  const key = typeof sp.key === "string" ? sp.key.slice(0, 120) : null;
  const by = typeof sp.by === "string" && GROUPS.some((g) => g.value === sp.by) ? sp.by : NEXT[group];
  const drillFilters = key && FILTER_OF[group] ? { ...q.filters, [FILTER_OF[group]]: [key] } : q.filters;
  const txAccount = (group === "account" && key) || (Array.isArray(q.filters.account) && q.filters.account.length === 1 ? q.filters.account[0] : null);
  const txSupplier = (group === "supplier" && key) || (Array.isArray(q.filters.supplier) && q.filters.supplier.length === 1 ? q.filters.supplier[0] : null);
  const txCc = (group === "cost_centre" && key) || (Array.isArray(q.filters.cost_centre) && q.filters.cost_centre.length === 1 ? q.filters.cost_centre[0] : null);
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const [an, drill, series, tx, crew, views] = await Promise.all([
    costAnalysis(b, q.period, group, q.filters),
    key && FILTER_OF[group] ? costAnalysis(b, q.period, by, drillFilters) : Promise.resolve(null),
    key ? costSeries(b, q.end, 24, group === "line" ? "line" : group, key, q.filters) : Promise.resolve(null),
    b.canTransactions && (txAccount || txSupplier || txCc) ? b.src.transactions({ from: q.period.start, to: q.period.end, account: txAccount, supplier: txSupplier, costCentre: txCc, limit: 50, offset: page * 50 }) : Promise.resolve(null),
    crewOptions(i),
    savedViews(i, "cost"),
  ]);
  const kp = keepParams(sp, ["key", "by", "page"]);
  const link = (extra: Record<string, string>) => `${base}/analysis?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(kp)), group, ...extra })}`;
  const months = [...b.status.keys()].sort().reverse();
  const keyLabel = key ? groupLabel(b, group, key) : null;
  const sel = key ? an.lines.find((l) => l.key === key) : null;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Cost Intelligence" title="Budget vs actual" description="Operating costs by any governed dimension, against budget, forecast, the prior period and last year. Select a row to drill down to its accounts, suppliers and transactions." actions={<SavedViews companyId={i.ctx.company.companyId} module="cost" path={`${base}/analysis`} views={views} />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControls grains={["month", "quarter", "ytd", "ltm"]} grain={q.grain} end={q.end} months={months} showCompare={false} />
          <ParamSelect name="group" label="By" value={group} options={GROUPS} />
        </div>
        <div className="flex items-center gap-2">
          <FilterBar dims={b.dims} active={q.chips} />
          <ExportButton href={`${base}/export?dataset=analysis&group=${group}&${kp}`} />
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>{q.period.label} — total operating costs {fmt(an.total, "currency")}</CardTitle>{!an.hasBudget && <span className="text-xs text-[var(--status-risk-ink)]">No budget for these months</span>}</CardHeader>
        <VarianceTable lines={an.lines} hasForecast={an.hasForecast} rowHref={FILTER_OF[group] ? (k) => link({ key: k }) : undefined} selected={key} />
      </Card>

      {key && sel && (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <Card>
              <CardHeader><CardTitle>{keyLabel}: 24-month trend</CardTitle><Link href={link({})} className="text-xs text-muted-foreground hover:text-foreground">Close</Link></CardHeader>
              <CardContent>
                <TimeSeries data={(series ?? []).map((p) => ({ label: monthLabel(p.month), actual: p.actual, budget: p.budget, forecast: p.forecast }))} series={[{ key: "actual", label: "Actual", type: "bar" }, { key: "budget", label: "Budget", dashed: true, color: "var(--chart-muted)" }, { key: "forecast", label: "Forecast", dashed: true, color: "var(--chart-2)" }]} height={220} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Variance</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-[13px]">
                <p>Actual {fmt(sel.actual, "currency", { precise: true })} against budget {fmt(sel.budget, "currency", { precise: true })}: <span className={cn("font-medium", sel.favourable === false && "text-[var(--status-off-ink)]", sel.favourable && "text-[var(--status-on-ink)]")}>{sel.variance === null ? "no budget" : `${fmt(sel.variance, "currency", { signed: true })} (${fmt(sel.variancePct, "percent", { signed: true })})`}</span></p>
                <p className="text-muted-foreground">Run-rate {fmt(sel.runRate, "currency")} a year against a budgeted run-rate of {fmt(sel.budgetRunRate, "currency")}. Year on year {fmt(sel.yoy, "percent", { signed: true })}.</p>
                <p className="text-xs text-muted-foreground">Whether a variance is temporary or structural is judged from its persistence across months and the transactions behind it; the CEO Agent applies the same test when investigating.</p>
                {i.ctx.can.write && <RaiseIssueButton companyId={i.ctx.company.companyId} crew={crew} analyticsRef={{ module: "cost", metric_key: "total_costs", period: q.end, label: `${keyLabel}: ${fmt(sel.actual, "currency")} vs ${fmt(sel.budget, "currency")} budget, ${q.period.label}`, href: link({ key }), values: { actual: sel.actual, comparison: sel.budget, unit: "currency" }, filters: drillFilters as Record<string, string[]> }} defaultTitle={`${keyLabel} over budget (${q.period.short})`} />}
              </CardContent>
            </Card>
          </div>
          {drill && (
            <Card>
              <CardHeader>
                <CardTitle>{keyLabel} by {GROUPS.find((g) => g.value === by)?.label.toLowerCase()}</CardTitle>
                <ParamSelect name="by" label="Break down by" value={by} options={GROUPS.filter((g) => g.value !== group)} />
              </CardHeader>
              <VarianceTable lines={drill.lines} hasForecast={drill.hasForecast} rowHref={FILTER_OF[by] ? (k) => `${base}/analysis?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(kp)), [`f_${FILTER_OF[group]}`]: key, group: by, key: k })}` : undefined} />
            </Card>
          )}
        </>
      )}

      {tx && (
        <Card>
          <CardHeader><CardTitle>Transactions — {q.period.label}: {tx.total}</CardTitle><span className="text-xs text-muted-foreground">Purchase ledger (read only; processing stays in the finance system)</span></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] whitespace-nowrap tabular">
              <thead className="border-b text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium">Posted</th><th className="px-2 text-left font-medium">Reference</th><th className="px-2 text-left font-medium">Description</th><th className="px-2 text-left font-medium">Account</th><th className="px-2 text-left font-medium">Cost centre</th><th className="px-4 text-right font-medium">Amount</th></tr></thead>
              <tbody className="divide-y">
                {tx.rows.map((t) => (
                  <tr key={t.id}><td className="px-4 py-1">{formatDate(t.posted_on)}</td><td className="px-2 font-mono text-[11px]">{t.reference}</td><td className="px-2">{t.description}</td><td className="px-2">{groupLabel(b, "account", t.account_code)}</td><td className="px-2">{t.cost_centre_code}</td><td className="px-4 text-right">{fmt(t.amount, "currency", { precise: true })}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {tx.total > 50 && (
            <div className="flex justify-between border-t px-4 py-2 text-xs">
              {page > 0 ? <Link href={link({ ...(key ? { key } : {}), page: String(page - 1) })} className="text-brand-ink">← Previous</Link> : <span />}
              <span className="text-muted-foreground">{page * 50 + 1}–{Math.min((page + 1) * 50, tx.total)} of {tx.total}</span>
              {(page + 1) * 50 < tx.total ? <Link href={link({ ...(key ? { key } : {}), page: String(page + 1) })} className="text-brand-ink">Next →</Link> : <span />}
            </div>
          )}
        </Card>
      )}
      {!b.canTransactions && (txAccount || txSupplier || txCc) && <p className="text-xs text-muted-foreground">Transaction detail is restricted; ask an administrator for the transactions domain.</p>}
    </div>
  );
}

function VarianceTable({ lines, hasForecast, rowHref, selected }: { lines: Awaited<ReturnType<typeof costAnalysis>>["lines"]; hasForecast: boolean; rowHref?: (key: string) => string; selected?: string | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] whitespace-nowrap tabular">
        <thead className="border-b text-[11px] text-muted-foreground">
          <tr><th className="px-4 py-1.5 text-left font-medium" /><th className="px-2 text-right font-medium">Actual</th><th className="px-2 text-right font-medium">Budget</th><th className="px-2 text-right font-medium">Variance</th><th className="px-2 text-right font-medium">%</th>{hasForecast && <th className="px-2 text-right font-medium">Forecast</th>}<th className="px-2 text-right font-medium">Prior period</th><th className="px-2 text-right font-medium">Year on year</th><th className="px-2 text-right font-medium">Run-rate</th><th className="px-4 text-right font-medium">Share</th></tr>
        </thead>
        <tbody className="divide-y">
          {lines.map((l) => (
            <tr key={l.key} className={cn("hover:bg-accent/40", selected === l.key && "bg-brand-subtle")}>
              <td className="max-w-[320px] truncate px-4 py-1.5 font-medium">{rowHref ? <Link href={rowHref(l.key)} className="hover:underline">{l.label}</Link> : l.label}</td>
              <td className="px-2 text-right">{fmt(l.actual, "currency")}</td>
              <td className="px-2 text-right text-muted-foreground">{fmt(l.budget, "currency")}</td>
              <td className={cn("px-2 text-right", l.favourable === false && "text-[var(--status-off-ink)]", l.favourable && "text-[var(--status-on-ink)]")}>{l.variance === null ? "—" : fmt(l.variance, "currency", { signed: true })}</td>
              <td className={cn("px-2 text-right", l.favourable === false && "text-[var(--status-off-ink)]")}>{fmt(l.variancePct, "percent", { signed: true })}</td>
              {hasForecast && <td className="px-2 text-right text-muted-foreground">{fmt(l.forecast, "currency")}</td>}
              <td className="px-2 text-right text-muted-foreground">{fmt(l.prior, "currency")}</td>
              <td className="px-2 text-right">{fmt(l.yoy, "percent", { signed: true })}</td>
              <td className="px-2 text-right">{fmt(l.runRate, "currency")}</td>
              <td className="px-4 text-right text-muted-foreground">{fmt(l.share, "percent", { decimals: 0 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
