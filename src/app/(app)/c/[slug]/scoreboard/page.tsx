import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatMetric, targetLabel } from "@/lib/domain/format";
import { evaluateMetric, periodLabel, periodRange, periodStart } from "@/lib/domain/metrics";
import { ruleFor, summariseStatuses } from "@/lib/domain/metric-view";
import { PageHeader } from "@/components/os/page";
import { Button } from "@/components/ui/button";
import { StatusBar } from "@/components/os/status";
import { ScoreboardGrid, type GridRow } from "@/components/scoreboard/scoreboard-grid";
import { CsvImportDialog, MetricDialog } from "@/components/scoreboard/metric-forms";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Scoreboard" };

export default async function ScoreboardPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const { slug } = await params;
  const { view: viewParam } = await searchParams;
  const ctx = await getCompanyContext(slug);
  const snap = await loadCompanySnapshot(ctx.supabase, ctx.company.companyId);
  if (!snap) return null;
  const view = viewParam === "monthly" ? "monthly" : "weekly";
  const cur = snap.company.currency;
  const now = new Date();
  const currentPeriod = periodStart(now, view);
  const periods = periodRange(currentPeriod, view, view === "weekly" ? 10 : 12).map((p) => ({ period: p, label: periodLabel(p, view, true), current: p === currentPeriod }));
  const linkCount = new Map<string, number>();
  for (const l of snap.metricLinks) linkCount.set(l.metric_id, (linkCount.get(l.metric_id) ?? 0) + 1);

  const views = snap.metrics.filter((v) => v.metric.frequency === view);
  const rows: GridRow[] = views.map((v) => {
    const m = v.metric;
    const byPeriod = new Map(v.points.map((p) => [p.period, p]));
    return {
      id: m.id,
      name: m.name,
      category: m.category,
      owner: snap.crewById.get(m.owner_id) ?? null,
      targetLabel: targetLabel(m, v.latest?.target ?? m.target_value, cur),
      status: v.status,
      trend: v.trend,
      isKey: m.is_key,
      linked: linkCount.get(m.id) ?? 0,
      cells: periods.map((p) => {
        const pt = byPeriod.get(p.period);
        const value = pt?.value ?? null;
        return {
          period: p.period,
          label: periodLabel(p.period, view),
          value,
          formatted: formatMetric(value, m.unit, { decimals: m.decimals, currency: cur }),
          status: value === null ? "no_data" : evaluateMetric(value, ruleFor(m, pt?.target)),
          target: pt?.target ?? m.target_value,
          current: p.current,
        };
      }),
    };
  });
  const all = summariseStatuses(snap.metrics);
  const crew = snap.crew.map((c) => ({ id: c.id, full_name: c.full_name, title: c.title, is_open_seat: c.is_open_seat }));
  const weeklyCount = snap.metrics.filter((v) => v.metric.frequency === "weekly").length;
  const monthlyCount = snap.metrics.length - weeklyCount;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Scoreboard"
        title="KPI Scoreboard"
        description="Actual versus target by reporting period. Click any cell to record or correct a result — every change is audited."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <a href={`/c/${slug}/scoreboard/export`} download>
                <Download /> Export
              </a>
            </Button>
            {ctx.can.write && <CsvImportDialog companyId={ctx.company.companyId} />}
            {ctx.can.write && (
              <MetricDialog
                companyId={ctx.company.companyId}
                crew={crew}
                defaults={{ frequency: view }}
                trigger={
                  <Button size="sm">
                    <Plus /> New KPI
                  </Button>
                }
              />
            )}
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {(["weekly", "monthly"] as const).map((f) => (
            <Link
              key={f}
              href={`/c/${slug}/scoreboard?view=${f}`}
              className={cn("inline-flex h-7 items-center rounded-md px-3 text-[13px] font-medium", view === f ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {f === "weekly" ? `Weekly · ${weeklyCount}` : `Monthly · ${monthlyCount}`}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground sm:justify-end">
          <span>
            <b className="text-on">{all.on_track}</b> on track · <b className="text-risk">{all.at_risk}</b> at risk · <b className="text-off">{all.off_track}</b> off track · {all.no_data} no data
          </span>
          <StatusBar counts={{ on: all.on_track, risk: all.at_risk, off: all.off_track, none: all.no_data }} className="w-40" />
        </div>
      </div>
      <ScoreboardGrid companyId={ctx.company.companyId} slug={slug} rows={rows} periods={periods} canWrite={ctx.can.write} />
    </div>
  );
}
