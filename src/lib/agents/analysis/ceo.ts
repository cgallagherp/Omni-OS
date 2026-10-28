// Pure analysis for the CEO Agent: a KPI deviation read against the company's own
// strategy — the North Star, the Flight Plan items the KPI measures, related KPIs,
// existing corrective actions and stated assumptions. Findings are classified as
// confirmed (from the records), hypotheses (to test) or missing evidence.
import type { Finding, SourceRef } from "../registry";

export interface KpiPoint {
  period: string;
  value: number | null;
  target: number | null;
  status: string;
}

export interface KpiInput {
  today: string;
  metric: { id: string; name: string; unit: string; category: string; comparable_key: string | null; direction: string; owner_name: string };
  points: KpiPoint[];
  fmt: (v: number | null) => string;
  /** Flight Plan items this KPI measures */
  links: Array<{ type: "winning_move" | "annual_goal" | "quarterly_priority"; id: string; title: string; status: string; ref: SourceRef }>;
  /** Other KPIs: latest status and whether they declined over the same periods */
  related: Array<{ id: string; name: string; category: string; status: string; declining: boolean; ref: SourceRef }>;
  correctiveActions: Array<{ id: string; title: string; due_date: string | null; status: string; ref: SourceRef }>;
  issues: Array<{ id: string; title: string; ref: SourceRef }>;
  northStar: { vision: string; targetYear: number | null; targetRevenue: number | null; targetEbitda: number | null; assumptions: string[]; ref: SourceRef } | null;
  financial: { ytdActual: number | null; ytdPlan: number | null; variancePct: number | null } | null;
  metricRef: SourceRef;
}

export interface KpiAssessment {
  material: boolean;
  offTrackRun: number;
  latest: KpiPoint | null;
  variancePct: number | null;
  findings: Finding[];
  delegateTo: Array<"commercial" | "execution">;
  needsIntervention: boolean;
  severity: "medium" | "high" | "critical";
}

const STOP = new Set(["the", "and", "of", "to", "a", "on", "in", "for", "per", "rate", "share", "kpi", "total", "number"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

export function assessKpi(i: KpiInput): KpiAssessment {
  const reported = i.points.filter((p) => p.value !== null);
  const latest = reported.at(-1) ?? null;
  const findings: Finding[] = [];
  let run = 0;
  for (let k = reported.length - 1; k >= 0 && reported[k].status === "off_track"; k--) run++;
  const variancePct = latest && latest.target ? ((latest.value! - latest.target) / Math.abs(latest.target)) * (i.metric.direction === "lower_is_better" ? -1 : 1) : null;

  if (latest) {
    findings.push({
      kind: "confirmed",
      text: `${i.metric.name} was ${i.fmt(latest.value)} against a target of ${i.fmt(latest.target)} in the latest period${variancePct !== null ? ` (${(variancePct * 100).toFixed(1)}%)` : ""}, off track for ${run} consecutive period${run === 1 ? "" : "s"}.`,
      sources: [i.metricRef],
      data: { latest: latest.value, target: latest.target, run },
    });
  } else findings.push({ kind: "missing", text: `${i.metric.name} has no reported results to assess.`, sources: [i.metricRef] });

  // Trend over the last six reported periods
  const last6 = reported.slice(-6);
  if (last6.length >= 3) {
    const first = last6[0].value!;
    const last = last6.at(-1)!.value!;
    const change = first !== 0 ? (last - first) / Math.abs(first) : 0;
    const worse = i.metric.direction === "lower_is_better" ? change > 0.02 : change < -0.02;
    findings.push({ kind: "confirmed", text: `Over the last ${last6.length} periods it moved from ${i.fmt(first)} to ${i.fmt(last)} (${worse ? "deteriorating" : "not deteriorating"}).`, sources: [i.metricRef] });
  }

  // Strategy: what this KPI measures
  for (const l of i.links) {
    const label = l.type === "winning_move" ? "Three-Year Outcome" : l.type === "annual_goal" ? "12-Month Objective" : "90-Day Priority";
    findings.push({ kind: "confirmed", text: `It measures the ${label} "${l.title}" (reported ${l.status.replace("_", " ")}).`, sources: [l.ref] });
    if ((l.status === "on_track" || l.status === "done") && run >= 2)
      findings.push({ kind: "hypothesis", text: `"${l.title}" is reported ${l.status.replace("_", " ")} while the KPI that measures it has been off track for ${run} periods — the reported progress may be optimistic.`, sources: [l.ref, i.metricRef] });
  }
  if (!i.links.length) findings.push({ kind: "missing", text: "This KPI is not linked to any Flight Plan item, so its strategic impact cannot be traced." });

  if (i.financial && i.financial.variancePct !== null && (i.metric.comparable_key === "revenue" || i.metric.comparable_key === "ebitda")) {
    findings.push({
      kind: "confirmed",
      text: `Year to date ${i.metric.name.toLowerCase()} is ${i.fmt(i.financial.ytdActual)} against a plan of ${i.fmt(i.financial.ytdPlan)} (${(i.financial.variancePct * 100).toFixed(1)}%), which puts the annual plan at risk if it continues.`,
      sources: [i.metricRef],
    });
  }
  if (i.northStar && (i.metric.comparable_key === "ebitda" || i.metric.comparable_key === "revenue")) {
    const target = i.metric.comparable_key === "ebitda" ? i.northStar.targetEbitda : i.northStar.targetRevenue;
    if (target) findings.push({ kind: "confirmed", text: `The North Star requires ${i.metric.name.toLowerCase()} of ${i.fmt(target)} by FY${i.northStar.targetYear}.`, sources: [i.northStar.ref] });
  }

  // Patterns across KPIs
  const movingTogether = i.related.filter((r) => (r.status === "off_track" || r.status === "at_risk") && r.declining);
  if (movingTogether.length)
    findings.push({
      kind: "hypothesis",
      text: `${movingTogether.length} related KPI${movingTogether.length === 1 ? " is" : "s are"} also deteriorating (${movingTogether.slice(0, 4).map((r) => r.name).join(", ")}); they may share a cause.`,
      sources: movingTogether.slice(0, 4).map((r) => r.ref),
    });

  // Assumptions that may no longer hold
  const keys = new Set(words(i.metric.name));
  for (const a of i.northStar?.assumptions ?? []) {
    const overlap = words(a).filter((w) => keys.has(w));
    if (overlap.length && run >= 2) findings.push({ kind: "hypothesis", text: `The strategic assumption "${a}" may no longer hold.`, sources: i.northStar ? [i.northStar.ref] : [] });
  }

  // Existing interventions
  const open = i.correctiveActions.filter((a) => a.status === "open");
  for (const a of open) findings.push({ kind: "confirmed", text: `An agreed corrective action is in place: "${a.title}"${a.due_date ? `, due ${a.due_date}` : ""}${a.due_date && a.due_date < i.today ? " — now overdue" : ""}.`, sources: [a.ref] });
  for (const x of i.issues) findings.push({ kind: "confirmed", text: `An issue is open against this KPI: "${x.title}".`, sources: [x.ref] });

  const delegateTo: KpiAssessment["delegateTo"] = [];
  const commercial = i.metric.category === "commercial" || ["revenue", "arr", "nrr", "pipeline"].some((k) => (i.metric.comparable_key ?? "").includes(k) || i.metric.name.toLowerCase().includes(k));
  if (commercial) {
    delegateTo.push("commercial");
    findings.push({ kind: "missing", text: "Omni OS holds the KPI but not the deal-level detail behind it; the Commercial Agent has been asked to examine the CRM." });
  } else findings.push({ kind: "missing", text: "The segment, product or site breakdown behind this KPI is not held in Omni OS." });

  const material = run >= 2 || (variancePct !== null && variancePct < -0.1);
  return {
    material,
    offTrackRun: run,
    latest,
    variancePct,
    findings,
    delegateTo,
    needsIntervention: material && open.length === 0,
    severity: run >= 3 || (variancePct !== null && variancePct < -0.2) ? "critical" : material ? "high" : "medium",
  };
}

export function interventionProposal(i: KpiInput, a: KpiAssessment, childFindings: string[]) {
  const evidence = childFindings.length ? ` The Commercial Agent found: ${childFindings.slice(0, 2).join(" ")}` : "";
  return {
    issueTitle: `${i.metric.name} off track for ${a.offTrackRun} periods (${i.fmt(a.latest?.value ?? null)} vs ${i.fmt(a.latest?.target ?? null)})`.slice(0, 300),
    issueDescription: `Raised by the CEO Agent. ${a.findings.filter((f) => f.kind === "confirmed").slice(0, 3).map((f) => f.text).join(" ")}${evidence}`.slice(0, 2000),
    actionTitle: `Agree and start a recovery plan for ${i.metric.name}`.slice(0, 300),
    actionDescription: `Owner to bring a recovery plan with the expected effect on ${i.metric.name} to the next weekly ELT meeting.${evidence}`.slice(0, 2000),
  };
}
