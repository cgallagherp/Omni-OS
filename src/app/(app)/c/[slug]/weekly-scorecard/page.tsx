import type { Metadata } from "next";
import { Lock, Mail } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate, formatDateTime } from "@/lib/domain/format";
import { scorecardEmailHtml, type ScorecardRow } from "@/lib/domain/weekly-scorecard";
import { emailConfigured } from "@/lib/email";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScorecardTable } from "@/components/scorecard/scorecard-table";
import { ApproveScorecardDialog, ChooseScorecardKpisDialog } from "@/components/scorecard/scorecard-controls";

export const metadata: Metadata = { title: "Monday scorecard" };

const LEADERSHIP = ["omni", "ceo", "company_admin", "executive"];
const DELIVERY_LABEL: Record<string, string> = {
  sent: "Emailed",
  not_configured: "In-app only (email not configured)",
  failed: "Email failed — shared in-app",
  queued: "Queued",
};

export default async function WeeklyScorecardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const base = `/c/${slug}`;

  if (!LEADERSHIP.includes(ctx.company.role)) {
    return (
      <div className="fade-in">
        <PageHeader eyebrow="Mission Control" title="Monday KPI scorecard" />
        <EmptyState title="Restricted" description="The Monday scorecard is shared with company leadership and its authorised Omni recipients only." />
      </div>
    );
  }

  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) return null;
  const canApprove = ctx.company.role === "ceo" || ctx.company.role === "company_admin";
  const thisWeek = snap.sentScorecards.find((w) => w.week_start === snap.weekStart && w.approved_at);
  const history = snap.sentScorecards.filter((w) => w.week_start !== snap.weekStart || !w.approved_at);

  const [{ data: memberships }, { data: outbox }, { data: approvers }] = await Promise.all([
    canApprove ? ctx.supabase.from("company_memberships").select("user_id, profiles(full_name, email)").eq("company_id", cid).eq("role", "omni") : Promise.resolve({ data: [] }),
    ctx.supabase.from("email_outbox").select("id, subject, recipients, status, created_at, ref_id").eq("company_id", cid).eq("kind", "weekly_scorecard").order("created_at", { ascending: false }).limit(12),
    ctx.supabase.from("weekly_scorecards").select("id, approved_by, profiles:approved_by(full_name)").eq("company_id", cid),
  ]);
  const recipients = (memberships ?? []).flatMap((m) => {
    const p = (m as { profiles: unknown }).profiles as { full_name: string; email: string } | null;
    return p ? [{ userId: (m as { user_id: string }).user_id, name: p.full_name, email: p.email }] : [];
  });
  const approverOf = new Map((approvers ?? []).map((a) => [a.id, (a.profiles as unknown as { full_name: string } | null)?.full_name ?? null]));
  const draftHtml = scorecardEmailHtml({ company: snap.company.name, weekStart: snap.weekStart, rows: snap.scorecard, approvedBy: ctx.viewer.fullName, brandColor: ctx.company.branding.primary ?? undefined });
  const rows: ScorecardRow[] = thisWeek ? thisWeek.rows : snap.scorecard;
  const counts = { off: rows.filter((r) => r.status === "off_track").length, risk: rows.filter((r) => r.status === "at_risk").length, missing: rows.filter((r) => r.status === "not_reported").length };
  const metrics = snap.metrics.map((v) => ({ id: v.metric.id, name: v.metric.name, frequency: v.metric.frequency, selected: v.metric.in_weekly_scorecard }));

  return (
    <div className="fade-in space-y-5">
      <PageHeader
        eyebrow="Mission Control"
        title="Monday KPI scorecard"
        description="The CEO's Monday update to Omni: the agreed KPIs, with corrective actions against anything off track. Generated automatically, approved by the CEO, then sent to authorised Omni recipients."
        actions={
          <>
            {ctx.can.admin && <ChooseScorecardKpisDialog companyId={cid} metrics={metrics} />}
            {canApprove && snap.scorecard.length > 0 && <ApproveScorecardDialog companyId={cid} recipients={recipients} emailHtml={draftHtml} reapprove={Boolean(thisWeek)} emailConfigured={emailConfigured()} />}
          </>
        }
      />

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Week of {formatDate(snap.weekStart)}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {counts.off} off track · {counts.risk} at risk · {counts.missing} not reported · {rows.length - counts.off - counts.risk - counts.missing} on track
            </p>
          </div>
          {thisWeek ? (
            <Badge variant="on" data-testid="scorecard-state">
              Approved {formatDateTime(thisWeek.approved_at)}
              {approverOf.get(thisWeek.id) ? ` by ${approverOf.get(thisWeek.id)}` : ""}
            </Badge>
          ) : (
            <Badge variant="risk" data-testid="scorecard-state">
              Draft — awaiting CEO approval
            </Badge>
          )}
        </CardHeader>
        {rows.length ? (
          <ScorecardTable rows={rows} base={base} />
        ) : (
          <EmptyState className="m-4" title="No KPIs in the weekly scorecard" description="Choose the handful of KPIs the ELT and Omni review every week." />
        )}
        {!thisWeek && rows.length > 0 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Draft built from live results. Missing results show as not reported, never as on track.</p>}
      </Card>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <span className="text-xs text-muted-foreground">{history.length} previous weeks</span>
          </CardHeader>
          <div className="divide-y">
            {history.map((w) => (
              <details key={w.id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/40">
                  <span className="font-medium">Week of {formatDate(w.week_start)}</span>
                  <span className="text-xs text-muted-foreground">
                    {w.rows.filter((r) => r.status === "off_track").length} off track · {w.rows.filter((r) => r.actionRequired).length} without action
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">{w.approved_at ? `Approved ${formatDate(w.approved_at, { year: false })}` : "Not approved"}</span>
                </summary>
                <div className="border-t bg-muted/20">
                  <ScorecardTable rows={w.rows} compact />
                </div>
              </details>
            ))}
            {!history.length && <p className="px-4 py-3 text-sm text-muted-foreground">No previous scorecards.</p>}
          </div>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Mail className="size-3.5 text-muted-foreground" /> Delivery log
            </CardTitle>
          </CardHeader>
          <div className="divide-y">
            {(outbox ?? []).map((e) => (
              <div key={e.id} className="px-4 py-2.5 text-[13px]">
                <p className="truncate font-medium">{e.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(e.created_at)} · {(e.recipients as string[]).length} recipient{(e.recipients as string[]).length === 1 ? "" : "s"} · {DELIVERY_LABEL[e.status] ?? e.status}
                </p>
              </div>
            ))}
            {!outbox?.length && <p className="px-4 py-3 text-sm text-muted-foreground">Nothing sent yet.</p>}
          </div>
          <p className="flex items-start gap-1.5 border-t px-4 py-2.5 text-xs text-muted-foreground">
            <Lock className="mt-px size-3 shrink-0" /> Visible to company leadership and Omni only.
          </p>
        </Card>
      </div>
    </div>
  );
}
