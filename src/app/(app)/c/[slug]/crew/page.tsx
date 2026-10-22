import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus, UserPlus } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formatDate } from "@/lib/domain/format";
import { PageHeader } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, Owner } from "@/components/os/avatar";
import { PriorityBadge } from "@/components/os/status";
import { CrewDialog, GapDialog } from "@/components/crew/forms";
import { OrgChart, type Load } from "@/components/crew/org-chart";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Crew" };

const GAP_LABEL = { hire: "Key hires", capability: "Capability gaps", development: "Leadership development" } as const;

export default async function CrewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) return null;
  const [{ data: gaps }, { data: memberships }] = await Promise.all([
    ctx.supabase.from("org_gaps").select("*").eq("company_id", cid).order("status").order("priority"),
    ctx.supabase.from("company_memberships").select("user_id, role").eq("company_id", cid),
  ]);
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
        description="The leadership team, the accountability chart and the ownership of every objective, KPI and commitment. Every important outcome has exactly one accountable owner."
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
          <CardTitle>Leadership team & ownership</CardTitle>
          <span className="text-xs text-muted-foreground">Current quarter</span>
        </CardHeader>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">Person</th>
              <th className="px-2 py-2 font-medium">Seat</th>
              <th className="px-2 py-2 text-right font-medium">Winning Moves</th>
              <th className="px-2 py-2 text-right font-medium">Annual goals</th>
              <th className="px-2 py-2 text-right font-medium">Priorities</th>
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
                  <td className="px-2 py-2.5 text-xs">{c.seat}</td>
                  <Cell v={l?.moves} />
                  <Cell v={l?.goals} />
                  <td className="px-2 py-2.5 text-right tabular">
                    {l?.priorities ?? 0}
                    {l?.offTrack ? <span className="ml-1 text-xs text-risk">({l.offTrack} at risk/off)</span> : null}
                  </td>
                  <Cell v={l?.kpis} />
                  <td className="px-2 py-2.5 text-right tabular">
                    {l?.openActions ?? 0}
                    {l?.overdue ? <span className="ml-1 text-xs text-off">({l.overdue} overdue)</span> : null}
                  </td>
                  <Cell v={l?.issues} />
                  <td className="px-4 py-2.5">
                    {c.is_open_seat ? <Badge variant="risk">Vacant</Badge> : role ? <Badge variant="outline">{role.replace("_", " ")}</Badge> : <span className="text-xs text-muted-foreground">No login</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {(["hire", "capability", "development"] as const).map((type) => {
          const list = (gaps ?? []).filter((g) => g.type === type);
          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle>{GAP_LABEL[type]}</CardTitle>
                {ctx.can.write && <GapDialog companyId={cid} crew={crewOptions} defaults={{ type }} trigger={<Button variant="ghost" size="xs"><Plus /> Add</Button>} />}
              </CardHeader>
              <div className="divide-y">
                {list.map((g) => (
                  <div key={g.id} className={cn("px-4 py-3", g.status === "closed" && "opacity-60")}>
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-[13px] font-medium">{g.title}</p>
                      {ctx.can.write && <GapDialog companyId={cid} id={g.id} crew={crewOptions} defaults={g} trigger={<button className="text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="size-3.5" /></button>} />}
                    </div>
                    {g.description && <p className="mt-0.5 text-xs text-muted-foreground">{g.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={g.priority} />
                      <Badge variant={g.status === "closed" ? "on" : g.status === "in_progress" ? "done" : "outline"}>{g.status.replace("_", " ")}</Badge>
                      <Owner person={snap.crewById.get(g.owner_id)} />
                      {g.crew_member_id && <span className="text-xs text-muted-foreground">for {snap.crewById.get(g.crew_member_id)?.full_name.split(" ")[0]}</span>}
                      <span className="ml-auto text-xs text-muted-foreground">{formatDate(g.target_date, { year: false })}</span>
                    </div>
                  </div>
                ))}
                {!list.length && <p className="px-4 py-3 text-sm text-muted-foreground">None recorded.</p>}
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
