// Loads a generated synthetic dataset into the governed-layer contract tables. This is
// the stand-in for the future Snowflake/dbt sync: the application itself has no write
// access to these tables.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database.types";
import { CALC_VERSION, type Domain } from "../../../src/lib/analytics/contracts";
import { definitionsFor } from "../../../src/lib/analytics/definitions";
import { generate, type Generated, type Profile } from "./generate";
import { ASHWORTH, CIVICLINE } from "./profiles";

type Db = SupabaseClient<Database>;
type Tbl = keyof Database["public"]["Tables"];

export const DATA: Record<string, { profile: Profile; data: Generated }> = {};
/** Generated once per seed run, so KPI series and governed tables come from the same numbers. */
export function intelligenceFor(slug: "civicline" | "ashworth") {
  if (!DATA[slug]) {
    const profile = slug === "civicline" ? CIVICLINE : ASHWORTH;
    DATA[slug] = { profile, data: generate(profile) };
  }
  return DATA[slug];
}

async function put<T extends Tbl>(db: Db, table: T, rows: Database["public"]["Tables"][T]["Insert"][], chunk = 2000) {
  for (let i = 0; i < rows.length; i += chunk) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from(table) as any).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export interface IntelligenceSeedOptions {
  slug: "civicline" | "ashworth";
  /** cost centre code → crew member id */
  ccOwners: Record<string, string>;
  /** user id → domains granted (executives) */
  grants: Array<{ userId: string; domains: Domain[] }>;
  grantedBy: string;
  agentDomains: Partial<Record<"ceo" | "commercial", Domain[]>>;
  crm?: boolean;
}

export async function seedIntelligence(db: Db, cid: string, o: IntelligenceSeedOptions) {
  const { profile, data: g } = intelligenceFor(o.slug);
  const refreshed = new Date(Date.now() - 3 * 3600_000).toISOString();

  await put(db, "an_sources", [{ company_id: cid, adapter: "synthetic", label: profile.label, is_synthetic: true, business_model: profile.model, currency: "GBP", config: { generator: "scripts/seed/intelligence", seed: profile.seed } }]);
  await put(db, "an_datasets", g.datasets.map((d) => ({ company_id: cid, ...d, calc_version: CALC_VERSION, refreshed_at: refreshed, status: "current" as const })));
  await put(db, "an_metric_definitions", definitionsFor(profile.model).map((d) => ({
    company_id: cid, key: d.key, version: 1, name: d.name, domain: d.domain, unit: d.unit, definition: d.definition, formula: d.formula, grain: d.grain, periods: d.periods,
    policy: d.policy as never, comparability_group: d.comparability_group, source_dataset: d.source_dataset, direction: d.direction, effective_from: g.coverage.start, change_note: "Initial definition (Omni OS default)",
  })));

  // dimensions: company-specific labels and the values present in the data
  const distinct = (xs: Array<string | null>) => [...new Set(xs.filter(Boolean) as string[])].sort();
  const valuesFor = (key: string): Array<{ key: string; label: string }> | undefined => {
    const c = g.customers;
    if (key === "product") return g.products.map((x) => ({ key: x.key, label: x.name }));
    if (key === "department") return distinct(g.costCentres.map((x) => x.department)).map((k) => ({ key: k, label: k }));
    if (key === "function") return distinct(g.costCentres.map((x) => x.function)).map((k) => ({ key: k, label: k }));
    if (key === "cost_centre") return g.costCentres.map((x) => ({ key: x.code, label: `${x.code} ${x.name}` }));
    if (key === "account") return profile.accounts.map((x) => ({ key: x.code, label: `${x.code} ${x.name}` }));
    if (key === "supplier") return g.suppliers.map((x) => ({ key: x.id, label: x.name }));
    if (key === "location") return distinct(g.costCentres.map((x) => x.location)).map((k) => ({ key: k, label: k }));
    if (["business_unit", "segment", "size_band", "geography", "contract_type"].includes(key)) return distinct(c.map((x) => x[key as "segment"])).map((k) => ({ key: k, label: k }));
    return undefined;
  };
  await put(db, "an_dimensions", profile.dimensions.map((d, i) => {
    const values = d.values ?? valuesFor(d.key) ?? (d.domain === "cost" && d.key === "business_unit" ? distinct(g.ledger.map((x) => x.business_unit)).map((k) => ({ key: k, label: k })) : []);
    return { company_id: cid, domain: d.domain, key: d.key, label: d.label, values: values as never, sort_order: i };
  }));

  // revenue contracts
  await put(db, "ri_products", g.products.map((x) => ({ company_id: cid, ...x })));
  await put(db, "ri_customers", g.customers.map((c) => ({ company_id: cid, ...c, attributes: c.attributes as never })));
  await put(db, "ri_arr_monthly", g.snapshots.map((s) => ({ company_id: cid, month: s.month, customer_id: s.customer_id, product_key: s.product_key, arr: s.arr, change_reason: s.change_reason ?? null, source_ref: "billing" })), 4000);
  await put(db, "ri_movements", g.movements.map((m) => ({ company_id: cid, ...m })), 4000);
  await put(db, "ri_cohorts", g.cohorts.map((k) => ({ company_id: cid, ...k })));
  await put(db, "ri_contracts", g.contracts.map((k) => ({ company_id: cid, ...k })));
  await put(db, "ri_finance_recon", g.recon.map((x) => ({ company_id: cid, ...x, status: x.status as "explained" })));

  // cost contracts
  await put(db, "ci_accounts", profile.accounts.map((a) => ({ company_id: cid, code: a.code, name: a.name, section: a.section, pl_line: a.line, behaviour: a.behaviour, controllable: a.controllable })));
  await put(db, "ci_cost_centres", g.costCentres.map((c) => ({ company_id: cid, ...c, owner_crew_id: o.ccOwners[c.code] ?? null })));
  await put(db, "ci_suppliers", g.suppliers.map((s) => ({ company_id: cid, ...s })));
  await put(db, "ci_ledger", g.ledger.map((l) => ({ company_id: cid, ...l })), 4000);
  await put(db, "ci_transactions", g.transactions.map((t) => ({ company_id: cid, ...t })));
  await put(db, "ci_people", g.people.map((x) => ({ company_id: cid, ...x })));

  // governance
  await put(db, "an_targets", g.targets.map((t) => ({ company_id: cid, ...t })));
  await put(db, "an_dq_results", g.dq.map((d) => ({ company_id: cid, ...d, sample: d.sample as never, detected_at: refreshed })));
  await put(db, "an_period_status", g.periodStatus.map((x) => ({ company_id: cid, ...x, validated_at: x.validated_by ? new Date(Date.parse(x.month) + 40 * 86400000).toISOString() : null })));
  await put(db, "an_period_closes", g.closes.map((x) => ({ company_id: cid, ...x, metrics: x.metrics as never, calc_version: CALC_VERSION })));
  await put(db, "an_restatements", g.restatements.map((x) => ({ company_id: cid, ...x, previous: x.previous as never, current: x.current as never })));

  // access: executives by explicit grant; agents by their own data domains
  await put(db, "an_grants", o.grants.flatMap((gr) => gr.domains.map((d) => ({ company_id: cid, user_id: gr.userId, domain: d, granted_by: o.grantedBy }))));
  for (const [agent, domains] of Object.entries(o.agentDomains)) {
    const { error } = await db.from("agent_configs").update({ data_domains: domains }).eq("company_id", cid).eq("agent_key", agent);
    if (error) throw new Error(`agent domains: ${error.message}`);
  }

  // the sandbox CRM the analytical layer links to (fictional accounts and renewals)
  if (o.crm) {
    const accounts = g.crm.accounts.map((a) => ({ company_id: cid, external_id: a.external_id, name: a.name, segment: a.segment, owner_name: a.owner_name, arr: a.arr, health: a.health, renewal_date: a.renewal_date }));
    const ids = new Map<string, string>();
    for (let i = 0; i < accounts.length; i += 1000) {
      const { data, error } = await db.from("crm_sandbox_accounts").insert(accounts.slice(i, i + 1000)).select("id, external_id");
      if (error) throw new Error(`crm accounts: ${error.message}`);
      for (const r of data) ids.set(r.external_id, r.id);
    }
    await put(db, "crm_sandbox_opportunities", g.crm.opportunities.map((x) => ({
      company_id: cid, external_id: x.external_id, account_id: ids.get(x.account_external_id) ?? null, name: x.name, stage: x.stage, status: "open", amount: x.amount,
      segment: x.segment, source: x.source, owner_name: x.owner_name, created_on: x.created_on, close_date: x.close_date, last_activity_on: x.last_activity_on,
    })));
  }
  return { customers: g.customers.length, snapshots: g.snapshots.length, ledger: g.ledger.length };
}
