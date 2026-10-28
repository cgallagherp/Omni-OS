// Pure analysis for the Commercial Agent: where the pipeline is weak and why, from the
// company's own CRM records. Breakdowns by owner are pipeline facts, not judgements
// about people.
import type { Finding, SourceRef } from "../registry";
import type { CrmOpportunity } from "../connectors/crm";

export interface PipelineInput {
  today: string;
  opportunities: CrmOpportunity[];
  coverage: { name: string; value: number | null; target: number | null; ref: SourceRef } | null;
  fmtMoney: (v: number) => string;
  crmLabel: string;
  staleDays?: number;
}

export interface Flagged {
  opp: CrmOpportunity;
  reasons: string[];
}

export interface PipelineAssessment {
  findings: Finding[];
  flagged: Flagged[];
  openValue: number;
  staleValue: number;
  topSegment: string | null;
}

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const groupBy = <T,>(xs: T[], k: (x: T) => string) => xs.reduce((m, x) => m.set(k(x), [...(m.get(k(x)) ?? []), x]), new Map<string, T[]>());

export function assessPipeline(i: PipelineInput): PipelineAssessment {
  const staleDays = i.staleDays ?? 21;
  const crm: SourceRef = { type: "crm", id: "crm", label: i.crmLabel, path: "/agents/commercial" };
  const open = i.opportunities.filter((o) => o.status === "open");
  const closed = i.opportunities.filter((o) => o.status !== "open" && o.closedOn && days(o.closedOn, i.today) <= 365);
  const sum = (xs: CrmOpportunity[]) => xs.reduce((n, o) => n + o.amount, 0);
  const findings: Finding[] = [];
  const openValue = sum(open);

  if (i.coverage?.value !== null && i.coverage?.value !== undefined)
    findings.push({ kind: "confirmed", text: `${i.coverage.name} is ${i.coverage.value}x against a target of ${i.coverage.target}x.`, sources: [i.coverage.ref] });
  findings.push({ kind: "confirmed", text: `${open.length} open opportunities worth ${i.fmtMoney(openValue)} in ${i.crmLabel}.`, sources: [crm] });

  const flaggedMap = new Map<string, Flagged>();
  const flag = (o: CrmOpportunity, r: string) => {
    const f = flaggedMap.get(o.id) ?? { opp: o, reasons: [] };
    f.reasons.push(r);
    flaggedMap.set(o.id, f);
  };
  const stale = open.filter((o) => !o.lastActivityOn || days(o.lastActivityOn, i.today) > staleDays);
  const slipped = open.filter((o) => o.closeDate && o.closeDate < i.today);
  for (const o of stale) flag(o, `no activity for ${o.lastActivityOn ? days(o.lastActivityOn, i.today) : "?"} days`);
  for (const o of slipped) flag(o, `close date ${o.closeDate} has passed`);
  const staleValue = sum(stale);
  if (stale.length) findings.push({ kind: "confirmed", text: `${stale.length} open opportunities (${i.fmtMoney(staleValue)}, ${pct(staleValue / Math.max(1, openValue))} of pipeline value) have had no activity for more than ${staleDays} days.`, sources: [crm] });
  if (slipped.length) findings.push({ kind: "confirmed", text: `${slipped.length} open opportunities (${i.fmtMoney(sum(slipped))}) are past their expected close date and have not been updated.`, sources: [crm] });

  // Which segment is driving it
  let topSegment: string | null = null;
  const segs = [...groupBy(open, (o) => o.segment ?? "Unsegmented")].map(([seg, xs]) => {
    const st = xs.filter((o) => flaggedMap.has(o.id));
    return { seg, value: sum(xs), staleValue: sum(st), share: sum(st) / Math.max(1, sum(xs)), n: xs.length };
  });
  segs.sort((a, b) => b.staleValue - a.staleValue);
  if (segs[0]?.staleValue) {
    topSegment = segs[0].seg;
    findings.push({ kind: "confirmed", text: `${segs[0].seg} accounts for ${i.fmtMoney(segs[0].staleValue)} of the stalled or slipped value (${pct(segs[0].staleValue / Math.max(1, sum([...flaggedMap.values()].map((f) => f.opp))))}); ${pct(segs[0].share)} of that segment's open pipeline is stalled.`, sources: [crm] });
  }

  // Historical conversion and cycle, by segment
  for (const [seg, xs] of groupBy(closed, (o) => o.segment ?? "Unsegmented")) {
    if (xs.length < 3) continue;
    const won = xs.filter((o) => o.status === "won");
    const cycle = xs.reduce((n, o) => n + days(o.createdOn, o.closedOn!), 0) / xs.length;
    if (seg === topSegment) findings.push({ kind: "confirmed", text: `Over the last 12 months ${seg} converted ${pct(won.length / xs.length)} of closed opportunities, with an average cycle of ${Math.round(cycle)} days.`, sources: [crm] });
  }

  // New pipeline creation: last 90 days vs the 90 before
  const recent = sum(i.opportunities.filter((o) => days(o.createdOn, i.today) <= 90));
  const prior = sum(i.opportunities.filter((o) => days(o.createdOn, i.today) > 90 && days(o.createdOn, i.today) <= 180));
  if (prior > 0) findings.push({ kind: "confirmed", text: `New pipeline created in the last 90 days: ${i.fmtMoney(recent)} (${recent >= prior ? "+" : ""}${pct((recent - prior) / prior)} on the previous 90 days).`, sources: [crm] });

  // Sources of the stalled value
  const bySource = [...groupBy([...flaggedMap.values()].map((f) => f.opp), (o) => o.source ?? "Unknown")].map(([s, xs]) => ({ s, v: sum(xs) })).sort((a, b) => b.v - a.v);
  if (bySource.length > 1 && topSegment)
    findings.push({ kind: "hypothesis", text: `Stalled ${topSegment.toLowerCase()} deals come mostly from ${bySource[0].s.toLowerCase()} (${i.fmtMoney(bySource[0].v)}); progression after first meetings may be the constraint rather than lead volume.` });
  // Owners: pipeline facts only
  const byOwner = [...groupBy([...flaggedMap.values()].map((f) => f.opp), (o) => o.owner ?? "Unassigned")].map(([o, xs]) => `${o} ${xs.length}`);
  if (byOwner.length) findings.push({ kind: "confirmed", text: `Opportunities needing a next step, by owner: ${byOwner.join(", ")}.`, sources: [crm] });
  findings.push({ kind: "missing", text: "The CRM records do not include stage history or meeting notes, so why individual deals stalled cannot be confirmed from the data." });

  const flagged = [...flaggedMap.values()].sort((a, b) => b.opp.amount - a.opp.amount);
  return { findings, flagged, openValue, staleValue, topSegment };
}

export function crmTaskFor(f: Flagged, due: string) {
  return {
    opportunityId: f.opp.id,
    subject: `Re-engage: ${f.opp.name}`.slice(0, 200),
    notes: `${f.reasons.join("; ")}. Agree the next step with the customer and update the stage and close date. (Created by the Omni OS Commercial Agent.)`,
    owner: f.opp.owner,
    due,
  };
}
