import type { Metadata } from "next";
import { Pencil, Plus, ShieldCheck } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formOptions } from "@/lib/data/options";
import { formatDate } from "@/lib/domain/format";
import { saveAction } from "@/lib/actions/flight-plan";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Owner } from "@/components/os/avatar";
import { ActionDialog } from "@/components/os/entity-forms";
import { ListeningDialog } from "@/components/listening/forms";
import type { ListeningRound } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Listening" };

const MONTHS_BETWEEN = 6; // at least twice a year

export default async function ListeningPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) return null;
  const options = await formOptions(ctx.supabase, snap);
  const [{ data: rounds }, { data: actions }] = await Promise.all([
    ctx.supabase.from("listening_rounds").select("*").eq("company_id", cid).order("held_on", { ascending: false }),
    ctx.supabase.from("actions").select("id, title, owner_id, due_date, status, listening_round_id").eq("company_id", cid).not("listening_round_id", "is", null),
  ]);
  const today = snap.now.toISOString().slice(0, 10);
  const nextDue = (list: ListeningRound[]) => {
    if (!list.length) return null;
    const d = new Date(`${list[0].held_on}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + MONTHS_BETWEEN);
    return d.toISOString().slice(0, 10);
  };

  return (
    <div className="fade-in space-y-5">
      <PageHeader
        eyebrow="Cycles · Listening"
        title="Employee and customer listening"
        description="At least twice a year, run as a management workflow: what we heard, what we will do, and progress. Findings are brought to the quarterly offsite."
        actions={ctx.can.write && <ListeningDialog companyId={cid} trigger={<Button size="sm"><Plus /> Record listening</Button>} />}
      />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" /> Aggregate results and themes only — Omni OS never stores raw or identifiable responses.
      </p>

      {(["employee", "customer"] as const).map((kind) => {
        const list = (rounds ?? []).filter((r) => r.kind === kind);
        const due = nextDue(list);
        return (
          <Card key={kind} data-testid={`listening-${kind}`}>
            <CardHeader>
              <CardTitle>{kind === "employee" ? "Employee listening" : "Customer listening"}</CardTitle>
              <span className={cn("text-xs", !due || due < today ? "font-medium text-off-ink" : "text-muted-foreground")}>
                {!due ? "No round recorded yet" : due < today ? `Overdue — next round was due ${formatDate(due)}` : `Next round due by ${formatDate(due)}`}
              </span>
            </CardHeader>
            {!list.length && <EmptyState className="m-4" title={`No ${kind} listening yet`} description="Record the first round to set a baseline." />}
            <div className="divide-y">
              {list.map((r, i) => {
                const prev = list[i + 1];
                const linked = (actions ?? []).filter((a) => a.listening_round_id === r.id);
                const metrics: Array<[string, number | null, number | null | undefined, string, boolean?]> =
                  kind === "employee"
                    ? [
                        ["Engagement", r.engagement, prev?.engagement, "%"],
                        ["eNPS", r.enps, prev?.enps, ""],
                        ["Leadership confidence", r.leadership_confidence, prev?.leadership_confidence, "%"],
                        ["Strategy confidence", r.strategy_confidence, prev?.strategy_confidence, "%"],
                        ["Clarity of accountability", r.clarity_accountability, prev?.clarity_accountability, "%"],
                      ]
                    : [
                        ["NPS", r.nps, prev?.nps, ""],
                        ["Satisfaction", r.satisfaction, prev?.satisfaction, "%"],
                        ["Retention", r.retention, prev?.retention, "%"],
                        ["Churn", r.churn, prev?.churn, "%", true],
                      ];
                return (
                  <div key={r.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[1.3fr_1fr]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{formatDate(r.held_on)}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.method} · {r.responses ?? "—"} responses
                        </span>
                        {ctx.can.write && (
                          <ListeningDialog
                            companyId={cid}
                            id={r.id}
                            defaults={{ ...r, themes: (r.themes as string[]) ?? [], ...numeric(r) }}
                            trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit round"><Pencil /></Button>}
                          />
                        )}
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {metrics.map(([label, v, p, unit, invert]) => {
                          const d = v !== null && p !== null && p !== undefined ? Number(v) - Number(p) : null;
                          return (
                            <div key={label}>
                              <dt className="text-[11px] text-muted-foreground">{label}</dt>
                              <dd className="text-lg font-semibold tabular">
                                {v === null ? "—" : `${Number(v)}${unit}`}
                                {d !== null && d !== 0 && <span className={cn("ml-1 text-xs", (invert ? -d : d) > 0 ? "text-on-ink" : "text-off-ink")}>{d > 0 ? "+" : "−"}{Math.abs(d)}</span>}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                      {r.summary && <p className="mt-2 text-[13px] text-muted-foreground">{r.summary}</p>}
                      {r.issues && <p className="mt-1 text-[13px]"><span className="text-muted-foreground">Issues raised:</span> {r.issues}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {((r.themes as string[]) ?? []).map((t) => (
                          <Badge key={t} variant="outline">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Actions and progress</p>
                        {ctx.can.write && (
                          <ActionDialog
                            title="Agree an action from listening"
                            trigger={<Button variant="ghost" size="xs"><Plus /> Action</Button>}
                            action={saveAction.bind(null, cid, null)}
                            crew={options.crew}
                            priorities={options.priorities}
                            defaults={{ listening_round_id: r.id }}
                          />
                        )}
                      </div>
                      <ul className="divide-y rounded-md border">
                        {linked.map((a) => (
                          <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                            <span className={cn("min-w-0 flex-1", a.status === "done" && "text-muted-foreground line-through")}>{a.title}</span>
                            <Owner person={snap.crewById.get(a.owner_id)} showName={false} />
                            <Badge variant={a.status === "done" ? "on" : a.due_date && a.due_date < today ? "off" : "outline"}>{a.status === "done" ? "Done" : formatDate(a.due_date, { year: false })}</Badge>
                          </li>
                        ))}
                        {!linked.length && <li className="px-3 py-2 text-sm text-muted-foreground">No actions agreed yet.</li>}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function numeric(r: ListeningRound) {
  const n = (v: number | null) => (v === null ? null : Number(v));
  return {
    engagement: n(r.engagement),
    enps: n(r.enps),
    leadership_confidence: n(r.leadership_confidence),
    strategy_confidence: n(r.strategy_confidence),
    clarity_accountability: n(r.clarity_accountability),
    nps: n(r.nps),
    satisfaction: n(r.satisfaction),
    retention: n(r.retention),
    churn: n(r.churn),
  };
}
