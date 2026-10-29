// Synthetic adapter: reads the governed-layer contract tables that the synthetic pipeline
// loads into Postgres, through the caller's own client (user session or agent principal),
// so company and data-domain permissions are enforced by RLS on every call.
import type { CohortCell, DataStatus, Dataset, Domain, LedgerTotal, MetricDefinition, MovementTotal, PeopleRow, RetentionInputs, SourceInfo } from "../contracts";
import { SourceUnavailable } from "../errors";
import type { AnalyticsSource, Db, DqRow, Filters } from "../source";

const PAGE = 1000;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** PostgREST returns at most 1,000 rows per request; read every page so nothing is silently truncated. */
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) throw new SourceUnavailable(error.code === "42501" ? "You do not have access to this data." : error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export class SyntheticSource implements AnalyticsSource {
  constructor(private readonly db: Db, readonly companyId: string, readonly info: SourceInfo) {}

  async domains() {
    const { data } = await this.db.rpc("an_my_domains", { p_company: this.companyId });
    return (data ?? []) as Domain[];
  }
  async datasets() {
    const { data } = await this.db.from("an_datasets").select("*").eq("company_id", this.companyId).order("key");
    return (data ?? []) as Dataset[];
  }
  async definitions() {
    const { data } = await this.db.from("an_metric_definitions").select("*").eq("company_id", this.companyId).eq("status", "active").order("key");
    return (data ?? []) as unknown as MetricDefinition[];
  }
  async definitionHistory(key: string) {
    const { data } = await this.db.from("an_metric_definitions").select("*").eq("company_id", this.companyId).eq("key", key).order("version", { ascending: false });
    return (data ?? []) as unknown as MetricDefinition[];
  }
  async dimensions(domain: "revenue" | "cost") {
    const { data } = await this.db.from("an_dimensions").select("*").eq("company_id", this.companyId).eq("domain", domain).order("sort_order");
    return (data ?? []).map((d) => ({ domain, key: d.key, label: d.label, values: (d.values as Array<{ key: string; label: string }>) ?? [] }));
  }
  async periodStatus(domain: "revenue" | "cost" | "people") {
    const rows = await all((a, b) => this.db.from("an_period_status").select("month, status, reason").eq("company_id", this.companyId).eq("domain", domain).order("month").range(a, b));
    return new Map(rows.map((r) => [r.month, { status: r.status as DataStatus, reason: r.reason }]));
  }
  async targets(metricKey: string) {
    const rows = await all((a, b) => this.db.from("an_targets").select("month, scenario, value").eq("company_id", this.companyId).eq("metric_key", metricKey).order("month").range(a, b));
    const out = new Map<string, { budget?: number; target?: number; forecast?: number }>();
    for (const r of rows) out.set(r.month, { ...out.get(r.month), [r.scenario]: num(r.value) });
    return out;
  }

  // revenue ---------------------------------------------------------------------
  async products() {
    const { data, error } = await this.db.from("ri_products").select("key, name, business_unit").eq("company_id", this.companyId).order("name");
    if (error) throw new SourceUnavailable(error.message);
    return data ?? [];
  }
  async arrAt(months: string[], filters: Filters = {}, group: string | null = null, ref?: string) {
    const rows = await all((a, b) => this.db.rpc("ri_arr_at", { p_company: this.companyId, p_months: months, p_filters: filters as never, p_group: group ?? undefined, p_ref: ref }).range(a, b));
    return rows.map((r) => ({ grp: r.grp, month: r.month, arr: num(r.arr), customers: num(r.customers) }));
  }
  async movements(from: string, to: string, filters: Filters = {}, group: string | null = null): Promise<MovementTotal[]> {
    const rows = await all((a, b) => this.db.rpc("ri_movement_totals", { p_company: this.companyId, p_from: from, p_to: to, p_filters: filters as never, p_group: group ?? undefined }).range(a, b));
    return rows.map((r) => ({ grp: r.grp, month: r.month, type: r.type as MovementTotal["type"], amount: num(r.amount), customers: num(r.customers) }));
  }
  async retention(start: string, end: string, filters: Filters = {}, group: string | null = null, acquiredWait = 12): Promise<RetentionInputs[]> {
    const rows = await all((a, b) => this.db.rpc("ri_retention", { p_company: this.companyId, p_start: start, p_end: end, p_filters: filters as never, p_group: group ?? undefined, p_acquired_wait: acquiredWait }).range(a, b));
    return rows.map((r) => ({
      grp: r.grp, opening_arr: num(r.opening_arr), opening_logos: num(r.opening_logos), expansion: num(r.expansion), contraction: num(r.contraction), churn: num(r.churn),
      reactivation: num(r.reactivation), transfer: num(r.transfer), migration: num(r.migration), adjustment: num(r.adjustment), end_arr: num(r.end_arr), end_logos: num(r.end_logos),
    }));
  }
  async cohorts(o: { last: string; cohort?: "month" | "quarter" | "year"; dimension?: string | null; filters?: Filters; age?: "month" | "quarter" | "year" }): Promise<CohortCell[]> {
    const rows = await all((a, b) => this.db.rpc("ri_cohort_matrix", { p_company: this.companyId, p_last: o.last, p_cohort: o.cohort ?? "quarter", p_dimension: o.dimension ?? undefined, p_filters: (o.filters ?? {}) as never, p_age: o.age ?? "quarter" }).range(a, b));
    return rows.map((r) => ({ cohort: r.cohort, age: r.age, members: num(r.members), initial_arr: num(r.initial_arr), arr: num(r.arr), active: num(r.active) }));
  }
  async customers(o: { month: string; compare: string; filters?: Filters; search?: string | null; sort?: "arr" | "change" | "name"; limit?: number; offset?: number }) {
    const { data, error } = await this.db.rpc("ri_customer_list", { p_company: this.companyId, p_month: o.month, p_compare: o.compare, p_filters: (o.filters ?? {}) as never, p_search: o.search || undefined, p_sort: o.sort ?? "arr", p_limit: o.limit ?? 50, p_offset: o.offset ?? 0 });
    if (error) throw new SourceUnavailable(error.message);
    return { rows: (data ?? []).map((r) => ({ ...r, arr: num(r.arr), arr_compare: num(r.arr_compare) })), total: num(data?.[0]?.total) };
  }
  async movementCustomers(o: { from: string; to: string; type: MovementTotal["type"]; filters?: Filters; limit?: number; offset?: number }) {
    const { data, error } = await this.db.rpc("ri_movement_customers", { p_company: this.companyId, p_from: o.from, p_to: o.to, p_type: o.type, p_filters: (o.filters ?? {}) as never, p_limit: o.limit ?? 50, p_offset: o.offset ?? 0 });
    if (error) throw new SourceUnavailable(error.message);
    return { rows: (data ?? []).map((r) => ({ ...r, amount: num(r.amount), months: num(r.months) })), total: num(data?.[0]?.total), totalAmount: num(data?.[0]?.total_amount) };
  }
  async customer(id: string) {
    const { data: customer } = await this.db.from("ri_customers").select("*").eq("company_id", this.companyId).eq("id", id).maybeSingle();
    if (!customer) return null;
    const [history, movements, contracts, cohort] = await Promise.all([
      all((a, b) => this.db.from("ri_arr_monthly").select("month, product_key, arr").eq("company_id", this.companyId).eq("customer_id", id).order("month").range(a, b)),
      all((a, b) => this.db.from("ri_movements").select("month, product_key, type, amount, rule_key").eq("company_id", this.companyId).eq("customer_id", id).order("month").range(a, b)),
      this.db.from("ri_contracts").select("*").eq("company_id", this.companyId).eq("customer_id", id).order("product_key"),
      this.db.from("ri_cohorts").select("*").eq("company_id", this.companyId).eq("customer_id", id).maybeSingle(),
    ]);
    return {
      customer,
      history: history.map((h) => ({ ...h, arr: num(h.arr) })),
      movements: movements.map((m) => ({ ...m, type: m.type as MovementTotal["type"], amount: num(m.amount) })),
      contracts: contracts.data ?? [],
      cohort: cohort.data ?? null,
    };
  }
  async reconciliation() {
    return all((a, b) => this.db.from("ri_finance_recon").select("*").eq("company_id", this.companyId).order("month").range(a, b));
  }
  async dataQuality(domain?: "revenue" | "cost" | "people") {
    let q = this.db.from("an_dq_results").select("*").eq("company_id", this.companyId);
    if (domain) q = q.eq("domain", domain);
    const { data } = await q.order("severity").order("title");
    return (data ?? []) as DqRow[];
  }
  async restatements() {
    const { data } = await this.db.from("an_restatements").select("*").eq("company_id", this.companyId).order("restated_at", { ascending: false });
    return data ?? [];
  }
  async closes(domain: "revenue" | "cost") {
    return all((a, b) => this.db.from("an_period_closes").select("*").eq("company_id", this.companyId).eq("domain", domain).order("month").order("version").range(a, b));
  }

  // cost ------------------------------------------------------------------------
  async ledger(from: string, to: string, scenarios: Array<"actual" | "budget" | "forecast">, group: string | null = null, filters: Filters = {}): Promise<LedgerTotal[]> {
    const rows = await all((a, b) => this.db.rpc("ci_ledger_totals", { p_company: this.companyId, p_from: from, p_to: to, p_scenarios: scenarios, p_group: group ?? undefined, p_filters: filters as never }).range(a, b));
    return rows.map((r) => ({ grp: r.grp, month: r.month, scenario: r.scenario as LedgerTotal["scenario"], section: r.section as LedgerTotal["section"], line: r.line, amount: num(r.amount) }));
  }
  async accounts() {
    const { data, error } = await this.db.from("ci_accounts").select("*").eq("company_id", this.companyId).order("code");
    if (error) throw new SourceUnavailable(error.message);
    return data ?? [];
  }
  async costCentres() {
    const { data } = await this.db.from("ci_cost_centres").select("*").eq("company_id", this.companyId).order("code");
    return data ?? [];
  }
  async suppliers() {
    const { data } = await this.db.from("ci_suppliers").select("*").eq("company_id", this.companyId).order("name");
    return data ?? [];
  }
  async people(from: string, to: string): Promise<PeopleRow[]> {
    const rows = await all((a, b) => this.db.from("ci_people").select("*").eq("company_id", this.companyId).gte("month", from).lte("month", to).order("month").range(a, b));
    return rows.map((r) => ({ month: r.month, scenario: r.scenario as PeopleRow["scenario"], department: r.department, headcount: r.headcount, fte: num(r.fte), employment_cost: num(r.employment_cost), hires: r.hires, leavers: r.leavers, open_roles: r.open_roles }));
  }
  async transactions(o: { from: string; to: string; account?: string | null; costCentre?: string | null; supplier?: string | null; limit?: number; offset?: number }) {
    let q = this.db.from("ci_transactions").select("*", { count: "exact" }).eq("company_id", this.companyId).gte("month", o.from).lte("month", o.to);
    if (o.account) q = q.eq("account_code", o.account);
    if (o.costCentre) q = q.eq("cost_centre_code", o.costCentre);
    if (o.supplier) q = q.eq("supplier_id", o.supplier);
    const limit = Math.min(o.limit ?? 50, 200);
    const { data, count, error } = await q.order("posted_on", { ascending: false }).order("reference").range(o.offset ?? 0, (o.offset ?? 0) + limit - 1);
    if (error) throw new SourceUnavailable(error.message);
    return { rows: (data ?? []).map((t) => ({ ...t, amount: num(t.amount) })), total: count ?? 0 };
  }
}
