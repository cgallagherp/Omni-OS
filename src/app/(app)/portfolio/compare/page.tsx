import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { healthOf, loadCompanySnapshots } from "@/lib/data/snapshot";
import { formatMetric, formatPct } from "@/lib/domain/format";
import { BAND_META, HEALTH_WEIGHTS } from "@/lib/domain/health";
import { PageHeader } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompanyMark } from "@/components/os/logo";
import { StatusDot } from "@/components/os/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Compare" };

const KEY_LABEL: Record<string, string> = {
  revenue: "Revenue (latest month)",
  ebitda: "EBITDA (latest month)",
  gross_margin: "Gross margin",
  cash_conversion: "Cash conversion",
  nps: "Customer NPS",
  enps: "Employee NPS",
  headcount: "Headcount",
  nrr: "Net revenue retention",
  arr: "ARR",
  new_arr: "New ARR booked",
  pipeline_coverage: "Pipeline coverage",
  logo_churn: "Logo churn",
  recurring_revenue_pct: "Contracted revenue share",
  debtor_days: "Debtor days",
  first_time_fix: "First-time fix rate",
  attrition: "Attrition",
};
const COMPONENT_LABEL: Record<keyof typeof HEALTH_WEIGHTS, string> = {
  financial: "Financial vs plan",
  priorities: "Priorities",
  kpis: "KPIs",
  cadence: "Meeting cadence",
  actions: "Actions on time",
  issues: "Critical issues",
};

export default async function ComparePage() {
  const viewer = await requireViewer();
  if (!viewer.isOmniStaff) redirect("/");
  const supabase = await createClient();
  const snaps = await loadCompanySnapshots(supabase, viewer.companies.filter((c) => c.role === "omni").map((c) => c.companyId));
  const rows = snaps.map((s) => ({ s, h: healthOf(s) })).sort((a, b) => b.h.score - a.h.score);
  const tracked = (k: string) => snaps.filter((s) => s.metrics.some((m) => m.metric.comparable_key === k)).length;
  const keys = [...new Set(snaps.flatMap((s) => s.metrics.map((m) => m.metric.comparable_key).filter(Boolean) as string[]))].sort((a, b) => tracked(b) - tracked(a) || a.localeCompare(b));

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Omni Portfolio"
        title="Who is executing — and who needs intervention?"
        description="A like-for-like view of execution discipline. Operational KPIs are compared only where companies track a comparable measure; nothing is forced."
      />
      <Card className="mb-5 overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">Execution score</th>
              <th className="px-3 py-2.5 text-right font-medium">Revenue vs plan</th>
              <th className="px-3 py-2.5 text-right font-medium">EBITDA vs plan</th>
              <th className="px-3 py-2.5 text-right font-medium">Priorities on track</th>
              <th className="px-3 py-2.5 text-right font-medium">KPIs on target</th>
              <th className="px-3 py-2.5 text-right font-medium">Weekly cadence</th>
              <th className="px-3 py-2.5 text-right font-medium">Overdue actions</th>
              <th className="px-4 py-2.5 text-right font-medium">Critical issues</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(({ s, h }) => {
              const band = BAND_META[h.band];
              const pOk = s.priorities.length ? (s.priorityStatus.on_track + s.priorityStatus.done) / s.priorities.length : null;
              const kOk = s.kpi.total ? s.kpi.on_track / s.kpi.total : null;
              return (
                <tr key={s.company.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link href={`/c/${s.company.slug}`} className="flex items-center gap-2.5 font-medium hover:underline">
                      <CompanyMark name={s.company.name} color={s.company.brand_color} size="md" /> {s.company.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold tabular">{h.score}</span>
                      <Badge variant={band.tone}>{band.label}</Badge>
                    </div>
                    <div className="mt-2 grid w-56 gap-1">
                      {(Object.keys(HEALTH_WEIGHTS) as Array<keyof typeof HEALTH_WEIGHTS>).map((k) => (
                        <div key={k} className="grid grid-cols-[96px_1fr_28px] items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="truncate">{COMPONENT_LABEL[k]}</span>
                          <span className="h-1 overflow-hidden rounded-full bg-muted">
                            <span className={cn("block h-full rounded-full", h.components[k] >= 0.75 ? "bg-on" : h.components[k] >= 0.5 ? "bg-risk" : "bg-off")} style={{ width: `${h.components[k] * 100}%` }} />
                          </span>
                          <span className="text-right tabular">{Math.round(h.components[k] * 100)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <Num v={s.financials.revenue?.variancePct ?? null} signed />
                  <Num v={s.financials.ebitda?.variancePct ?? null} signed />
                  <Num v={pOk} good={0.7} />
                  <Num v={kOk} good={0.6} />
                  <td className={cn("px-3 py-3 text-right tabular", s.meetingsLast4Weeks < 4 && "text-risk-ink")}>{s.meetingsLast4Weeks}/4</td>
                  <td className={cn("px-3 py-3 text-right tabular", s.overdueActions.length > 2 && "text-off-ink")}>
                    {s.overdueActions.length}
                    <span className="text-muted-foreground">/{s.openActions.length}</span>
                  </td>
                  <td className={cn("px-4 py-3 text-right tabular", s.openIssues.some((i) => i.priority === "critical") && "font-medium text-off-ink")}>{s.openIssues.filter((i) => i.priority === "critical").length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Score weights: {(Object.keys(HEALTH_WEIGHTS) as Array<keyof typeof HEALTH_WEIGHTS>).map((k) => `${COMPONENT_LABEL[k]} ${HEALTH_WEIGHTS[k] * 100}%`).join(" · ")}. Financial variance of −10% or worse scores zero. ≥75 executing well, 60–74 watch, &lt;60 requires intervention.
        </p>
      </Card>

      <Card className="overflow-x-auto">
        <CardHeader>
          <CardTitle>Comparable KPIs</CardTitle>
          <span className="text-xs text-muted-foreground">Latest reported value · status against each company&apos;s own target</span>
        </CardHeader>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">Measure</th>
              {snaps.map((s) => (
                <th key={s.company.id} className="px-3 py-2 text-right font-medium">
                  {s.company.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {keys.map((k) => (
              <tr key={k}>
                <td className="px-4 py-2">{KEY_LABEL[k] ?? k.replace(/_/g, " ")}</td>
                {snaps.map((s) => {
                  const v = s.metrics.find((m) => m.metric.comparable_key === k);
                  return (
                    <td key={s.company.id} className="px-3 py-2 text-right">
                      {v ? (
                        <Link href={`/c/${s.company.slug}/scoreboard/${v.metric.id}`} className="inline-flex items-center gap-1.5 tabular hover:underline">
                          {formatMetric(v.latest?.value, v.metric.unit, { decimals: v.metric.decimals, currency: s.company.currency })}
                          <StatusDot status={v.status} />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not tracked</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Num({ v, signed, good }: { v: number | null; signed?: boolean; good?: number }) {
  const tone = v === null ? "" : signed ? (v >= 0 ? "text-on-ink" : v > -0.05 ? "text-risk-ink" : "text-off-ink") : good !== undefined ? (v >= good ? "text-on-ink" : v >= good - 0.2 ? "text-risk-ink" : "text-off-ink") : "";
  return <td className={cn("px-3 py-3 text-right font-medium tabular", tone)}>{formatPct(v, signed ? 1 : 0, signed)}</td>;
}
