import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, FileText, Hand, Lock, Pencil } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadAcquisition } from "@/lib/data/integration";
import { ACQUISITION_STATUS_LABEL, daysBetween, downstream, verifiedComplete, type Health } from "@/lib/domain/integration";
import { DOC_TYPES } from "@/lib/integration/ingest";
import { claudeConfigured } from "@/lib/integration/claude";
import { SYNERGY_LABEL } from "@/lib/integration/schema";
import { formatDate, formatDateTime } from "@/lib/domain/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Owner } from "@/components/os/avatar";
import { EmptyState } from "@/components/os/page";
import { ApprovalCard, type ApprovalRow } from "@/components/agents/approval-card";
import { InvestigationStatus, Timeline as AgentTimeline, type TimelineEvent } from "@/components/agents/agent-ui";
import {
  AcquisitionForm, ActivityDialog, ApproveActivityButton, GeneratePlanDialog, GenerationWatch, KnowledgeUploader, PauseToggle, StartReviewButton, StatusButton, SynergyDialog, SynergyResultDialog, VerifyButtons, VerifyResultButton,
} from "@/components/integration/controls";
import { PlanEditor } from "@/components/integration/plan-editor";
import { HealthBadge, MilestoneMeter, SynergyBadge, Timeline, money } from "@/components/integration/ui";

export const metadata: Metadata = { title: "Integration" };

const TABS = [
  ["overview", "Overview"], ["plan", "Playbook"], ["workstreams", "Workstreams"], ["critical", "Critical path"], ["synergies", "Synergies"],
  ["issues", "Issues and decisions"], ["agent", "Agent activity"], ["timeline", "Timeline"], ["documents", "Documents"], ["review", "Review"],
] as const;

export default async function AcquisitionPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const b = await loadAcquisition(ctx.supabase, cid, id);
  if (!b) notFound();
  const { a, sum } = b;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "overview") as (typeof TABS)[number][0];
  const base = `/c/${slug}/integrations/${id}`;
  const executing = ["ready", "active", "on_hold", "completed"].includes(a.status);
  const health: Health = a.status === "active" ? sum.health : "not_started";
  const wsName = new Map(b.workstreams.map((w) => [w.id, w.name]));
  const actById = new Map(b.activities.map((x) => [x.id, x]));
  const { data: cfg } = await ctx.supabase.from("agent_configs").select("enabled, allow_external_ai").eq("company_id", cid).eq("agent_key", "integration").maybeSingle();
  const aiEnabled = Boolean(cfg?.allow_external_ai) && claudeConfigured();
  const pendingApprovals = b.approvals.filter((x) => x.status === "pending");
  const missing = [...(b.draftContent?.missing_information ?? []), ...(((a.handover as { missing?: string[] } | null)?.missing ?? []).filter(() => !b.approved))];

  return (
    <div className="space-y-4">
      <Link href={`/c/${slug}/integrations`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Integrations</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {a.status === "active" ? <HealthBadge health={health} /> : <Badge variant="outline">{ACQUISITION_STATUS_LABEL[a.status]}</Badge>}
            {a.integration_model && <Badge variant="outline">{a.integration_model}</Badge>}
            {a.agent_paused && <Badge variant="none">Agent paused</Badge>}
            {a.ma_target_id && <Badge variant="brand">Handed over from the M&A Agent</Badge>}
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight">{a.name}</h1>
          <p className="text-sm text-muted-foreground">Completion {formatDate(a.completion_date)}{a.completion_date && a.status === "active" ? ` · day ${daysBetween(a.completion_date, b.today)}` : ""} · leader <Owner person={a.leader_crew_id ? (b.crewById.get(a.leader_crew_id) as never) : undefined} /> · sponsor <Owner person={a.sponsor_crew_id ? (b.crewById.get(a.sponsor_crew_id) as never) : undefined} /></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ctx.can.write && <AcquisitionForm companyId={cid} slug={slug} acquisition={a as never} crew={b.crew} goals={b.goals} priorities={b.priorities} trigger={<Button size="sm" variant="outline"><Pencil /> Edit</Button>} />}
          {ctx.can.admin && executing && a.status !== "completed" && <PauseToggle companyId={cid} acquisitionId={a.id} paused={a.agent_paused} />}
          {ctx.can.admin && a.status === "ready" && a.completion_date && a.completion_date <= b.today && <StatusButton companyId={cid} acquisitionId={a.id} status="active" label="Activate plan" variant="brand" />}
          {ctx.can.admin && a.status === "active" && <StatusButton companyId={cid} acquisitionId={a.id} status="completed" label="Complete integration" confirmText="Mark the integration complete? The agent stops monitoring it; run the post-integration review afterwards." />}
        </div>
      </div>

      {a.status === "active" && b.activities.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="p-3"><p className="text-xs text-muted-foreground">Progress (verified milestones)</p><MilestoneMeter sum={sum} className="mt-2" /></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Critical path</p><p className="mt-1 text-lg font-semibold tabular">{sum.criticalOpen.length} open</p><p className="text-xs text-muted-foreground">{sum.criticalSlipDays ? `${sum.criticalSlipDays} days slip vs approved plan` : "No slip"}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Overdue / at risk</p><p className="mt-1 text-lg font-semibold tabular"><span className={sum.overdue.length ? "text-off-ink" : ""}>{sum.overdue.length}</span> / <span className={sum.atRisk.length ? "text-risk-ink" : ""}>{sum.atRisk.length}</span></p><p className="text-xs text-muted-foreground">{sum.unverified.length} done but not verified</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Synergies (verified)</p><p className="mt-1 text-lg font-semibold tabular">{money(b.totals.realised)} <span className="text-sm font-normal text-muted-foreground">of {money(b.totals.target)}</span></p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Next milestone</p><p className="mt-1 truncate text-[13px] font-medium">{sum.nextMilestone?.title ?? "—"}</p><p className="text-xs text-muted-foreground tabular">{formatDate(sum.nextMilestone?.due_date)}</p></Card>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Integration sections">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`${base}?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium", tab === k ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {l}{k === "issues" && pendingApprovals.length + sum.pendingApprovals.length > 0 ? <span className="ml-1.5 rounded-full bg-risk px-1.5 text-[10.5px] font-semibold tabular">{pendingApprovals.length + sum.pendingApprovals.length}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardContent className="grid gap-4 p-4 text-[13px] sm:grid-cols-2">
              {[["Strategic rationale", a.rationale], ["Integration objectives", a.objectives], ["Target operating model", a.operating_model], ["Expected synergies", a.expected_synergies], ["Relevant diligence findings", a.diligence_findings], ["Contractual commitments", a.commitments], ["Systems", a.systems_info], ["Organisation", a.org_info]].map(([l, v]) => (
                <div key={l}><p className="text-xs text-muted-foreground">{l}</p><p className="mt-0.5 whitespace-pre-line">{v || <span className="text-muted-foreground">Not recorded</span>}</p></div>
              ))}
            </CardContent>
          </Card>
          <div className="space-y-3">
            {!executing && (
              <Card className="space-y-2 p-4">
                <p className="text-[13px] font-medium">Integration plan</p>
                <p className="text-[13px] text-muted-foreground">{b.draft ? (b.draft.status === "generating" ? "The agent is drafting the plan." : b.draft.status === "failed" ? `Generation failed: ${b.draft.generation_note}` : "A draft plan is ready for review.") : b.playbooks.length ? "Generate a plan from an approved playbook." : "Approve a master playbook first."}</p>
                {b.draft && b.draft.status !== "failed" ? <Button asChild size="sm" variant="brand"><Link href={`${base}?tab=plan`}>Review the plan</Link></Button> : ctx.can.write && cfg?.enabled && <GeneratePlanDialog companyId={cid} acquisitionId={a.id} playbooks={b.playbooks} recommended={a.recommended_playbook_id} recommendation={(a.recommendation as { reason?: string } | null)?.reason ?? null} aiEnabled={aiEnabled} />}
              </Card>
            )}
            {missing.length > 0 && (
              <Card className="border-risk/40 p-4">
                <p className="mb-1.5 text-[13px] font-medium">Information still needed</p>
                <ul className="list-disc space-y-0.5 pl-4 text-[13px] text-muted-foreground">{[...new Set(missing)].map((m) => <li key={m}>{m}</li>)}</ul>
              </Card>
            )}
            <Card className="p-4">
              <p className="mb-1.5 text-[13px] font-medium">Principal risks</p>
              <ul className="space-y-1 text-[13px]">
                {(b.approvedContent ?? b.draftContent)?.risks.slice(0, 6).map((r, i) => <li key={i}>{r.text}</li>) ?? <li className="text-muted-foreground">{a.key_risks || "None recorded"}</li>}
              </ul>
            </Card>
            {(a.annual_goal_id || a.quarterly_priority_id) && (
              <Card className="p-4 text-[13px]">
                <p className="mb-1 font-medium">Flight Plan</p>
                {a.annual_goal_id && <p><span className="text-muted-foreground">12-Month Objective:</span> <Link className="hover:underline" href={`/c/${slug}/flight-plan/annual_goal/${a.annual_goal_id}`}>{b.goals.find((g) => g.id === a.annual_goal_id)?.title}</Link></p>}
                {a.quarterly_priority_id && <p><span className="text-muted-foreground">90-Day Priority:</span> <Link className="hover:underline" href={`/c/${slug}/flight-plan/quarterly_priority/${a.quarterly_priority_id}`}>{b.priorities.find((g) => g.id === a.quarterly_priority_id)?.title}</Link></p>}
              </Card>
            )}
            {a.handover && (
              <Card className="p-4 text-[13px]">
                <p className="mb-1 font-medium">Handover from the M&A Agent</p>
                <p className="text-muted-foreground">Thesis: {(a.handover as { thesis?: string }).thesis ?? "—"} · fit {(a.handover as { fit_score?: number }).fit_score ?? "—"}/100</p>
                <p className="text-muted-foreground">Financials: {typeof (a.handover as { financials?: unknown }).financials === "string" ? String((a.handover as { financials: string }).financials) : "shared with the integration team"}</p>
                <p className="text-xs text-muted-foreground">Approved by {(a.handover as { approved_by?: string }).approved_by}</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "plan" && (
        !executing ? (
          b.draft?.status === "generating" ? <GenerationWatch active label="The M&A Integration Agent is adapting the playbook to this acquisition" />
          : b.draft && b.draftContent ? (
            <div className="space-y-3">
              {b.draft.generation_note && <p className="text-[13px] text-muted-foreground">{b.draft.generation_note}</p>}
              <PlanEditor companyId={cid} slug={slug} plan={{ id: b.draft.id, updated_at: b.draft.updated_at, version: b.draft.version }} initial={b.draftContent} crew={b.crew} canEdit={ctx.can.write} canApprove={ctx.can.admin} completion={a.completion_date} />
            </div>
          ) : (
            <EmptyState title="No plan yet" description="Generate an integration plan from an approved playbook." action={ctx.can.write && cfg?.enabled ? <GeneratePlanDialog companyId={cid} acquisitionId={a.id} playbooks={b.playbooks} recommended={a.recommended_playbook_id} recommendation={(a.recommendation as { reason?: string } | null)?.reason ?? null} aiEnabled={aiEnabled} /> : undefined} />
          )
        ) : (
          <div className="space-y-4">
            {b.approved && <p className="text-[13px] text-muted-foreground">Approved plan v{b.approved.version} ({formatDate(b.approved.approved_at)}), from the playbook in use. Dates and owners change here, through people; the agent never changes them itself.</p>}
            {b.workstreams.map((w) => {
              const acts = b.activities.filter((x) => x.workstream_id === w.id);
              return (
                <Card key={w.id} className="overflow-hidden">
                  <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                    <h3 className="text-[14px] font-semibold">{w.name}</h3>
                    <HealthBadge health={sum.workstreamHealth.get(w.id) ?? "not_started"} />
                  </div>
                  <table className="w-full text-[13px]">
                    <tbody className="divide-y">
                      {acts.map((x) => {
                        const as = sum.assessments.get(x.id)!;
                        return (
                          <tr key={x.id} id={x.id} className="scroll-mt-24 align-top">
                            <td className="w-24 px-4 py-2 text-xs text-muted-foreground tabular">{formatDate(x.due_date, { year: false })}{x.baseline_due_date && x.due_date !== x.baseline_due_date && <span className="block line-through">{formatDate(x.baseline_due_date, { year: false })}</span>}</td>
                            <td className="px-2 py-2">
                              <span className={cn(x.status === "done" && "text-muted-foreground")}>{x.title}</span>
                              <span className="mt-0.5 flex flex-wrap gap-1">
                                {x.critical && <Badge variant="off">Critical path</Badge>}
                                {x.milestone && <Badge variant="outline">Milestone</Badge>}
                                {x.human_only && <Badge variant="outline" title={x.human_only_reason ?? ""}><Hand className="size-3" /> People only</Badge>}
                                {x.approval_required && <Badge variant={x.approval_status === "approved" ? "on" : "risk"}>Approval: {x.approval_required} {x.approval_status === "approved" ? "✓" : "pending"}</Badge>}
                                {as.blockedBy.length > 0 && <Badge variant="risk">Waiting on {as.blockedBy.map((d) => actById.get(d)?.title).join(", ")}</Badge>}
                              </span>
                              {x.completion_criteria && <span className="mt-0.5 block text-xs text-muted-foreground">Criteria: {x.completion_criteria}</span>}
                              {x.evidence_note && <span className="mt-0.5 block text-xs text-muted-foreground">Note: {x.evidence_note}</span>}
                            </td>
                            <td className="w-36 px-2 py-2"><Owner person={x.owner_crew_id ? (b.crewById.get(x.owner_crew_id) as never) : undefined} /></td>
                            <td className="w-56 px-2 py-2">
                              <HealthBadge health={as.health} />
                              {x.status === "done" && x.completion_criteria && (x.criteria_met === true ? <span className="ml-1 text-xs text-on-ink"><CheckCircle2 className="inline size-3" /> verified</span> : x.criteria_met === false ? <span className="ml-1 text-xs text-off-ink">criteria not met</span> : <span className="ml-1 text-xs text-risk-ink">not verified</span>)}
                              {as.overdueDays > 0 && <span className="block text-xs text-off-ink">{as.overdueDays} days overdue</span>}
                            </td>
                            <td className="w-64 px-4 py-2 text-right">
                              <span className="inline-flex flex-wrap justify-end gap-1">
                                {ctx.can.write && x.status === "done" && x.completion_criteria && x.criteria_met === null && <VerifyButtons companyId={cid} activityId={x.id} />}
                                {ctx.can.admin && x.approval_status === "pending" && <ApproveActivityButton companyId={cid} activityId={x.id} />}
                                {ctx.can.write && <ActivityDialog companyId={cid} crew={b.crew} activity={x} trigger={<Button size="xs" variant="ghost">Update</Button>} />}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              );
            })}
          </div>
        )
      )}

      {tab === "workstreams" && (
        <Card>
          <table className="w-full text-[13px]">
            <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><tr>{["Workstream", "Status", "Verified complete", "Milestones", "Overdue", "Waiting on dependencies", "Owner"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {b.workstreams.map((w) => {
                const acts = b.activities.filter((x) => x.workstream_id === w.id);
                const ms = acts.filter((x) => x.milestone || x.critical);
                return (
                  <tr key={w.id}>
                    <td className="px-4 py-2.5 font-medium">{w.name}</td>
                    <td className="px-4 py-2.5"><HealthBadge health={sum.workstreamHealth.get(w.id) ?? "not_started"} /></td>
                    <td className="px-4 py-2.5 tabular">{acts.filter(verifiedComplete).length}/{acts.length}</td>
                    <td className="px-4 py-2.5 tabular">{ms.filter(verifiedComplete).length}/{ms.length}</td>
                    <td className="px-4 py-2.5 tabular">{acts.filter((x) => sum.assessments.get(x.id)!.overdueDays > 0).length || "—"}</td>
                    <td className="px-4 py-2.5 tabular">{acts.filter((x) => sum.assessments.get(x.id)!.blockedBy.length).length || "—"}</td>
                    <td className="px-4 py-2.5"><Owner person={w.owner_crew_id ? (b.crewById.get(w.owner_crew_id) as never) : undefined} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!b.workstreams.length && <CardContent><EmptyState title="No approved plan yet" /></CardContent>}
        </Card>
      )}

      {tab === "critical" && (
        <Card>
          <CardHeader><CardTitle>Activities that determine the integration&apos;s key dates</CardTitle></CardHeader>
          <ul className="divide-y text-[13px]">
            {b.activities.filter((x) => x.critical).sort((p, q) => (p.due_date ?? "").localeCompare(q.due_date ?? "")).map((x) => {
              const as = sum.assessments.get(x.id)!;
              const deps = downstream(x.id, b.deps).map((d) => actById.get(d)?.title).filter(Boolean);
              return (
                <li key={x.id} className="grid gap-2 px-4 py-2.5 md:grid-cols-[110px_1fr_160px]">
                  <span className="text-xs text-muted-foreground tabular">{formatDate(x.due_date)}{as.slipDays ? <span className="block text-off-ink">+{as.slipDays}d vs plan</span> : null}</span>
                  <span><span className="font-medium">{x.title}</span> <span className="text-muted-foreground">· {wsName.get(x.workstream_id)}</span>{deps.length > 0 && <span className="block text-xs text-muted-foreground">Holds up: {deps.join("; ")}</span>}{as.blockedBy.length > 0 && <span className="block text-xs text-risk-ink">Waiting on: {as.blockedBy.map((d) => actById.get(d)?.title).join("; ")}</span>}</span>
                  <span className="md:text-right"><HealthBadge health={as.health} /></span>
                </li>
              );
            })}
            {!b.activities.some((x) => x.critical) && <li className="px-4 py-3 text-muted-foreground">No critical-path activities.</li>}
          </ul>
        </Card>
      )}

      {tab === "synergies" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">Realised benefit counts only verified actual results. Forecasts are shown separately; each synergy is counted once.</p>
            {ctx.can.write && executing && <SynergyDialog companyId={cid} acquisitionId={a.id} crew={b.crew} activities={b.activities} trigger={<Button size="sm" variant="outline">Add synergy</Button>} />}
          </div>
          {b.synergies.map((s) => {
            const r = b.assessed.get(s.id)!;
            const results = b.actuals.filter((x) => x.synergy_id === s.id);
            return (
              <Card key={s.id} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[14px] font-semibold">{s.description}</p>
                    <p className="text-xs text-muted-foreground">{SYNERGY_LABEL[s.category as keyof typeof SYNERGY_LABEL]} · {s.measurement.replace(/_/g, " ")} · owner <Owner person={s.owner_crew_id ? (b.crewById.get(s.owner_crew_id) as never) : undefined} /> · realise by {formatDate(s.expected_realisation_date)}</p>
                  </div>
                  <div className="flex items-center gap-2"><SynergyBadge status={r.status} />{ctx.can.write && <SynergyResultDialog companyId={cid} synergyId={s.id} canVerify={ctx.can.admin} />}</div>
                </div>
                <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-5">
                  <div><p className="text-xs text-muted-foreground">Baseline → target</p><p className="tabular">{money(s.baseline, s.unit)} → {money(s.target, s.unit)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Expected by now</p><p className="tabular">{money(Math.round(r.expectedByNow), s.unit)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Realised (verified)</p><p className="font-semibold tabular">{money(r.realised, s.unit)}{r.attainment !== null && <span className="ml-1 text-xs font-normal text-muted-foreground">{Math.round(r.attainment * 100)}% of plan</span>}</p></div>
                  <div><p className="text-xs text-muted-foreground">Latest forecast</p><p className="tabular text-muted-foreground">{money(r.forecast, s.unit)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Supporting activities</p><p className="tabular">{r.supportingDone}/{r.supportingTotal} verified complete</p></div>
                </div>
                {r.status === "off_track" && r.supportingTotal > 0 && r.supportingDone === r.supportingTotal && <p className="mt-2 flex items-center gap-1.5 text-[13px] text-off-ink"><AlertTriangle className="size-3.5" /> The work intended to deliver this benefit is complete, but the benefit has not followed.</p>}
                {results.length > 0 && (
                  <table className="mt-3 w-full text-xs">
                    <tbody className="divide-y">
                      {results.map((x) => (
                        <tr key={x.id}>
                          <td className="py-1 tabular">{formatDate(x.period_start)}</td>
                          <td className="py-1 capitalize">{x.kind}</td>
                          <td className="py-1 tabular">{money(x.value, s.unit)}</td>
                          <td className="py-1 text-muted-foreground">{x.source}</td>
                          <td className="py-1 text-right">{x.kind === "actual" && (x.verified ? <span className="text-on-ink">Verified</span> : <span className="inline-flex items-center gap-1 text-risk-ink">Unverified {ctx.can.admin && <VerifyResultButton companyId={cid} actualId={x.id} />}</span>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            );
          })}
          {!b.synergies.length && <EmptyState title="No synergies recorded" description="Synergy targets come from the approved plan, or can be added here." />}
        </div>
      )}

      {tab === "issues" && (
        <div className="space-y-4">
          {pendingApprovals.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Proposals from the M&A Integration Agent</h2>
              {pendingApprovals.map((x) => <ApprovalCard key={x.id} a={x as unknown as ApprovalRow} slug={slug} companyId={cid} role={ctx.company.role} />)}
            </section>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Mission Control issues</CardTitle></CardHeader>
              <ul className="divide-y text-[13px]">
                {b.issues.map((x) => <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2"><Link className="hover:underline" href={`/c/${slug}/execution/issue/${x.id}`}>{x.title}</Link><Badge variant={x.status === "resolved" ? "done" : "risk"} className="capitalize">{x.status.replace("_", " ")}</Badge></li>)}
                {!b.issues.length && <li className="px-4 py-3 text-muted-foreground">Nothing escalated. Routine integration work stays here, out of the weekly ELT meeting.</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader><CardTitle>Agreed corrective actions</CardTitle></CardHeader>
              <ul className="divide-y text-[13px]">
                {b.actions.map((x) => <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2"><span><span className={cn(x.status !== "open" && "text-muted-foreground line-through")}>{x.title}</span><span className="block text-xs text-muted-foreground"><Owner person={b.crewById.get(x.owner_id) as never} /> · due {formatDate(x.due_date)}</span></span><Badge variant={x.status === "done" ? "done" : x.due_date && x.due_date < b.today ? "off" : "outline"} className="capitalize">{x.status === "open" && x.due_date && x.due_date < b.today ? "Overdue" : x.status}</Badge></li>)}
                {!b.actions.length && <li className="px-4 py-3 text-muted-foreground">None.</li>}
              </ul>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Decisions and approvals in the plan</CardTitle></CardHeader>
            <ul className="divide-y text-[13px]">
              {b.activities.filter((x) => x.approval_required).map((x) => <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2"><span>{x.title} <span className="text-muted-foreground">— {x.approval_required}</span></span>{x.approval_status === "approved" ? <Badge variant="on">Approved</Badge> : ctx.can.admin ? <ApproveActivityButton companyId={cid} activityId={x.id} /> : <Badge variant="risk">Pending</Badge>}</li>)}
              {!b.activities.some((x) => x.approval_required) && <li className="px-4 py-3 text-muted-foreground">No approvals required by the plan.</li>}
            </ul>
          </Card>
        </div>
      )}

      {tab === "agent" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Bot className="size-4" /> What the agent investigated, followed up, executed or escalated</CardTitle></CardHeader>
            <AgentTimeline events={b.events as unknown as TimelineEvent[]} base={`/c/${slug}`} showTools={false} linkInvestigation />
          </Card>
          <div className="space-y-3">
            <Card>
              <CardHeader><CardTitle>Investigations</CardTitle></CardHeader>
              <ul className="divide-y text-[13px]">
                {b.cases.map((x) => (
                  <li key={x.id} className="px-4 py-2">
                    <div className="flex items-center justify-between gap-2"><Link href={`/c/${slug}/agents/investigations/${x.id}`} className="min-w-0 truncate font-medium hover:underline">{x.title}</Link><InvestigationStatus status={x.status} /></div>
                    {x.summary && <p className="text-xs text-muted-foreground">{x.summary}</p>}
                    {x.next_review_at && !["resolved", "closed", "failed"].includes(x.status) && <p className="text-xs text-muted-foreground">Next review {formatDateTime(x.next_review_at)}</p>}
                  </li>
                ))}
                {!b.cases.length && <li className="px-4 py-3 text-muted-foreground">{a.status === "active" ? "Nothing needs the agent's attention." : "The agent starts monitoring once the plan is approved and the transaction completes."}</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader><CardTitle>Follow-ups sent</CardTitle></CardHeader>
              <ul className="divide-y text-[13px]">
                {b.messages.slice(0, 12).map((m) => <li key={m.id} className="px-4 py-2"><p className="truncate">{m.subject}</p><p className="text-xs text-muted-foreground">{b.crewById.get(m.to_crew_id)?.full_name} · {formatDateTime(m.created_at)} · {m.responded_at ? `replied: ${m.response_kind?.replace("_", " ")}` : m.kind === "notice" ? "report" : "awaiting reply"}</p></li>)}
                {!b.messages.length && <li className="px-4 py-3 text-muted-foreground">None yet.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {tab === "timeline" && (
        <Card className="p-4">
          <Timeline activities={b.activities.map((x) => ({ id: x.id, title: x.title, workstream: wsName.get(x.workstream_id) ?? "", start_date: x.start_date, due_date: x.due_date, baseline_due_date: x.baseline_due_date, status: x.status, critical: x.critical, milestone: x.milestone, health: sum.assessments.get(x.id)?.health ?? "not_started" }))} deps={b.deps} today={b.today} completion={a.completion_date} />
        </Card>
      )}

      {tab === "documents" && (
        <div className="space-y-4">
          {ctx.can.write && <Card className="p-4"><p className="mb-2 text-[13px] font-medium">Acquisition documents</p><p className="mb-3 text-[13px] text-muted-foreground">Diligence reports, the SPA schedule of commitments, systems inventories. Mark transaction documents confidential to limit them to administrators; the agent uses them when planning.</p><KnowledgeUploader companyId={cid} acquisitionId={a.id} canRestrict={ctx.can.admin} defaultType="diligence" /></Card>}
          <Card>
            <ul className="divide-y text-[13px]">
              {b.docs.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 px-4 py-2"><Link className="inline-flex items-center gap-1.5 hover:underline" href={`/c/${slug}/integrations/knowledge/${d.id}`}><FileText className="size-3.5 text-muted-foreground" /> {d.title}{d.restricted && <Lock className="size-3 text-muted-foreground" />}</Link><span className="text-xs text-muted-foreground">{DOC_TYPES[d.doc_type as keyof typeof DOC_TYPES]} · {d.status === "ready" ? "indexed" : d.error}</span></li>)}
              {!b.docs.length && <li className="px-4 py-3 text-muted-foreground">No acquisition documents yet.</li>}
            </ul>
          </Card>
        </div>
      )}

      {tab === "review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] text-muted-foreground">Compares the approved plan with what happened, looks for the same problems in previous integrations and proposes improvements to the master playbook. Proposals change nothing until management accepts and approves them.</p>
            {ctx.can.write && ["active", "completed"].includes(a.status) && cfg?.enabled && <StartReviewButton companyId={cid} acquisitionId={a.id} />}
          </div>
          {b.reviews.map((r) => {
            const c = r.content as { summary?: string; delays?: Array<{ title: string; workstream: string; slip_days: number; delayed_dependents: string[] }>; patterns?: Array<{ theme: string; occurrences: number; sources: string[] }>; unnecessary?: string[]; unexpected?: string[]; synergies?: Array<{ description: string; target: number; realised: number | null; status: string; supporting_done: string }> };
            const props = b.proposals.filter((p) => p.review_id === r.id);
            return (
              <Card key={r.id} className="space-y-3 p-4">
                <div className="flex items-center justify-between"><p className="text-[13px] font-medium">Review · {formatDateTime(r.created_at)}</p><Badge variant={r.status === "ready" ? "on" : r.status === "failed" ? "off" : "brand"}>{r.status === "generating" ? "Preparing…" : r.status}</Badge></div>
                <GenerationWatch active={r.status === "generating"} label="The M&A Integration Agent is reviewing the integration" />
                {c.summary && <p className="text-[13px]">{c.summary}</p>}
                {!!c.delays?.length && <div><p className="text-xs font-semibold text-muted-foreground uppercase">Delays</p><ul className="mt-1 space-y-0.5 text-[13px]">{c.delays.map((d) => <li key={d.title}><span className="font-medium">{d.title}</span> — {d.slip_days} days late{d.delayed_dependents.length ? `, delaying ${d.delayed_dependents.join(", ")}` : ""}</li>)}</ul></div>}
                {!!c.patterns?.length && <div><p className="text-xs font-semibold text-muted-foreground uppercase">Recurring patterns</p><ul className="mt-1 space-y-0.5 text-[13px]">{c.patterns.map((p) => <li key={p.theme}><span className="font-medium">{p.theme}</span> in {p.occurrences} integrations <span className="text-muted-foreground">({p.sources.join("; ")})</span></li>)}</ul></div>}
                {!!c.synergies?.length && <div><p className="text-xs font-semibold text-muted-foreground uppercase">Synergies</p><ul className="mt-1 space-y-0.5 text-[13px]">{c.synergies.map((s) => <li key={s.description}>{s.description}: {money(s.realised)} of {money(s.target)} ({s.status.replace("_", " ")}); supporting work {s.supporting_done}</li>)}</ul></div>}
                {props.length > 0 && <div><p className="text-xs font-semibold text-muted-foreground uppercase">Proposed playbook improvements</p><ul className="mt-1 space-y-0.5 text-[13px]">{props.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><Link className="hover:underline" href={`/c/${slug}/integrations/playbooks/${p.playbook_id}#improvements`}>{p.title}</Link><Badge variant={p.status === "accepted" ? "on" : p.status === "rejected" ? "none" : "risk"} className="capitalize">{p.status}</Badge></li>)}</ul></div>}
              </Card>
            );
          })}
          {!b.reviews.length && <EmptyState title="No review yet" description="Run the review during or after the integration to compare plan and outcome." />}
        </div>
      )}
    </div>
  );
}
