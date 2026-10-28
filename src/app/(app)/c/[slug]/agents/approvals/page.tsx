import type { Metadata } from "next";
import { getCompanyContext } from "@/lib/auth";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/os/page";
import { ApprovalCard, canDecide, type ApprovalRow } from "@/components/agents/approval-card";

export const metadata: Metadata = { title: "Agent approvals" };

export default async function ApprovalsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const { data } = await ctx.supabase.from("agent_approvals").select("*").eq("company_id", cid).order("created_at", { ascending: false }).limit(100);
  const pending = (data ?? []).filter((a) => a.status === "pending");
  const mine = pending.filter((a) => canDecide(ctx.company.role, a.approver_role));
  const others = pending.filter((a) => !canDecide(ctx.company.role, a.approver_role));
  const decided = (data ?? []).filter((a) => a.status !== "pending");
  return (
    <div className="space-y-5">
      <Card data-testid="approval-queue">
        <CardHeader>
          <CardTitle>Awaiting your decision</CardTitle>
          <span className="text-xs text-muted-foreground">Each approval authorises one specific action — never blanket authority</span>
        </CardHeader>
        {mine.length ? (
          <div className="divide-y">
            {mine.map((a) => (
              <ApprovalCard key={a.id} a={a as ApprovalRow} slug={slug} companyId={cid} role={ctx.company.role} />
            ))}
          </div>
        ) : (
          <EmptyState className="m-4" title="Nothing awaiting your decision" description="Proposals that need your approval appear here." />
        )}
      </Card>
      {others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Awaiting other approvers</CardTitle>
          </CardHeader>
          <div className="divide-y">
            {others.map((a) => (
              <ApprovalCard key={a.id} a={a as ApprovalRow} slug={slug} companyId={cid} role={ctx.company.role} />
            ))}
          </div>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Decided</CardTitle>
          <span className="text-xs text-muted-foreground">{decided.length} recent</span>
        </CardHeader>
        <div className="divide-y">
          {decided.slice(0, 30).map((a) => (
            <ApprovalCard key={a.id} a={a as ApprovalRow} slug={slug} companyId={cid} role={ctx.company.role} />
          ))}
          {!decided.length && <p className="px-4 py-3 text-sm text-muted-foreground">No decisions yet.</p>}
        </div>
      </Card>
    </div>
  );
}
