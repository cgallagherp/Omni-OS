import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { crewOptions, loadIntelligence, savedViews } from "@/lib/data/intelligence";
import { bridgeBySegment, bridgePeriods, bridgeSeries, loadRevenueBase, provenance } from "@/lib/analytics/revenue-service";
import { keepParams, viewQuery, type SearchParams } from "@/lib/analytics/query";
import { MOVEMENT_GROUP, MOVEMENT_LABEL, MOVEMENT_TYPES, type MovementType } from "@/lib/analytics/contracts";
import { gbp, type Bridge } from "@/lib/analytics/calc/revenue";
import { fmt } from "@/lib/analytics/format";
import type { Grain } from "@/lib/analytics/period";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartOrTable, ExportButton, FilterBar, ParamSelect, PeriodControls, SavedViews } from "@/components/intelligence/controls";
import { Waterfall, type WaterfallStep } from "@/components/intelligence/charts";
import { MetricInfo } from "@/components/intelligence/provenance";
import { DataStatusBadge } from "@/components/intelligence/status";
import { RaiseIssueButton } from "@/components/intelligence/actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "ARR bridge" };

const GROUPS = [
  { value: "product", label: "Product" },
  { value: "business_unit", label: "Business unit" },
  { value: "sector", label: "Sector" },
  { value: "segment", label: "Segment" },
  { value: "origin", label: "Organic / acquired" },
];

export default async function BridgePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadRevenueBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "quarter");
  const base = `${i.base}/revenue`;
  const group = typeof sp.group === "string" && GROUPS.some((x) => x.value === sp.group) ? sp.group : "product";
  const drill = typeof sp.drill === "string" && (MOVEMENT_TYPES as readonly string[]).includes(sp.drill) ? (sp.drill as MovementType) : null;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const historyGrain: Grain = q.grain === "ytd" || q.grain === "ltm" ? "month" : q.grain;
  const period = q.period;
  const [[cur], history, segments, closes, restatements, drillRows, crew, views] = await Promise.all([
    bridgeSeries(b, [period], q.filters),
    bridgeSeries(b, bridgePeriods(b, historyGrain, q.end, historyGrain === "year" ? 4 : 12), q.filters),
    bridgeBySegment(b, period, group, q.filters),
    b.src.closes("revenue"),
    b.src.restatements(),
    drill ? b.src.movementCustomers({ from: period.open, to: period.end, type: drill, filters: q.filters, limit: 50, offset: page * 50 }) : Promise.resolve(null),
    crewOptions(i),
    savedViews(i, "revenue"),
  ]);
  const br = cur.bridge;
  const kp = keepParams(sp, ["drill", "page"]);
  const href = (extra: Record<string, string>) => `${base}/bridge?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(kp)), ...extra })}`;
  const item = (t: MovementType) => br.items.find((x) => x.type === t)!.amount;
  const adjustments = (["migration", "transfer", "correction", "reclassification"] as const).filter((t) => item(t) !== 0);
  const steps: WaterfallStep[] = [
    { key: "open", label: `Opening ARR`, amount: gbp(br.opening), kind: "total" },
    ...(["new", "expansion", "contraction", "churn", "reactivation"] as const).map((t) => ({ key: t, label: MOVEMENT_LABEL[t], amount: gbp(item(t)), kind: (item(t) >= 0 ? "up" : "down") as WaterfallStep["kind"], href: href({ drill: t }) })),
    { key: "acquired", label: "Acquired ARR", amount: gbp(item("acquired")), kind: "up", href: href({ drill: "acquired" }), note: "Inorganic — excluded from organic growth and retention" },
    { key: "disposed", label: "Disposed ARR", amount: gbp(item("disposed")), kind: "down", href: href({ drill: "disposed" }), note: "Inorganic" },
    ...(adjustments.length ? [{ key: "adjust", label: "Other reconciled adjustments", amount: gbp(adjustments.reduce((s, t) => s + item(t), 0)), kind: "adjust" as const, note: adjustments.map((t) => MOVEMENT_LABEL[t]).join(", ") }] : []),
    ...(item("unclassified") ? [{ key: "unclassified", label: "Unclassified", amount: gbp(item("unclassified")), kind: "unclassified" as const, href: href({ drill: "unclassified" }), note: "Awaiting a valid reason code in billing" }] : []),
    { key: "close", label: "Closing ARR", amount: gbp(br.closing), kind: "total" },
  ];
  const closeRows = closes.filter((c) => c.month === period.end);
  const asReported = closeRows.find((c) => c.version === 1)?.metrics as Record<string, number> | undefined;
  const latest = closeRows.at(-1)?.metrics as Record<string, number> | undefined;
  const restated = restatements.find((r) => Object.keys(r.previous as object).includes(period.end));
  const months = [...b.status.keys()].sort().reverse();
  const prov = provenance(b, "arr_total", period.label, period.months);
  const pct = (v: number) => (br.opening ? v / br.opening : null);
  const exportQs = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(kp)) });
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Revenue Intelligence"
        title="ARR bridge"
        description="Opening ARR + new + expansion − contraction − churn + reactivation + acquired − disposed ± reconciled adjustments = closing ARR. Every bar opens the customers behind it."
        actions={<SavedViews companyId={i.ctx.company.companyId} module="revenue" path={`${base}/bridge`} views={views} />}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodControls grains={["month", "quarter", "year", "ltm"]} grain={q.grain} end={q.end} months={months} showCompare={false} />
        <FilterBar dims={b.dims} active={q.chips} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{period.label} <MetricInfo p={prov} label="ARR bridge" /></CardTitle>
            <div className="flex items-center gap-2">
              <DataStatusBadge status={cur.status.status} synthetic={prov.synthetic} title={cur.status.reasons.join("; ")} />
              <ExportButton href={`${base}/export?dataset=bridge&${exportQs}`} label="Export movements" />
            </div>
          </CardHeader>
          <CardContent>
            <ChartOrTable
              chart={<Waterfall steps={steps} height={320} />}
              table={
                <table className="w-full text-[13px] tabular">
                  <tbody className="divide-y">
                    {steps.map((s) => (
                      <tr key={s.key} className={cn(s.kind === "total" && "font-semibold")}>
                        <td className="py-1.5">{s.label}</td>
                        <td className="py-1.5 text-right">{fmt(s.amount, "currency", { precise: true, signed: s.kind !== "total" })}</td>
                        <td className="w-20 py-1.5 text-right text-muted-foreground">{s.kind === "total" ? "" : fmt(pct(s.amount * 100), "percent", { signed: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Reconciliation</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 tabular">
              <dt className="text-muted-foreground">Opening ARR</dt><dd>{fmt(gbp(br.opening), "currency", { precise: true })}</dd>
              <dt className="text-muted-foreground">Organic movements</dt><dd>{fmt(gbp(br.organic), "currency", { precise: true, signed: true })}</dd>
              <dt className="text-muted-foreground">Acquired / disposed</dt><dd>{fmt(gbp(br.inorganic), "currency", { precise: true, signed: true })}</dd>
              <dt className="text-muted-foreground">Reconciled adjustments</dt><dd>{fmt(gbp(br.adjustments), "currency", { precise: true, signed: true })}</dd>
              <dt className="text-muted-foreground">Unclassified</dt><dd>{fmt(gbp(br.unclassified), "currency", { precise: true, signed: true })}</dd>
              <dt className="border-t pt-1 font-medium">Opening + movements</dt><dd className="border-t pt-1">{fmt(gbp(br.computed), "currency", { precise: true })}</dd>
              <dt className="font-medium">Closing ARR (snapshot)</dt><dd>{fmt(gbp(br.closing), "currency", { precise: true })}</dd>
              <dt className="text-muted-foreground">Difference</dt><dd>{fmt(gbp(br.difference), "currency", { precise: true })}</dd>
            </dl>
            <p className={cn("flex items-center gap-1.5 font-medium", br.reconciles ? "text-[var(--status-on-ink)]" : "text-[var(--status-off-ink)]")}>
              {br.reconciles ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {br.reconciles ? "Movements reconcile exactly to closing ARR" : "The bridge does not reconcile — see Data quality"}
            </p>
            {br.unclassified !== 0 && <p className="text-xs text-[var(--status-risk-ink)]">{fmt(gbp(br.unclassified), "currency", { precise: true })} is unclassified. It is shown, not reallocated, until billing records a valid reason. The period is incomplete.</p>}
            {cur.status.reasons.length > 0 && <p className="text-xs text-muted-foreground">{cur.status.reasons.join(". ")}.</p>}
            <p className="text-xs text-muted-foreground">Organic growth {fmt(pct(br.organic), "percent", { signed: true })} · acquired ARR is shown separately and never included in organic growth or retention.</p>
            {asReported && latest && asReported.arr_total !== latest.arr_total && (
              <div className="rounded-md border border-dashed p-2 text-xs">
                <p className="font-medium">Restated</p>
                <p className="text-muted-foreground">As reported at close: {fmt(asReported.arr_total, "currency", { precise: true })}; restated: {fmt(latest.arr_total, "currency", { precise: true })}.</p>
                {restated && <p className="mt-1 text-muted-foreground">{restated.reason}</p>}
              </div>
            )}
            {i.ctx.can.write && (
              <RaiseIssueButton companyId={i.ctx.company.companyId} crew={crew} analyticsRef={{ module: "revenue", metric_key: "arr_total", period: period.end, label: `ARR bridge, ${period.label}`, href: `${base}/bridge?${kp}`, values: { actual: gbp(br.closing), comparison: gbp(br.opening), unit: "currency" }, filters: q.filters as Record<string, string[]> }} defaultTitle={`ARR movement, ${period.label}`} />
            )}
          </CardContent>
        </Card>
      </div>

      {drill && drillRows && (
        <Card id="drill">
          <CardHeader>
            <CardTitle>{MOVEMENT_LABEL[drill]} — {period.label}: {drillRows.total} customers, {fmt(drillRows.totalAmount ?? 0, "currency", { precise: true, signed: true })}</CardTitle>
            <div className="flex items-center gap-2">
              <ExportButton href={`${base}/export?dataset=movement_customers&type=${drill}&${exportQs}`} />
              <Link href={href({})} className="text-xs text-muted-foreground hover:text-foreground">Close</Link>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular">
              <thead className="border-b text-xs text-muted-foreground">
                <tr><th className="px-4 py-2 text-left font-medium">Customer</th><th className="px-2 text-left font-medium">Sector</th><th className="px-2 text-left font-medium">Business unit</th><th className="px-2 text-left font-medium">Account owner</th><th className="px-2 text-right font-medium">Months</th><th className="px-4 text-right font-medium">Movement</th></tr>
              </thead>
              <tbody className="divide-y">
                {drillRows.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-accent/40">
                    <td className="px-4 py-1.5"><Link href={`${base}/customers/${r.id}?${kp}`} className="font-medium hover:underline">{r.name}</Link></td>
                    <td className="px-2">{b.dims.find((d) => d.key === "sector")?.values.find((v) => v.key === r.sector)?.label ?? r.sector}</td>
                    <td className="px-2">{r.business_unit}</td>
                    <td className="px-2">{r.account_owner ?? "—"}</td>
                    <td className="px-2 text-right">{r.months}</td>
                    <td className="px-4 text-right">{fmt(r.amount, "currency", { precise: true, signed: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {drillRows.total > 50 && (
            <div className="flex justify-between border-t px-4 py-2 text-xs">
              {page > 0 ? <Link href={href({ drill, page: String(page - 1) })} className="text-brand-ink">← Previous</Link> : <span />}
              <span className="text-muted-foreground">{page * 50 + 1}–{Math.min((page + 1) * 50, drillRows.total)} of {drillRows.total}</span>
              {(page + 1) * 50 < drillRows.total ? <Link href={href({ drill, page: String(page + 1) })} className="text-brand-ink">Next →</Link> : <span />}
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>By {GROUPS.find((g) => g.value === group)!.label.toLowerCase()}</CardTitle>
          <ParamSelect name="group" label="Segment by" value={group} options={GROUPS} />
        </CardHeader>
        <BridgeTable rows={segments.map((s) => ({ key: s.grp, label: labelFor(b, group, s.grp), bridge: s.bridge }))} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History — {historyGrain === "month" ? "monthly" : historyGrain === "quarter" ? "quarterly" : "annual"}</CardTitle>
          <ExportButton href={`${base}/export?dataset=bridge_history&hg=${historyGrain}&${exportQs}`} />
        </CardHeader>
        <BridgeTable rows={history.map((h) => ({ key: h.period.end, label: h.period.short, bridge: h.bridge, status: h.status.status, href: href({ g: historyGrain === "year" ? "year" : historyGrain, end: h.period.end.slice(0, 7) }) }))} />
      </Card>
    </div>
  );
}

function labelFor(b: Awaited<ReturnType<typeof loadRevenueBase>>, group: string, key: string) {
  if (group === "product") return b.products.find((p) => p.key === key)?.name ?? key;
  return b.dims.find((d) => d.key === group)?.values.find((v) => v.key === key)?.label ?? key;
}

function BridgeTable({ rows }: { rows: Array<{ key: string; label: string; bridge: Bridge; status?: "validated" | "provisional" | "incomplete" | "missing"; href?: string }> }) {
  const cols = MOVEMENT_TYPES.filter((t) => rows.some((r) => r.bridge.items.find((x) => x.type === t)!.amount !== 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] whitespace-nowrap tabular">
        <thead className="border-b text-[11px] text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium" />
            <th className="px-2 text-right font-medium">Opening</th>
            {cols.map((t) => <th key={t} className={cn("px-2 text-right font-medium", MOVEMENT_GROUP[t] !== "organic" && "text-muted-foreground/80 italic")}>{MOVEMENT_LABEL[t].replace(" ARR", "")}</th>)}
            <th className="px-2 text-right font-medium">Closing</th>
            <th className="px-2 text-right font-medium">Organic</th>
            <th className="px-4 text-right font-medium">Check</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-accent/40">
              <td className="px-4 py-1.5 font-medium whitespace-nowrap">{r.href ? <Link href={r.href} className="hover:underline">{r.label}</Link> : r.label}</td>
              <td className="px-2 text-right">{fmt(gbp(r.bridge.opening), "currency")}</td>
              {cols.map((t) => { const v = r.bridge.items.find((x) => x.type === t)!.amount; return <td key={t} className={cn("px-2 text-right", v < 0 && "text-[var(--status-off-ink)]")}>{v ? fmt(gbp(v), "currency", { signed: true }) : "—"}</td>; })}
              <td className="px-2 text-right font-medium">{fmt(gbp(r.bridge.closing), "currency")}</td>
              <td className="px-2 text-right">{r.bridge.opening ? fmt(r.bridge.organic / r.bridge.opening, "percent", { signed: true }) : "—"}</td>
              <td className="px-4 text-right">
                <span className="inline-flex items-center gap-1.5">
                  {r.bridge.reconciles ? <CheckCircle2 className="size-3.5 text-[var(--status-on)]" aria-label="Reconciles" /> : <XCircle className="size-3.5 text-[var(--status-off)]" aria-label="Does not reconcile" />}
                  {r.status && r.status !== "validated" && <span className={cn("text-[11px]", r.status === "incomplete" ? "text-[var(--status-off-ink)]" : "text-[var(--status-risk-ink)]")}>{r.status}</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

