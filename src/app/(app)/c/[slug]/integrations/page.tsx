import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, FileStack, Plus, Sparkles } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadIntegrationHome } from "@/lib/data/integration";
import { ACQUISITION_STATUS_LABEL } from "@/lib/domain/integration";
import { formatDate } from "@/lib/domain/format";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Owner } from "@/components/os/avatar";
import { AcquisitionForm, StatusPill } from "@/components/integration/controls";
import { HealthBadge, MilestoneMeter, SynergyBadge, money } from "@/components/integration/ui";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const home = await loadIntegrationHome(ctx.supabase, cid);
  const [{ data: crew }, { data: goals }, { data: priorities }, { count: approvals }] = await Promise.all([
    ctx.supabase.from("crew_members").select("id, full_name, title, is_open_seat").eq("company_id", cid).order("sort_order"),
    ctx.supabase.from("annual_goals").select("id, title").eq("company_id", cid),
    ctx.supabase.from("quarterly_priorities").select("id, title").eq("company_id", cid),
    ctx.supabase.from("agent_approvals").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("agent_key", "integration").eq("status", "pending"),
  ]);
  const base = `/c/${slug}/integrations`;
  const live = home.rows.filter((r) => ["planning", "plan_in_review", "ready", "active", "on_hold"].includes(r.a.status));
  const done = home.rows.filter((r) => r.a.status === "completed");
  const approved = home.playbooks.filter((p) => p.approved);
  const realised = live.reduce((n, r) => n + r.totals.realised, 0);
  const target = live.reduce((n, r) => n + r.totals.target, 0);
  const plansAwaiting = live.filter((r) => r.a.status === "plan_in_review").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Integrations"
        title="M&A integration"
        description="Your company's own integration playbooks, tailored plans for each acquisition, and an agent that drives them: milestones verified against their completion criteria, synergies measured on verified results."
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link href={`${base}/knowledge`}><FileStack /> Integration knowledge ({home.knowledgeCount})</Link></Button>
            {ctx.can.write && <AcquisitionForm companyId={cid} slug={slug} crew={crew ?? []} goals={goals ?? []} priorities={priorities ?? []} trigger={<Button size="sm"><Plus /> New acquisition</Button>} />}
          </>
        }
      />

      {!approved.length && (
        <Card className="border-brand/30 bg-brand-subtle/40">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[14px] font-semibold"><Sparkles className="size-4 text-brand-ink" /> Start with your master playbook</p>
              <p className="mt-0.5 max-w-2xl text-[13px] text-muted-foreground">Select your existing integration documents — previous plans, checklists, reviews and lessons — and the M&A Integration Agent drafts a structured playbook of how your company integrates acquisitions, with evidence for every requirement. Management reviews and approves it.</p>
            </div>
            <Button asChild variant="brand"><Link href={`${base}/knowledge`}>Generate Playbook with AI <ArrowRight /></Link></Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Integrations under way", value: live.filter((r) => r.a.status === "active").length, hint: `${live.length - live.filter((r) => r.a.status === "active").length} in planning` },
          { label: "Milestones verified", value: `${live.reduce((n, r) => n + r.sum.milestonesVerified, 0)}/${live.reduce((n, r) => n + r.sum.milestonesTotal, 0)}`, hint: `${live.reduce((n, r) => n + r.sum.overdue.length, 0)} activities overdue` },
          { label: "Synergies realised (verified)", value: target ? `${money(realised)} of ${money(target)}` : "—", hint: "Forecasts are not counted" },
          { label: "Needs a decision", value: (approvals ?? 0) + home.proposals.length + plansAwaiting, hint: `${approvals ?? 0} agent proposals · ${plansAwaiting} plans · ${home.proposals.length} playbook changes` },
        ].map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-xl font-semibold tabular">{t.value}</p>
            <p className="text-xs text-muted-foreground">{t.hint}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Acquisitions</CardTitle></CardHeader>
        {live.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" data-testid="integrations-table">
              <thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  {["Acquired company", "Completion", "Model", "Status", "Progress", "Critical path", "At risk", "Overdue", "Decisions", "Synergies", "Next milestone", "Leader"].map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {live.map((r) => {
                  const synStatus = [...r.assessed.values()];
                  const worst = synStatus.find((s) => s.status === "off_track") ?? synStatus.find((s) => s.status === "at_risk") ?? synStatus[0];
                  return (
                    <tr key={r.a.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5"><Link href={`${base}/${r.a.id}`} className="font-medium hover:underline">{r.a.name}</Link>{r.a.agent_paused && <Badge variant="none" className="ml-2">Agent paused</Badge>}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular">{formatDate(r.a.completion_date)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.a.integration_model || "—"}</td>
                      <td className="px-3 py-2.5">{r.a.status === "active" ? <HealthBadge health={r.sum.health} /> : <Badge variant="outline">{ACQUISITION_STATUS_LABEL[r.a.status]}</Badge>}</td>
                      <td className="px-3 py-2.5">{r.activities ? <MilestoneMeter sum={r.sum} /> : <span className="text-muted-foreground">No plan yet</span>}</td>
                      <td className="px-3 py-2.5 tabular">{r.sum.criticalOpen.length ? `${r.sum.criticalOpen.length} open${r.sum.criticalSlipDays ? ` · ${r.sum.criticalSlipDays}d slip` : ""}` : "—"}</td>
                      <td className="px-3 py-2.5 tabular">{r.atRiskWs ? <span className="text-risk-ink">{r.atRiskWs} workstreams</span> : "—"}</td>
                      <td className="px-3 py-2.5 tabular">{r.sum.overdue.length ? <span className="text-off-ink">{r.sum.overdue.length}</span> : "—"}</td>
                      <td className="px-3 py-2.5 tabular">{r.sum.pendingApprovals.length || "—"}</td>
                      <td className="px-3 py-2.5">{worst ? <span className="flex items-center gap-1.5"><SynergyBadge status={worst.status} /><span className="text-xs text-muted-foreground tabular">{money(r.totals.realised)}/{money(r.totals.target)}</span></span> : "—"}</td>
                      <td className="px-3 py-2.5 text-xs">{r.sum.nextMilestone ? <><span>{r.sum.nextMilestone.title}</span><span className="block text-muted-foreground tabular">{formatDate(r.sum.nextMilestone.due_date)}</span></> : "—"}</td>
                      <td className="px-3 py-2.5"><Owner person={r.a.leader_crew_id ? (home.crew.get(r.a.leader_crew_id) as never) : undefined} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <CardContent><EmptyState title="No acquisitions yet" description="Create an acquisition, or hand one over from the M&A Agent's pipeline, then generate its integration plan from an approved playbook." /></CardContent>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><BookOpen className="size-4" /> Playbooks</CardTitle>
            <Link href={`${base}/playbooks`} className="text-xs text-muted-foreground hover:text-foreground">All playbooks →</Link>
          </CardHeader>
          <ul className="divide-y text-[13px]">
            {home.playbooks.map((p) => (
              <li key={p.latest.lineage_id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <Link href={`${base}/playbooks/${(p.approved ?? p.latest).id}`} className="min-w-0 hover:underline">
                  <span className="font-medium">{p.latest.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.approved ? `v${p.approved.version} approved ${formatDate(p.approved.approved_at)}` : "Not yet approved"}{p.approved && p.latest.id !== p.approved.id ? ` · v${p.latest.version} ${p.latest.status}` : ""}</span>
                </Link>
                <StatusPill status={p.latest.status} />
              </li>
            ))}
            {!home.playbooks.length && <li className="px-4 py-3 text-muted-foreground">No playbooks yet.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader><CardTitle>Completed integrations</CardTitle></CardHeader>
          <ul className="divide-y text-[13px]">
            {done.map((r) => (
              <li key={r.a.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <Link href={`${base}/${r.a.id}`} className="font-medium hover:underline">{r.a.name}</Link>
                <span className="text-xs text-muted-foreground tabular">{r.sum.milestonesOnTime}/{r.sum.milestonesTotal} milestones on time · {money(r.totals.realised)} of {money(r.totals.target)} realised</span>
              </li>
            ))}
            {!done.length && <li className="px-4 py-3 text-muted-foreground">None yet. After each integration, a post-integration review proposes playbook improvements.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
