// Builds a meeting agenda from the live operating plan. Pure so it can be unit tested
// and previewed before a meeting starts; it is snapshotted when the meeting starts.
import { exceptionReason, isException, type MetricView } from "./metric-view";

export type AgendaSection = "kpi_exceptions" | "priorities" | "previous_actions" | "issues" | "discussion" | "new_actions";

export const AGENDA_SECTIONS: Array<{ key: AgendaSection; label: string; description: string }> = [
  { key: "kpi_exceptions", label: "KPI exceptions", description: "Metrics off track, at risk, deteriorating or not reported" },
  { key: "priorities", label: "Quarterly priorities", description: "On track or off track — owners give a one-line update" },
  { key: "previous_actions", label: "Previous actions", description: "Done or not done" },
  { key: "issues", label: "Material issues", description: "Prioritise, discuss and resolve" },
  { key: "discussion", label: "Discussion & decisions", description: "Decisions recorded in this meeting" },
  { key: "new_actions", label: "New actions", description: "Commitments with owners and deadlines" },
];

export interface AgendaInput {
  meetingType: "weekly" | "monthly" | "quarterly" | "annual";
  metrics: MetricView<{
    id: string;
    name: string;
    unit: string;
    decimals: number;
    direction: "higher_is_better" | "lower_is_better" | "range";
    frequency: "weekly" | "monthly";
    target_value: number | null;
    target_min: number | null;
    target_max: number | null;
    tolerance_pct: number;
    owner_id: string;
    is_key: boolean;
  }>[];
  priorities: Array<{ id: string; title: string; status: string; progress: number; owner_id: string; due_date: string | null }>;
  openActions: Array<{ id: string; title: string; owner_id: string; due_date: string | null; meeting_id: string | null }>;
  openIssues: Array<{ id: string; title: string; priority: string; owner_id: string; status: string; metric_id: string | null }>;
  /** entity ids that appeared on any previous meeting's agenda (for carry-over flags) */
  previouslyDiscussed: Set<string>;
  today: string;
}

export interface AgendaItemDraft {
  section: AgendaSection;
  entity_type: "metric" | "quarterly_priority" | "action" | "issue";
  entity_id: string;
  title: string;
  snapshot: Record<string, unknown>;
  carried_over: boolean;
  sort_order: number;
}

const statusRank: Record<string, number> = { off_track: 0, at_risk: 1, no_data: 2, on_track: 3 };
const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function buildAgenda(input: AgendaInput): AgendaItemDraft[] {
  const items: AgendaItemDraft[] = [];
  let order = 0;

  // 1. KPI exceptions (monthly and quarterly reviews look at every KPI, exceptions first)
  const fullReview = input.meetingType !== "weekly";
  const metrics = input.metrics
    .filter((v) => (fullReview ? true : isException(v)))
    .sort((a, b) => Number(isException(b)) - Number(isException(a)) || (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9));
  for (const v of metrics) {
    items.push({
      section: "kpi_exceptions",
      entity_type: "metric",
      entity_id: v.metric.id,
      title: v.metric.name,
      snapshot: {
        value: v.latest?.value ?? null,
        target: v.latest?.target ?? v.metric.target_value,
        target_min: v.metric.target_min,
        target_max: v.metric.target_max,
        period: v.latest?.period ?? null,
        status: v.status,
        reason: isException(v) ? exceptionReason(v) : "On track",
        trend: v.trend,
        unit: v.metric.unit,
        decimals: v.metric.decimals,
        owner_id: v.metric.owner_id,
        exception: isException(v),
      },
      carried_over: false,
      sort_order: order++,
    });
  }

  // 2. Quarterly priorities: off track first
  for (const p of [...input.priorities].sort((a, b) => (statusRank[a.status] ?? 5) - (statusRank[b.status] ?? 5))) {
    items.push({
      section: "priorities",
      entity_type: "quarterly_priority",
      entity_id: p.id,
      title: p.title,
      snapshot: { status: p.status, progress: p.progress, owner_id: p.owner_id, due_date: p.due_date },
      carried_over: false,
      sort_order: order++,
    });
  }

  // 3. Outstanding actions: overdue first
  for (const a of [...input.openActions].sort((x, y) => (x.due_date ?? "9999").localeCompare(y.due_date ?? "9999"))) {
    items.push({
      section: "previous_actions",
      entity_type: "action",
      entity_id: a.id,
      title: a.title,
      snapshot: { due_date: a.due_date, owner_id: a.owner_id, overdue: a.due_date !== null && a.due_date < input.today },
      carried_over: a.meeting_id !== null || input.previouslyDiscussed.has(a.id),
      sort_order: order++,
    });
  }

  // 4. Material issues: by priority; issues linked to an exception KPI are flagged
  const exceptionIds = new Set(input.metrics.filter(isException).map((v) => v.metric.id));
  for (const i of [...input.openIssues].sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9))) {
    items.push({
      section: "issues",
      entity_type: "issue",
      entity_id: i.id,
      title: i.title,
      snapshot: { priority: i.priority, owner_id: i.owner_id, status: i.status, linked_exception: i.metric_id ? exceptionIds.has(i.metric_id) : false },
      carried_over: input.previouslyDiscussed.has(i.id),
      sort_order: order++,
    });
  }
  return items;
}
