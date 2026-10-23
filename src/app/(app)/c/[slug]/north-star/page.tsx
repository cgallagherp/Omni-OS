import type { Metadata } from "next";
import Link from "next/link";
import { Diamond, History, Pencil, Plus } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { formOptions } from "@/lib/data/options";
import { formatDate, formatDateTime, formatMoney } from "@/lib/domain/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Owner } from "@/components/os/avatar";
import { StatusBadge, StatusDot } from "@/components/os/status";
import { ConditionDialog, MilestoneDialog, NorthStarDialog, type NorthStarValues } from "@/components/north-star/forms";
import { TrajectoryChart, type TrajectoryPoint } from "@/components/north-star/trajectory-chart";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "North Star" };

const EMPTY_NS = {
  vision: "",
  mission: "",
  target_end_state: "",
  strategic_positioning: "",
  market_opportunity: "",
  financial_ambition: "",
  exit_equity_story: "",
  buyer_proposition: "",
  strategic_value: "",
};

export default async function NorthStarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const snap = await loadCompanySnapshot(ctx.supabase, cid);
  if (!snap) return null;
  const options = await formOptions(ctx.supabase, snap);
  const ns = snap.northStar;
  const cur = snap.company.currency;
  const [{ data: conditions }, { data: milestones }, { data: versions }] = await Promise.all([
    ctx.supabase.from("success_conditions").select("*").eq("company_id", cid).order("sort_order"),
    ctx.supabase.from("milestones").select("*").eq("company_id", cid).order("target_date"),
    ctx.supabase.from("north_star_versions").select("*").eq("company_id", cid).order("version", { ascending: false }),
  ]);
  const versionAuthors = new Map<string, string>();
  const authorIds = [...new Set((versions ?? []).map((v) => v.changed_by).filter(Boolean))] as string[];
  if (authorIds.length) {
    const { data } = await ctx.supabase.from("profiles").select("id, full_name").in("id", authorIds);
    for (const p of data ?? []) versionAuthors.set(p.id, p.full_name);
  }

  // Financial trajectory: plan line from baseline (acquisition) to target; actuals by fiscal year
  const keyed = (k: string) => snap.metrics.find((v) => v.metric.comparable_key === k)?.metric.id;
  const ids = [keyed("revenue"), keyed("ebitda")].filter(Boolean) as string[];
  const { data: finValues } = ids.length ? await ctx.supabase.from("metric_values").select("metric_id, period_start, value").in("metric_id", ids).not("value", "is", null) : { data: [] };
  const acqYear = snap.company.acquired_on ? Number(snap.company.acquired_on.slice(0, 4)) : snap.fiscalYear - 1;
  const targetYear = ns?.target_year ?? snap.fiscalYear + 2;
  const sums = new Map<string, { sum: number; n: number }>();
  for (const v of finValues ?? []) {
    const key = `${v.metric_id}|${v.period_start.slice(0, 4)}`;
    const s = sums.get(key) ?? { sum: 0, n: 0 };
    s.sum += Number(v.value);
    s.n += 1;
    sums.set(key, s);
  }
  const annual = (metricId: string | undefined, y: number) => {
    if (!metricId) return null;
    const s = sums.get(`${metricId}|${y}`);
    if (!s) return null;
    return s.n >= 12 ? s.sum : (s.sum / s.n) * 12; // annualise partial years
  };
  const interp = (a: number | null | undefined, b: number | null | undefined, y: number) =>
    a == null || b == null ? null : a + ((b - a) * (y - acqYear)) / Math.max(1, targetYear - acqYear);
  const trajectory: TrajectoryPoint[] = [];
  for (let y = acqYear; y <= targetYear; y++) {
    trajectory.push({
      year: y === snap.fiscalYear ? `FY${y} (run-rate)` : `FY${y}`,
      revenuePlan: interp(ns?.baseline_revenue, ns?.target_revenue, y),
      ebitdaPlan: interp(ns?.baseline_ebitda, ns?.target_ebitda, y),
      revenueActual: y <= snap.fiscalYear ? annual(keyed("revenue"), y) : null,
      ebitdaActual: y <= snap.fiscalYear ? annual(keyed("ebitda"), y) : null,
    });
  }

  // Roadmap timeline span
  const ms = milestones ?? [];
  const spanStart = Date.UTC(acqYear, 0, 1);
  const spanEnd = Date.UTC(Math.max(targetYear, ...ms.map((m) => Number(m.target_date.slice(0, 4)))) + 1, 0, 1);
  const pos = (d: string) => ((new Date(`${d}T00:00:00Z`).getTime() - spanStart) / (spanEnd - spanStart)) * 100;
  const years = Array.from({ length: new Date(spanEnd).getUTCFullYear() - acqYear }, (_, i) => acqYear + i);
  const todayPos = pos(new Date().toISOString().slice(0, 10));
  // Greedy lane assignment so nearby milestone labels never overlap (lanes: up, down, up-high, down-low)
  const laneEnd = [-100, -100, -100, -100];
  const placed = ms.map((m) => {
    const x = pos(m.target_date);
    let lane = laneEnd.findIndex((end) => x - end >= 12.5);
    if (lane === -1) lane = laneEnd.indexOf(Math.min(...laneEnd));
    laneEnd[lane] = x;
    return { m, lane, x };
  });

  const values = (ns?.values as NorthStarValues["values"]) ?? [];
  const buyers = (ns?.potential_buyers as string[]) ?? [];
  const conditionCount = conditions?.length ?? 0;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="North Star"
        title="Where are we going?"
        description="Vision, Mission and Values; the destination for the investment period; the equity story for the eventual buyer; and the conditions that must be true."
        actions={
          ctx.can.admin && (
            <NorthStarDialog
              companyId={cid}
              values={{
                ...EMPTY_NS,
                ...(ns ?? {}),
                values: ((ns?.values as NorthStarValues["values"]) ?? []),
                potential_buyers: ((ns?.potential_buyers as string[]) ?? []),
                target_year: ns?.target_year ?? null,
                target_revenue: num(ns?.target_revenue),
                target_ebitda: num(ns?.target_ebitda),
                target_ev: num(ns?.target_ev),
                baseline_revenue: num(ns?.baseline_revenue),
                baseline_ebitda: num(ns?.baseline_ebitda),
                assumptions: (ns?.assumptions as string[]) ?? [],
              }}
              trigger={
                <Button size="sm">
                  <Pencil /> {ns ? "Edit North Star" : "Define North Star"}
                </Button>
              }
            />
          )
        }
      />
      {!ns ? (
        <EmptyState title="No North Star defined yet" description="The CEO or a company administrator can define the Vision, Mission, Values and destination." />
      ) : (
        <div className="space-y-5">
          <Card className="overflow-hidden" data-testid="vmv">
            <div className="grid [&>*]:min-w-0 lg:grid-cols-3 lg:divide-x">
              <div className="p-6">
                <Block label="Vision" text={ns.vision} large />
              </div>
              <div className="p-6">
                <Block label="Mission" text={ns.mission} large />
              </div>
              <div className="p-6">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Values</p>
                {values.length ? (
                  <ul className="mt-2 space-y-2">
                    {values.map((v) => (
                      <li key={v.name} className="text-sm">
                        <span className="font-medium">{v.name}</span>
                        {v.description && <span className="text-muted-foreground"> — {v.description}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-muted-foreground italic">Not yet defined</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="grid [&>*]:min-w-0 lg:grid-cols-[1.3fr_1fr]">
              <div className="space-y-4 p-6 lg:border-r">
                <Block label={`Target end-state${ns.target_year ? ` · FY${ns.target_year}` : ""}`} text={ns.target_end_state} large />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Block label="Strategic positioning" text={ns.strategic_positioning} />
                  <Block label="Market opportunity" text={ns.market_opportunity} />
                </div>
                <Block label="Financial ambition" text={ns.financial_ambition} />
              </div>
              <div className="bg-muted/30 p-6">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Revenue and EBITDA targets</p>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <Fin label="Revenue" from={ns.baseline_revenue} to={ns.target_revenue} cur={cur} />
                  <Fin label="EBITDA" from={ns.baseline_ebitda} to={ns.target_ebitda} cur={cur} />
                  <Fin label="Enterprise value" from={null} to={ns.target_ev} cur={cur} />
                </div>
                {ns.target_revenue && ns.target_ebitda && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Target EBITDA margin {((Number(ns.target_ebitda) / Number(ns.target_revenue)) * 100).toFixed(0)}% · implied EV/EBITDA {ns.target_ev ? (Number(ns.target_ev) / Number(ns.target_ebitda)).toFixed(1) : "—"}x
                  </p>
                )}
                <div className="mt-5">
                  <TrajectoryChart data={trajectory} />
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Exit equity story</CardTitle>
                <Badge variant="brand">Begin with the buyer</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <Block label="Equity story" text={ns.exit_equity_story} />
                <Block label="What makes the company strategically valuable" text={ns.strategic_value} />
                <Block label="Buyer proposition" text={ns.buyer_proposition} />
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Potential buyers</p>
                  {buyers.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {buyers.map((b) => (
                        <Badge key={b} variant="outline">
                          {b}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted-foreground italic">Not yet defined</p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  Conditions for success{" "}
                  {conditionCount > 0 && (conditionCount < 3 || conditionCount > 5) && (
                    <span className="ml-1 text-xs font-normal text-risk-ink">Omni guidance is three to five ({conditionCount} defined)</span>
                  )}
                </CardTitle>
                {ctx.can.write && <ConditionDialog companyId={cid} crew={options.crew} trigger={<Button variant="ghost" size="xs"><Plus /> Add</Button>} />}
              </CardHeader>
              <div className="divide-y">
                {(conditions ?? []).map((c, i) => (
                  <div key={c.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 text-xs font-semibold text-muted-foreground tabular">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{c.title}</p>
                      {c.description && <p className="mt-0.5 text-[13px] text-muted-foreground">{c.description}</p>}
                      <div className="mt-1.5 flex items-center gap-2">
                        <StatusBadge status={c.status} />
                        {c.owner_id && <Owner person={snap.crewById.get(c.owner_id)} />}
                      </div>
                    </div>
                    {ctx.can.write && <ConditionDialog companyId={cid} id={c.id} crew={options.crew} defaults={c} trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit condition"><Pencil /></Button>} />}
                  </div>
                ))}
              </div>
              <div className="border-t px-4 py-3">
                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Strategic assumptions</p>
                <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted-foreground">
                  {((ns.assumptions as string[]) ?? []).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Value creation roadmap</CardTitle>
              {ctx.can.write && <MilestoneDialog companyId={cid} moves={options.moves} trigger={<Button variant="ghost" size="xs"><Plus /> Milestone</Button>} />}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="relative min-w-[760px]" style={{ height: 230, marginTop: 40 }}>
                <div className="absolute inset-x-0 h-px bg-border" style={{ top: 100 }}>
                  {years.map((y) => (
                    <span key={y} className="absolute -top-1 h-2 w-px bg-border" style={{ left: `${pos(`${y}-01-01`)}%` }}>
                      <span className="absolute top-3 -translate-x-1/2 text-[11px] font-medium text-muted-foreground">{y}</span>
                    </span>
                  ))}
                  <span className="absolute -top-2 h-4 w-0.5 rounded bg-brand" style={{ left: `${todayPos}%` }} title="Today" />
                  <span className="absolute -top-6 -translate-x-1/2 text-[10px] font-medium text-brand-ink" style={{ left: `${todayPos}%` }}>
                    Today
                  </span>
                </div>
                {placed.map(({ m, lane, x }) => {
                  const up = lane % 2 === 0;
                  const level = Math.floor(lane / 2);
                  const label = Math.min(93, Math.max(7, x));
                  const stem = up ? 30 + level * 46 : 16 + level * 46;
                  return (
                    <div key={m.id}>
                      <span className="absolute w-px bg-border" style={{ left: `${x}%`, top: up ? 100 - stem : 100, height: stem }} />
                      <Diamond
                        className={cn("absolute size-3.5 -translate-x-1/2 -translate-y-1/2", m.status === "done" ? "fill-done text-done-ink" : m.status === "at_risk" || m.status === "off_track" ? "fill-risk text-risk-ink" : m.status === "on_track" ? "fill-on text-on-ink" : "fill-card text-muted-foreground")}
                        style={{ left: `${x}%`, top: 100 }}
                      />
                      <div className="absolute w-36 -translate-x-1/2 text-center" style={{ left: `${label}%`, top: up ? 100 - stem - 34 : 100 + stem }}>
                        <MilestoneDialog
                          companyId={cid}
                          id={m.id}
                          moves={options.moves}
                          defaults={m}
                          trigger={
                            <button className="rounded-md px-1 py-0.5 text-[11.5px] leading-tight font-medium hover:bg-accent disabled:pointer-events-none" disabled={!ctx.can.write}>
                              {m.title}
                              <span className="block text-[10.5px] font-normal text-muted-foreground">{formatDate(m.target_date)}</span>
                            </button>
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1fr_380px]">
            <Card>
              <CardHeader>
                <CardTitle>Supporting Three-Year Outcomes</CardTitle>
                <Link href={`/c/${slug}/flight-plan`} className="text-xs text-muted-foreground hover:text-foreground">
                  Flight Plan →
                </Link>
              </CardHeader>
              <div className="divide-y">
                {snap.winningMoves.map((w, i) => (
                  <Link key={w.id} href={`/c/${slug}/flight-plan/winning_move/${w.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50">
                    <span className="text-xs text-muted-foreground tabular">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{w.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{w.measurable_outcome}</p>
                    </div>
                    <Owner person={snap.crewById.get(w.owner_id)} />
                    <Progress value={w.progress} className="h-1 w-16" />
                    <StatusDot status={w.status} />
                  </Link>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <History className="size-3.5 text-muted-foreground" /> Version history
                </CardTitle>
                <span className="text-xs text-muted-foreground">v{ns.version}</span>
              </CardHeader>
              <div className="max-h-96 divide-y overflow-y-auto">
                {(versions ?? []).map((v) => {
                  const s = v.snapshot as Record<string, unknown>;
                  return (
                    <details key={v.id} className="group px-4 py-2.5">
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-center gap-2">
                          <Badge variant={v.version === ns.version ? "brand" : "outline"}>v{v.version}</Badge>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{v.change_summary ?? "Update"}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(v.created_at)} · {v.changed_by ? (versionAuthors.get(v.changed_by) ?? "User") : "System"}
                        </p>
                      </summary>
                      <dl className="mt-2 space-y-1 rounded-md bg-muted/40 p-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Vision</dt>
                          <dd>{String(s.vision ?? "")}</dd>
                        </div>
                        <div className="flex gap-4">
                          <span>Revenue {formatMoney(num(s.target_revenue as number), cur)}</span>
                          <span>EBITDA {formatMoney(num(s.target_ebitda as number), cur)}</span>
                          <span>EV {formatMoney(num(s.target_ev as number), cur)}</span>
                          <span>FY{String(s.target_year ?? "")}</span>
                        </div>
                      </dl>
                    </details>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function num(v: number | string | null | undefined) {
  return v === null || v === undefined ? null : Number(v);
}

function Block({ label, text, large }: { label: string; text: string; large?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-1 leading-relaxed text-pretty", large ? "text-[17px] font-medium" : "text-sm")}>{text || <span className="text-muted-foreground">Not defined</span>}</p>
    </div>
  );
}

function Fin({ label, from, to, cur }: { label: string; from: number | string | null; to: number | string | null; cur: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tracking-tight tabular">{formatMoney(num(to), cur)}</p>
      {from !== null && <p className="text-[11px] text-muted-foreground">from {formatMoney(num(from), cur)} at entry</p>}
    </div>
  );
}
