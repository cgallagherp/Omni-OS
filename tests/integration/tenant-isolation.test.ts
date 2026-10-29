/**
 * Database-enforced tenant isolation. These tests talk to PostgREST exactly as a
 * browser or a hostile script with a valid session would ("direct API access"),
 * using real ids from the other tenant ("modified identifiers").
 */
import { beforeAll, describe, expect, it } from "vitest";
import { admin, as, companyId, type Client } from "./helpers";

let clinara: string;
let kestrel: string;
let marcus: Client; // Clinara executive
let helen: Client; // Clinara observer
let tom: Client; // Omni, Clinara only
let priya: Client; // Omni, both companies
let kestrelMetricId: string;
let kestrelIssueId: string;
let kestrelCrewId: string;
let clinaraMetricId: string;

const TENANT_TABLES = [
  "crew_members",
  "north_stars",
  "north_star_versions",
  "success_conditions",
  "winning_moves",
  "milestones",
  "annual_goals",
  "quarters",
  "quarterly_priorities",
  "metrics",
  "metric_values",
  "metric_links",
  "meetings",
  "meeting_attendees",
  "meeting_agenda_items",
  "issues",
  "decisions",
  "actions",
  "org_actions",
  "priority_milestones",
  "weekly_scorecards",
  "email_outbox",
  "board_reports",
  "listening_rounds",
  "onboarding_milestones",
  "governance_items",
  "company_branding",
  "quarterly_resets",
  "comments",
  "audit_log",
] as const;

const INTELLIGENCE_TABLES = [
  "an_grants", "an_sources", "an_datasets", "an_metric_definitions", "an_dimensions", "an_targets", "ri_products", "ri_customers",
  "ri_arr_monthly", "ri_movements", "ri_contracts", "ri_cohorts", "ri_finance_recon", "ci_accounts", "ci_cost_centres", "ci_suppliers",
  "ci_ledger", "ci_transactions", "ci_people", "an_dq_results", "an_period_status", "an_period_closes", "an_restatements",
  "an_saved_views", "an_exports",
] as const;

beforeAll(async () => {
  clinara = await companyId("clinara");
  kestrel = await companyId("kestrel");
  [marcus, helen, tom, priya] = await Promise.all([as("marcus@clinara.demo"), as("helen@clinara.demo"), as("tom@omni.demo"), as("priya@omni.demo")]);
  kestrelMetricId = (await admin.from("metrics").select("id").eq("company_id", kestrel).limit(1).single()).data!.id;
  kestrelIssueId = (await admin.from("issues").select("id").eq("company_id", kestrel).limit(1).single()).data!.id;
  kestrelCrewId = (await admin.from("crew_members").select("id").eq("company_id", kestrel).eq("is_open_seat", false).limit(1).single()).data!.id;
  clinaraMetricId = (await admin.from("metrics").select("id").eq("company_id", clinara).limit(1).single()).data!.id;
});

describe("company users cannot read another company's records", () => {
  it("sees only their own company", async () => {
    const { data } = await marcus.from("companies").select("id, slug");
    expect(data?.map((c) => c.slug)).toEqual(["clinara"]);
  });

  it.each(TENANT_TABLES)("returns no Kestrel rows from %s, even when filtering by Kestrel's company id", async (table) => {
    const { data, error } = await marcus.from(table).select("*").eq("company_id", kestrel);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    // sanity: the rows really exist
    const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq("company_id", kestrel);
    if (!["comments", "metric_links", "quarterly_resets", "north_star_versions"].includes(table)) expect(count).toBeGreaterThan(0);
  });

  // Revenue & Cost Intelligence governed tables (Civicline has the synthetic dataset)
  it.each(INTELLIGENCE_TABLES)("returns no Civicline rows from %s to a Clinara executive", async (table) => {
    const civicline = await companyId("civicline");
    const { data, error } = await marcus.from(table).select("company_id").eq("company_id", civicline).limit(5);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq("company_id", civicline);
    if (!["an_saved_views", "an_exports", "an_restatements"].includes(table)) expect(count).toBeGreaterThan(0);
  });

  it("cannot fetch a Kestrel record by its id", async () => {
    const m = await marcus.from("metrics").select("*").eq("id", kestrelMetricId).maybeSingle();
    const i = await marcus.from("issues").select("*").eq("id", kestrelIssueId).maybeSingle();
    expect(m.data).toBeNull();
    expect(i.data).toBeNull();
  });

  it("cannot read Kestrel KPI values through an embedded relation", async () => {
    const { data } = await marcus.from("metrics").select("id, metric_values(value)").eq("id", kestrelMetricId);
    expect(data).toEqual([]);
  });
});

describe("company users cannot modify another company's records", () => {
  it("update of a Kestrel issue affects zero rows", async () => {
    const { data } = await marcus.from("issues").update({ title: "hacked" }).eq("id", kestrelIssueId).select();
    expect(data).toEqual([]);
    const after = await admin.from("issues").select("title").eq("id", kestrelIssueId).single();
    expect(after.data!.title).not.toBe("hacked");
  });

  it("delete of a Kestrel metric affects zero rows", async () => {
    await marcus.from("metrics").delete().eq("id", kestrelMetricId);
    const after = await admin.from("metrics").select("id").eq("id", kestrelMetricId).maybeSingle();
    expect(after.data).not.toBeNull();
  });

  it("cannot insert a KPI value into Kestrel", async () => {
    const { error } = await marcus.from("metric_values").insert({ company_id: kestrel, metric_id: kestrelMetricId, period_start: "2020-01-01", value: 1 });
    expect(error).not.toBeNull();
  });

  it("cannot smuggle a Kestrel metric into a Clinara row (modified identifier)", async () => {
    const { error } = await marcus.from("metric_values").insert({ company_id: clinara, metric_id: kestrelMetricId, period_start: "2020-01-01", value: 1 });
    expect(error).not.toBeNull(); // composite FK (company_id, metric_id)
  });

  it("cannot assign a Kestrel person as owner of a Clinara action", async () => {
    const { error } = await marcus.from("actions").insert({ company_id: clinara, title: "x", owner_id: kestrelCrewId });
    expect(error).not.toBeNull();
  });

  it("cannot move a Clinara record into Kestrel", async () => {
    const { error } = await marcus.from("metrics").update({ company_id: kestrel }).eq("id", clinaraMetricId);
    expect(error).not.toBeNull();
    const after = await admin.from("metrics").select("company_id").eq("id", clinaraMetricId).single();
    expect(after.data!.company_id).toBe(clinara);
  });

  it("cannot write to the audit log directly", async () => {
    const { error } = await marcus.from("audit_log").insert({ company_id: clinara, entity_type: "x", action: "insert" });
    expect(error).not.toBeNull();
  });
});

describe("Omni-only confidential information", () => {
  it("is hidden from company executives", async () => {
    const ic = await marcus.from("investment_cases").select("*");
    const notes = await marcus.from("omni_notes").select("*");
    expect(ic.data).toEqual([]);
    expect(notes.data).toEqual([]);
  });

  it("is visible to assigned Omni staff only for their companies", async () => {
    const tomCases = await tom.from("investment_cases").select("company_id");
    expect(tomCases.data?.map((c) => c.company_id)).toEqual([clinara]);
    const priyaCases = await priya.from("investment_cases").select("company_id");
    expect(priyaCases.data?.length).toBe(4); // Clinara, Kestrel, Ashworth and Civicline
  });

  it("Omni staff see only explicitly assigned companies", async () => {
    const { data } = await tom.from("companies").select("slug");
    expect(data?.map((c) => c.slug)).toEqual(["clinara"]);
    const k = await tom.from("metrics").select("id").eq("company_id", kestrel);
    expect(k.data).toEqual([]);
  });
});

describe("roles and privilege escalation", () => {
  it("observers can read but not write", async () => {
    const read = await helen.from("metrics").select("id").eq("company_id", clinara);
    expect(read.data!.length).toBeGreaterThan(0);
    const { error } = await helen.from("metric_values").upsert({ company_id: clinara, metric_id: clinaraMetricId, period_start: "2020-01-01", value: 5 }, { onConflict: "metric_id,period_start" });
    expect(error).not.toBeNull();
    const upd = await helen.from("metrics").update({ name: "x" }).eq("id", clinaraMetricId).select();
    expect(upd.data).toEqual([]);
  });

  it("users cannot grant themselves a platform role", async () => {
    const { data: me } = await marcus.auth.getUser();
    const { error } = await marcus.from("profiles").update({ platform_role: "platform_admin" } as never).eq("id", me.user!.id);
    expect(error).not.toBeNull();
    const after = await admin.from("profiles").select("platform_role").eq("id", me.user!.id).single();
    expect(after.data!.platform_role).toBeNull();
  });

  it("executives cannot add themselves to another company", async () => {
    const { data: me } = await marcus.auth.getUser();
    const { error } = await marcus.from("company_memberships").insert({ company_id: kestrel, user_id: me.user!.id, role: "executive" });
    expect(error).not.toBeNull();
  });

  it("a company admin cannot grant Omni access", async () => {
    const daniel = await as("daniel@clinara.demo");
    const { data: m } = await marcus.auth.getUser();
    const { error } = await daniel.from("company_memberships").update({ role: "omni" }).eq("company_id", clinara).eq("user_id", m.user!.id);
    expect(error).not.toBeNull();
  });

  it("anonymous requests see nothing", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await anon.from("companies").select("*");
    expect(data ?? []).toEqual([]);
  });
});

describe("audit trail", () => {
  it("records who changed a KPI value", async () => {
    const { data: me } = await marcus.auth.getUser();
    const { data: row } = await marcus
      .from("metric_values")
      .upsert({ company_id: clinara, metric_id: clinaraMetricId, period_start: "2019-01-01", value: 42 }, { onConflict: "metric_id,period_start" })
      .select()
      .single();
    await marcus.from("metric_values").update({ value: 43 }).eq("id", row!.id);
    const { data: log } = await marcus.from("audit_log").select("*").eq("entity_id", row!.id).order("id");
    expect(log?.map((l) => l.action)).toEqual(["insert", "update"]);
    expect(log?.[1].actor_id).toBe(me.user!.id);
    expect(log?.[1].changes).toMatchObject({ value: { from: 42, to: 43 } });
  });
});
