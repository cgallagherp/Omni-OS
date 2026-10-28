import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, GitBranch } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/domain/format";
import { AGENTS, type AgentKey, type Finding } from "@/lib/agents/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentIcon, Findings, InvestigationStatus, Timeline } from "@/components/agents/agent-ui";
import { ApprovalCard, type ApprovalRow } from "@/components/agents/approval-card";
import { CloseInvestigationDialog } from "@/components/agents/controls";

export const metadata: Metadata = { title: "Investigation" };

const SUBJECT_PATH: Record<string, (id: string) => string> = {
  action: () => `/execution?view=actions`,
  metric: (id) => `/scoreboard/${id}`,
  thesis: () => `/agents/ma`,
  pipeline: () => `/agents/commercial`,
};

export default async function InvestigationPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ tools?: string }> }) {
  const { slug, id } = await params;
  const { tools } = await searchParams;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const base = `/c/${slug}`;
  const { data: inv } = await ctx.supabase.from("agent_investigations").select("*").eq("company_id", cid).eq("id", id).maybeSingle();
  if (!inv) notFound();
  const [{ data: events }, { data: approvals }, { data: runs }, { data: messages }, { data: children }, { data: parent }] = await Promise.all([
    ctx.supabase.from("agent_events").select("*").eq("company_id", cid).eq("investigation_id", id).order("id"),
    ctx.supabase.from("agent_approvals").select("*").eq("company_id", cid).eq("investigation_id", id).order("created_at"),
    ctx.supabase.from("agent_runs").select("*").eq("company_id", cid).eq("investigation_id", id).order("created_at", { ascending: false }).limit(1),
    ctx.supabase.from("agent_messages").select("id, kind, subject, to_crew_id, delivery_status, delivery_detail, created_at, response_kind, response_text, response_date, responded_at").eq("company_id", cid).eq("investigation_id", id).order("created_at"),
    ctx.supabase.from("agent_investigations").select("id, title, agent_key, status, summary").eq("company_id", cid).eq("parent_id", id),
    inv.parent_id ? ctx.supabase.from("agent_investigations").select("id, title, agent_key").eq("id", inv.parent_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { data: crew } = await ctx.supabase.from("crew_members").select("id, full_name").eq("company_id", cid);
  const name = new Map((crew ?? []).map((c) => [c.id, c.full_name]));
  const run = runs?.[0];
  const findings = (inv.findings ?? []) as unknown as Finding[];
  const pending = (approvals ?? []).filter((a) => a.status === "pending");
  const done = (events ?? []).filter((e) => ["message", "escalation", "outcome"].includes(e.kind) || (e.kind === "tool_call" && /create|apply/.test(e.summary)));
  const trigger = (inv.trigger ?? {}) as { type?: string; summary?: string };
  const baseline = (inv.baseline ?? {}) as Record<string, unknown>;
  const outcome = (inv.outcome ?? null) as Record<string, unknown> | null;
  const active = !["resolved", "closed", "failed"].includes(inv.status);
  const agent = inv.agent_key as AgentKey;

  return (
    <div className="space-y-5">
      <Link href={`${base}/agents/${agent}`} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {AGENTS[agent].name}
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <AgentIcon agent={agent} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{inv.title}</h2>
            <InvestigationStatus status={inv.status} />
            <Badge variant={inv.severity === "high" || inv.severity === "critical" ? "off" : "outline"}>{inv.severity}</Badge>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {trigger.type === "manual" ? "Requested" : trigger.type === "delegation" ? "Commissioned by another agent" : trigger.type === "schedule" ? "Scheduled check" : "Triggered automatically"}: {trigger.summary} · opened {formatDateTime(inv.opened_at)}
            {inv.subject_type && inv.subject_id && SUBJECT_PATH[inv.subject_type] && (
              <>
                {" · "}
                <Link href={`${base}${SUBJECT_PATH[inv.subject_type](inv.subject_id)}`} className="hover:underline">
                  view {inv.subject_type}
                </Link>
              </>
            )}
          </p>
          {inv.summary && <p className="mt-1 text-sm">{inv.summary}</p>}
          {parent && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch className="size-3.5" /> Commissioned by the {AGENTS[parent.agent_key as AgentKey].name}:{" "}
              <Link href={`${base}/agents/investigations/${parent.id}`} className="hover:underline">
                {parent.title}
              </Link>
            </p>
          )}
        </div>
        {active && ctx.can.write && <CloseInvestigationDialog companyId={cid} id={inv.id} />}
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What it discovered</CardTitle>
            <span className="text-xs text-muted-foreground">{findings.length} findings</span>
          </CardHeader>
          <CardContent>
            <Findings findings={findings} base={base} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What it did</CardTitle>
          </CardHeader>
          <div className="divide-y">
            {(messages ?? []).map((m) => (
              <div key={m.id} className="px-4 py-2.5 text-[13px]">
                <p>
                  <span className="font-medium">{m.kind === "escalation" ? "Escalated" : m.kind === "reminder" ? "Reminded" : "Asked"} {name.get(m.to_crew_id)}</span>
                  <span className="text-muted-foreground"> · {formatDateTime(m.created_at)} · {m.delivery_detail ?? m.delivery_status}</span>
                </p>
                <p className="text-xs text-muted-foreground">{m.subject}</p>
                {m.responded_at ? (
                  <p className="mt-1 rounded bg-muted/50 px-2 py-1 text-xs">
                    Reply ({formatDateTime(m.responded_at)}): <span className="font-medium">{m.response_kind?.replace("_", " ")}</span>
                    {m.response_date ? ` — ${formatDate(m.response_date)}` : ""}
                    {m.response_text ? ` — "${m.response_text}"` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">No reply yet.</p>
                )}
              </div>
            ))}
            {done.filter((e) => e.kind !== "message" && e.kind !== "escalation").map((e) => (
              <p key={e.id} className="px-4 py-2 text-[13px]">
                {e.summary} <span className="text-xs text-muted-foreground">· {formatDateTime(e.created_at)}</span>
              </p>
            ))}
            {(approvals ?? []).filter((a) => a.status === "executed").map((a) => (
              <p key={a.id} className="px-4 py-2 text-[13px]">
                Carried out after approval: {a.title} <span className="text-xs text-muted-foreground">· {formatDateTime(a.executed_at)}</span>
              </p>
            ))}
            {!messages?.length && !done.length && <p className="px-4 py-3 text-sm text-muted-foreground">No actions taken yet.</p>}
          </div>
        </Card>
      </div>

      {(approvals?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{pending.length ? "What requires your decision" : "Proposals"}</CardTitle>
          </CardHeader>
          <div className="divide-y">
            {(approvals ?? []).map((a) => (
              <ApprovalCard key={a.id} a={a as ApprovalRow} slug={slug} companyId={cid} role={ctx.company.role} showInvestigation={false} />
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1fr_1.2fr]">
        <Card className="h-fit" data-testid="intervention-record">
          <CardHeader>
            <CardTitle>What happened as a result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <Row label="Baseline">{Object.keys(baseline).length ? Object.entries(baseline).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ") : "—"}</Row>
            <Row label="Expected outcome">{inv.expected_outcome ?? "—"}</Row>
            <Row label="Measured result">{outcome ? Object.entries(outcome).filter(([, v]) => v !== null && typeof v !== "object").map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ") : active ? "Not yet — still in progress" : "—"}</Row>
            <Row label="Current state">{active ? (run?.last_error ? `Retrying after an error: ${run.last_error}` : (run?.wait_reason ?? "Working")) : inv.status === "closed" ? `Closed: ${inv.close_note ?? ""}` : `Finished ${formatDateTime(inv.resolved_at)}`}</Row>
            <Row label="Next review">{inv.next_review_at ? formatDateTime(inv.next_review_at) : "—"}</Row>
            {(children?.length ?? 0) > 0 && (
              <Row label="Commissioned investigations">
                <ul className="space-y-1">
                  {children!.map((c) => (
                    <li key={c.id}>
                      <Link href={`${base}/agents/investigations/${c.id}`} className="font-medium hover:underline">
                        {AGENTS[c.agent_key as AgentKey].name}: {c.title}
                      </Link>{" "}
                      <InvestigationStatus status={c.status} />
                    </li>
                  ))}
                </ul>
              </Row>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Investigation steps and evidence</CardTitle>
            <Link href={`${base}/agents/investigations/${id}${tools ? "" : "?tools=1"}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Eye className="size-3.5" /> {tools ? "Hide tool calls" : "Show tool calls"}
            </Link>
          </CardHeader>
          <Timeline events={events ?? []} base={base} showTools={Boolean(tools)} />
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">An auditable record of triggers, evidence, tool calls, proposals, approvals and outcomes. Agents record decisions and sources, not hidden reasoning.</p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
