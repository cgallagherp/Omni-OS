import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus, UserPlus } from "lucide-react";
import { ShieldCheck } from "lucide-react";
import { getCompanyContext, roleLabel } from "@/lib/auth";
import { formOptions } from "@/lib/data/options";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate } from "@/lib/domain/format";
import { PageHeader } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, Owner } from "@/components/os/avatar";
import { PriorityBadge } from "@/components/os/status";
import { CrewDialog, OrgActionDialog } from "@/components/crew/forms";
import { ORG_ACTION_TYPES } from "@/lib/domain/crew";
import { OrgChart, type Load } from "@/components/crew/org-chart";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Crew" };

export default async function CrewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) return null;
  const [{ data: orgActions }, { data: memberships }, options] = await Promise.all([
    ctx.supabase.from("org_actions").select("*").eq("company_id", cid).order("status").order("priority").order("target_date"),
    ctx.supabase.from("company_memberships").select("user_id, role").eq("company_id", cid),
    formOptions(ctx.supabase, snap),
  ]);
  const priorityTitle = new Map(snap.priorities.map((p) => [p.id, p.title]));
  const goalTitle = new Map(snap.annualGoals.map((g) => [g.id, g.title]));
  const roleByUser = new Map((memberships ?? []).map((m) => [m.user_id, m.role]));
  const crewOptions = snap.crew.map((c) => ({ id: c.id, full_name: c.full_name, title: c.title, is_open_seat: c.is_open_seat }));

  const load = new Map<string, Load & { moves: number; goals: number; issues: number }>();
  const bump = (id: string, k: keyof (Load & { moves: number; goals: number; issues: number })) => {
    const l = load.get(id) ?? { moves: 0, goals: 0, priorities: 0, kpis: 0, openActions: 0, overdue: 0, offTrack: 0, issues: 0 };
    l[k] += 1;
    load.set(id, l);
  };
  snap.winningMoves.forEach((w) => bump(w.owner_id, "moves"));
  snap.annualGoals.forEach((g) => bump(g.owner_id, "goals"));
  snap.priorities.forEach((p) => {
    bump(p.owner_id, "priorities");
    if (p.status === "off_track" || p.status === "at_risk") bump(p.owner_id, "offTrack");
  });
  snap.metrics.forEach((m) => bump(m.metric.owner_id, "kpis"));
  snap.openActions.forEach((a) => bump(a.owner_id, "openActions"));
  snap.overdueActions.forEach((a) => bump(a.owner_id, "overdue"));
  snap.openIssues.forEach((i) => bump(i.owner_id, "issues"));
  const leaders = snap.crew.filter((c) => c.is_leadership);
  const openSeats = snap.crew.filter((c) => c.is_open_seat);

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Crew"
        title="Who will deliver it?"
        description="Organisation structure, the executive leadership team, functional accountabilities and ownership — plus the agreed organisational actions the plan depends on. Every important outcome has exactly one accountable owner."
        actions={
          ctx.can.write && (
            <CrewDialog companyId={cid} crew={crewOptions} trigger={<Button size="sm"><UserPlus /> Add seat</Button>} />
          )
        }
      />

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Accountability chart</CardTitle>
          <span className="text-xs text-muted-foreground">
            {snap.crew.length - openSeats.length} people · {openSeats.length} open seat{openSeats.length === 1 ? "" : "s"}
          </span>
        </CardHeader>
        <div className="p-5">
          <OrgChart crew={snap.crew} slug={slug} load={load} />
        </div>
      </Card>

      <Card className="mb-5 overflow-x-auto">
        <CardHeader>
          <CardTitle>Executive leadership team & ownership</CardTitle>
          <span className="text-xs text-muted-foreground">Current quarter</span>
        </CardHeader>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">Person</th>
              <th className="px-2 py-2 font-medium">Functional accountabilities</th>
              <th className="px-2 py-2 text-right font-medium">3-yr outcomes</th>
              <th className="px-2 py-2 text-right font-medium">12-month objectives</th>
              <th className="px-2 py-2 text-right font-medium">90-day priorities</th>
              <th className="px-2 py-2 text-right font-medium">KPIs</th>
              <th className="px-2 py-2 text-right font-medium">Open actions</th>
              <th className="px-2 py-2 text-right font-medium">Issues</th>
              <th className="px-4 py-2 font-medium">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {leaders.map((c) => {
              const l = load.get(c.id);
              const role = c.user_id ? roleByUser.get(c.user_id) : undefined;
              return (
                <tr key={c.id} className={cn("hover:bg-accent/30", c.is_open_seat && "text-muted-foreground")}>
                  <td className="px-4 py-2.5">
                    <Link href={`/c/${slug}/crew/${c.id}`} className="flex items-center gap-2.5 hover:underline">
                      <Avatar name={c.full_name} color={c.avatar_color} size="sm" open={c.is_open_seat} />
                      <span>
                        <span className="block font-medium">{c.full_name}</span>
                        <span className="block text-xs text-muted-foreground">{c.title}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-[260px] px-2 py-2.5 text-xs">
                    <span className="font-medium">{c.seat}</span>
                    {c.responsibilities?.length ? <span className="block truncate text-muted-foreground">{(c.responsibilities as string[]).join(" · ")}</span> : null}
                  </td>
                  <Cell v={l?.moves} />
                  <Cell v={l?.goals} />
                  <td className="px-2 py-2.5 text-right tabular">
                    {l?.priorities ?? 0}
                    {l?.offTrack ? <span className="ml-1 text-xs text-risk-ink">({l.offTrack} at risk/off)</span> : null}
                  </td>
                  <Cell v={l?.kpis} />
                  <td className="px-2 py-2.5 text-right tabular">
                    {l?.openActions ?? 0}
                    {l?.overdue ? <span className="ml-1 text-xs text-off-ink">({l.overdue} overdue)</span> : null}
                  </td>
                  <Cell v={l?.issues} />
                  <td className="px-4 py-2.5">
                    {c.is_open_seat ? <Badge variant="risk">Vacant</Badge> : role ? <Badge variant="outline">{roleLabel[role]}</Badge> : <span className="text-xs text-muted-foreground">No login</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Agreed organisational actions</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Omni OS records agreed organisational actions only — never assessments of individuals.
          </p>
        </div>
        {ctx.can.write && (
          <OrgActionDialog companyId={cid} crew={crewOptions} priorities={options.priorities} goals={options.goals} trigger={<Button size="sm" variant="outline"><Plus /> Add action</Button>} />
        )}
      </div>
      <div className="grid gap-5 [&>*]:min-w-0 md:grid-cols-2">
        {ORG_ACTION_TYPES.map((t) => {
          const list = (orgActions ?? []).filter((g) => g.type === t.value);
          return (
            <Card key={t.value} data-testid={`org-${t.value}`}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>{t.plural}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.hint}</p>
                </div>
                {ctx.can.write && (
                  <OrgActionDialog companyId={cid} crew={crewOptions} priorities={options.priorities} goals={options.goals} defaults={{ type: t.value }} trigger={<Button variant="ghost" size="xs"><Plus /> Add</Button>} />
                )}
              </CardHeader>
              <div className="divide-y">
                {list.map((g) => (
                  <div key={g.id} className={cn("px-4 py-3", g.status === "closed" && "opacity-60")}>
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-[13px] font-medium">{g.title}</p>
                      {ctx.can.write && (
                        <OrgActionDialog
                          companyId={cid}
                          id={g.id}
                          crew={crewOptions}
                          priorities={options.priorities}
                          goals={options.goals}
                          defaults={g}
                          trigger={<button className="text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="size-3.5" /></button>}
                        />
                      )}
                    </div>
                    {g.description && <p className="mt-0.5 text-xs text-muted-foreground">{g.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={g.priority} />
                      <Badge variant={g.status === "closed" ? "on" : g.status === "in_progress" ? "done" : "outline"}>{g.status === "in_progress" ? "In progress" : g.status === "closed" ? "Done" : "Open"}</Badge>
                      <Owner person={snap.crewById.get(g.owner_id)} />
                      <span className="ml-auto text-xs text-muted-foreground">{g.target_date ? `by ${formatDate(g.target_date)}` : "No deadline"}</span>
                    </div>
                    {(g.quarterly_priority_id || g.annual_goal_id) && (
                      <p className="mt-1.5 truncate text-[11.5px] text-muted-foreground">
                        Supports{" "}
                        {g.quarterly_priority_id ? (
                          <Link className="hover:underline" href={`/c/${slug}/flight-plan/quarterly_priority/${g.quarterly_priority_id}`}>
                            {priorityTitle.get(g.quarterly_priority_id) ?? "90-day priority"}
                          </Link>
                        ) : (
                          <Link className="hover:underline" href={`/c/${slug}/flight-plan/annual_goal/${g.annual_goal_id}`}>
                            {goalTitle.get(g.annual_goal_id!) ?? "12-month objective"}
                          </Link>
                        )}
                      </p>
                    )}
                  </div>
                ))}
                {!list.length && <p className="px-4 py-3 text-sm text-muted-foreground">None agreed.</p>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ v }: { v?: number }) {
  return <td className={cn("px-2 py-2.5 text-right tabular", !v && "text-muted-foreground/50")}>{v ?? 0}</td>;
}
