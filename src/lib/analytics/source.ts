// The boundary between Omni OS and the governed data layer. Every intelligence screen and
// every agent tool reads through an AnalyticsSource; swapping the synthetic adapter for a
// Snowflake/dbt adapter changes nothing above this file. All methods return governed
// aggregates or paginated drill-down rows — never whole ledgers.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ArrTotal, CohortCell, DataStatus, Dataset, Domain, LedgerTotal, MetricDefinition, MovementTotal, MovementType, PeopleRow, RetentionInputs, SourceInfo } from "./contracts";
import { SyntheticSource } from "./adapters/synthetic";
import { WarehouseSource } from "./adapters/warehouse";

export type Db = SupabaseClient<Database>;
export type Filters = Record<string, string[] | Record<string, string[]>>;

export interface Dimension { domain: "revenue" | "cost"; key: string; label: string; values: Array<{ key: string; label: string }> }
export interface CustomerRow { id: string; name: string; segment: string | null; sector: string | null; business_unit: string | null; origin: string; account_owner: string | null; crm_id: string | null; arr: number; arr_compare: number }
export interface MovementCustomerRow { id: string; name: string; segment: string | null; sector: string | null; business_unit: string | null; account_owner: string | null; amount: number; months: number }
export interface Paged<T> { rows: T[]; total: number; totalAmount?: number }
export interface CustomerDetail {
  customer: Database["public"]["Tables"]["ri_customers"]["Row"];
  history: Array<{ month: string; product_key: string; arr: number }>;
  movements: Array<{ month: string; product_key: string; type: MovementType; amount: number; rule_key: string }>;
  contracts: Database["public"]["Tables"]["ri_contracts"]["Row"][];
  cohort: Database["public"]["Tables"]["ri_cohorts"]["Row"] | null;
}
export interface TransactionRow { id: string; posted_on: string; month: string; account_code: string; cost_centre_code: string; supplier_id: string | null; reference: string; description: string; amount: number; source_system: string }
export interface DqRow { id: string; domain: string; check_key: string; title: string; severity: string; status: "pass" | "warn" | "fail"; month: string | null; affected_count: number; amount: number | null; sample: unknown; source_system: string; owner_function: string; remediation: string; detected_at: string }

export interface AnalyticsSource {
  readonly companyId: string;
  readonly info: SourceInfo;
  domains(): Promise<Domain[]>;
  datasets(): Promise<Dataset[]>;
  definitions(): Promise<MetricDefinition[]>;
  definitionHistory(key: string): Promise<MetricDefinition[]>;
  dimensions(domain: "revenue" | "cost"): Promise<Dimension[]>;
  periodStatus(domain: "revenue" | "cost" | "people"): Promise<Map<string, { status: DataStatus; reason: string | null }>>;
  targets(metricKey: string): Promise<Map<string, { budget?: number; target?: number; forecast?: number }>>;

  // revenue
  products(): Promise<Array<{ key: string; name: string; business_unit: string }>>;
  arrAt(months: string[], filters?: Filters, group?: string | null, ref?: string): Promise<ArrTotal[]>;
  movements(from: string, to: string, filters?: Filters, group?: string | null): Promise<MovementTotal[]>;
  retention(start: string, end: string, filters?: Filters, group?: string | null, acquiredWait?: number): Promise<RetentionInputs[]>;
  cohorts(o: { last: string; cohort?: "month" | "quarter" | "year"; dimension?: string | null; filters?: Filters; age?: "month" | "quarter" | "year" }): Promise<CohortCell[]>;
  customers(o: { month: string; compare: string; filters?: Filters; search?: string | null; sort?: "arr" | "change" | "name"; limit?: number; offset?: number }): Promise<Paged<CustomerRow>>;
  movementCustomers(o: { from: string; to: string; type: MovementType; filters?: Filters; limit?: number; offset?: number }): Promise<Paged<MovementCustomerRow>>;
  customer(id: string): Promise<CustomerDetail | null>;
  reconciliation(): Promise<Database["public"]["Tables"]["ri_finance_recon"]["Row"][]>;
  dataQuality(domain?: "revenue" | "cost" | "people"): Promise<DqRow[]>;
  restatements(): Promise<Database["public"]["Tables"]["an_restatements"]["Row"][]>;
  closes(domain: "revenue" | "cost"): Promise<Database["public"]["Tables"]["an_period_closes"]["Row"][]>;

  // cost
  ledger(from: string, to: string, scenarios: Array<"actual" | "budget" | "forecast">, group?: string | null, filters?: Filters): Promise<LedgerTotal[]>;
  accounts(): Promise<Database["public"]["Tables"]["ci_accounts"]["Row"][]>;
  costCentres(): Promise<Database["public"]["Tables"]["ci_cost_centres"]["Row"][]>;
  suppliers(): Promise<Database["public"]["Tables"]["ci_suppliers"]["Row"][]>;
  people(from: string, to: string): Promise<PeopleRow[]>;
  transactions(o: { from: string; to: string; account?: string | null; costCentre?: string | null; supplier?: string | null; limit?: number; offset?: number }): Promise<Paged<TransactionRow>>;
}

export { SourceUnavailable } from "./errors";

/** The governed source configured for a company, or null when none is connected. */
export async function getSource(db: Db, companyId: string): Promise<AnalyticsSource | null> {
  const { data } = await db.from("an_sources").select("*").eq("company_id", companyId).maybeSingle();
  if (!data) return null;
  const info: SourceInfo = { adapter: data.adapter as SourceInfo["adapter"], label: data.label, is_synthetic: data.is_synthetic, business_model: data.business_model as SourceInfo["business_model"], currency: data.currency };
  return data.adapter === "warehouse" ? new WarehouseSource(companyId, info, data.config as Record<string, unknown>) : new SyntheticSource(db, companyId, info);
}
