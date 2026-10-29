import Link from "next/link";
import { ArrowRight, RotateCcw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/domain/format";
import { AGENTS, APPROVER_LABEL, CATEGORIES, type AgentKey, type ApproverRole, type Category, type SourceRef } from "@/lib/agents/registry";
import { AgentIcon, ApprovalStatus, SourceLinks } from "./agent-ui";
import { ApprovalActions } from "./controls";

export interface ApprovalRow {
  id: string;
  agent_key: string;
  investigation_id: string;
  category: string;
  action_type: string;
  title: string;
  rationale: string;
  payload: unknown;
  evidence: unknown;
  affected: unknown;
  implications: string | null;
  reversible: boolean;
  approver_role: string;
  status: string;
  decision_note: string | null;
  decided_at: string | null;
  executed_at: string | null;
  created_at: string;
  result: unknown;
}

/** Mirrors app.can_decide(): who may decide a proposal for this approver role. */
export function canDecide(role: string, approver: string) {
  if (approver === "ceo" || approver === "company_admin") return role === "ceo" || role === "company_admin";
  if (approver === "leadership") return ["ceo", "company_admin", "executive", "omni"].includes(role);
  if (approver === "omni") return role === "omni";
  return false;
}

type P = Record<string, unknown>;

/** The exact action that will run if approved. */
export function ProposedAction({ type, payload }: { type: string; payload: unknown }) {
  const p = (payload ?? {}) as P;
  const box = "rounded-md border bg-muted/30 p-3 text-[13px]";
  switch (type) {
    case "send_external_message": {
      const d = (p.draft ?? {}) as P;
      return (
        <div className={`${box} space-y-2`}>
          <p className="text-xs text-muted-foreground">Draft approach to {String(p.target_name ?? "the target")} — the agent does not send it</p>
          <div>
            <p className="font-medium">{String(d.subject ?? "")}</p>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{String(d.body ?? "")}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {p.handoff_action ? "If approved: a Mission Control action is created for the deal lead to review, personalise and send it themselves." : "If approved: recorded as approved; no deal lead is set, so nothing further happens automatically."}
          </p>
        </div>
      );
    }
    case "send_followup":
    case "send_escalation":
      return (
        <div className={box}>
          {"to_name" in p && <p className="text-xs text-muted-foreground">To: {String(p.to_name)}{p.to_address ? ` <${String(p.to_address)}>` : ""}</p>}
          <p className="font-medium">{String(p.subject ?? "")}</p>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">{String(p.body ?? "")}</p>
        </div>
      );
    case "change_action_due_date":
      return (
        <div className={box}>
          Due date: <span className="tabular">{formatDate(String(p.expected_due_date ?? ""))}</span> <ArrowRight className="inline size-3.5" /> <span className="font-semibold tabular">{formatDate(String(p.new_due_date ?? ""))}</span>
          <p className="mt-1 text-xs text-muted-foreground">Only applied if the action still has its current date and status when the agent executes it.</p>
        </div>
      );
    case "change_action_status":
      return <div className={box}>Status: {String(p.expected_status)} <ArrowRight className="inline size-3.5" /> <span className="font-semibold">{String(p.new_status)}</span></div>;
    case "create_issue":
      return (
        <div className={box}>
          <p className="text-xs text-muted-foreground">New Mission Control issue · {String(p.priority ?? "medium")} priority</p>
          <p className="font-medium">{String(p.title ?? "")}</p>
          {p.description ? <p className="mt-1 text-muted-foreground">{String(p.description)}</p> : null}
        </div>
      );
    case "change_integration_activity":
      return (
        <div className={box}>
          <p className="text-xs text-muted-foreground">Integration plan · {String(p.activity_title ?? "activity")}</p>
          Due date: <span className="tabular">{formatDate(String(p.expected_due_date ?? ""))}</span> <ArrowRight className="inline size-3.5" /> <span className="font-semibold tabular">{formatDate(String(p.new_due_date ?? ""))}</span>
          <p className="mt-1 text-xs text-muted-foreground">Only applied if the activity still has its current date and is not complete. The approved baseline date is kept for variance reporting.</p>
        </div>
      );
    case "create_corrective_action": {
      const a = (p.action ?? {}) as P;
      const i = p.issue as P | undefined;
      if (Array.isArray(p.actions)) {
        const list = p.actions as P[];
        return (
          <div className={`${box} space-y-2`}>
            {i && (
              <div>
                <p className="text-xs text-muted-foreground">New Mission Control issue · {String(i.priority ?? "high")} priority{p.acquisition_id ? " · linked to the integration" : ""}</p>
                <p className="font-medium">{String(i.title)}</p>
                {i.description ? <p className="mt-1 text-muted-foreground">{String(i.description)}</p> : null}
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">{list.length} agreed corrective action{list.length === 1 ? "" : "s"}, tracked by the agent</p>
              <ul className="mt-1 space-y-1">
                {list.map((x, n) => (
                  <li key={n}>
                    <span className="font-medium">{String(x.title)}</span> <span className="text-xs text-muted-foreground">— {String(x.owner_name ?? "")}, due {formatDate(String(x.due_date ?? ""))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      }
      return (
        <div className={`${box} space-y-2`}>
          {i && (
            <div>
              <p className="text-xs text-muted-foreground">New issue · {String(i.priority ?? "high")} priority</p>
              <p className="font-medium">{String(i.title)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Agreed corrective action against the KPI (appears on the Monday scorecard) · owner {String(a.owner_name ?? "")} · due {formatDate(String(a.due_date ?? ""))}</p>
            <p className="font-medium">{String(a.title ?? "")}</p>
            {a.description ? <p className="mt-1 text-muted-foreground">{String(a.description)}</p> : null}
          </div>
        </div>
      );
    }
    case "create_action":
      return (
        <div className={box}>
          <p className="text-xs text-muted-foreground">New Mission Control action · owner {String(p.owner_name ?? "")} · due {formatDate(String(p.due_date ?? ""))}</p>
          <p className="font-medium">{String(p.title ?? "")}</p>
          {p.description ? <p className="mt-1 text-muted-foreground">{String(p.description)}</p> : null}
        </div>
      );
    case "crm_create_tasks": {
      const tasks = (p.tasks ?? []) as P[];
      return (
        <div className={box}>
          <p className="mb-1 text-xs text-muted-foreground">{tasks.length} CRM follow-up task{tasks.length === 1 ? "" : "s"} ({String(p.connection ?? "CRM")})</p>
          <ul className="space-y-1">
            {tasks.slice(0, 12).map((t, i) => (
              <li key={i}>
                <span className="font-medium">{String(t.subject)}</span> <span className="text-xs text-muted-foreground">— {String(t.owner)}, due {formatDate(String(t.due))}</span>
              </li>
            ))}
            {tasks.length > 12 && <li className="text-xs text-muted-foreground">…and {tasks.length - 12} more</li>}
          </ul>
        </div>
      );
    }
    case "add_ma_targets": {
      const targets = (p.targets ?? []) as P[];
      return (
        <div className={box}>
          <p className="mb-1 text-xs text-muted-foreground">Add {targets.length} target{targets.length === 1 ? "" : "s"} to the acquisition pipeline</p>
          <ul className="space-y-0.5">
            {targets.map((t, i) => (
              <li key={i}>
                {String(t.name)} <span className="text-xs text-muted-foreground">— fit {String(t.fit_score)}/100</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    default:
      return <pre className={`${box} overflow-x-auto text-xs`}>{JSON.stringify(p, null, 2)}</pre>;
  }
}

export function ApprovalCard({ a, slug, companyId, role, showInvestigation = true }: { a: ApprovalRow; slug: string; companyId: string; role: string; showInvestigation?: boolean }) {
  const base = `/c/${slug}`;
  const cat = CATEGORIES[a.category as Category];
  const affected = (a.affected ?? []) as Array<{ type: string; label: string }>;
  const evidence = (a.evidence ?? []) as SourceRef[];
  return (
    <div className="space-y-3 p-4" data-testid="approval-card">
      <div className="flex items-start gap-3">
        <AgentIcon agent={a.agent_key as AgentKey} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{a.title}</p>
            <ApprovalStatus status={a.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Proposed by the {AGENTS[a.agent_key as AgentKey].name} · {formatDateTime(a.created_at)} · {cat?.label ?? a.category} (Level {cat?.level ?? "?"})
            {showInvestigation && (
              <>
                {" · "}
                <Link href={`${base}/agents/investigations/${a.investigation_id}`} className="hover:underline">
                  investigation
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Why</p>
            <p className="text-[13px]">
              {a.rationale}
              <SourceLinks sources={evidence} base={base} />
            </p>
          </div>
          {affected.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Affects</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {affected.map((x, i) => (
                  <Badge key={i} variant="outline">
                    {x.type.replace("_", " ")}: {x.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            {a.reversible ? <RotateCcw className="mt-px size-3.5 shrink-0" /> : <ShieldAlert className="mt-px size-3.5 shrink-0 text-risk-ink" />}
            <span>
              {a.reversible ? "Reversible." : "Not reversible once carried out."} {a.implications}
            </span>
          </p>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Exactly what will happen</p>
          <ProposedAction type={a.action_type} payload={a.payload} />
        </div>
      </div>
      {a.status === "pending" ? (
        <div className="flex flex-col gap-1.5 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Approver: {APPROVER_LABEL[a.approver_role as ApproverRole]}. Approval authorises this action only; it is checked again before it runs.</p>
          <ApprovalActions companyId={companyId} approvalId={a.id} canDecide={canDecide(role, a.approver_role)} approverLabel={APPROVER_LABEL[a.approver_role as ApproverRole]} />
        </div>
      ) : (
        <p className="border-t pt-2 text-xs text-muted-foreground">
          {a.decided_at ? `Decided ${formatDateTime(a.decided_at)}` : ""}
          {a.decision_note ? ` — "${a.decision_note}"` : ""}
          {a.executed_at ? ` · carried out ${formatDateTime(a.executed_at)}` : ""}
          {a.status === "stale" ? " · not carried out: circumstances changed after it was proposed" : ""}
        </p>
      )}
    </div>
  );
}
