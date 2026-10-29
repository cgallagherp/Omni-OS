import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { loadIntelligence } from "@/lib/data/intelligence";
import { bridgePeriods, bridgeSeries, loadRevenueBase } from "@/lib/analytics/revenue-service";
import { gbp } from "@/lib/analytics/calc/revenue";
import { fmt } from "@/lib/analytics/format";
import { monthLabel } from "@/lib/analytics/period";
import { formatDate, formatDateTime } from "@/lib/domain/format";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataStatusBadge } from "@/components/intelligence/status";
import { DqChecks } from "@/components/intelligence/quality";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Revenue data quality" };

export default async function RevenueQuality({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = await loadIntelligence(slug);
  const b = await loadRevenueBase(i.src!, i.fyStart);
  const periods = bridgePeriods(b, "month", b.coverage.end, 24);
  const [series, recon, dq, restatements, closes] = await Promise.all([bridgeSeries(b, periods), b.src.reconciliation(), b.src.dataQuality("revenue"), b.src.restatements(), b.src.closes("revenue")]);
  const synthetic = i.src!.info.is_synthetic;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Revenue Intelligence" title="Reconciliation and data quality" description="Whether the figures are validated, provisional or incomplete, why, and what needs correcting in which source system. Numbers are never adjusted to make a bridge reconcile." />
      <div className="grid gap-3 md:grid-cols-4">
        {b.datasets.filter((d) => d.domain === "revenue" || d.domain === "shared").map((d) => (
          <Card key={d.key} className="p-3 text-xs">
            <p className="text-[13px] font-medium">{d.label}</p>
            <p className="text-muted-foreground">{d.source_system} → <span className="font-mono">{d.model}</span></p>
            <p className="mt-1 text-muted-foreground">{d.row_count.toLocaleString("en-GB")} rows · {d.coverage_start ? monthLabel(d.coverage_start) : "—"}–{d.coverage_end ? monthLabel(d.coverage_end) : "—"}</p>
            <p className="text-muted-foreground">Refreshed {formatDateTime(d.refreshed_at)} · {d.calc_version}</p>
            {synthetic && <p className="mt-1 font-medium text-muted-foreground">Synthetic</p>}
          </Card>
        ))}
      </div>

      <DqChecks rows={dq} />

      <Card>
        <CardHeader><CardTitle>Monthly ARR reconciliation</CardTitle><span className="text-xs text-muted-foreground">Opening + classified movements = closing snapshot</span></CardHeader>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-[12.5px] whitespace-nowrap tabular">
            <thead className="sticky top-0 border-b bg-card text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium">Month</th><th className="px-2 text-right font-medium">Opening</th><th className="px-2 text-right font-medium">Movements</th><th className="px-2 text-right font-medium">of which unclassified</th><th className="px-2 text-right font-medium">Closing</th><th className="px-2 text-right font-medium">Difference</th><th className="px-2 text-right font-medium">As reported at close</th><th className="px-4 text-right font-medium">Status</th></tr></thead>
            <tbody className="divide-y">
              {[...series].reverse().map((s) => {
                const cl = closes.filter((c) => c.month === s.period.end);
                const v1 = (cl.find((c) => c.version === 1)?.metrics as Record<string, number> | undefined)?.arr_total;
                const restated = v1 !== undefined && Math.round(v1) !== Math.round(gbp(s.bridge.closing));
                return (
                  <tr key={s.period.end}>
                    <td className="px-4 py-1">{monthLabel(s.period.end, true)}</td>
                    <td className="px-2 text-right">{fmt(gbp(s.bridge.opening), "currency", { precise: true })}</td>
                    <td className="px-2 text-right">{fmt(gbp(s.bridge.computed - s.bridge.opening), "currency", { precise: true, signed: true })}</td>
                    <td className={cn("px-2 text-right", s.bridge.unclassified && "text-[var(--status-risk-ink)]")}>{s.bridge.unclassified ? fmt(gbp(s.bridge.unclassified), "currency", { precise: true }) : "—"}</td>
                    <td className="px-2 text-right">{fmt(gbp(s.bridge.closing), "currency", { precise: true })}</td>
                    <td className="px-2 text-right"><span className="inline-flex items-center gap-1">{s.bridge.reconciles ? <CheckCircle2 className="size-3.5 text-[var(--status-on)]" /> : <XCircle className="size-3.5 text-[var(--status-off)]" />}{fmt(gbp(s.bridge.difference), "currency", { precise: true })}</span></td>
                    <td className={cn("px-2 text-right", restated && "text-[var(--status-risk-ink)]")}>{v1 === undefined ? "—" : `${fmt(v1, "currency", { precise: true })}${restated ? " (restated)" : ""}`}</td>
                    <td className="px-4 text-right"><DataStatusBadge status={s.status.status} synthetic={synthetic} title={s.status.reasons.join("; ")} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contractual ARR, invoiced and recognised revenue</CardTitle><span className="text-xs text-muted-foreground">Three measures with separate definitions; ARR is not assumed to equal revenue</span></CardHeader>
        <CardContent className="pb-0 text-xs text-muted-foreground">
          Contractual ARR: annualised value of active recurring contracts at month end. Invoiced recurring revenue (annualised): trailing twelve months of recurring invoices. Recognised recurring revenue: the month&apos;s revenue under the accounting policy, from the finance system. Differences are expected (billing in advance, contracts signed but not yet invoiced); unexplained differences are flagged for Finance.
        </CardContent>
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full text-[12.5px] whitespace-nowrap tabular">
            <thead className="sticky top-0 border-b bg-card text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium">Month</th><th className="px-2 text-right font-medium">Contractual ARR</th><th className="px-2 text-right font-medium">Invoiced (annualised)</th><th className="px-2 text-right font-medium">Recognised recurring (month)</th><th className="px-2 text-right font-medium">Recognised total (month)</th><th className="px-2 text-right font-medium">Explained difference</th><th className="px-4 text-left font-medium">Status</th></tr></thead>
            <tbody className="divide-y">
              {[...recon].reverse().slice(0, 24).map((r) => (
                <tr key={r.month} title={r.explanation ?? ""}>
                  <td className="px-4 py-1">{monthLabel(r.month, true)}</td>
                  <td className="px-2 text-right">{fmt(Number(r.contractual_arr), "currency", { precise: true })}</td>
                  <td className="px-2 text-right">{fmt(Number(r.invoiced_recurring_annualised), "currency", { precise: true })}</td>
                  <td className="px-2 text-right">{fmt(Number(r.recognised_recurring_revenue), "currency", { precise: true })}</td>
                  <td className="px-2 text-right">{fmt(Number(r.recognised_total_revenue), "currency", { precise: true })}</td>
                  <td className="px-2 text-right">{fmt(Number(r.explained_difference), "currency", { precise: true })}</td>
                  <td className={cn("px-4", r.status === "unexplained" ? "text-[var(--status-off-ink)]" : r.status === "pending" ? "text-[var(--status-risk-ink)]" : "text-muted-foreground")}>{r.status}{r.status === "unexplained" ? ` — ${r.explanation?.split(". ").at(-1)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Restatements</CardTitle><span className="text-xs text-muted-foreground">As-reported figures are kept; restatements are approved and recorded</span></CardHeader>
        <CardContent className="space-y-3 text-[13px]">
          {restatements.length === 0 && <p className="text-muted-foreground">No restatements.</p>}
          {restatements.map((r) => (
            <div key={r.id} className="rounded-md border p-3">
              <p className="font-medium">{r.subject.startsWith("cohort:") ? "Cohort membership" : "ARR history"} — {r.month ? monthLabel(r.month, true) : ""} · approved by {r.approved_by} on {formatDate(r.restated_at)}</p>
              <p className="text-muted-foreground">{r.reason}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{Object.entries(r.previous as Record<string, { arr_total?: number }>).map(([m, v]) => `${m.slice(0, 7)}: ${v.arr_total !== undefined ? fmt(v.arr_total, "currency", { precise: true }) : JSON.stringify(v)} → ${(() => { const c = (r.current as Record<string, { arr_total?: number }>)[m]; return c?.arr_total !== undefined ? fmt(c.arr_total, "currency", { precise: true }) : JSON.stringify(c); })()}`).join(" · ")}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
