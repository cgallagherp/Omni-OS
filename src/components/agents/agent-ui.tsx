import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CircleDot,
  Compass,
  FileSearch,
  GitBranch,
  HelpCircle,
  ListChecks,
  Mail,
  MessageSquareReply,
  Search,
  Settings2,
  ShieldCheck,
  Siren,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/domain/format";
import { INVESTIGATION_STATUS_LABEL, type AgentKey, type Finding, type SourceRef } from "@/lib/agents/registry";
import { cn } from "@/lib/utils";

export const AGENT_ICON = { execution: ListChecks, ceo: Compass, commercial: TrendingUp, ma: Building2 } as const satisfies Record<AgentKey, unknown>;

export function AgentIcon({ agent, className }: { agent: AgentKey; className?: string }) {
  const I = AGENT_ICON[agent];
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand-ink", className)}>
      <I className="size-4" />
    </span>
  );
}

const STATUS_VARIANT: Record<string, "on" | "risk" | "off" | "done" | "outline" | "brand" | "none"> = {
  open: "outline",
  investigating: "brand",
  awaiting_approval: "risk",
  awaiting_response: "done",
  monitoring: "done",
  escalated: "off",
  resolved: "on",
  closed: "none",
  failed: "off",
};

export function InvestigationStatus({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{INVESTIGATION_STATUS_LABEL[status as keyof typeof INVESTIGATION_STATUS_LABEL] ?? status}</Badge>;
}

export function ApprovalStatus({ status }: { status: string }) {
  const v = { pending: "risk", approved: "done", executed: "on", rejected: "off", changes_requested: "risk", stale: "none", failed: "off", withdrawn: "none" }[status] as "risk";
  return <Badge variant={v ?? "outline"}>{status.replace("_", " ")}</Badge>;
}

export function ModeBadge({ mode }: { mode: string }) {
  if (mode === "auto") return <Badge variant="brand">Automatic</Badge>;
  if (mode === "approval") return <Badge variant="outline">Needs approval</Badge>;
  return <Badge variant="none">Off</Badge>;
}

const FINDING_META = {
  confirmed: { label: "Confirmed", icon: BadgeCheck, cls: "text-on-ink" },
  hypothesis: { label: "Hypothesis", icon: HelpCircle, cls: "text-risk-ink" },
  missing: { label: "Missing evidence", icon: Search, cls: "text-none-ink" },
} as const;

export function SourceLinks({ sources, base }: { sources?: SourceRef[]; base: string }) {
  if (!sources?.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {sources.map((s, i) =>
        s.path ? (
          <Link key={i} href={`${base}${s.path}`} className="rounded bg-muted px-1 text-[10.5px] font-medium text-muted-foreground hover:bg-brand-subtle hover:text-brand-ink" title={s.label}>
            {s.type.replace(/_/g, " ")}
          </Link>
        ) : (
          <span key={i} className="rounded bg-muted px-1 text-[10.5px] text-muted-foreground" title={s.label}>
            {s.label}
          </span>
        ),
      )}
    </span>
  );
}

export function Findings({ findings, base, compact = false }: { findings: Finding[]; base: string; compact?: boolean }) {
  if (!findings.length) return <p className="text-sm text-muted-foreground">No findings recorded yet.</p>;
  const groups = (["confirmed", "hypothesis", "missing"] as const).map((k) => ({ k, items: findings.filter((f) => f.kind === k) })).filter((g) => g.items.length);
  return (
    <div className={cn("space-y-3", compact && "space-y-2")} data-testid="findings">
      {groups.map(({ k, items }) => {
        const m = FINDING_META[k];
        return (
          <div key={k}>
            <p className={cn("mb-1 flex items-center gap-1 text-[11px] font-semibold tracking-[0.06em] uppercase", m.cls)}>
              <m.icon className="size-3.5" /> {m.label}
            </p>
            <ul className="space-y-1">
              {items.map((f, i) => (
                <li key={i} className="text-[13px] leading-snug">
                  {f.text}
                  <SourceLinks sources={f.sources} base={base} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

const EVENT_ICON: Record<string, typeof Zap> = {
  trigger: Zap,
  context: FileSearch,
  evidence: FileSearch,
  finding: BadgeCheck,
  step: CircleDot,
  tool_call: Wrench,
  proposal: ShieldCheck,
  approval: ShieldCheck,
  message: Mail,
  response: MessageSquareReply,
  escalation: Siren,
  outcome: BadgeCheck,
  monitoring: CircleDot,
  delegation: GitBranch,
  error: AlertTriangle,
  config: Settings2,
  note: CircleDot,
};

export interface TimelineEvent {
  id: number;
  kind: string;
  summary: string;
  created_at: string;
  sources?: unknown;
  investigation_id?: string | null;
}

export function Timeline({ events, base, showTools = true, linkInvestigation = false }: { events: TimelineEvent[]; base: string; showTools?: boolean; linkInvestigation?: boolean }) {
  const list = showTools ? events : events.filter((e) => e.kind !== "tool_call");
  if (!list.length) return <p className="px-4 py-3 text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative space-y-0 px-4 py-3" data-testid="timeline">
      {list.map((e, i) => {
        const I = EVENT_ICON[e.kind] ?? CircleDot;
        const tone = e.kind === "error" ? "text-off-ink" : e.kind === "approval" || e.kind === "proposal" ? "text-risk-ink" : e.kind === "outcome" ? "text-on-ink" : e.kind === "tool_call" ? "text-muted-foreground/70" : "text-brand-ink";
        return (
          <li key={e.id} className="relative flex gap-3 pb-3">
            {i < list.length - 1 && <span aria-hidden className="absolute top-5 bottom-0 left-[9px] w-px bg-border" />}
            <span className={cn("relative mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border bg-card", tone)}>
              <I className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[13px] leading-snug", e.kind === "tool_call" && "text-xs text-muted-foreground")}>
                {e.summary}
                <SourceLinks sources={e.sources as SourceRef[] | undefined} base={base} />
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatDateTime(e.created_at)} · {e.kind.replace("_", " ")}
                {linkInvestigation && e.investigation_id && (
                  <>
                    {" · "}
                    <Link href={`${base}/agents/investigations/${e.investigation_id}`} className="hover:underline">
                      investigation
                    </Link>
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
