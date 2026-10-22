import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import { formatMetric, targetLabel } from "@/lib/domain/format";
import { periodLabel } from "@/lib/domain/metrics";
import type { AgendaItem, Meeting } from "./types";
import type { CompanySnapshot } from "./snapshot";

export interface LiveMetric {
  id: string;
  name: string;
  unit: string;
  frequency: "weekly" | "monthly";
  value: string;
  rawValue: number | null;
  period: string | null;
  periodLabel: string;
  lastCompleted: string;
  lastCompletedLabel: string;
  target: string;
  status: string;
  trend: string;
  points: Array<number | null>;
  targetValue: number | null;
  owner_id: string;
}

export interface MeetingBundle {
  meeting: Meeting;
  agenda: AgendaItem[];
  attendees: Array<{ crew_member_id: string; present: boolean }>;
  decisions: Array<{ id: string; title: string; rationale: string | null; owner_id: string; issue_id: string | null }>;
  newActions: Array<{ id: string; title: string; owner_id: string; due_date: string | null; status: string; issue_id: string | null; decision_id: string | null }>;
  raisedIssues: Array<{ id: string; title: string; priority: string; status: string }>;
  resolvedIssues: Array<{ id: string; title: string; resolution: string | null }>;
  // live state of referenced records
  metrics: Record<string, LiveMetric>;
  priorities: Record<string, { id: string; title: string; status: string; progress: number; owner_id: string; due_date: string | null }>;
  actions: Record<string, { id: string; title: string; status: string; owner_id: string; due_date: string | null }>;
  issues: Record<string, { id: string; title: string; status: string; priority: string; owner_id: string; description: string | null; escalated_to_omni: boolean; metric_id: string | null; quarterly_priority_id: string | null }>;
}

export async function loadMeetingBundle(supabase: Supabase, snap: CompanySnapshot, meetingId: string): Promise<MeetingBundle | null> {
  const cid = snap.company.id;
  const { data: meeting } = await supabase.from("meetings").select("*").eq("company_id", cid).eq("id", meetingId).maybeSingle();
  if (!meeting) return null;
  const [agenda, attendees, decisions, newActions, raised, resolved] = await Promise.all([
    supabase.from("meeting_agenda_items").select("*").eq("meeting_id", meetingId).order("sort_order"),
    supabase.from("meeting_attendees").select("crew_member_id, present").eq("meeting_id", meetingId),
    supabase.from("decisions").select("id, title, rationale, owner_id, issue_id").eq("meeting_id", meetingId).order("created_at"),
    supabase.from("actions").select("id, title, owner_id, due_date, status, issue_id, decision_id").eq("meeting_id", meetingId).order("created_at"),
    supabase.from("issues").select("id, title, priority, status").eq("raised_in_meeting_id", meetingId).order("created_at"),
    supabase.from("issues").select("id, title, resolution").eq("resolved_in_meeting_id", meetingId),
  ]);

  const items = agenda.data ?? [];
  const ids = (t: string) => items.filter((i) => i.entity_type === t).map((i) => i.entity_id!).filter(Boolean);
  const actionIds = [...new Set([...ids("action")])];
  const issueIds = [...new Set([...ids("issue"), ...(raised.data ?? []).map((i) => i.id)])];
  const priorityIds = ids("quarterly_priority");
  const [actionRows, issueRows, priorityRows] = await Promise.all([
    actionIds.length ? supabase.from("actions").select("id, title, status, owner_id, due_date").in("id", actionIds) : Promise.resolve({ data: [] }),
    issueIds.length
      ? supabase.from("issues").select("id, title, status, priority, owner_id, description, escalated_to_omni, metric_id, quarterly_priority_id").in("id", issueIds)
      : Promise.resolve({ data: [] }),
    priorityIds.length ? supabase.from("quarterly_priorities").select("id, title, status, progress, owner_id, due_date").in("id", priorityIds) : Promise.resolve({ data: [] }),
  ]);

  const cur = snap.company.currency;
  const metrics: Record<string, LiveMetric> = {};
  for (const v of snap.metrics) {
    const m = v.metric;
    metrics[m.id] = {
      id: m.id,
      name: m.name,
      unit: m.unit,
      frequency: m.frequency,
      value: formatMetric(v.latest?.value, m.unit, { decimals: m.decimals, currency: cur }),
      rawValue: v.latest?.value ?? null,
      period: v.latest?.period ?? null,
      periodLabel: v.latest ? periodLabel(v.latest.period, m.frequency) : "No data",
      lastCompleted: v.lastCompleted,
      lastCompletedLabel: periodLabel(v.lastCompleted, m.frequency),
      target: targetLabel(m, v.latest?.target ?? m.target_value, cur),
      status: v.status,
      trend: v.trend,
      points: v.points.slice(-10).map((p) => p.value),
      targetValue: m.direction === "range" ? null : (v.latest?.target ?? m.target_value),
      owner_id: m.owner_id,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = (rows: any[] | null | undefined) => Object.fromEntries((rows ?? []).map((r) => [r.id, r]));

  return {
    meeting,
    agenda: items,
    attendees: attendees.data ?? [],
    decisions: decisions.data ?? [],
    newActions: newActions.data ?? [],
    raisedIssues: raised.data ?? [],
    resolvedIssues: resolved.data ?? [],
    metrics,
    priorities: byId(priorityRows.data),
    actions: byId(actionRows.data),
    issues: byId(issueRows.data),
  };
}
