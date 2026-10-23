// "What needs attention this week?" — Mission Control's exception list.
// Separates the few items needing attention from routine, on-track activity.
import type { ScorecardRow } from "./weekly-scorecard";
import type { ScheduledReport } from "./reporting";
import { REPORT_META } from "./reporting";

export type AttentionKind = "kpi" | "priority" | "issue" | "action" | "org_action" | "reporting" | "scorecard" | "onboarding";

export interface AttentionItem {
  kind: AttentionKind;
  severity: "off" | "risk";
  title: string;
  detail: string;
  /** company-relative path */
  href: string;
  ownerId?: string | null;
}

export interface AttentionInput {
  today: string;
  scorecard: ScorecardRow[];
  priorities: Array<{ id: string; title: string; status: string; owner_id: string; due_date: string | null }>;
  openIssues: Array<{ id: string; title: string; priority: string; owner_id: string; escalated_to_omni: boolean }>;
  overdueActions: Array<{ id: string; title: string; owner_id: string; due_date: string | null }>;
  orgActions: Array<{ id: string; title: string; owner_id: string; target_date: string | null; priority: string }>;
  reporting: ScheduledReport[];
  scorecardApproved: boolean;
  onboarding: Array<{ id: string; title: string; status: string; due_date: string | null; owner_id: string | null }>;
}

export interface AttentionSummary {
  items: AttentionItem[];
  routine: { kpisOnTrack: number; kpisTotal: number; prioritiesOnTrack: number; prioritiesTotal: number; issuesRoutine: number };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export function attentionThisWeek(i: AttentionInput): AttentionSummary {
  const items: AttentionItem[] = [];

  for (const r of i.scorecard) {
    if (r.status === "off_track")
      items.push({
        kind: "kpi",
        severity: "off",
        title: r.kpi,
        detail: r.actionRequired ? `Off track (${r.actual} vs ${r.target}) — action required, no corrective action agreed` : `Off track (${r.actual} vs ${r.target}) — ${r.actions.length} corrective action${r.actions.length === 1 ? "" : "s"} agreed`,
        href: `/scoreboard/${r.metricId}`,
      });
    else if (r.status === "not_reported") items.push({ kind: "kpi", severity: "risk", title: r.kpi, detail: `Not reported — ${r.period}`, href: `/scoreboard/${r.metricId}` });
  }
  if (!i.scorecardApproved && i.scorecard.length)
    items.push({ kind: "scorecard", severity: "risk", title: "Monday scorecard not yet approved", detail: "The CEO approves the scorecard before it goes to Omni.", href: "/weekly-scorecard" });

  for (const p of i.priorities) {
    if (p.status === "off_track" || p.status === "at_risk")
      items.push({ kind: "priority", severity: p.status === "off_track" ? "off" : "risk", title: p.title, detail: `90-day priority ${p.status === "off_track" ? "off track" : "at risk"}`, href: `/flight-plan/quarterly_priority/${p.id}`, ownerId: p.owner_id });
  }
  for (const x of i.openIssues) {
    if (x.priority === "critical" || x.escalated_to_omni)
      items.push({ kind: "issue", severity: x.priority === "critical" ? "off" : "risk", title: x.title, detail: x.escalated_to_omni ? "Issue escalated to Omni" : "Critical issue", href: `/execution/issue/${x.id}`, ownerId: x.owner_id });
  }
  for (const a of i.overdueActions)
    items.push({ kind: "action", severity: "off", title: a.title, detail: `Action overdue by ${daysBetween(a.due_date ?? i.today, i.today)} days`, href: "/execution?view=actions&filter=overdue", ownerId: a.owner_id });
  for (const o of i.orgActions) {
    if (o.target_date && o.target_date < i.today)
      items.push({ kind: "org_action", severity: "risk", title: o.title, detail: "Organisational action past its deadline", href: "/crew", ownerId: o.owner_id });
  }
  for (const r of i.reporting) {
    if (r.state === "overdue") items.push({ kind: "reporting", severity: "off", title: `${REPORT_META[r.kind].label} · ${r.periodLabel}`, detail: `Overdue since ${r.due}`, href: "/reporting" });
    else if ((r.state === "due" || r.state === "draft") && daysBetween(i.today, r.due) <= 5)
      items.push({ kind: "reporting", severity: "risk", title: `${REPORT_META[r.kind].label} · ${r.periodLabel}`, detail: `Due ${r.due}`, href: "/reporting" });
  }
  for (const m of i.onboarding) {
    if (m.status !== "done" && m.due_date && m.due_date < i.today)
      items.push({ kind: "onboarding", severity: "risk", title: m.title, detail: "First-100-days milestone past due", href: "/onboarding", ownerId: m.owner_id });
  }

  const rank = { off: 0, risk: 1 };
  const kindRank: Record<AttentionKind, number> = { kpi: 0, priority: 1, issue: 2, action: 3, reporting: 4, scorecard: 5, org_action: 6, onboarding: 7 };
  items.sort((a, b) => rank[a.severity] - rank[b.severity] || kindRank[a.kind] - kindRank[b.kind]);

  return {
    items,
    routine: {
      kpisOnTrack: i.scorecard.filter((r) => r.status === "on_track").length,
      kpisTotal: i.scorecard.length,
      prioritiesOnTrack: i.priorities.filter((p) => p.status === "on_track" || p.status === "done").length,
      prioritiesTotal: i.priorities.length,
      issuesRoutine: i.openIssues.filter((x) => x.priority !== "critical" && !x.escalated_to_omni).length,
    },
  };
}
