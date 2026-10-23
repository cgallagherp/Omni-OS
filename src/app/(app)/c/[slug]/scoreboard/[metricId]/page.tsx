import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Link2, Pencil } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { loadActivity } from "@/lib/data/activity";
import { formOptions } from "@/lib/data/options";
import { formatDate, formatMetric, formatPct, targetLabel } from "@/lib/domain/format";
import { evaluateMetric, fiscalYearStart, periodLabel, ytd } from "@/lib/domain/metrics";
import { exceptionReason, isException, ruleFor } from "@/lib/domain/metric-view";
import { CATEGORY_LABEL } from "@/lib/domain/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Owner } from "@/components/os/avatar";
import { PriorityBadge, StatusBadge } from "@/components/os/status";
import { TrendIcon } from "@/components/os/metric-card";
import { Activity } from "@/components/os/activity";
import { IssueDialog } from "@/components/os/entity-forms";
import { MetricChart } from "@/components/scoreboard/metric-chart";
import { LinkObjectivesDialog, MetricDialog } from "@/components/scoreboard/metric-forms";
import { RecordValueForm } from "@/components/scoreboard/record-value";
import { ArchiveMetricButton } from "@/components/scoreboard/metric-actions";
import { saveIssue } from "@/lib/actions/execution";

export const metadata: Metadata = { title: "KPI" };

export default async function MetricPage({ params }: { params: Promise<{ slug: string; metricId: string }> }) {
  const { slug, metricId } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  const view = snap?.metrics.find((v) => v.metric.id === metricId);
  if (!snap || !view) notFound();
  const m = view.metric;
  const cur = snap.company.currency;
  const fmt = (v: number | null | undefined) => formatMetric(v, m.unit, { decimals: m.decimals, currency: cur });

  const [{ data: allValues }, { data: issues }, options] = await Promise.all([
    ctx.supabase.from("metric_values").select("*").eq("company_id", cid).eq("metric_id", metricId).order("period_start", { ascending: false }),
    ctx.supabase.from("issues").select("*").eq("company_id", cid).eq("metric_id", metricId).order("created_at", { ascending: false }),
    formOptions(ctx.supabase, snap),
  ]);
  const values = allValues ?? [];
  const activity = await loadActivity(ctx.supabase, cid, {
    tables: ["metrics", "metric_values"],
    ids: [metricId, ...values.map((v) => v.id)],
    commentType: "metric",
    commentId: metricId,
    labelFor: (table, row) => (table === "metric_values" && typeof row.period_start === "string" ? `value for ${periodLabel(row.period_start, m.frequency)}` : null),
  });

  const history = values.filter((v) => v.value !== null || v.target !== null);
  const chartData = [...history]
    .filter((v) => v.value !== null)
    .reverse()
    .slice(-24)
    .map((v) => {
      const value = v.value === null ? null : Number(v.value);
      const target = v.target ?? m.target_value;
      return {
        label: periodLabel(v.period_start, m.frequency, m.frequency === "monthly"),
        value,
        target: m.direction === "range" ? null : target === null ? null : Number(target),
        status: evaluateMetric(value, ruleFor(m, v.target)),
        formatted: fmt(value),
        formattedTarget: targetLabel(m, target === null ? null : Number(target), cur),
      };
    });

  const links = snap.metricLinks.filter((l) => l.metric_id === metricId);
  const linkedItems = links.map((l) => {
    if (l.winning_move_id) return { type: "winning_move", id: l.winning_move_id, label: "Three-Year Outcome", title: snap.winningMoves.find((w) => w.id === l.winning_move_id)?.title };
    if (l.annual_goal_id) return { type: "annual_goal", id: l.annual_goal_id, label: "12-month objective", title: snap.annualGoals.find((g) => g.id === l.annual_goal_id)?.title };
    return { type: "quarterly_priority", id: l.quarterly_priority_id!, label: "90-day priority", title: snap.priorities.find((p) => p.id === l.quarterly_priority_id)?.title };
  });
  const linkOptions = [
    { group: "Three-Year Outcomes", items: snap.winningMoves.map((w) => ({ value: `winning_move:${w.id}`, label: w.title })) },
    { group: `12-month objectives · FY${snap.fiscalYear}`, items: snap.annualGoals.map((g) => ({ value: `annual_goal:${g.id}`, label: g.title })) },
    { group: "90-day priorities", items: snap.priorities.map((p) => ({ value: `quarterly_priority:${p.id}`, label: p.title })) },
  ];
  const selected = linkedItems.map((i) => `${i.type}:${i.id}`);
  const ytdSummary = m.aggregation === "flow" ? ytd(view.points.map((p) => ({ period_start: p.period, value: p.value, target: p.target })), fiscalYearStart(new Date(), snap.company.fiscal_year_start_month), m.target_value) : null;
  const crew = options.crew;
  const openIssue = (issues ?? []).find((i) => i.status !== "resolved");
  const vals = view.points.filter((p) => p.value !== null).map((p) => p.value!) ;
  const best = vals.length ? (m.direction === "lower_is_better" ? Math.min(...vals) : Math.max(...vals)) : null;

  return (
    <div className="fade-in">
      <Link href={`/c/${slug}/scoreboard${m.frequency === "monthly" ? "?view=monthly" : ""}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Scoreboard
      </Link>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{CATEGORY_LABEL[m.category]}</Badge>
            <Badge variant="outline">{m.frequency === "weekly" ? "Weekly" : "Monthly"}</Badge>
            {m.comparable_key && <Badge variant="outline">Portfolio: {m.comparable_key}</Badge>}
            {m.is_key && <Badge variant="brand">On Blueprint</Badge>}
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight">{m.name}</h1>
          {m.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{m.description}</p>}
          <div className="mt-2 flex items-center gap-3 text-sm">
            <Owner person={snap.crewById.get(m.owner_id)} />
            <StatusBadge status={view.status} />
            {isException(view) && view.status === "on_track" && <Badge variant="risk">{exceptionReason(view)}</Badge>}
          </div>
        </div>
        {ctx.can.write && (
          <div className="flex flex-wrap gap-2">
            {openIssue ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/c/${slug}/execution/issue/${openIssue.id}`}>
                  <AlertTriangle /> View open issue
                </Link>
              </Button>
            ) : (
              <IssueDialog
                  trigger={<Button variant="outline" size="sm"><AlertTriangle /> Raise issue</Button>}
                  action={saveIssue.bind(null, cid, null)}
                  crew={crew}
                  priorities={options.priorities}
                  metrics={options.metrics}
                  defaults={{ metric_id: m.id, owner_id: m.owner_id, title: `${m.name} ${view.status === "no_data" ? "not reported" : exceptionReason(view).toLowerCase()} — ${fmt(view.latest?.value)} vs ${targetLabel(m, view.latest?.target ?? m.target_value, cur)}`, priority: view.status === "off_track" ? "high" : "medium" }}
                />
            )}
            <LinkObjectivesDialog companyId={cid} metricId={m.id} options={linkOptions} selected={selected} trigger={<Button variant="outline" size="sm"><Link2 /> Link objectives</Button>} />
            <MetricDialog
              companyId={cid}
              id={m.id}
              crew={crew}
              defaults={{ ...m, target_value: m.target_value, tolerance_pct: Number(m.tolerance_pct) }}
              trigger={<Button variant="outline" size="sm"><Pencil /> Edit definition</Button>}
            />
            {ctx.can.admin && <ArchiveMetricButton companyId={cid} metricId={m.id} slug={slug} />}
          </div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-5">
        <Stat label={`Latest · ${view.latest ? periodLabel(view.latest.period, m.frequency) : "—"}`} value={fmt(view.latest?.value)} extra={<TrendIcon trend={view.trend} />} />
        <Stat label="Target" value={targetLabel(m, view.latest?.target ?? m.target_value, cur)} />
        <Stat label="Previous" value={fmt(view.previous?.value)} />
        <Stat label={m.direction === "lower_is_better" ? "Best (lowest)" : "Best"} value={fmt(best)} />
        {ytdSummary ? <Stat label="Year to date vs plan" value={fmt(ytdSummary.actual)} sub={`${formatPct(ytdSummary.variancePct, 1, true)} vs ${fmt(ytdSummary.plan)}`} /> : <Stat label="Tolerance" value={`${Number(m.tolerance_pct)}%`} sub="before off track" />}
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Performance</CardTitle>
              <span className="text-xs text-muted-foreground">Bars: actual (coloured by status) · dashed: target</span>
            </CardHeader>
            <CardContent>
              {chartData.length ? <MetricChart data={chartData} range={m.direction === "range" ? { min: Number(m.target_min), max: Number(m.target_max) } : null} /> : <p className="py-10 text-center text-sm text-muted-foreground">No results recorded yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Results by period</CardTitle>
              <span className="text-xs text-muted-foreground">{history.filter((h) => h.value !== null).length} observations</span>
            </CardHeader>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 font-medium">Period</th>
                    <th className="px-2 py-2 text-right font-medium">Actual</th>
                    <th className="px-2 py-2 text-right font-medium">Target</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((v) => {
                    const value = v.value === null ? null : Number(v.value);
                    const status = evaluateMetric(value, ruleFor(m, v.target));
                    return (
                      <tr key={v.id}>
                        <td className="px-4 py-2 whitespace-nowrap">{periodLabel(v.period_start, m.frequency)}</td>
                        <td className="px-2 py-2 text-right font-medium tabular">{fmt(value)}</td>
                        <td className="px-2 py-2 text-right text-muted-foreground tabular">{targetLabel(m, v.target ?? m.target_value, cur)}</td>
                        <td className="px-2 py-2">{value !== null ? <StatusBadge status={status} /> : <Badge variant="none">Budget only</Badge>}</td>
                        <td className="max-w-xs truncate px-4 py-2 text-xs text-muted-foreground">
                          {v.note}
                          {v.source !== "manual" && <span className="ml-1 rounded bg-muted px-1">{v.source}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {ctx.can.write && (
            <Card>
              <CardHeader>
                <CardTitle>Record a result</CardTitle>
              </CardHeader>
              <CardContent>
                <RecordValueForm companyId={cid} metricId={m.id} frequency={m.frequency} defaultPeriod={view.lastCompleted} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Strategic links</CardTitle>
            </CardHeader>
            <div className="divide-y text-sm">
              {linkedItems.map((i) => (
                <Link key={`${i.type}${i.id}`} href={`/c/${slug}/flight-plan/${i.type}/${i.id}`} className="block px-4 py-2.5 hover:bg-accent/50">
                  <p className="text-xs text-muted-foreground">{i.label}</p>
                  <p className="font-medium">{i.title ?? "Archived item"}</p>
                </Link>
              ))}
              {!linkedItems.length && <p className="px-4 py-3 text-muted-foreground">Not linked to any objective yet.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Issues</CardTitle>
            </CardHeader>
            <div className="divide-y text-sm">
              {(issues ?? []).map((i) => (
                <Link key={i.id} href={`/c/${slug}/execution/issue/${i.id}`} className="block px-4 py-2.5 hover:bg-accent/50">
                  <p className="font-medium">{i.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <PriorityBadge priority={i.priority} />
                    <span className="text-xs text-muted-foreground">{i.status === "resolved" ? `Resolved ${formatDate(i.resolved_at)}` : `Raised ${formatDate(i.created_at)}`}</span>
                  </div>
                </Link>
              ))}
              {!issues?.length && <p className="px-4 py-3 text-muted-foreground">No issues linked to this KPI.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity & audit trail</CardTitle>
            </CardHeader>
            <CardContent>
              <Activity entries={activity} companyId={cid} entityType="metric" entityId={m.id} canWrite={ctx.can.write} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, extra }: { label: string; value: string; sub?: string; extra?: React.ReactNode }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-center gap-1 text-lg font-semibold tracking-tight tabular">
        {value} {extra}
      </p>
      {sub && <p className="text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
