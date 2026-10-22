import type { Metadata } from "next";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { buildBrief } from "@/lib/data/insights";
import { formatDate, formatMetric, formatMoney, formatPct, targetLabel } from "@/lib/domain/format";
import { periodLabel } from "@/lib/domain/metrics";
import { quarterLabel } from "@/lib/domain/quarters";
import { CATEGORY_LABEL, STATUS_META } from "@/lib/domain/status";
import { PrintButton } from "@/components/os/print-button";
import { StatusDot } from "@/components/os/status";
import { CompanyMark, OmniMark } from "@/components/os/logo";

export const metadata: Metadata = { title: "Board pack" };

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const s = await loadCompanySnapshot(ctx.supabase, ctx.company.companyId);
  if (!s) return null;
  const cur = s.company.currency;
  const brief = await buildBrief(ctx.supabase, s, "commentary");
  const who = (id: string) => s.crewById.get(id)?.full_name ?? "—";
  const latestMonth = s.metrics.find((v) => v.metric.comparable_key === "revenue")?.latest?.period;

  return (
    <div className="mx-auto max-w-4xl overflow-x-auto bg-card p-4 shadow-sm sm:p-8 print:p-0 print:shadow-none">
      <div className="mb-6 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <CompanyMark name={s.company.name} color={s.company.brand_color} size="lg" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{s.company.name} — Monthly operating report</h1>
            <p className="text-sm text-muted-foreground">
              {latestMonth ? `Results to ${periodLabel(latestMonth, "monthly")}` : ""} · {s.activeQuarter ? quarterLabel(s.activeQuarter) : ""} · prepared {formatDate(new Date())}
              {s.company.is_demo && " · DEMONSTRATION DATA"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <PrintButton />
          <OmniMark className="text-sm" />
        </div>
      </div>

      <section className="print-avoid-break mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
        {[
          ["Revenue YTD", formatMoney(s.financials.revenue?.actual, cur), `${formatPct(s.financials.revenue?.variancePct, 1, true)} vs plan`],
          ["EBITDA YTD", formatMoney(s.financials.ebitda?.actual, cur), `${formatPct(s.financials.ebitda?.variancePct, 1, true)} vs plan`],
          ["Priorities on track", `${s.priorityStatus.on_track + s.priorityStatus.done}/${s.priorities.length}`, `${s.priorityStatus.off_track} off track`],
          ["KPIs on target", `${s.kpi.on_track}/${s.kpi.total}`, `${s.kpi.off_track} off track`],
        ].map(([l, v, sub]) => (
          <div key={l} className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="text-lg font-semibold tabular">{v}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Management commentary (generated from records)</h2>
        {brief.sections.map((sec) => (
          <div key={sec.title} className="print-avoid-break mb-3">
            <h3 className="text-[13px] font-medium">{sec.title}</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
              {sec.facts.map((f, i) => (
                <li key={i}>{f.text}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="print-page-break mb-6">
        <h2 className="mb-2 text-sm font-semibold">Scoreboard</h2>
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 font-medium">KPI</th>
              <th className="py-1.5 font-medium">Category</th>
              <th className="py-1.5 font-medium">Period</th>
              <th className="py-1.5 text-right font-medium">Actual</th>
              <th className="py-1.5 text-right font-medium">Target</th>
              <th className="py-1.5 pl-3 font-medium">Status</th>
              <th className="py-1.5 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {s.metrics.map((v) => (
              <tr key={v.metric.id}>
                <td className="py-1.5">{v.metric.name}</td>
                <td className="py-1.5 text-muted-foreground">{CATEGORY_LABEL[v.metric.category]}</td>
                <td className="py-1.5 text-muted-foreground">{v.latest ? periodLabel(v.latest.period, v.metric.frequency) : "—"}</td>
                <td className="py-1.5 text-right font-medium tabular">{formatMetric(v.latest?.value, v.metric.unit, { decimals: v.metric.decimals, currency: cur })}</td>
                <td className="py-1.5 text-right text-muted-foreground tabular">{targetLabel(v.metric, v.latest?.target ?? v.metric.target_value, cur)}</td>
                <td className="py-1.5 pl-3">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot status={v.status} /> {STATUS_META[v.status].label}
                  </span>
                </td>
                <td className="py-1.5 text-muted-foreground">{who(v.metric.owner_id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="print-avoid-break mb-6">
        <h2 className="mb-2 text-sm font-semibold">90-day commitments</h2>
        <table className="w-full text-[12.5px]">
          <tbody className="divide-y">
            {s.priorities.map((p) => (
              <tr key={p.id}>
                <td className="py-1.5">{p.title}</td>
                <td className="py-1.5 text-muted-foreground">{who(p.owner_id)}</td>
                <td className="py-1.5 text-right tabular">{p.progress}%</td>
                <td className="py-1.5 pl-3">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot status={p.status} /> {STATUS_META[p.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="print-avoid-break grid gap-6 sm:grid-cols-2 text-[12.5px]">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Material issues</h2>
          <ul className="space-y-1">
            {s.openIssues.map((i) => (
              <li key={i.id}>
                <span className="font-medium capitalize">{i.priority}</span> · {i.title} <span className="text-muted-foreground">({who(i.owner_id)})</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Decisions this period</h2>
          <ul className="space-y-1">
            {s.recentDecisions.slice(0, 8).map((d) => (
              <li key={d.id}>
                <span className="text-muted-foreground">{formatDate(d.decided_on, { year: false })}</span> · {d.title}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
