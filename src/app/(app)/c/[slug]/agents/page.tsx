import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { agentOutcomes, loadAgentOverview } from "@/lib/data/agents";
import { formatDateTime, relativeDays } from "@/lib/domain/format";
import { AGENT_KEYS, AGENTS, modeFor, type AgentKey } from "@/lib/agents/registry";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentIcon, InvestigationStatus, Timeline } from "@/components/agents/agent-ui";
import { ApprovalCard, type ApprovalRow } from "@/components/agents/approval-card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agents" };

const SIGNIFICANT = ["trigger", "proposal", "approval", "message", "response", "escalation", "outcome", "delegation", "error"];

export default async function AgentsOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const base = `/c/${slug}`;
  const o = await loadAgentOverview(ctx.supabase, cid);
  const pending = o.approvals.filter((a) => a.status === "pending");
  const active = o.investigations.filter((i) => !["resolved", "closed", "failed"].includes(i.status));
  const completed30 = o.investigations.filter((i) => i.status === "resolved" && i.resolved_at && Date.parse(i.resolved_at) > o.now - 30 * 86400000);
  const errors = o.investigations.filter((i) => i.status === "failed").length + o.runs.filter((r) => r.status === "failed").length;
  const recent = o.events.filter((e) => SIGNIFICANT.includes(e.kind)).slice(0, 14);
  const workerSeen = o.events[0]?.created_at;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
        <Tile href={`${base}/agents/approvals`} label="Needs your decision" value={pending.length} tone={pending.length ? "risk" : undefined} sub="specific actions awaiting approval" />
        <Tile label="Active investigations" value={active.length} sub={`${active.filter((i) => i.status === "monitoring").length} monitoring · ${active.filter((i) => i.status === "escalated").length} escalated`} />
        <Tile label="Completed (30 days)" value={completed30.length} sub="investigations resolved" tone={completed30.length ? "on" : undefined} />
        <Tile label="Errors or blocked" value={errors} tone={errors ? "off" : undefined} sub={workerSeen ? `last activity ${relativeDays(workerSeen)}` : "no agent activity yet"} />
      </div>

      <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2 xl:grid-cols-4" data-testid="agent-cards">
        {AGENT_KEYS.map((k) => {
          const a = o.byAgent[k];
          const def = AGENTS[k];
          const enabled = a.config?.enabled ?? false;
          const autos = def.categories.filter((c) => c !== "record_findings" && modeFor(a.config, c) === "auto").length;
          const outcomes = agentOutcomes(o, k).slice(0, 2);
          return (
            <Link key={k} href={`${base}/agents/${k}`} className="group">
              <Card className="h-full p-4 transition-colors group-hover:border-brand-border">
                <div className="flex items-start gap-3">
                  <AgentIcon agent={k} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{def.name}</p>
                    <p className="text-xs text-muted-foreground">{def.short}</p>
                  </div>
                  {enabled ? <Badge variant="on">On</Badge> : <Badge variant="none">Off</Badge>}
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Active" value={a.active.length} />
                  <Stat label="Awaiting you" value={a.pending.length} warn={a.pending.length > 0} />
                  <Stat label="Errors" value={a.failed.length + a.blockedRuns.length} bad={a.failed.length + a.blockedRuns.length > 0} />
                </dl>
                <div className="mt-3 space-y-1 border-t pt-2.5">
                  {outcomes.map((x) => (
                    <p key={x.label} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{x.label}</span>
                      <span className="font-medium tabular">{x.value}</span>
                    </p>
                  ))}
                </div>
                <p className="mt-2.5 truncate text-[11.5px] text-muted-foreground">
                  {enabled ? (autos ? `${autos} activit${autos === 1 ? "y" : "ies"} automatic within guardrails` : "Every action needs approval") : "Switched off — conservative default"}
                </p>
                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{a.lastEvent ? `${a.lastEvent.summary} · ${relativeDays(a.lastEvent.created_at)}` : "No activity yet"}</p>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-risk-ink" /> What requires your decision
            </CardTitle>
            <Link href={`${base}/agents/approvals`} className="text-xs text-muted-foreground hover:text-foreground">
              Approval queue <ArrowRight className="inline size-3" />
            </Link>
          </CardHeader>
          <div className="divide-y">
            {pending.slice(0, 3).map((a) => (
              <ApprovalCard key={a.id} a={a as ApprovalRow} slug={slug} companyId={cid} role={ctx.company.role} />
            ))}
            {!pending.length && (
              <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-on-ink" /> Nothing needs your decision.
              </p>
            )}
            {pending.length > 3 && <p className="px-4 py-2 text-xs text-muted-foreground">{pending.length - 3} more in the approval queue</p>}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What the agents found and did</CardTitle>
            <Link href={`${base}/agents/activity`} className="text-xs text-muted-foreground hover:text-foreground">
              All activity <ArrowRight className="inline size-3" />
            </Link>
          </CardHeader>
          <Timeline events={recent} base={base} showTools={false} linkInvestigation />
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Investigations in progress</CardTitle>
          <span className="text-xs text-muted-foreground">{active.length} active</span>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]" data-testid="active-investigations">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">Investigation</th>
                <th className="px-2 py-2 font-medium">Agent</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Waiting for</th>
                <th className="px-4 py-2 text-right font-medium">Next review</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.map((i) => {
                const r = o.runs.find((x) => x.investigation_id === i.id);
                return (
                  <tr key={i.id} className="hover:bg-accent/40">
                    <td className="px-4 py-2">
                      <Link href={`${base}/agents/investigations/${i.id}`} className="font-medium hover:underline">
                        {i.title}
                      </Link>
                      {i.summary && <span className="block truncate text-xs text-muted-foreground">{i.summary}</span>}
                    </td>
                    <td className="px-2 py-2 text-xs">{AGENTS[i.agent_key as AgentKey].name}</td>
                    <td className="px-2 py-2">
                      <InvestigationStatus status={i.status} />
                    </td>
                    <td className={cn("px-2 py-2 text-xs", r?.last_error ? "text-off-ink" : "text-muted-foreground")}>{r?.last_error ? `Retrying: ${r.last_error.slice(0, 60)}` : (r?.wait_reason ?? "—")}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{i.next_review_at ? formatDateTime(i.next_review_at) : "—"}</td>
                  </tr>
                );
              })}
              {!active.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-sm text-muted-foreground">
                    No active investigations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {errors > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-off-ink">
          <AlertTriangle className="size-3.5" /> Some agent work stopped with an error — see the agent pages for details.
        </p>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone, href }: { label: string; value: number; sub: string; tone?: "risk" | "on" | "off"; href?: string }) {
  const body = (
    <div className="h-full bg-card px-4 py-3 hover:bg-accent/30">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-2xl font-semibold tracking-tight tabular", tone === "risk" && "text-risk-ink", tone === "on" && "text-on-ink", tone === "off" && "text-off-ink")}>{value}</p>
      <p className="text-[11.5px] text-muted-foreground">{sub}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Stat({ label, value, warn, bad }: { label: string; value: number; warn?: boolean; bad?: boolean }) {
  return (
    <div className="rounded-md bg-muted/50 py-1.5">
      <dd className={cn("text-base font-semibold tabular", warn && "text-risk-ink", bad && "text-off-ink")}>{value}</dd>
      <dt className="text-[10.5px] text-muted-foreground">{label}</dt>
    </div>
  );
}
