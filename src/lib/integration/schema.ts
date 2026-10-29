// The structured integration playbook and plan. Everything generated (by Claude or the
// rule-based extractor) or edited by management is validated against these schemas before
// it is stored. Timing is relative to completion (day 0), so the template is reusable.
import { z } from "zod";

export const BASES = ["established", "inferred", "recommended"] as const;
export type Basis = (typeof BASES)[number];
export const BASIS_LABEL: Record<Basis, string> = {
  established: "Established requirement",
  inferred: "Inferred practice",
  recommended: "AI recommendation",
};
export const BASIS_HELP: Record<Basis, string> = {
  established: "Explicitly documented in company materials, or consistently evidenced across previous acquisitions.",
  inferred: "A pattern from previous transactions, not formally established as company policy.",
  recommended: "Suggested improvement or addition. Not company practice until management accepts it.",
};

export const citation = z.object({
  source_id: z.string().uuid(),
  chunk_id: z.string().uuid().nullable(),
  quote: z.string().max(600),
  source_title: z.string().max(300).optional(),
});
export type Citation = z.infer<typeof citation>;

export const ANCHORS = ["pre_completion", "day_1", "days", "ongoing"] as const;
export const timing = z.object({
  anchor: z.enum(ANCHORS),
  start_offset_days: z.number().int().min(-365).max(1095),
  due_offset_days: z.number().int().min(-365).max(1095),
  label: z.string().max(80),
});
export type Timing = z.infer<typeof timing>;

const key = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const decision = z.enum(["pending", "accepted", "rejected"]);

export const activity = z.object({
  key,
  title: z.string().min(2).max(300),
  description: z.string().max(2000).default(""),
  accountable_function: z.string().max(120).default(""),
  timing,
  milestone: z.boolean().default(false),
  critical: z.boolean().default(false),
  completion_criteria: z.string().max(1000).default(""),
  evidence_required: z.string().max(1000).default(""),
  approval_required: z.string().max(200).nullable().default(null),
  depends_on: z.array(key).max(20).default([]),
  basis: z.enum(BASES),
  rationale: z.string().max(1500).default(""),
  citations: z.array(citation).max(12).default([]),
  decision: decision.default("pending"),
  human_only: z.boolean().default(false),
  human_only_reason: z.string().max(300).nullable().default(null),
  applies_to: z.array(z.string().max(80)).max(10).default([]),
});
export type Activity = z.infer<typeof activity>;

export const workstream = z.object({
  key,
  name: z.string().min(2).max(120),
  objective: z.string().max(1000).default(""),
  accountable_function: z.string().max(120).default(""),
  basis: z.enum(BASES),
  rationale: z.string().max(1500).default(""),
  citations: z.array(citation).max(12).default([]),
  decision: decision.default("pending"),
  activities: z.array(activity).max(60),
  applies_to: z.array(z.string().max(80)).max(10).default([]),
});
export type Workstream = z.infer<typeof workstream>;

const statement = z.object({ text: z.string().min(2).max(1500), basis: z.enum(BASES), citations: z.array(citation).max(12).default([]) });
export type Statement = z.infer<typeof statement>;

export const playbookContent = z.object({
  summary: z.string().max(3000).default(""),
  philosophy: z.array(statement).max(20).default([]),
  acquisition_types: z.array(z.object({ name: z.string().min(2).max(120), when: z.string().max(1000), basis: z.enum(BASES), citations: z.array(citation).max(12).default([]) })).max(12).default([]),
  workstreams: z.array(workstream).max(20),
  risks: z.array(z.object({ key, description: z.string().min(2).max(1000), escalation_trigger: z.string().max(500).default(""), escalate_to: z.string().max(120).default(""), basis: z.enum(BASES), citations: z.array(citation).max(12).default([]) })).max(40).default([]),
  kpis: z.array(z.object({ key, name: z.string().min(2).max(300), target: z.string().max(200).default(""), basis: z.enum(BASES), citations: z.array(citation).max(12).default([]) })).max(30).default([]),
  synergy_rules: z.array(statement).max(20).default([]),
  conflicts: z.array(z.object({ key, topic: z.string().min(2).max(300), positions: z.array(z.object({ text: z.string().max(1000), citations: z.array(citation).max(6).default([]) })).min(2).max(6), resolution: z.string().max(1500).default("") })).max(30).default([]),
  gaps: z.array(z.object({ key, question: z.string().min(2).max(500), context: z.string().max(1000).default(""), answer: z.string().max(1500).default("") })).max(40).default([]),
  lessons: z.array(z.object({ key, text: z.string().min(2).max(1000), citations: z.array(citation).max(12).default([]), applied_in: z.string().max(64).nullable().default(null) })).max(40).default([]),
  stats: z.object({ sources: z.number().int(), chunks: z.number().int(), citations_checked: z.number().int(), citations_rejected: z.number().int(), demoted: z.number().int() }).optional(),
});
export type PlaybookContent = z.infer<typeof playbookContent>;

// ---------------------------------------------------------------------------
// Acquisition-specific plan (draft JSON → materialised on approval)
// ---------------------------------------------------------------------------
export const ORIGINS = ["playbook", "acquisition", "recommended"] as const;
export type Origin = (typeof ORIGINS)[number];
export const ORIGIN_LABEL: Record<Origin, string> = { playbook: "From the playbook", acquisition: "Acquisition-specific", recommended: "Suggested improvement" };

export const planActivity = z.object({
  key,
  title: z.string().min(2).max(300),
  description: z.string().max(2000).default(""),
  accountable_function: z.string().max(120).default(""),
  owner_crew_id: z.string().uuid().nullable().default(null),
  start_offset_days: z.number().int().min(-365).max(1095),
  due_offset_days: z.number().int().min(-365).max(1095),
  timing_label: z.string().max(80).default(""),
  milestone: z.boolean().default(false),
  critical: z.boolean().default(false),
  completion_criteria: z.string().max(1000).default(""),
  evidence_required: z.string().max(1000).default(""),
  approval_required: z.string().max(200).nullable().default(null),
  depends_on: z.array(key).max(20).default([]),
  origin: z.enum(ORIGINS),
  playbook_activity_key: z.string().max(64).nullable().default(null),
  deviation_note: z.string().max(1500).nullable().default(null),
  basis: z.enum(BASES).nullable().default(null),
  citations: z.array(citation).max(12).default([]),
  decision: decision.default("pending"),
  included: z.boolean().default(true),
  human_only: z.boolean().default(false),
  human_only_reason: z.string().max(300).nullable().default(null),
});
export type PlanActivity = z.infer<typeof planActivity>;

export const planWorkstream = z.object({
  key,
  name: z.string().min(2).max(120),
  objective: z.string().max(1000).default(""),
  accountable_function: z.string().max(120).default(""),
  owner_crew_id: z.string().uuid().nullable().default(null),
  origin: z.enum(ORIGINS),
  included: z.boolean().default(true),
  deviation_note: z.string().max(1500).nullable().default(null),
  activities: z.array(planActivity).max(60),
});
export type PlanWorkstream = z.infer<typeof planWorkstream>;

export const SYNERGY_CATEGORIES = ["revenue", "cross_sell", "cost", "procurement", "operational", "product", "technology", "capability", "other"] as const;
export type SynergyCategory = (typeof SYNERGY_CATEGORIES)[number];
export const SYNERGY_LABEL: Record<SynergyCategory, string> = {
  revenue: "Revenue growth", cross_sell: "Cross-selling", cost: "Cost savings", procurement: "Procurement", operational: "Operational efficiency",
  product: "Product integration", technology: "Technology savings", capability: "Strategic capability", other: "Other",
};

export const planSynergy = z.object({
  key,
  category: z.enum(SYNERGY_CATEGORIES),
  description: z.string().min(2).max(1000),
  unit: z.enum(["currency", "number", "percent"]).default("currency"),
  baseline: z.number().default(0),
  target: z.number(),
  measurement: z.enum(["annual_run_rate", "cumulative", "monthly"]).default("annual_run_rate"),
  owner_crew_id: z.string().uuid().nullable().default(null),
  supporting_activity_keys: z.array(key).max(20).default([]),
  evidence_source: z.string().max(500).default(""),
  realisation_offset_days: z.number().int().min(0).max(1825).default(365),
});
export type PlanSynergy = z.infer<typeof planSynergy>;

export const planContent = z.object({
  summary: z.string().max(3000).default(""),
  integration_model: z.string().max(200).default(""),
  workstreams: z.array(planWorkstream).max(20),
  synergies: z.array(planSynergy).max(30).default([]),
  deviations: z.array(z.object({ text: z.string().max(1500), reason: z.string().max(1500), kind: z.enum(["omitted", "added", "changed"]) })).max(60).default([]),
  risks: z.array(z.object({ text: z.string().max(1000), mitigation: z.string().max(1000).default(""), source: z.string().max(300).default("") })).max(30).default([]),
  decisions_required: z.array(z.object({ text: z.string().max(1000), by: z.string().max(120).default("") })).max(30).default([]),
  missing_information: z.array(z.string().max(500)).max(30).default([]),
  critical_path: z.array(key).max(40).default([]),
});
export type PlanContent = z.infer<typeof planContent>;

// ---------------------------------------------------------------------------
// Consequential work the agent must never perform: people execute it, after approval.
// Applied in code to every generated or edited activity — not left to the model.
// ---------------------------------------------------------------------------
const HUMAN_ONLY: Array<[RegExp, string]> = [
  [/\b(terminat|dismiss|redundan|make .* redundant|layoff|lay off)/i, "Employment decisions are made and executed by people"],
  [/\b(employment contract|contract of employment|terms and conditions of employment|change .*salar|pay change)/i, "Employment contracts are changed only by people"],
  [/\b(customer contract|contractual terms|price change|repric|change .*terms)/i, "Customer contractual terms are changed only by people"],
  [/\b(cancel|terminate) .*(supplier|vendor|agreement|contract)/i, "Supplier agreements are cancelled only by people"],
  [/\b(delete|purge|decommission|migrate) .*(production|live) .*data|\bdata migration\b|\bmigrate (customer )?records\b|\bcutover\b/i, "Production data migrations and deletions are run and signed off by people"],
  [/\b(regulated|clinical governance|regulatory procedure|standard operating procedure)/i, "Regulated operating procedures are changed only by people"],
  [/\b(sign|execute|enter into) .*(agreement|contract|deed)|\blegally binding\b/i, "Legally binding commitments are made only by people"],
  [/\b(spend|expenditure|purchase order|capex|invest)\b/i, "Expenditure is committed only within people's delegated authority"],
  [/\b(disclose|share) .*(confidential|transaction)/i, "Confidential transaction information is disclosed only by people"],
];
export function humanOnly(text: string): string | null {
  for (const [re, reason] of HUMAN_ONLY) if (re.test(text)) return reason;
  return null;
}

/** Stamp the human-only rule onto every activity (never trust a generator to do it). */
export function enforceHumanOnly<T extends { title: string; description: string; human_only: boolean; human_only_reason: string | null }>(a: T): T {
  const reason = humanOnly(`${a.title} ${a.description}`);
  return reason ? { ...a, human_only: true, human_only_reason: a.human_only_reason ?? reason } : a;
}

/** A copy of an object without some keys. */
export function omit<T extends object, K extends keyof T>(o: T, keys: K[]): Omit<T, K> {
  const out = { ...o };
  for (const k of keys) delete out[k];
  return out;
}

export const slug = (s: string, fallback = "item") =>
  (s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || fallback);

/** Unique keys within a list. */
export function uniqueKey(base: string, taken: Set<string>) {
  let k = slug(base);
  let n = 2;
  while (taken.has(k)) k = `${slug(base).slice(0, 44)}_${n++}`;
  taken.add(k);
  return k;
}

export function timingLabel(t: Pick<Timing, "anchor" | "due_offset_days">) {
  if (t.anchor === "pre_completion") return "Pre-completion";
  if (t.anchor === "day_1") return "Day 1";
  if (t.anchor === "ongoing") return "Ongoing";
  return `By day ${t.due_offset_days}`;
}
