import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wrench } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { agentOutcomes, loadAgentOverview } from "@/lib/data/agents";
import { formatDate, formatDateTime, formatMoney } from "@/lib/domain/format";
import { AGENT_KEYS, AGENTS, APPROVER_LABEL, approverFor, CATEGORIES, modeFor, type AgentKey, type Finding } from "@/lib/agents/registry";
import { WORKFLOW_SUBJECTS } from "@/lib/agents/manual";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentIcon, Findings, InvestigationStatus, ModeBadge, Timeline } from "@/components/agents/agent-ui";
import { ApprovalCard, type ApprovalRow } from "@/components/agents/approval-card";
import { CompleteTaskButton, RequestInvestigationDialog, TargetStageSelect } from "@/components/agents/controls";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentPage({ params }: { params: Promise<{ slug: string; agent: string }> }) {
  const { slug, agent: raw } = await params;
  if (!AGENT_KEYS.includes(raw as AgentKey)) notFound();
  const agent = raw as AgentKey;
  const def = AGENTS[agent];
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const base = `/c/${slug}`;
  const o = await loadAgentOverview(ctx.supabase, cid);
  const a = o.byAgent[agent];
  const cfg = a.config;
  const latestWithFindings = a.all.find((i) => Array.isArray(i.findings) && (i.findings as unknown[]).length > 0);
  const completed = a.all.filter((i) => ["resolved", "closed"].includes(i.status)).slice(0, 10);
  const proposals = o.approvals.filter((x) => x.agent_key === agent).slice(0, 6);
  const workflows = Object.entries(WORKFLOW_SUBJECTS).filter(([, w]) => w.agent === agent).map(([key, w]) => ({ key, label: w.label, subject: w.subject }));
  const [actionsRes, metricsRes, thesesRes, intActs, intSyn, acqs] = await Promise.all([
    ctx.supabase.from("actions").select("id, title, due_date").eq("company_id", cid).eq("status", "open").order("due_date").limit(60),
    ctx.supabase.from("metrics").select("id, name").eq("company_id", cid).eq("archived", false).order("sort_order"),
    ctx.supabase.from("ma_theses").select("*").eq("company_id", cid).order("created_at"),
    ctx.supabase.from("integration_activities").select("id, title, due_date, status").eq("company_id", cid).not("status", "in", "(done,not_needed)").order("due_date").limit(80),
    ctx.supabase.from("integration_synergies").select("id, description").eq("company_id", cid).limit(40),
    ctx.supabase.from("acquisitions").select("id, name, status").eq("company_id", cid).in("status", ["ready", "active"]),
  ]);
  const subjects = {
    action: (actionsRes.data ?? []).map((x) => ({ id: x.id, label: `${x.title}${x.due_date ? ` (due ${x.due_date})` : ""}` })),
    metric: (metricsRes.data ?? []).map((x) => ({ id: x.id, label: x.name })),
    thesis: (thesesRes.data ?? []).filter((t) => t.status === "approved").map((x) => ({ id: x.id, label: x.title })),
    integration_activity: (intActs.data ?? []).map((x) => ({ id: x.id, label: `${x.title}${x.due_date ? ` (due ${x.due_date})` : ""}` })),
    synergy: (intSyn.data ?? []).map((x) => ({ id: x.id, label: x.description })),
    acquisition: (acqs.data ?? []).map((x) => ({ id: x.id, label: x.name })),
  };
  const conns = o.connections.filter((c) => cfg?.allowed_connections.includes(c.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <AgentIcon agent={agent} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{def.name}</h2>
            {cfg?.enabled ? <Badge variant="on">On</Badge> : <Badge variant="none">Off</Badge>}
          </div>
          <p className="max-w-3xl text-[13px] text-muted-foreground">{def.remit}</p>
        </div>
        {ctx.can.write && cfg?.enabled && workflows.length > 0 && <RequestInvestigationDialog companyId={cid} slug={slug} agent={agent} workflows={workflows} subjects={subjects} />}
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4" data-testid="agent-outcomes">
        {agentOutcomes(o, agent).map((x) => (
          <div key={x.label} className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{x.label}</p>
            <p className="text-xl font-semibold tabular">{x.value}</p>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-[11px] text-muted-foreground">Measured from completed work and observed results — not message volume. Business improvements are attributed only where the investigation records evidence.</p>

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Investigations in progress</CardTitle>
              <span className="text-xs text-muted-foreground">{a.active.length}</span>
            </CardHeader>
            <div className="divide-y">
              {a.active.map((i) => (
                <Link key={i.id} href={`${base}/agents/investigations/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{i.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{o.runs.find((r) => r.investigation_id === i.id)?.wait_reason ?? i.summary ?? ""}</span>
                  </span>
                  <InvestigationStatus status={i.status} />
                </Link>
              ))}
              {!a.active.length && <p className="px-4 py-3 text-sm text-muted-foreground">{cfg?.enabled ? "Nothing in progress." : "The agent is switched off."}</p>}
            </div>
          </Card>
          {latestWithFindings && (
            <Card>
              <CardHeader>
                <CardTitle>Latest findings</CardTitle>
                <Link href={`${base}/agents/investigations/${latestWithFindings.id}`} className="truncate text-xs text-muted-foreground hover:text-foreground">
                  {latestWithFindings.title}
                </Link>
              </CardHeader>
              <CardContent>
                <Findings findings={(latestWithFindings.findings as unknown as Finding[]).slice(0, 8)} base={base} compact />
              </CardContent>
            </Card>
          )}
          {proposals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Proposed interventions</CardTitle>
              </CardHeader>
              <div className="divide-y">
                {proposals.map((p) => (
                  <ApprovalCard key={p.id} a={p as ApprovalRow} slug={slug} companyId={cid} role={ctx.company.role} />
                ))}
              </div>
            </Card>
          )}
          {agent === "commercial" && <CrmPanel slug={slug} companyId={cid} supabase={ctx.supabase} canWrite={ctx.can.write} />}
          {agent === "ma" && <MaPanel companyId={cid} supabase={ctx.supabase} theses={thesesRes.data ?? []} canWrite={ctx.can.write} />}
          <Card>
            <CardHeader>
              <CardTitle>Completed and results</CardTitle>
            </CardHeader>
            <div className="divide-y">
              {completed.map((i) => (
                <Link key={i.id} href={`${base}/agents/investigations/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{i.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{i.summary}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(i.resolved_at, { year: false })}</span>
                  <InvestigationStatus status={i.status} />
                </Link>
              ))}
              {!completed.length && <p className="px-4 py-3 text-sm text-muted-foreground">Nothing completed yet.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Authority</CardTitle>
              {ctx.can.admin && (
                <Link href={`${base}/agents/settings?agent=${agent}`} className="text-xs text-muted-foreground hover:text-foreground">
                  Configure
                </Link>
              )}
            </CardHeader>
            <div className="divide-y">
              {def.categories.map((c) => (
                <div key={c} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    {CATEGORIES[c].label} <span className="text-xs text-muted-foreground">L{CATEGORIES[c].level}</span>
                    {modeFor(cfg, c) === "approval" && <span className="block text-[11px] text-muted-foreground">Approver: {APPROVER_LABEL[approverFor(cfg, c)]}</span>}
                  </span>
                  <ModeBadge mode={c === "record_findings" && cfg?.enabled ? "auto" : modeFor(cfg, c)} />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tools, systems and schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Tools</p>
                <div className="flex flex-wrap gap-1">
                  {def.tools.map((t) => (
                    <Badge key={t} variant="outline">
                      <Wrench /> {t}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Connected systems it may use</p>
                {conns.length ? conns.map((c) => <p key={c.id}>{c.display_name} <span className="text-xs text-muted-foreground">({c.mode})</span></p>) : <p className="text-muted-foreground">None</p>}
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Runs</p>
                {def.schedules.map((s) => (
                  <p key={s.key} className={cn(cfg?.schedules[s.key]?.enabled === false && "text-muted-foreground line-through")}>
                    {s.label}
                  </p>
                ))}
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Management instructions</p>
                <p className={cn(!cfg?.instructions && "text-muted-foreground")}>{cfg?.instructions || "None"}</p>
              </div>
              {cfg && (
                <p className="text-xs text-muted-foreground">
                  Limits: {cfg.limits.max_actions_per_day} actions and {cfg.limits.max_messages_per_day} messages a day · escalate after {cfg.escalation.escalate_after_days} days overdue to the {cfg.escalation.escalate_to === "manager" ? "owner's manager" : "CEO"}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <Timeline events={a.events.filter((e) => e.kind !== "tool_call").slice(0, 12)} base={base} showTools={false} linkInvestigation />
          </Card>
        </div>
      </div>
    </div>
  );
}

type Sb = Awaited<ReturnType<typeof getCompanyContext>>["supabase"];

async function CrmPanel({ slug, companyId, supabase, canWrite }: { slug: string; companyId: string; supabase: Sb; canWrite: boolean }) {
  const [{ data: opps }, { data: tasks }, { data: conn }] = await Promise.all([
    supabase.from("crm_sandbox_opportunities").select("id, status, amount, segment, last_activity_on, close_date").eq("company_id", companyId),
    supabase.from("crm_sandbox_tasks").select("*, crm_sandbox_opportunities(name)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(20),
    supabase.from("integration_connections").select("provider, display_name, mode").eq("company_id", companyId).in("provider", ["crm_sandbox", "hubspot", "salesforce"]),
  ]);
  if (!conn?.length) return null;
  const open = (opps ?? []).filter((o) => o.status === "open");
  void slug;
  return (
    <Card>
      <CardHeader>
        <CardTitle>CRM — {conn.map((c) => c.display_name).join(", ")}</CardTitle>
        <span className="text-xs text-muted-foreground">{open.length} open opportunities · {formatMoney(open.reduce((n, o) => n + Number(o.amount), 0))}</span>
      </CardHeader>
      <div className="divide-y" data-testid="crm-tasks">
        {(tasks ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate", t.status === "completed" && "text-muted-foreground line-through")}>{t.subject}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {(t.crm_sandbox_opportunities as unknown as { name: string } | null)?.name} · {t.owner_name} · due {formatDate(t.due_date, { year: false })}
                {t.created_by_agent ? " · created by the Commercial Agent" : ""}
              </span>
            </span>
            {t.status === "open" && canWrite ? <CompleteTaskButton companyId={companyId} id={t.id} /> : <Badge variant={t.status === "completed" ? "on" : "outline"}>{t.status}</Badge>}
          </div>
        ))}
        {!tasks?.length && <p className="px-4 py-3 text-sm text-muted-foreground">No CRM follow-up tasks yet.</p>}
      </div>
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">Sandbox CRM with fictional data, standing in for the company&apos;s HubSpot or Salesforce until it is connected. Completing a task here records activity on the opportunity.</p>
    </Card>
  );
}

async function MaPanel({ companyId, supabase, theses, canWrite }: { companyId: string; supabase: Sb; theses: Array<{ id: string; title: string; status: string; rationale: string; geographies: string[]; sectors: string[]; min_revenue: number | null; max_revenue: number | null; min_ebitda: number | null; exclusions: string[]; approved_at: string | null }>; canWrite: boolean }) {
  const { data: targets } = await supabase.from("ma_targets").select("*").eq("company_id", companyId).order("fit_score", { ascending: false, nullsFirst: false });
  return (
    <>
      {theses.map((t) => (
        <Card key={t.id}>
          <CardHeader>
            <CardTitle>Acquisition thesis: {t.title}</CardTitle>
            <Badge variant={t.status === "approved" ? "on" : "outline"}>{t.status === "approved" ? `Approved ${formatDate(t.approved_at, { year: false })}` : t.status}</Badge>
          </CardHeader>
          <CardContent className="space-y-1 text-[13px]">
            <p>{t.rationale}</p>
            <p className="text-xs text-muted-foreground">
              Sectors: {t.sectors.join(", ")} · Regions: {t.geographies.join(", ")} · Revenue {formatMoney(t.min_revenue)}–{formatMoney(t.max_revenue)} · EBITDA ≥ {formatMoney(t.min_ebitda)} · Excludes: {t.exclusions.join(", ")}
            </p>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Target pipeline</CardTitle>
          <span className="text-xs text-muted-foreground">{targets?.length ?? 0} targets</span>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13px]" data-testid="ma-pipeline">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-2 py-2 text-right font-medium">Fit</th>
                <th className="px-2 py-2 text-right font-medium">Revenue</th>
                <th className="px-2 py-2 text-right font-medium">EBITDA</th>
                <th className="px-4 py-2 font-medium">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(targets ?? []).map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.geography} · {t.source}
                      {t.added_by_agent ? " · added by the M&A Agent" : ""}
                      {t.rejection_reason ? ` · rejected: ${t.rejection_reason}` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular">{t.fit_score ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular">{t.revenue !== null ? formatMoney(Number(t.revenue)) : <span className="text-muted-foreground">Unknown</span>}</td>
                  <td className="px-2 py-2 text-right tabular">{t.ebitda !== null ? formatMoney(Number(t.ebitda)) : <span className="text-muted-foreground">Unknown</span>}</td>
                  <td className="px-4 py-2">{canWrite ? <TargetStageSelect companyId={companyId} id={t.id} stage={t.stage} /> : t.stage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">Financials are shown only where a source provides them; unknown values are never estimated. Last updated {formatDateTime(new Date().toISOString())}.</p>
      </Card>
    </>
  );
}
