/**
 * Revenue & Cost Intelligence: governed data is read-only, tenant-isolated and domain-scoped
 * in the database; the SQL query interface returns exactly what the reference calculations do.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { admin, as, companyId, type Client } from "./helpers";
import { agentClient } from "@/lib/agents/principal";
import { refBridge, refRetentionInputs, retention, p } from "@/lib/analytics/calc/revenue";
import { retentionPolicy, type ArrMonthlyRow, type CustomerAttrs, type MovementRow } from "@/lib/analytics/contracts";
import { addMonths } from "@/lib/analytics/period";
import { WarehouseSource } from "@/lib/analytics/adapters/warehouse";
import { SourceUnavailable } from "@/lib/analytics/errors";

process.env.SUPABASE_JWT_SECRET ??= "super-secret-jwt-token-with-at-least-32-characters-long";

let civic: string;
let clinara: string;
let hannah: Client; // Civicline CEO: every domain
let marcus: Client; // CFO: granted revenue, cost, people, transactions
let sophie: Client; // CRO: granted revenue only
let ruth: Client; // observer: nothing granted
let daniel: Client; // Clinara CEO: no access to Civicline
let agentUser: string;
let end: string;

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await q(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

beforeAll(async () => {
  civic = await companyId("civicline");
  clinara = await companyId("clinara");
  [hannah, marcus, sophie, ruth, daniel] = await Promise.all(["hannah@civicline.demo", "marcus.o@civicline.demo", "sophie@civicline.demo", "ruth@civicline.demo", "daniel@clinara.demo"].map(as));
  agentUser = (await admin.from("company_memberships").select("user_id").eq("company_id", civic).eq("role", "agent").single()).data!.user_id;
  end = (await admin.from("an_datasets").select("coverage_end").eq("company_id", civic).eq("key", "fct_arr_monthly").single()).data!.coverage_end!;
});

describe("SQL query interface reconciles to the reference calculations", () => {
  let data: { snapshots: ArrMonthlyRow[]; movements: MovementRow[]; customers: CustomerAttrs[] };
  beforeAll(async () => {
    const [snapshots, movements, customers] = await Promise.all([
      all<ArrMonthlyRow>((a, b) => admin.from("ri_arr_monthly").select("month, customer_id, product_key, arr, change_reason").eq("company_id", civic).order("month").order("customer_id").order("product_key").range(a, b) as never),
      all<MovementRow>((a, b) => admin.from("ri_movements").select("month, customer_id, product_key, type, amount, rule_key, calc_version").eq("company_id", civic).order("month").order("customer_id").order("product_key").order("type").range(a, b) as never),
      all<CustomerAttrs>((a, b) => admin.from("ri_customers").select("id, origin, acquired_on, disposed_on").eq("company_id", civic).order("id").range(a, b) as never),
    ]);
    data = { snapshots, movements, customers };
  });

  it("the LTM ARR bridge reconciles exactly and matches movement totals", async () => {
    const from = addMonths(end, -12);
    const ref = refBridge(data, from, end);
    expect(ref.reconciles).toBe(true);
    const { data: rows } = await hannah.rpc("ri_movement_totals", { p_company: civic, p_from: from, p_to: end });
    const sum = (rows ?? []).reduce((s, r) => s + p(Number(r.amount)), 0);
    expect(sum).toBe(ref.closing - ref.opening);
    // and type by type: expansion, contraction and product migrations net per customer-month
    for (const item of ref.items) {
      const sqlType = (rows ?? []).filter((r) => r.type === item.type).reduce((s, r) => s + p(Number(r.amount)), 0);
      expect(sqlType, item.type).toBe(item.amount);
    }
  });

  it("GRR and NRR from SQL equal the reference", async () => {
    const start = addMonths(end, -12);
    const policy = retentionPolicy.parse({});
    const ref = retention(refRetentionInputs(data, start, end, policy), policy);
    const { data: rows, error } = await hannah.rpc("ri_retention", { p_company: civic, p_start: start, p_end: end, p_acquired_wait: policy.acquired_wait_months });
    expect(error).toBeNull();
    const r = rows![0];
    const sqlInputs = { grp: "all", opening_arr: Number(r.opening_arr), opening_logos: Number(r.opening_logos), expansion: Number(r.expansion), contraction: Number(r.contraction), churn: Number(r.churn), reactivation: Number(r.reactivation), transfer: Number(r.transfer), migration: Number(r.migration), adjustment: Number(r.adjustment), end_arr: Number(r.end_arr), end_logos: Number(r.end_logos) };
    const sql = retention(sqlInputs, policy);
    expect(sql.reconciles).toBe(true);
    expect(sql.grr).toBeCloseTo(ref.grr!, 10);
    expect(sql.nrr).toBeCloseTo(ref.nrr!, 10);
  });
});

describe("tenant isolation and domain permissions", () => {
  it("another company's users see none of the governed data and cannot call the query functions", async () => {
    for (const t of ["ri_customers", "ri_arr_monthly", "ci_ledger", "ci_transactions", "ci_people", "an_metric_definitions", "an_sources"] as const) {
      const { data } = await daniel.from(t).select("company_id").eq("company_id", civic).limit(1);
      expect(data ?? [], t).toHaveLength(0);
    }
    const { data } = await daniel.rpc("ri_movement_totals", { p_company: civic, p_from: addMonths(end, -12), p_to: end });
    expect(data ?? []).toHaveLength(0);
    const { data: led } = await daniel.rpc("ci_ledger_totals", { p_company: civic, p_from: addMonths(end, -12), p_to: end, p_scenarios: ["actual"] });
    expect(led ?? []).toHaveLength(0);
    // and Civicline's CEO cannot reach Clinara's
    const { data: mine } = await hannah.from("ri_customers").select("id").eq("company_id", clinara).limit(1);
    expect(mine ?? []).toHaveLength(0);
  });

  it("domains are granted per person", async () => {
    const domains = async (c: Client) => ((await c.rpc("an_my_domains", { p_company: civic })).data ?? []).sort();
    expect(await domains(hannah)).toEqual(["cost", "people", "revenue", "transactions"]);
    expect(await domains(marcus)).toEqual(["cost", "people", "revenue", "transactions"]);
    expect(await domains(sophie)).toEqual(["revenue"]);
    expect(await domains(ruth)).toEqual([]);
    const count = async (c: Client, t: "ri_customers" | "ci_ledger" | "ci_people" | "ci_transactions") => (await c.from(t).select("company_id", { count: "exact", head: true }).eq("company_id", civic)).count ?? 0;
    expect(await count(sophie, "ri_customers")).toBeGreaterThan(0);
    expect(await count(sophie, "ci_ledger")).toBe(0);
    expect(await count(sophie, "ci_people")).toBe(0);
    expect(await count(marcus, "ci_transactions")).toBeGreaterThan(0);
    expect(await count(ruth, "ri_customers")).toBe(0);
    const { data } = await sophie.rpc("ci_ledger_totals", { p_company: civic, p_from: addMonths(end, -12), p_to: end, p_scenarios: ["actual"] });
    expect(data ?? []).toHaveLength(0);
  });

  it("only an administrator or the CEO can grant domains", async () => {
    const { data: s } = await admin.from("profiles").select("id").eq("email", "sophie@civicline.demo").single();
    const { error } = await sophie.from("an_grants").insert({ company_id: civic, user_id: s!.id, domain: "cost" });
    expect(error).not.toBeNull();
  });

  it("each agent reads only the domains configured for it", async () => {
    const commercial = agentClient(agentUser, "commercial");
    const ceo = agentClient(agentUser, "ceo");
    expect(((await commercial.rpc("an_my_domains", { p_company: civic })).data ?? []).sort()).toEqual(["revenue"]);
    expect((await commercial.from("ci_ledger").select("company_id", { count: "exact", head: true }).eq("company_id", civic)).count ?? 0).toBe(0);
    expect((await commercial.from("ri_customers").select("company_id", { count: "exact", head: true }).eq("company_id", civic)).count ?? 0).toBeGreaterThan(0);
    expect((await ceo.from("ci_ledger").select("company_id", { count: "exact", head: true }).eq("company_id", civic)).count ?? 0).toBeGreaterThan(0);
    expect((await ceo.from("ci_transactions").select("company_id", { count: "exact", head: true }).eq("company_id", civic)).count ?? 0).toBe(0);
    // an agent without a key gets no analytics domains at all
    expect((await agentClient(agentUser).rpc("an_my_domains", { p_company: civic })).data ?? []).toEqual([]);
  });
});

describe("governed data integrity", () => {
  it("the application cannot write governed tables", async () => {
    const { data: row } = await admin.from("ri_arr_monthly").select("*").eq("company_id", civic).limit(1).single();
    await hannah.from("ri_arr_monthly").update({ arr: 1 }).eq("company_id", civic).eq("customer_id", row!.customer_id).eq("month", row!.month);
    const { data: after } = await admin.from("ri_arr_monthly").select("arr").eq("company_id", civic).eq("customer_id", row!.customer_id).eq("month", row!.month).eq("product_key", row!.product_key).single();
    expect(Number(after!.arr)).toBe(Number(row!.arr));
    const { error } = await hannah.from("ci_ledger").insert({ company_id: civic } as never);
    expect(error).not.toBeNull();
  });

  it("cohort membership changes only through a recorded restatement", async () => {
    const { data: c } = await admin.from("ri_cohorts").select("customer_id, cohort_month").eq("company_id", civic).limit(1).single();
    const { error } = await admin.from("ri_cohorts").update({ cohort_month: "2020-01-01" }).eq("company_id", civic).eq("customer_id", c!.customer_id);
    expect(error?.message).toMatch(/fixed once assigned/);
    const { error: e2 } = await sophie.rpc("an_restate_cohort", { p_company: civic, p_customer: c!.customer_id, p_cohort_month: c!.cohort_month, p_reason: "Not an administrator" });
    expect(e2).not.toBeNull();
    const { data: rid, error: e3 } = await hannah.rpc("an_restate_cohort", { p_company: civic, p_customer: c!.customer_id, p_cohort_month: c!.cohort_month, p_reason: "Test restatement: confirmed contract start date" });
    expect(e3).toBeNull();
    const { data: rs } = await admin.from("an_restatements").select("subject, reason").eq("id", rid!).single();
    expect(rs!.subject).toBe(`cohort:${c!.customer_id}`);
    const { error: e4 } = await admin.from("an_restatements").update({ reason: "rewritten" }).eq("id", rid!);
    expect(e4?.message).toMatch(/immutable/);
  });

  it("metric definitions are versioned, never overwritten", async () => {
    const { data: before } = await admin.from("an_metric_definitions").select("version, policy").eq("company_id", civic).eq("key", "nrr").eq("status", "active").single();
    const { error: denied } = await sophie.rpc("an_new_definition_version", { p_company: civic, p_key: "nrr", p_policy: before!.policy, p_definition: "", p_note: "Trying without authority" });
    expect(denied).not.toBeNull();
    const { data: v, error } = await hannah.rpc("an_new_definition_version", { p_company: civic, p_key: "nrr", p_policy: before!.policy, p_definition: "", p_note: "Test: board confirmed the policy" });
    expect(error).toBeNull();
    expect(v).toBe(before!.version + 1);
    const { data: versions } = await admin.from("an_metric_definitions").select("version, status").eq("company_id", civic).eq("key", "nrr").order("version");
    expect(versions!.filter((x) => x.status === "active")).toHaveLength(1);
    expect(versions!.find((x) => x.version === before!.version)!.status).toBe("superseded");
  });

  it("exports are recorded only for domains the person can read", async () => {
    const { data: s } = await admin.from("profiles").select("id").eq("email", "sophie@civicline.demo").single();
    expect((await sophie.from("an_exports").insert({ company_id: civic, user_id: s!.id, dataset: "bridge", domain: "revenue", params: "", row_count: 1 })).error).toBeNull();
    expect((await sophie.from("an_exports").insert({ company_id: civic, user_id: s!.id, dataset: "analysis", domain: "cost", params: "", row_count: 1 })).error).not.toBeNull();
  });

  it("an executed agent proposal links the Mission Control issue to its exception", async () => {
    const { data: owner } = await admin.from("crew_members").select("id").eq("company_id", civic).eq("is_open_seat", false).limit(1).single();
    const { data: issue } = await admin.from("issues").insert({ company_id: civic, title: "Test analytics link", owner_id: owner!.id }).select("id").single();
    const ref = { domain: "revenue", key: "nrr_decline", period: end, href: "/c/civicline/revenue/retention" };
    const { data: inv } = await admin.from("agent_investigations").insert({ company_id: civic, agent_key: "ceo", workflow: "ceo.financial_variance", title: "Test link", dedupe_key: `test-link-${Date.now()}` } as never).select("id").single();
    const { data: ap, error } = await admin.from("agent_approvals").insert({ company_id: civic, investigation_id: inv!.id, agent_key: "ceo", category: "propose_issue", action_type: "create_corrective_action", title: "t", rationale: "test", payload: { analytics_ref: ref }, status: "approved" } as never).select("id").single();
    if (error) throw error;
    expect((await hannah.from("agent_approvals").update({ status: "approved" }).eq("id", ap!.id)).error).toBeNull(); // the CEO decides
    await admin.from("agent_approvals").update({ status: "executed", result: { issue_id: issue!.id } } as never).eq("id", ap!.id);
    const { data: linked } = await admin.from("issues").select("analytics_ref").eq("id", issue!.id).single();
    expect(linked!.analytics_ref).toMatchObject({ key: "nrr_decline" });
  });
});

describe("adapters", () => {
  it("the warehouse adapter refuses rather than returning invented data", async () => {
    const w = new WarehouseSource(civic, { adapter: "warehouse", is_synthetic: false } as never, {});
    await expect(async () => w.movements()).rejects.toBeInstanceOf(SourceUnavailable);
  });
});
