import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { reportFigures, type ReportFigures } from "@/lib/data/reports";
import { formatDate, formatDateTime, formatMoney, formatPct } from "@/lib/domain/format";
import { periodLabel as metricPeriodLabel } from "@/lib/domain/metrics";
import { REPORT_META, REPORT_SECTIONS, REPORT_STATE, fiscalQuarterStart, periodLabel, reportDue, type ReportKind } from "@/lib/domain/reporting";
import { OUTCOME_LABEL, STATUS_META } from "@/lib/domain/status";
import { PrintButton } from "@/components/os/print-button";
import { StatusBadge, StatusDot } from "@/components/os/status";
import { CompanyLogo, CompanyMark, OmniLogo } from "@/components/os/logo";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PublishReportButton, ReportSection } from "@/components/reporting/report-controls";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Report" };

const KINDS = ["flash", "monthly_board", "quarterly_board"] as const;

export default async function ReportPage({ params }: { params: Promise<{ slug: string; kind: string; period: string }> }) {
  const { slug, kind: rawKind, period } = await params;
  if (!KINDS.includes(rawKind as ReportKind) || !/^\d{4}-\d{2}-01$/.test(period)) notFound();
  const kind = rawKind as ReportKind;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const s = await loadCompanySnapshot(ctx.supabase, cid);
  if (!s) notFound();
  if (kind === "quarterly_board" && fiscalQuarterStart(new Date(`${period}T00:00:00Z`), s.company.fiscal_year_start_month).toISOString().slice(0, 10) !== period) notFound();

  const { data: report } = await ctx.supabase.from("board_reports").select("*, profiles:published_by(full_name)").eq("company_id", cid).eq("kind", kind).eq("period_start", period).maybeSingle();
  const published = report?.status === "published";
  const stored = report?.snapshot as unknown as ReportFigures | null;
  const f: ReportFigures = published && stored && "kpis" in stored ? stored : reportFigures(s, kind, period);
  const content = (report?.content ?? {}) as Record<string, string>;
  const meta = REPORT_META[kind];
  const cur = s.company.currency;
  const boardMeetings = (await ctx.supabase.from("meetings").select("type, scheduled_at").eq("company_id", cid).in("type", ["board_monthly", "board_quarterly"])).data ?? [];
  const due = reportDue(kind, period, boardMeetings);
  const today = s.now.toISOString().slice(0, 10);
  const state = published ? (report!.published_at!.slice(0, 10) > due ? "published_late" : "published") : due < today ? "overdue" : report ? "draft" : "due";
  const publisher = (report?.profiles as unknown as { full_name: string } | null)?.full_name;
  const editable = ctx.can.write && !published;
  const logoUrl = ctx.company.branding.logoUrl;
  const ns = s.northStar;
  const exceptions = f.kpis.filter((k) => k.exception);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/c/${slug}/reporting`} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-3.5" /> Reporting
      </Link>
      <article className="overflow-x-auto rounded-lg border bg-card p-5 sm:p-8 print:border-0 print:p-0" data-testid="report">
        <header className="mb-6 flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? <CompanyLogo name={s.company.name} logoUrl={logoUrl} className="h-9" /> : <CompanyMark name={s.company.name} color={ctx.company.brandColor} size="lg" />}
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                {meta.label} · {periodLabel(kind, period)}
              </h1>
              <p className="text-[13px] text-muted-foreground">
                {s.company.name} · {meta.owner} · due {formatDate(due)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={REPORT_STATE[state].variant}>{REPORT_STATE[state].label}</Badge>
            {published && <span className="text-xs text-muted-foreground">{formatDateTime(report!.published_at)}{publisher ? ` · ${publisher}` : ""}</span>}
            <PrintButton />
            {ctx.can.admin && !published && <PublishReportButton companyId={cid} kind={kind} period={period} label={`${meta.label} for ${periodLabel(kind, period)}`} />}
          </div>
        </header>

        {!published && <p className="mb-5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground print:hidden">Draft — figures are live and will be frozen when the report is published.</p>}

        {kind === "quarterly_board" && ns && (
          <Block title="Strategy against the North Star">
            <p className="text-sm font-medium">{ns.vision}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {s.winningMoves.map((w) => (
                <div key={w.id}>
                  <div className="flex items-center gap-2 text-[13px]">
                    <StatusDot status={w.status} />
                    <span className="flex-1 truncate">{w.title}</span>
                    <span className="text-xs text-muted-foreground tabular">{w.progress}%</span>
                  </div>
                  <Progress value={w.progress} className="mt-1 h-1" tone="brand" />
                </div>
              ))}
            </div>
          </Block>
        )}

        <Block title={kind === "flash" ? "Headline trading" : kind === "monthly_board" ? "Financials against budget" : "The quarter against budget"}>
          <div className="grid grid-cols-3 gap-4">
            <Fig label="Revenue" actual={f.revenue?.actual ?? null} target={f.revenue?.target ?? null} cur={cur} />
            <Fig label="EBITDA" actual={f.ebitda?.actual ?? null} target={f.ebitda?.target ?? null} cur={cur} />
            <Fig label="Cash" actual={f.cash?.actual ?? null} target={f.cash?.target ?? null} cur={cur} stock />
          </div>
        </Block>

        {kind !== "flash" && (
          <Block title="Trends · last six months">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1.5 font-medium">Month</th>
                  <th className="py-1.5 text-right font-medium">Revenue</th>
                  <th className="py-1.5 text-right font-medium">Budget</th>
                  <th className="py-1.5 text-right font-medium">EBITDA</th>
                  <th className="py-1.5 text-right font-medium">Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y tabular">
                {f.trend.map((t) => (
                  <tr key={t.period}>
                    <td className="py-1.5">{metricPeriodLabel(t.period, "monthly")}</td>
                    <td className="py-1.5 text-right">{formatMoney(t.revenue, cur)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{formatMoney(t.revenueTarget, cur)}</td>
                    <td className="py-1.5 text-right">{formatMoney(t.ebitda, cur)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{formatMoney(t.ebitdaTarget, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>
        )}

        <Block title={kind === "flash" ? `KPIs and exceptions · ${exceptions.length} exception${exceptions.length === 1 ? "" : "s"}` : "KPIs"}>
          <table className="w-full min-w-[520px] text-[13px]">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 font-medium">KPI</th>
                <th className="py-1.5 text-right font-medium">Actual</th>
                <th className="py-1.5 text-right font-medium">Target</th>
                <th className="py-1.5 pl-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(kind === "flash" ? exceptions : f.kpis).map((k) => (
                <tr key={k.metricId}>
                  <td className="py-1.5">
                    {k.name} <span className="text-xs text-muted-foreground">· {k.period}</span>
                  </td>
                  <td className="py-1.5 text-right font-medium tabular">{k.actual}</td>
                  <td className="py-1.5 text-right text-muted-foreground tabular">{k.target}</td>
                  <td className="py-1.5 pl-3">{k.status === "no_data" ? <Badge variant="none">Not reported</Badge> : <StatusBadge status={k.status as never} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {kind === "flash" && <p className="mt-1.5 text-xs text-muted-foreground">{f.kpis.length - exceptions.length} other KPIs on track.</p>}
        </Block>

        {kind !== "flash" && (
          <Block title={kind === "quarterly_board" ? "90-day priorities" : "Priority progress"}>
            <ul className="divide-y text-[13px]">
              {f.priorities.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{p.owner}</span>
                  {p.outcome ? <Badge variant="outline">{OUTCOME_LABEL[p.outcome as keyof typeof OUTCOME_LABEL]}</Badge> : <StatusBadge status={p.status as never} />}
                </li>
              ))}
              {!f.priorities.length && <li className="py-1.5 text-muted-foreground">No priorities in the active quarter.</li>}
            </ul>
          </Block>
        )}

        {kind !== "flash" && (
          <Block title={kind === "quarterly_board" ? "Leadership and organisation (governance level)" : "People and risks"}>
            <ul className="space-y-1 text-[13px]">
              {f.orgActions.map((o) => (
                <li key={o.title}>
                  · {o.title}
                  {o.target_date && <span className="text-muted-foreground"> — by {formatDate(o.target_date)}</span>}
                </li>
              ))}
              {f.openSeats > 0 && <li>· {f.openSeats} open leadership seat{f.openSeats === 1 ? "" : "s"}</li>}
              {f.escalatedIssues.map((i) => (
                <li key={i.title}>
                  · <span className={cn(i.priority === "critical" && "text-off-ink")}>{i.title}</span> <span className="text-xs text-muted-foreground">({i.priority})</span>
                </li>
              ))}
              {!f.orgActions.length && !f.openSeats && !f.escalatedIssues.length && <li className="text-muted-foreground">Nothing to report.</li>}
            </ul>
          </Block>
        )}

        <Block title="Management commentary">
          <div className="space-y-4">
            {REPORT_SECTIONS[kind].map((sec) => (
              <ReportSection key={sec.key} companyId={cid} kind={kind} period={period} section={sec.key} label={sec.label} hint={sec.hint} value={content[sec.key] ?? ""} editable={editable} />
            ))}
          </div>
        </Block>

        <footer className="mt-8 flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
          <span>
            {STATUS_META.on_track.label}/at risk/off track statuses are calculated against each KPI&apos;s target and tolerance. Missing results are shown as not reported.
          </span>
          <OmniLogo className="h-3.5 opacity-70" />
        </footer>
      </article>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-brand-ink uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Fig({ label, actual, target, cur, stock }: { label: string; actual: number | null; target: number | null; cur: string; stock?: boolean }) {
  const v = actual !== null && target ? (actual - target) / Math.abs(target) : null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tracking-tight tabular">{actual === null ? "Not reported" : formatMoney(actual, cur)}</p>
      <p className={cn("text-xs tabular", v === null ? "text-muted-foreground" : v >= 0 ? "text-on-ink" : v > -0.05 ? "text-risk-ink" : "text-off-ink")}>
        {target !== null ? `${v !== null ? `${formatPct(v, 1, true)} vs ` : ""}${stock ? "target" : "budget"} ${formatMoney(target, cur)}` : "No budget set"}
      </p>
    </div>
  );
}
