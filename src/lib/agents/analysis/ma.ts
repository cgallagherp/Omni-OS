// Pure analysis for the M&A Agent: duplicate detection and transparent strategic-fit
// scoring against an approved acquisition thesis. Every criterion is met, not met or
// unknown — unknown financials are never estimated and score nothing.
import type { Finding } from "../registry";

export interface Thesis {
  id: string;
  title: string;
  sectors: string[];
  keywords: string[];
  geographies: string[];
  min_revenue: number | null;
  max_revenue: number | null;
  min_ebitda: number | null;
  ownership_preferences: string[];
  exclusions: string[];
  fit_threshold: number;
}

export interface Candidate {
  sourceId: string;
  source: string;
  name: string;
  registrationNumber: string | null;
  website: string | null;
  sector: string | null;
  geography: string | null;
  description: string | null;
  ownership: string | null;
  revenue: number | null;
  ebitda: number | null;
  employees: number | null;
  financialsSource: string | null;
}

export type CriterionResult = "met" | "not_met" | "unknown";
export interface Criterion {
  key: string;
  label: string;
  weight: number;
  result: CriterionResult;
  evidence: string;
}
export interface FitScore {
  score: number;
  knownWeight: number;
  criteria: Criterion[];
  excluded: string | null;
  unknownFinancials: boolean;
}

const SUFFIX = /\b(ltd|limited|plc|llp|llc|inc|group|holdings|uk|co|company|the)\b/g;
export const normalizeName = (n: string) =>
  n.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();

const has = (hay: string | null, needles: string[]) => needles.filter((n) => (hay ?? "").toLowerCase().includes(n.toLowerCase()));

export function scoreFit(t: Thesis, c: Candidate, fmtMoney: (v: number) => string): FitScore {
  const text = `${c.sector ?? ""} ${c.description ?? ""}`;
  const excl = has(c.description, t.exclusions);
  const criteria: Criterion[] = [];
  const add = (key: string, label: string, weight: number, result: CriterionResult, evidence: string) => criteria.push({ key, label, weight, result, evidence });

  const sector = t.sectors.some((s) => s.toLowerCase() === (c.sector ?? "").toLowerCase());
  add("sector", "Sector in thesis", 20, c.sector ? (sector ? "met" : "not_met") : "unknown", c.sector ? `Sector: ${c.sector}` : "Sector not recorded");
  const kw = has(text, t.keywords);
  add("activity", "Activities match thesis keywords", 10, c.description ? (kw.length ? "met" : "not_met") : "unknown", kw.length ? `Mentions ${kw.join(", ")}` : c.description ? "No thesis keywords in the description" : "No description");
  const recurring = has(c.description, ["maintenance", "servicing", "recurring", "contracts", "monitoring", "testing"]);
  add("recurring", "Recurring maintenance revenue", 20, c.description ? (recurring.length ? "met" : "not_met") : "unknown", recurring.length ? `Describes ${recurring.join(", ")}` : c.description ? "Description suggests project or install revenue" : "No description");
  add("geography", "Target region", 15, c.geography ? (t.geographies.includes(c.geography) ? "met" : "not_met") : "unknown", c.geography ?? "Region not recorded");
  if (c.revenue === null) add("revenue", "Revenue in range", 15, "unknown", "Revenue not available from the source");
  else add("revenue", "Revenue in range", 15, (t.min_revenue === null || c.revenue >= t.min_revenue) && (t.max_revenue === null || c.revenue <= t.max_revenue) ? "met" : "not_met", `Revenue ${fmtMoney(c.revenue)} (${c.financialsSource ?? "source"})`);
  if (c.ebitda === null) add("ebitda", "EBITDA above minimum", 10, "unknown", "EBITDA not available from the source");
  else add("ebitda", "EBITDA above minimum", 10, t.min_ebitda === null || c.ebitda >= t.min_ebitda ? "met" : "not_met", `EBITDA ${fmtMoney(c.ebitda)}`);
  add("ownership", "Preferred ownership", 10, c.ownership ? (t.ownership_preferences.includes(c.ownership) ? "met" : "not_met") : "unknown", c.ownership ?? "Ownership not recorded");

  const score = Math.round(criteria.filter((x) => x.result === "met").reduce((n, x) => n + x.weight, 0));
  const knownWeight = criteria.filter((x) => x.result !== "unknown").reduce((n, x) => n + x.weight, 0);
  return { score, knownWeight, criteria, excluded: excl.length ? `Matches thesis exclusion: ${excl.join(", ")}` : null, unknownFinancials: c.revenue === null || c.ebitda === null };
}

export interface Screened {
  candidate: Candidate;
  normalized: string;
  fit: FitScore;
  outcome: "shortlist" | "below_threshold" | "excluded" | "duplicate" | "previously_rejected";
  note: string;
}

/** Criteria the thesis treats as hard requirements: a clear miss rules a company out whatever its score. */
const REQUIRED = new Set(["sector", "geography"]);

export function screen(t: Thesis, candidates: Candidate[], pipeline: Array<{ normalized_name: string; name: string; stage: string; rejection_reason: string | null; registration_number: string | null }>, fmtMoney: (v: number) => string) {
  const byName = new Map(pipeline.map((p) => [p.normalized_name, p]));
  const byReg = new Map(pipeline.filter((p) => p.registration_number).map((p) => [p.registration_number!, p]));
  const seen = new Set<string>();
  const out: Screened[] = [];
  for (const c of candidates) {
    const normalized = normalizeName(c.name);
    const fit = scoreFit(t, c, fmtMoney);
    const existing = byName.get(normalized) ?? (c.registrationNumber ? byReg.get(c.registrationNumber) : undefined);
    let outcome: Screened["outcome"];
    let note: string;
    if (seen.has(normalized)) { outcome = "duplicate"; note = "Duplicate result in this search"; }
    else if (existing?.stage === "rejected") { outcome = "previously_rejected"; note = `Previously rejected: ${existing.rejection_reason ?? "no reason recorded"}`; }
    else if (existing) { outcome = "duplicate"; note = `Already in the pipeline as ${existing.name} (${existing.stage.replace("_", " ")})`; }
    else if (fit.excluded) { outcome = "excluded"; note = fit.excluded; }
    else if (fit.criteria.some((x) => REQUIRED.has(x.key) && x.result === "not_met")) { outcome = "below_threshold"; note = `Outside the thesis: ${fit.criteria.filter((x) => REQUIRED.has(x.key) && x.result === "not_met").map((x) => x.evidence).join("; ")}`; }
    else if (fit.score >= t.fit_threshold) { outcome = "shortlist"; note = `Fit ${fit.score}/100${fit.unknownFinancials ? "; financials unknown" : ""}`; }
    else { outcome = "below_threshold"; note = `Fit ${fit.score}/100 is below the threshold of ${t.fit_threshold}`; }
    seen.add(normalized);
    out.push({ candidate: c, normalized, fit, outcome, note });
  }
  const shortlist = out
    .filter((s) => s.outcome === "shortlist")
    .sort((a, b) => b.fit.score - a.fit.score || Number(a.fit.unknownFinancials) - Number(b.fit.unknownFinancials) || a.candidate.name.localeCompare(b.candidate.name));
  const count = (o: Screened["outcome"]) => out.filter((s) => s.outcome === o).length;
  const findings: Finding[] = [
    { kind: "confirmed", text: `Screened ${candidates.length} companies from authorised sources against "${t.title}".` },
    { kind: "confirmed", text: `${shortlist.length} meet the fit threshold of ${t.fit_threshold}: ${shortlist.map((s) => `${s.candidate.name} (${s.fit.score})`).join(", ") || "none"}.` },
  ];
  if (count("duplicate")) findings.push({ kind: "confirmed", text: `${count("duplicate")} already in the pipeline or duplicated in the results; not added again.` });
  if (count("previously_rejected")) findings.push({ kind: "confirmed", text: `${count("previously_rejected")} previously rejected by management; excluded.` });
  if (count("excluded")) findings.push({ kind: "confirmed", text: `${count("excluded")} match a thesis exclusion (${out.filter((s) => s.outcome === "excluded").map((s) => s.candidate.name).join(", ")}).` });
  const unknown = shortlist.filter((s) => s.fit.unknownFinancials);
  if (unknown.length) findings.push({ kind: "missing", text: `Financials are not available for ${unknown.map((s) => s.candidate.name).join(", ")}; they are recorded as unknown and scored only on known criteria. Verify before any approach.` });
  return { screened: out, shortlist, findings };
}

export function approachDraft(acquirer: string, target: { name: string; sector: string | null; geography: string | null; criteria: Criterion[] }) {
  const met = (k: string) => target.criteria.some((c) => c.key === k && c.result === "met");
  const what = [target.sector ? `${target.sector.toLowerCase()} work` : "work", met("geography") && target.geography ? `across ${target.geography}` : ""].filter(Boolean).join(" ");
  const why = met("recurring") ? ", and particularly the strength of your maintenance and servicing contracts" : "";
  return {
    subject: `Introduction from ${acquirer}`,
    body: `Dear [name],\n\nI lead corporate development at ${acquirer}. We have been following ${target.name}'s ${what}${why}, and wondered whether you would be open to an informal, confidential conversation about how our businesses might work together.\n\nThere is no agenda beyond getting to know each other. Would you have 30 minutes in the next few weeks?\n\nKind regards,\n[sender]`,
    note: `Draft only. Do not include confidential ${acquirer} information or any indication of value.`,
  };
}
