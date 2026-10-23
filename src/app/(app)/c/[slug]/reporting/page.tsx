import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate } from "@/lib/domain/format";
import { REPORT_META, REPORT_STATE, periodLabel, type ReportKind } from "@/lib/domain/reporting";
import { PageHeader } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Reporting" };


export default async function ReportingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const s = await loadCompanySnapshot(ctx.supabase, cid);
  if (!s) return null;
  const base = `/c/${slug}`;
  const { data: all } = await ctx.supabase.from("board_reports").select("id, kind, period_start, status, published_at").eq("company_id", cid).order("period_start", { ascending: false });
  const c = s.reportingCompliance;

  return (
    <div className="fade-in space-y-5">
      <PageHeader
        eyebrow="Mission Control · Reporting"
        title="Reporting"
        description="Three distinct outputs, each with its own purpose and deadline. Figures come from the same scorecard and plan as the rest of Omni OS; management adds the commentary and publishes."
      />

      <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        <Tile label="Published on time" value={String(c.onTime)} />
        <Tile label="Published late" value={String(c.late)} warn={c.late > 0} />
        <Tile label="Overdue" value={String(c.overdue)} warn={c.overdue > 0} />
        <Link href={`${base}/weekly-scorecard`} className="flex items-center gap-2 bg-card px-4 py-3 text-[13px] hover:bg-accent/40">
          <Mail className="size-4 text-muted-foreground" />
          <span className="flex-1">
            The Monday KPI scorecard is separate
            <span className="block text-xs text-muted-foreground">Weekly · CEO → Omni</span>
          </span>
          <ArrowRight className="size-3.5 text-muted-foreground" />
        </Link>
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-3">
        {(Object.keys(REPORT_META) as ReportKind[]).map((kind) => {
          const meta = REPORT_META[kind];
          const scheduled = s.reporting.filter((r) => r.kind === kind);
          const older = (all ?? []).filter((r) => r.kind === kind && !scheduled.some((x) => x.periodStart === r.period_start));
          return (
            <Card key={kind} data-testid={`report-${kind}`}>
              <CardHeader className="items-start">
                <div>
                  <CardTitle>{meta.label}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {meta.owner} · {meta.cadence}
                  </p>
                </div>
              </CardHeader>
              <p className="border-b px-4 pb-3 text-[13px] text-muted-foreground">{meta.purpose}</p>
              <div className="divide-y">
                {scheduled.map((r) => (
                  <Link key={r.periodStart} href={`${base}/reporting/${kind}/${r.periodStart}`} className="flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-accent/40">
                    <span className="flex-1 font-medium">{r.periodLabel}</span>
                    <span className="text-xs text-muted-foreground">due {formatDate(r.due, { year: false })}</span>
                    <Badge variant={REPORT_STATE[r.state].variant}>{REPORT_STATE[r.state].label}</Badge>
                  </Link>
                ))}
                {older.slice(0, 6).map((r) => (
                  <Link key={r.id} href={`${base}/reporting/${kind}/${r.period_start}`} className="flex items-center gap-2 px-4 py-2 text-[13px] text-muted-foreground hover:bg-accent/40">
                    <span className="flex-1">{periodLabel(kind, r.period_start)}</span>
                    <span className="text-xs">{r.status === "published" ? `Published ${formatDate(r.published_at, { year: false })}` : "Draft"}</span>
                  </Link>
                ))}
                {!scheduled.length && !older.length && <p className="px-4 py-3 text-sm text-muted-foreground">Nothing due yet.</p>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={warn ? "text-xl font-semibold text-off-ink tabular" : "text-xl font-semibold tabular"}>{value}</p>
    </div>
  );
}
