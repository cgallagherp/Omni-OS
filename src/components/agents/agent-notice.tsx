// Agent work surfaced inside Mission Control. Status is the agents' own; nothing here
// changes a KPI's status or adds commentary to the scorecard.
import Link from "next/link";
import { Bot } from "lucide-react";
import { AGENTS, INVESTIGATION_STATUS_LABEL, type AgentKey } from "@/lib/agents/registry";
import type { AgentWork } from "@/lib/data/agents";
import { AgentIcon } from "./agent-ui";

type Inv = AgentWork["active"][number];

/** Banner on a record an agent is working on. */
export function AgentNotice({ slug, items }: { slug: string; items: Inv[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {items.map((i) => (
        <Link key={i.id} href={`/c/${slug}/agents/investigations/${i.id}`} className="flex items-start gap-2.5 rounded-md border border-brand/30 bg-brand-subtle px-3 py-2 text-sm hover:bg-brand-subtle/70">
          <AgentIcon agent={i.agent_key as AgentKey} className="mt-0.5 size-6" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{AGENTS[i.agent_key as AgentKey].name}: investigation underway</span>
            <span className="text-muted-foreground"> · {INVESTIGATION_STATUS_LABEL[i.status as keyof typeof INVESTIGATION_STATUS_LABEL]}</span>
            {i.summary && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{i.summary}</span>}
          </span>
          <span className="shrink-0 text-xs text-brand-ink">View →</span>
        </Link>
      ))}
    </div>
  );
}

/** Compact marker for a row (an action the Execution Agent is following up). */
export function AgentMarker({ slug, items }: { slug: string; items: Inv[] | undefined }) {
  const i = items?.[0];
  if (!i) return null;
  const label = i.agent_key === "execution" ? (i.status === "escalated" ? "Agent escalated" : "Agent following up") : "Agent investigating";
  return (
    <Link href={`/c/${slug}/agents/investigations/${i.id}`} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground" title={i.summary ?? i.title}>
      <Bot className="size-3" /> {label}
    </Link>
  );
}

/** Agent evidence for a meeting or review: what the agents found, proposed and measured. */
export function AgentEvidence({ slug, work, title = "Agent evidence", limit = 6 }: { slug: string; work: AgentWork; title?: string; limit?: number }) {
  const notable = work.active.filter((i) => i.severity !== "low" && (i.agent_key !== "execution" || i.status === "escalated"));
  if (!notable.length && !work.pending.length && !work.recentlyResolved.length) return null;
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Bot className="size-4 text-muted-foreground" /> {title}</h2>
        <Link href={`/c/${slug}/agents`} className="text-xs text-muted-foreground hover:text-foreground">Agent Control Centre →</Link>
      </div>
      <div className="divide-y text-sm">
        {work.pending.length > 0 && (
          <Link href={`/c/${slug}/agents/approvals`} className="flex items-center justify-between px-4 py-2 hover:bg-muted/40">
            <span><span className="font-medium">{work.pending.length}</span> agent proposal{work.pending.length === 1 ? "" : "s"} awaiting a management decision</span>
            <span className="text-xs text-brand-ink">Review →</span>
          </Link>
        )}
        {notable.slice(0, limit).map((i) => (
          <Link key={i.id} href={`/c/${slug}/agents/investigations/${i.id}`} className="flex items-start gap-2.5 px-4 py-2 hover:bg-muted/40">
            <AgentIcon agent={i.agent_key as AgentKey} className="mt-0.5 size-6" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{i.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{INVESTIGATION_STATUS_LABEL[i.status as keyof typeof INVESTIGATION_STATUS_LABEL]}{i.summary ? ` · ${i.summary}` : ""}</span>
            </span>
          </Link>
        ))}
        {work.recentlyResolved.slice(0, 3).map((i) => (
          <Link key={i.id} href={`/c/${slug}/agents/investigations/${i.id}`} className="flex items-start gap-2.5 px-4 py-2 hover:bg-muted/40">
            <AgentIcon agent={i.agent_key as AgentKey} className="mt-0.5 size-6" />
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">Resolved: </span>{i.title}
              {i.summary && <span className="block truncate text-xs text-muted-foreground">{i.summary}</span>}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Quarter summary for the reset: what the agents investigated and what changed — activity kept separate from results. */
export function AgentQuarterSummary({ slug, work, since }: { slug: string; work: AgentWork; since: string }) {
  const inQuarter = work.all.filter((i) => i.opened_at >= since);
  if (!inQuarter.length) return null;
  const outcome = (i: Inv) => (i.outcome ?? {}) as Record<string, unknown>;
  const resolved = inQuarter.filter((i) => i.status === "resolved");
  const kpi = resolved.filter((i) => i.workflow === "ceo.kpi_deviation");
  const rows: Array<[string, string | number]> = [
    ["Investigations opened", inQuarter.length],
    ["Still open", inQuarter.filter((i) => work.active.some((a) => a.id === i.id)).length],
    ["KPI interventions applied", kpi.filter((i) => outcome(i).intervention_applied).length],
    ["KPIs recovered (not attributed)", `${kpi.filter((i) => outcome(i).recovered === true).length} of ${kpi.length}`],
    ["Overdue actions resolved", resolved.filter((i) => i.workflow === "execution.overdue_action" && outcome(i).final_status === "done").length],
    ["CRM follow-ups completed", resolved.reduce((n, i) => n + Number(outcome(i).tasks_completed ?? 0), 0)],
    ["Acquisition targets added", resolved.reduce((n, i) => n + Number(outcome(i).targets_added ?? 0), 0)],
  ];
  const stillOpen = work.active.filter((i) => i.opened_at >= since && i.agent_key !== "execution");
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase"><Bot className="size-3.5" /> Agent summary this quarter</p>
      <dl className="divide-y rounded-md border text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between px-3 py-1.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium tabular">{v}</dd>
          </div>
        ))}
      </dl>
      {stillOpen.length > 0 && (
        <ul className="mt-2 space-y-1 text-[13px]">
          {stillOpen.slice(0, 4).map((i) => (
            <li key={i.id}>
              <Link href={`/c/${slug}/agents/investigations/${i.id}`} className="hover:underline">{i.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
