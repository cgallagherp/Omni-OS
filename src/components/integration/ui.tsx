// Shared Integrations views. Status uses the fixed status tokens (never brand colours);
// basis and origin labels keep company practice, inferred practice and AI suggestions apart.
import Link from "next/link";
import { FileText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BASIS_HELP, BASIS_LABEL, ORIGIN_LABEL, type Basis, type Citation, type Origin } from "@/lib/integration/schema";
import { HEALTH_LABEL, HEALTH_TONE, SYNERGY_STATUS_LABEL, SYNERGY_TONE, daysBetween, type Health, type IntegrationSummary, type SynergyStatus } from "@/lib/domain/integration";
import { cn } from "@/lib/utils";

export function BasisBadge({ basis, className }: { basis: Basis | string | null; className?: string }) {
  if (!basis) return null;
  const b = basis as Basis;
  return (
    <Badge variant={b === "established" ? "brand" : b === "inferred" ? "outline" : "default"} className={cn("gap-1", b === "recommended" && "border-dashed border-foreground/30 bg-transparent text-foreground/80", className)} title={BASIS_HELP[b]}>
      {b === "recommended" && <Sparkles className="size-3" />}
      {BASIS_LABEL[b]}
    </Badge>
  );
}

export function OriginBadge({ origin }: { origin: Origin | string }) {
  const o = origin as Origin;
  if (o === "playbook") return <Badge variant="outline">{ORIGIN_LABEL.playbook}</Badge>;
  return (
    <Badge variant={o === "acquisition" ? "brand" : "default"} className={cn(o === "recommended" && "border-dashed border-foreground/30 bg-transparent")}>
      {o === "recommended" && <Sparkles className="size-3" />}
      {ORIGIN_LABEL[o]}
    </Badge>
  );
}

export function HealthBadge({ health, className }: { health: Health; className?: string }) {
  return <Badge variant={HEALTH_TONE[health]} className={className}>{HEALTH_LABEL[health]}</Badge>;
}

export function SynergyBadge({ status }: { status: SynergyStatus }) {
  return <Badge variant={SYNERGY_TONE[status]}>{SYNERGY_STATUS_LABEL[status]}</Badge>;
}

/** Evidence: the exact passages a requirement rests on, linked to the source document. */
export function Citations({ citations, slug, className }: { citations: Citation[]; slug: string; className?: string }) {
  if (!citations.length) return <p className={cn("text-xs text-muted-foreground", className)}>No supporting passage in the selected documents.</p>;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {citations.map((c, i) => (
        <li key={`${c.chunk_id}-${i}`} className="rounded-md border-l-2 border-brand/50 bg-muted/40 px-2.5 py-1.5">
          <p className="text-[12.5px] italic text-foreground/85">“{c.quote}”</p>
          <Link href={`/c/${slug}/integrations/knowledge/${c.source_id}${c.chunk_id ? `#p-${c.chunk_id}` : ""}`} className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <FileText className="size-3" /> {c.source_title ?? "Source document"}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Progress that means something: milestones whose completion criteria are verified. */
export function MilestoneMeter({ sum, className }: { sum: IntegrationSummary; className?: string }) {
  const total = Math.max(1, sum.milestonesTotal);
  const verified = (sum.milestonesVerified / total) * 100;
  const dueNotDone = (Math.max(0, sum.milestonesDue - sum.milestonesVerified) / total) * 100;
  return (
    <div className={cn("min-w-32", className)}>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="bg-on" style={{ width: `${verified}%` }} />
        <div className="bg-off/70" style={{ width: `${dueNotDone}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground tabular">
        {sum.milestonesVerified}/{sum.milestonesTotal} milestones verified{sum.milestonesDue > sum.milestonesVerified ? ` · ${sum.milestonesDue - sum.milestonesVerified} due, not verified` : ""}
      </p>
    </div>
  );
}

export function money(v: number | null | undefined, unit = "currency") {
  if (v === null || v === undefined) return "—";
  if (unit === "percent") return `${v}%`;
  if (unit === "number") return v.toLocaleString("en-GB");
  return Math.abs(v) >= 1e6 ? `£${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 2)}m` : Math.abs(v) >= 1e3 ? `£${Math.round(v / 1e3)}k` : `£${Math.round(v)}`;
}

export interface TimelineActivity {
  id: string;
  title: string;
  workstream: string;
  start_date: string | null;
  due_date: string | null;
  baseline_due_date: string | null;
  status: string;
  critical: boolean;
  milestone: boolean;
  health: Health;
}

const TONE_FILL: Record<string, string> = { done: "var(--color-done)", on_track: "var(--color-on)", at_risk: "var(--color-risk)", off_track: "var(--color-off)", not_started: "var(--color-none)" };

/** Milestones and dependencies across workstreams, with slippage against the approved baseline. */
export function Timeline({ activities, deps, today, completion }: { activities: TimelineActivity[]; deps: Array<{ from_activity_id: string; to_activity_id: string }>; today: string; completion: string | null }) {
  const dated = activities.filter((a) => a.due_date);
  if (!dated.length) return <p className="text-sm text-muted-foreground">No dated activities.</p>;
  const starts = dated.map((a) => a.start_date ?? a.due_date!);
  const ends = dated.flatMap((a) => [a.due_date!, a.baseline_due_date ?? a.due_date!]);
  const min = [...starts, today].sort()[0];
  const max = [...ends, today].sort().at(-1)!;
  const span = Math.max(14, daysBetween(min, max) + 7);
  const W = 1000;
  const LABEL = 250;
  const ROW = 22;
  const x = (d: string) => LABEL + (daysBetween(min, d) / span) * (W - LABEL - 10);
  const groups = [...new Set(dated.map((a) => a.workstream))];
  const rows: Array<{ kind: "ws"; name: string } | { kind: "act"; a: TimelineActivity }> = [];
  for (const g of groups) {
    rows.push({ kind: "ws", name: g });
    for (const a of dated.filter((d) => d.workstream === g).sort((p, q) => (p.start_date ?? p.due_date!).localeCompare(q.start_date ?? q.due_date!))) rows.push({ kind: "act", a });
  }
  const yOf = new Map<string, number>();
  rows.forEach((r, i) => r.kind === "act" && yOf.set(r.a.id, 30 + i * ROW));
  const H = 40 + rows.length * ROW;
  const months: string[] = [];
  for (let d = new Date(`${min.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 10) <= max; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 10));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[760px] text-[10px]" role="img" aria-label="Integration timeline">
        {months.filter((m) => m >= min).map((m) => (
          <g key={m}>
            <line x1={x(m)} x2={x(m)} y1={16} y2={H} stroke="var(--color-border)" />
            <text x={x(m) + 3} y={12} fill="var(--color-muted-foreground)">{new Date(`${m}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })}</text>
          </g>
        ))}
        {completion && completion >= min && (
          <g>
            <line x1={x(completion)} x2={x(completion)} y1={16} y2={H} stroke="var(--color-foreground)" strokeDasharray="2 3" />
            <text x={x(completion) + 3} y={24} fill="var(--color-foreground)">Completion</text>
          </g>
        )}
        <line x1={x(today)} x2={x(today)} y1={16} y2={H} stroke="var(--color-brand)" strokeWidth={1.5} />
        <text x={x(today) + 3} y={H - 4} fill="var(--color-brand)">Today</text>
        {deps.map((d) => {
          const from = dated.find((a) => a.id === d.from_activity_id);
          const to = dated.find((a) => a.id === d.to_activity_id);
          if (!from || !to || !yOf.has(from.id) || !yOf.has(to.id)) return null;
          const x1 = x(from.due_date!);
          const y1 = yOf.get(from.id)! + 7;
          const x2 = x(to.start_date ?? to.due_date!);
          const y2 = yOf.get(to.id)! + 7;
          const late = from.due_date! > (to.start_date ?? to.due_date!);
          return <path key={`${d.from_activity_id}-${d.to_activity_id}`} d={`M${x1},${y1} C${x1 + 18},${y1} ${x2 - 18},${y2} ${x2},${y2}`} fill="none" stroke={late ? "var(--color-off)" : "var(--color-muted-foreground)"} strokeWidth={late ? 1.5 : 0.8} markerEnd="url(#arrow)" />;
        })}
        <defs>
          <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--color-muted-foreground)" /></marker>
        </defs>
        {rows.map((r, i) => {
          const y = 30 + i * ROW;
          if (r.kind === "ws") return <text key={`ws-${r.name}`} x={4} y={y + 11} className="font-semibold" fill="var(--color-foreground)">{r.name}</text>;
          const a = r.a;
          const s = a.start_date ?? a.due_date!;
          const fill = TONE_FILL[a.health];
          return (
            <g key={a.id}>
              <title>{`${a.title} — ${s} → ${a.due_date}${a.baseline_due_date && a.baseline_due_date !== a.due_date ? ` (approved: ${a.baseline_due_date})` : ""}`}</title>
              <text x={14} y={y + 11} fill="var(--color-muted-foreground)">{a.title.length > 38 ? `${a.title.slice(0, 37)}…` : a.title}</text>
              {a.baseline_due_date && a.baseline_due_date !== a.due_date && <rect x={x(s)} y={y + 9} width={Math.max(3, x(a.baseline_due_date) - x(s))} height={4} rx={2} fill="none" stroke="var(--color-muted-foreground)" strokeDasharray="2 2" />}
              {a.milestone && s === a.due_date ? (
                <path d={`M${x(a.due_date!)},${y + 2} l6,6 l-6,6 l-6,-6 z`} fill={fill} stroke={a.critical ? "var(--color-foreground)" : "none"} />
              ) : (
                <rect x={x(s)} y={y + 3} width={Math.max(4, x(a.due_date!) - x(s))} height={10} rx={3} fill={fill} opacity={a.status === "done" ? 0.55 : 0.9} stroke={a.critical ? "var(--color-foreground)" : "none"} strokeWidth={1.2} />
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-muted-foreground">Outlined bars are on the critical path. Dashed outlines show the approved baseline where dates have moved. Red links mark a prerequisite due after its dependent starts.</p>
    </div>
  );
}
