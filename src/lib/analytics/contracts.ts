// Data contracts between the governed data layer and Omni OS. These are the shapes a
// Snowflake/dbt-backed adapter must return; the synthetic adapter returns the same shapes.
// See docs/intelligence-data-contracts.md for grain, keys and refresh requirements.
import { z } from "zod";

export const CALC_VERSION = "omni-ref-2026.10.1";

export const DOMAINS = ["revenue", "cost", "people", "transactions"] as const;
export type Domain = (typeof DOMAINS)[number];
export const DOMAIN_LABEL: Record<Domain, string> = { revenue: "Revenue and customers", cost: "Costs and P&L", people: "People costs (aggregated)", transactions: "Transaction detail" };

export const MOVEMENT_TYPES = ["new", "expansion", "contraction", "churn", "reactivation", "acquired", "disposed", "migration", "transfer", "correction", "reclassification", "unclassified"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  new: "New ARR",
  expansion: "Expansion",
  contraction: "Contraction",
  churn: "Churned ARR",
  reactivation: "Reactivation",
  acquired: "Acquired ARR",
  disposed: "Disposed ARR",
  migration: "Product migration",
  transfer: "Customer transfer",
  correction: "Correction",
  reclassification: "Reclassification",
  unclassified: "Unclassified",
};
export type MovementGroup = "organic" | "inorganic" | "adjustment" | "unclassified";
export const MOVEMENT_GROUP: Record<MovementType, MovementGroup> = {
  new: "organic", expansion: "organic", contraction: "organic", churn: "organic", reactivation: "organic",
  acquired: "inorganic", disposed: "inorganic",
  migration: "adjustment", transfer: "adjustment", correction: "adjustment", reclassification: "adjustment",
  unclassified: "unclassified",
};

/** Source-system reason codes on an ARR change, and how each is classified. */
export const REASON_RULES: Record<string, { type: MovementType; rule: string }> = {
  migration: { type: "migration", rule: "Contract amendment flagged as a product migration" },
  transfer: { type: "transfer", rule: "Customer transfer between entities (e.g. a merger of authorities)" },
  correction: { type: "correction", rule: "Correction of a prior-period data error" },
  reclassification: { type: "reclassification", rule: "Reclassification between recurring and non-recurring" },
  acquisition: { type: "acquired", rule: "ARR brought in by an acquisition" },
  disposal: { type: "disposed", rule: "ARR removed by a disposal" },
};

// ---------------------------------------------------------------------------
// Rows (grain noted)
// ---------------------------------------------------------------------------
/** fct_arr_monthly — one row per company × month × customer × product */
export const arrMonthlyRow = z.object({
  month: z.string(),
  customer_id: z.string(),
  product_key: z.string(),
  arr: z.number().nonnegative(),
  change_reason: z.string().nullable().optional(),
});
export type ArrMonthlyRow = z.infer<typeof arrMonthlyRow>;

/** fct_arr_movements — one row per company × month × customer × product */
export const movementRow = z.object({
  month: z.string(),
  customer_id: z.string(),
  product_key: z.string(),
  type: z.enum(MOVEMENT_TYPES),
  amount: z.number(),
  rule_key: z.string(),
  calc_version: z.string(),
});
export type MovementRow = z.infer<typeof movementRow>;

export interface CustomerAttrs {
  id: string;
  origin: "organic" | "acquired";
  acquired_on?: string | null;
  disposed_on?: string | null;
  first_arr_month?: string | null;
  [k: string]: unknown;
}

/** Aggregated movement totals as returned by the governed query interface */
export interface MovementTotal { grp: string; month: string; type: MovementType; amount: number; customers: number }
export interface ArrTotal { grp: string; month: string; arr: number; customers: number }
export interface RetentionInputs {
  grp: string;
  opening_arr: number;
  opening_logos: number;
  expansion: number;
  contraction: number;
  churn: number;
  reactivation: number;
  transfer: number;
  migration: number;
  adjustment: number;
  end_arr: number;
  end_logos: number;
}
export interface CohortCell { cohort: string; age: number; members: number; initial_arr: number; arr: number; active: number }

export interface LedgerTotal { grp: string; month: string; scenario: "actual" | "budget" | "forecast"; section: "revenue" | "cogs" | "opex" | "below_ebitda"; line: string; amount: number }
export interface PeopleRow { month: string; scenario: "actual" | "budget"; department: string; headcount: number; fte: number; employment_cost: number; hires: number; leavers: number; open_roles: number }

// ---------------------------------------------------------------------------
// Governance metadata
// ---------------------------------------------------------------------------
export type DataStatus = "validated" | "provisional" | "incomplete" | "missing";
export const retentionPolicy = z.object({
  window_months: z.number().int().min(1).max(36).default(12),
  /** acquired customers join the retention base after this many months of ownership */
  acquired_wait_months: z.number().int().min(0).max(36).default(12),
  /** a cohort customer that churns and returns within the window */
  reactivation: z.enum(["include_in_nrr", "exclude"]).default("include_in_nrr"),
  /** ARR transferred to a successor entity (e.g. merged councils) */
  transfers: z.enum(["neutral", "count_as_churn"]).default("neutral"),
  /** corrections and reclassifications never count as retention movements */
  adjustments: z.literal("exclude").default("exclude"),
  currency: z.string().default("Reported in GBP; no FX translation"),
});
export type RetentionPolicy = z.infer<typeof retentionPolicy>;

export interface MetricDefinition {
  key: string;
  version: number;
  name: string;
  domain: "revenue" | "cost" | "people";
  unit: "currency" | "percent" | "ratio" | "count" | "fte" | "currency_per_fte";
  definition: string;
  formula: string;
  grain: string;
  periods: string[];
  policy: Record<string, unknown>;
  comparability_group: string | null;
  source_dataset: string;
  direction: "higher_is_better" | "lower_is_better" | "neutral";
  effective_from: string;
  change_note: string;
}

export interface Dataset {
  key: string;
  domain: string;
  label: string;
  source_system: string;
  model: string;
  calc_version: string;
  refreshed_at: string;
  coverage_start: string | null;
  coverage_end: string | null;
  row_count: number;
  status: "current" | "stale" | "failed";
}

export interface SourceInfo {
  adapter: "synthetic" | "warehouse";
  label: string;
  is_synthetic: boolean;
  business_model: "recurring_software" | "recurring_services" | "services";
  currency: string;
}

/** What every material number on screen carries */
export interface Provenance {
  metric: MetricDefinition | null;
  period: string;
  dataset: Dataset | null;
  status: DataStatus;
  synthetic: boolean;
  calcVersion: string;
  drill?: string;
}

/** Display status: synthetic data is never presented as verified. */
export function statusLabel(s: DataStatus, synthetic: boolean): string {
  const base = { validated: "Validated", provisional: "Provisional", incomplete: "Incomplete", missing: "Missing" }[s];
  return synthetic ? `Synthetic · ${s === "validated" ? "reconciles" : base.toLowerCase()}` : base;
}
