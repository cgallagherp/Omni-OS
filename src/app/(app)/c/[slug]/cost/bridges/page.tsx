import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { crewOptions, loadIntelligence, savedViews } from "@/lib/data/intelligence";
import { costProvenance, loadCostBase, profitBridges, type BridgeBasis } from "@/lib/analytics/cost-service";
import type { BridgeStep, ValueBridge } from "@/lib/analytics/calc/cost";
import { gbp } from "@/lib/analytics/calc/revenue";
import { keepParams, viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt } from "@/lib/analytics/format";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartOrTable, FilterBar, ParamSelect, PeriodControls, SavedViews } from "@/components/intelligence/controls";
import { Waterfall, type WaterfallStep } from "@/components/intelligence/charts";
import { MetricInfo } from "@/components/intelligence/provenance";
import { RaiseIssueButton } from "@/components/intelligence/actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Profit bridges" };

const LINE_FILTER: Record<string, string> = { hosting: "hosting", direct_labour: "direct_labour", third_party_delivery: "third_party_delivery", licences_cogs: "licences_cogs", other_direct: "other_direct", people: "people", sales_marketing: "sales_marketing", technology: "technology", g_and_a: "g_and_a", property: "property", other_opex: "other_opex" };

export default async function Bridges({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadCostBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "quarter");
  const base = `${i.base}/cost`;
  const basis: BridgeBasis = sp.basis === "year" || sp.basis === "budget" ? sp.basis : "prior";
  const mode = sp.mode === "mix" ? "mix" : "line";
  const [r, crew, views] = await Promise.all([profitBridges(b, q.period, basis, q.filters), crewOptions(i), savedViews(i, "cost")]);
  const months = [...b.status.keys()].sort().reverse();
  const kp = keepParams(sp, ["basis", "mode"]);
  const drillHref = (line: string) => (LINE_FILTER[line] ? `${base}/analysis?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(kp)), group: "account", f_line: line })}` : undefined);
  const baseLabel = basis === "budget" ? `Budget ${q.period.short}` : r.basePeriod.short;
  const steps = (v: ValueBridge, fromLabel: string, toLabel: string): WaterfallStep[] => [
    { key: "from", label: fromLabel, amount: gbp(v.from), kind: "total" },
    ...v.steps.map((s: BridgeStep) => ({ key: s.key, label: s.label, amount: gbp(s.amount), kind: (s.group === "rounding" ? "adjust" : s.amount >= 0 ? "up" : "down") as WaterfallStep["kind"], href: drillHref(s.key), note: s.group === "acquisition" ? "Acquired and disposed entities, kept apart from organic performance" : undefined })),
    { key: "to", label: toLabel, amount: gbp(v.to), kind: "total" },
  ];
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Cost Intelligence" title="Gross profit and EBITDA bridges" description="What moved profitability between two periods, or against budget. Every ledger row belongs to exactly one step, so nothing is counted twice; acquisitions and disposals are separated from organic performance." actions={<SavedViews companyId={i.ctx.company.companyId} module="cost" path={`${base}/bridges`} views={views} />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControls grains={["month", "quarter", "ytd", "ltm"]} grain={q.grain} end={q.end} months={months} showCompare={false} />
          <ParamSelect name="basis" label="Compare with" value={basis} options={[{ value: "prior", label: "Prior period" }, { value: "year", label: "Same period last year" }, { value: "budget", label: "Budget" }]} />
          <ParamSelect name="mode" label="Gross profit view" value={mode} options={[{ value: "line", label: "By cost line" }, { value: "mix", label: "Volume, mix and cost rate" }]} />
        </div>
        <FilterBar dims={b.dims} active={q.chips} />
      </div>
      {r.unavailable ? (
        <Card><CardContent className="text-sm text-muted-foreground">{r.unavailable}</CardContent></Card>
      ) : (
        <>
          <BridgeCard title={`Gross profit: ${baseLabel} → ${q.period.short}`} prov={<MetricInfo p={costProvenance(b, "gross_profit", q.period.label, q.period.months)} />} bridge={mode === "mix" && "steps" in r.gpVolumeMix ? r.gpVolumeMix : r.gpByLine} steps={steps(mode === "mix" && "steps" in r.gpVolumeMix ? r.gpVolumeMix : r.gpByLine, `${baseLabel} gross profit`, `${q.period.short} gross profit`)}
            note={
              <>
                <p>Gross margin {fmt(r.base.grossMargin, "percent")} → {fmt(r.current.grossMargin, "percent")}.</p>
                {mode === "mix" && !("steps" in r.gpVolumeMix) && <p className="text-[var(--status-risk-ink)]">Volume and mix view unavailable: {r.gpVolumeMix.unavailable} Showing the bridge by cost line instead.</p>}
                {r.gpByLine.unavailable.map((u) => <p key={u.key} className="text-muted-foreground"><span className="font-medium text-foreground">{u.label}:</span> {u.reason}</p>)}
              </>
            }
            action={i.ctx.can.write ? <RaiseIssueButton companyId={i.ctx.company.companyId} crew={crew} analyticsRef={{ module: "cost", metric_key: "gross_margin", period: q.end, label: `Gross margin ${fmt(r.current.grossMargin, "percent")} vs ${fmt(r.base.grossMargin, "percent")} (${baseLabel})`, href: `${base}/bridges?${keepParams(sp)}`, values: { actual: r.current.grossMargin, comparison: r.base.grossMargin, unit: "percent" } }} defaultTitle={`Gross margin ${fmt(r.current.grossMargin, "percent")} vs ${fmt(r.base.grossMargin, "percent")} ${basis === "budget" ? "budget" : baseLabel}`} /> : null}
          />
          <BridgeCard title={`EBITDA: ${baseLabel} → ${q.period.short}`} prov={<MetricInfo p={costProvenance(b, "ebitda", q.period.label, q.period.months)} />} bridge={r.ebitda} steps={steps(r.ebitda, `${baseLabel} EBITDA`, `${q.period.short} EBITDA`)}
            note={<p>EBITDA margin {fmt(r.base.ebitdaMargin, "percent")} → {fmt(r.current.ebitdaMargin, "percent")}. People costs here are non-direct employment costs; direct staff sit in gross profit.</p>}
          />
        </>
      )}
      <p className="text-xs text-muted-foreground">Select a cost bar to open the accounts behind it. <Link href={`${base}/definitions`} className="text-brand-ink hover:underline">Definitions</Link></p>
    </div>
  );
}

function BridgeCard({ title, prov, bridge, steps, note, action }: { title: string; prov: React.ReactNode; bridge: ValueBridge; steps: WaterfallStep[]; note: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{title} {prov}</CardTitle>
        <span className={cn("flex items-center gap-1 text-xs font-medium", bridge.reconciles ? "text-[var(--status-on-ink)]" : "text-[var(--status-off-ink)]")}>
          {bridge.reconciles ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}{bridge.reconciles ? "Steps sum exactly to the change" : "Does not reconcile"}
        </span>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[3fr_1fr]">
        <ChartOrTable
          chart={<Waterfall steps={steps} height={300} />}
          table={
            <table className="w-full text-[13px] tabular">
              <tbody className="divide-y">{steps.map((s) => <tr key={s.key} className={cn(s.kind === "total" && "font-semibold")}><td className="py-1.5">{s.label}</td><td className="text-right">{fmt(s.amount, "currency", { precise: true, signed: s.kind !== "total" })}</td></tr>)}</tbody>
            </table>
          }
        />
        <div className="space-y-2 text-[13px]">{note}{action}</div>
      </CardContent>
    </Card>
  );
}
