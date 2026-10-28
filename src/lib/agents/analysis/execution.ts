// Pure analysis for the Execution Agent: is an action really overdue, was it updated
// elsewhere, what depends on it, who should be asked, and what to say. No commentary
// about people — only the commitment, its dates and what depends on it.
import type { Finding, SourceRef } from "../registry";

export interface OverdueInput {
  today: string;
  companyName: string;
  action: { id: string; title: string; status: string; due_date: string | null; owner_id: string; updated_at: string };
  owner: { id: string; full_name: string; user_id: string | null; reports_to: string | null } | null;
  manager: { id: string; full_name: string; user_id: string | null } | null;
  ceo: { id: string; full_name: string; user_id: string | null } | null;
  priority: { id: string; title: string; status: string; due_date: string | null } | null;
  issue: { id: string; title: string } | null;
  metric: { id: string; name: string } | null;
  comments: Array<{ body: string; created_at: string }>;
  audit: Array<{ action: string; changes: unknown; created_at: string }>;
  dependencies: Array<{ from_type: string; from_id: string; to_type: string; to_id: string; note: string | null }>;
  siblings: Array<{ id: string; title: string; status: string; due_date: string | null }>;
}

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400000);
const first = (name: string) => name.split(" ")[0];
const fmt = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "no date";

export interface OverdueAssessment {
  overdue: boolean;
  daysOverdue: number;
  /** Updated by someone in the last 2 days — wait rather than chase */
  recentlyUpdated: { at: string; what: string } | null;
  recipient: { crewId: string; name: string; reason: string } | null;
  findings: Finding[];
  sources: SourceRef[];
}

export function assessOverdue(i: OverdueInput, refs: { action: SourceRef; priority?: SourceRef; issue?: SourceRef; metric?: SourceRef }): OverdueAssessment {
  const a = i.action;
  const overdue = a.status === "open" && a.due_date !== null && a.due_date < i.today;
  const daysOverdue = a.due_date ? Math.max(0, days(a.due_date, i.today)) : 0;
  const findings: Finding[] = [];
  const sources = [refs.action, refs.priority, refs.issue, refs.metric].filter(Boolean) as SourceRef[];

  if (overdue) {
    findings.push({ kind: "confirmed", text: `"${a.title}" was due on ${fmt(a.due_date)} and is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue; status is still open.`, sources: [refs.action], data: { due_date: a.due_date, days_overdue: daysOverdue } });
  }

  // Updated elsewhere? Comments or record changes after the due date
  const since = a.due_date ?? a.updated_at;
  const recentComment = i.comments.find((c) => c.created_at.slice(0, 10) >= since && days(c.created_at, i.today) <= 2);
  const recentChange = i.audit.find((x) => x.action === "update" && x.created_at.slice(0, 10) >= since && days(x.created_at, i.today) <= 2);
  const recentlyUpdated = recentComment
    ? { at: recentComment.created_at, what: `progress update: "${recentComment.body.slice(0, 120)}"` }
    : recentChange
      ? { at: recentChange.created_at, what: "the record was edited" }
      : null;
  if (recentlyUpdated) findings.push({ kind: "confirmed", text: `The action was updated on ${fmt(recentlyUpdated.at)} (${recentlyUpdated.what}).`, sources: [refs.action] });
  else if (overdue) {
    const last = [...i.comments.map((c) => c.created_at), ...i.audit.filter((x) => x.action === "update").map((x) => x.created_at)].sort().at(-1);
    findings.push({ kind: "confirmed", text: last ? `No updates since ${fmt(last)}.` : "No progress updates have been recorded against the action.", sources: [refs.action] });
  }

  // What depends on it
  if (i.priority) {
    const pDays = i.priority.due_date ? days(i.today, i.priority.due_date) : null;
    findings.push({
      kind: "confirmed",
      text: `It supports the 90-day priority "${i.priority.title}" (${i.priority.status.replace("_", " ")}${pDays !== null ? `, due in ${pDays} days` : ""}).`,
      sources: refs.priority ? [refs.priority] : [],
    });
    const openSiblings = i.siblings.filter((s) => s.status === "open");
    const lateSiblings = openSiblings.filter((s) => s.due_date && s.due_date < i.today);
    if (lateSiblings.length) findings.push({ kind: "confirmed", text: `${lateSiblings.length} other action${lateSiblings.length === 1 ? " on the same priority is" : "s on the same priority are"} also overdue.` });
    if (i.priority.status === "on_track" && daysOverdue >= 7) findings.push({ kind: "hypothesis", text: "The priority is reported on track although a supporting action is more than a week late; the priority status may be optimistic." });
  } else if (!i.issue && !i.metric) {
    findings.push({ kind: "missing", text: "The action is not linked to a priority, issue or KPI, so its impact on the plan cannot be assessed." });
  }
  const blocking = i.dependencies.filter((d) => d.to_id === a.id || (i.priority && d.to_id === i.priority.id));
  if (blocking.length) findings.push({ kind: "confirmed", text: `${blocking.length} recorded dependenc${blocking.length === 1 ? "y relies" : "ies rely"} on this work${blocking[0].note ? ` (e.g. "${blocking[0].note}")` : ""}.` });
  if (i.issue) findings.push({ kind: "confirmed", text: `It is the agreed action for the issue "${i.issue.title}".`, sources: refs.issue ? [refs.issue] : [] });
  if (i.metric) findings.push({ kind: "confirmed", text: `It is a corrective action for the KPI "${i.metric.name}", so it appears on the Monday scorecard while the KPI is off track.`, sources: refs.metric ? [refs.metric] : [] });

  // Who to ask: the owner; if they have no login, their manager; else the CEO
  let recipient: OverdueAssessment["recipient"] = null;
  if (i.owner?.user_id) recipient = { crewId: i.owner.id, name: i.owner.full_name, reason: "accountable owner" };
  else if (i.manager?.user_id) recipient = { crewId: i.manager.id, name: i.manager.full_name, reason: `manager of ${i.owner?.full_name ?? "the owner"}, who has no Omni OS login` };
  else if (i.ceo?.user_id) recipient = { crewId: i.ceo.id, name: i.ceo.full_name, reason: "CEO — the owner and their manager have no Omni OS login" };
  if (!recipient) findings.push({ kind: "missing", text: "Nobody connected to this action has an Omni OS login, so there is no internal channel for a follow-up." });

  return { overdue, daysOverdue, recentlyUpdated, recipient, findings, sources };
}

export function followupMessage(i: OverdueInput, recipientName: string, kind: "followup" | "reminder", daysOverdue: number) {
  const a = i.action;
  const lines = [
    `${first(recipientName)}, ${kind === "reminder" ? "a reminder: " : ""}the action "${a.title}" was due on ${fmt(a.due_date)} and is now ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue.`,
  ];
  if (i.owner && recipientName !== i.owner.full_name) lines.push(`It is owned by ${i.owner.full_name}.`);
  if (i.priority) lines.push(`It supports the 90-day priority "${i.priority.title}"${i.priority.due_date ? ` (due ${fmt(i.priority.due_date)})` : ""}.`);
  if (i.metric) lines.push(`It is the agreed corrective action for the KPI "${i.metric.name}".`);
  lines.push("", "Please reply in Omni OS with one of: it is done; a new completion date; or what is blocking it.");
  return {
    subject: `${kind === "reminder" ? "Reminder — u" : "U"}pdate needed: ${a.title}`.slice(0, 200),
    body: lines.join("\n"),
  };
}

export function escalationMessage(i: OverdueInput, toName: string, reason: string, daysOverdue: number, blocker: string | null) {
  const a = i.action;
  const lines = [
    `${first(toName)}, escalating an overdue commitment: "${a.title}" (owner ${i.owner?.full_name ?? "unassigned"}) was due on ${fmt(a.due_date)} and is ${daysOverdue} days overdue.`,
    `Reason for escalation: ${reason}.`,
  ];
  if (blocker) lines.push(`Blocker reported by the owner: "${blocker}".`);
  if (i.priority) lines.push(`It supports the 90-day priority "${i.priority.title}".`);
  lines.push("", "Please reply in Omni OS with how this will be unblocked, or a revised date.");
  return { subject: `Escalation: ${a.title}`.slice(0, 200), body: lines.join("\n") };
}
