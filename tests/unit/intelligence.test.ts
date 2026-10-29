// Revenue & Cost Intelligence: the deterministic reference calculations.
import { describe, expect, it } from "vitest";
import { bridge, classifyMovements, organicGrowth, p, refBridge, refCohortMatrix, refRetentionInputs, retention, sumByType } from "@/lib/analytics/calc/revenue";
import { ebitdaBridge, gpBridgeByLine, gpBridgeVolumeMix, pl, variance, concentration, runRate } from "@/lib/analytics/calc/cost";
import { retentionPolicy, statusLabel, type ArrMonthlyRow, type LedgerTotal } from "@/lib/analytics/contracts";
import { addMonths, fiscalQuarter, periodOf, periodSeries, priorPeriod } from "@/lib/analytics/period";
import { comparableAcross, type PortfolioRow } from "@/lib/analytics/portfolio";
import { parseFilters } from "@/lib/analytics/query";
import { csv } from "@/lib/analytics/csv";

const M = (n: number) => addMonths("2025-01-01", n - 1);
const row = (m: number, c: string, prod: string, arr: number, reason?: string): ArrMonthlyRow => ({ month: M(m), customer_id: c, product_key: prod, arr, change_reason: reason ?? null });
const policy = retentionPolicy.parse({});

describe("ARR movement classification", () => {
  const rows = [
    row(1, "a", "x", 100), row(2, "a", "x", 120), row(3, "a", "x", 90), row(4, "a", "x", 0, undefined),
    row(1, "b", "x", 50), row(2, "b", "x", 50), row(2, "b", "y", 20), row(3, "b", "y", 70), row(3, "b", "x", 0, "migration"),
    row(2, "c", "x", 40), row(5, "c", "x", 30),
    row(3, "d", "z", 80, "acquisition"),
    row(1, "e", "x", 60), row(2, "e", "x", 0, "transfer"), row(2, "f", "x", 60, "transfer"),
    row(2, "g", "x", 30, "AMD-PENDING"),
  ];
  const mv = classifyMovements(rows, { firstMonth: M(1) });
  const type = (c: string, m: number, prod = "x") => mv.find((x) => x.customer_id === c && x.month === M(m) && x.product_key === prod)?.type;
  it("classifies by rule, never guessing", () => {
    expect(type("a", 2)).toBe("expansion");
    expect(type("a", 3)).toBe("contraction");
    expect(type("a", 4)).toBe("churn");
    expect(type("b", 2, "y")).toBe("expansion"); // cross-sell
    expect(type("b", 3, "x")).toBe("migration"); // tagged in the source
    expect(type("c", 2)).toBe("new");
    expect(type("c", 3)).toBe("churn");
    expect(type("c", 5)).toBe("reactivation");
    expect(type("d", 3, "z")).toBe("acquired");
    expect(type("e", 2)).toBe("transfer");
    expect(type("f", 2)).toBe("transfer");
    expect(type("g", 2)).toBe("unclassified"); // unknown reason code is shown, not reallocated
  });
  it("reconciles every month: opening + movements = closing", () => {
    const data = { snapshots: rows, movements: mv, customers: ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ id, origin: id === "d" ? "acquired" as const : "organic" as const, acquired_on: id === "d" ? M(3) : null })) };
    for (let m = 1; m < 5; m++) expect(refBridge(data, M(m), M(m + 1)).reconciles).toBe(true);
    const b = refBridge(data, M(1), M(5));
    expect(b.reconciles).toBe(true);
    expect(b.inorganic).toBe(p(80)); // acquired ARR is not organic
    expect(b.unclassified).toBe(p(30));
  });
});

describe("retention", () => {
  // three opening customers; a newcomer and an acquisition during the window must not count
  const rows = [
    row(1, "a", "x", 100), row(13, "a", "x", 130),
    row(1, "b", "x", 100), row(13, "b", "x", 70),
    row(1, "c", "x", 100), row(7, "c", "x", 0), row(12, "c", "x", 50), row(13, "c", "x", 50),
    row(5, "n", "x", 500), row(13, "n", "x", 500),
    row(6, "q", "x", 300, "acquisition"), row(13, "q", "x", 300),
  ];
  // fill the months in between so changes land where intended
  const dense = [...rows];
  for (const [c, from, to, v] of [["a", 2, 12, 100], ["b", 2, 12, 100], ["c", 2, 6, 100], ["n", 6, 12, 500], ["q", 7, 12, 300]] as const) for (let m = from; m <= to; m++) dense.push(row(m, c, "x", v));
  const mv = classifyMovements(dense, { firstMonth: M(1) });
  const customers = [{ id: "a", origin: "organic" as const }, { id: "b", origin: "organic" as const }, { id: "c", origin: "organic" as const }, { id: "n", origin: "organic" as const }, { id: "q", origin: "acquired" as const, acquired_on: M(6) }];
  const months13 = M(13);
  const snapshots = dense, movements = mv;
  const inputs = refRetentionInputs({ snapshots, movements, customers }, M(1), months13, policy);
  it("excludes new and acquired customers from the cohort", () => {
    expect(inputs.opening_arr).toBe(300);
    expect(inputs.opening_logos).toBe(3);
  });
  it("matches the governed definitions", () => {
    const r = retention(inputs, policy);
    // GRR = (300 − 30 contraction − 100 churn) / 300; NRR adds 30 expansion and 50 reactivation
    expect(r.grr).toBeCloseTo(170 / 300, 10);
    expect(r.nrr).toBeCloseTo(250 / 300, 10);
    expect(r.reconciles).toBe(true);
    const noReact = retention(inputs, { ...policy, reactivation: "exclude" });
    expect(noReact.nrr).toBeCloseTo(200 / 300, 10);
  });
  it("cohort membership drives the matrix", () => {
    const cells = refCohortMatrix({ snapshots, movements, customers }, [{ customer_id: "n", cohort_month: M(5), key: "2025-Q2" }], months13, 3);
    expect(cells[0]).toMatchObject({ age: 0, members: 1, initial: p(500), arr: p(500) });
  });
});

describe("bridge arithmetic", () => {
  it("is exact in pence and separates organic from inorganic", () => {
    const b = bridge(p(1000.1), sumByType([{ type: "new", amount: 0.2 }, { type: "churn", amount: -0.1 }, { type: "acquired", amount: 50 }]), p(1050.2));
    expect(b.reconciles).toBe(true);
    expect(organicGrowth(b)).toBeCloseTo(p(0.1) / p(1000.1), 12);
  });
  it("flags a bridge that does not reconcile instead of adjusting it", () => {
    expect(bridge(p(100), sumByType([{ type: "new", amount: 10 }]), p(111)).difference).toBe(p(1));
  });
});

describe("cost and profit", () => {
  const L = (scenario: LedgerTotal["scenario"], section: LedgerTotal["section"], line: string, amount: number, grp = "all"): LedgerTotal => ({ grp, month: M(1), scenario, section, line, amount });
  const base = [L("actual", "revenue", "recurring_revenue", 1000, "p1"), L("actual", "revenue", "recurring_revenue", 500, "p2"), L("actual", "cogs", "hosting", 100, "p1"), L("actual", "cogs", "hosting", 80, "p2"), L("actual", "cogs", "direct_labour", 150, "p1"), L("actual", "cogs", "direct_labour", 70, "p2")];
  const cur = [L("actual", "revenue", "recurring_revenue", 1100, "p1"), L("actual", "revenue", "recurring_revenue", 700, "p2"), L("actual", "cogs", "hosting", 160, "p1"), L("actual", "cogs", "hosting", 120, "p2"), L("actual", "cogs", "direct_labour", 160, "p1"), L("actual", "cogs", "direct_labour", 90, "p2")];
  it("gross profit bridges reconcile exactly, with or without product mix", () => {
    const byLine = gpBridgeByLine(pl(base, "actual"), pl(cur, "actual"));
    expect(byLine.reconciles).toBe(true);
    expect(byLine.unavailable.map((u) => u.key)).toContain("pricing"); // no price/volume data: no price effect is invented
    const vm = gpBridgeVolumeMix(base, cur, "actual", "actual");
    expect("steps" in vm && vm.reconciles).toBe(true);
  });
  it("refuses a mix analysis when costs are unallocated", () => {
    const vm = gpBridgeVolumeMix([...base, L("actual", "cogs", "hosting", 10, "(unallocated)")], cur, "actual", "actual");
    expect("unavailable" in vm && typeof vm.unavailable === "string").toBe(true);
  });
  it("EBITDA bridge separates acquisitions and counts every row once", () => {
    const b0 = [L("actual", "revenue", "recurring_revenue", 1000, "organic"), L("actual", "cogs", "hosting", 100, "organic"), L("actual", "opex", "people", 500, "organic")];
    const b1 = [L("actual", "revenue", "recurring_revenue", 1100, "organic"), L("actual", "cogs", "hosting", 150, "organic"), L("actual", "opex", "people", 520, "organic"), L("actual", "revenue", "recurring_revenue", 200, "acquired"), L("actual", "opex", "people", 120, "acquired")];
    const e = ebitdaBridge(b0, b1, "actual", "actual");
    expect(e.reconciles).toBe(true);
    expect(e.steps.find((s) => s.key === "acquisitions")!.amount).toBe(p(80));
    expect(e.to - e.from).toBe(e.steps.reduce((s, x) => s + x.amount, 0));
  });
  it("variance direction depends on whether it is a cost", () => {
    expect(variance("x", 110, 100, "cost").favourable).toBe(false);
    expect(variance("x", 110, 100, "income").favourable).toBe(true);
    expect(variance("x", 110, null, "cost").variance).toBeNull();
  });
  it("concentration and run-rate", () => {
    const c = concentration([{ key: "a", amount: 50 }, { key: "b", amount: 30 }, { key: "c", amount: 20 }]);
    expect(c.top1).toBeCloseTo(0.5);
    expect(c.hhi).toBe(3800);
    expect(runRate([10, 20, 30, 40])).toBe(360);
  });
});

describe("periods, filters, comparability and labelling", () => {
  it("fiscal periods", () => {
    expect(fiscalQuarter("2026-09-01", 4)).toMatchObject({ fy: 2027, q: 2, start: "2026-07-01" });
    const ytd = periodOf("ytd", "2026-09-01", 4);
    expect(ytd).toMatchObject({ start: "2026-04-01", open: "2026-03-01", partial: true });
    expect(priorPeriod(periodOf("quarter", "2026-09-01", 4), 4).end).toBe("2026-06-01");
    expect(periodSeries("quarter", "2026-09-01", 4, 4).map((x) => x.short)).toEqual(["Q3 FY26", "Q4 FY26", "Q1 FY27", "Q2 FY27"]);
  });
  it("only whitelisted dimension values reach a query", () => {
    const dims = [{ domain: "revenue" as const, key: "sector", label: "Sector", values: [{ key: "police", label: "Police" }] }, { domain: "revenue" as const, key: "attr:authority_type", label: "Type", values: [{ key: "County", label: "County" }] }];
    expect(parseFilters({ f_sector: "police,'; drop table x", f_evil: "x", "f_attr:authority_type": "County" }, dims)).toEqual({ sector: ["police"], attr: { authority_type: ["County"] } });
  });
  it("compares metrics only where the methodology matches", () => {
    const rows = (g1: string, g2: string): PortfolioRow[] => [g1, g2].map((g, n) => ({ companyId: String(n), name: "", slug: "", synthetic: true, period: "", cells: { nrr: { value: 1, group: g, label: "", status: "validated" } } }));
    expect(comparableAcross(rows("saas_retention_v1", "saas_retention_v1"), "nrr")).toBe(true);
    expect(comparableAcross(rows("saas_retention_v1", "services_contract_retention_v1"), "nrr")).toBe(false);
  });
  it("synthetic data is never labelled verified", () => {
    expect(statusLabel("validated", true)).toBe("Synthetic · reconciles");
    expect(statusLabel("validated", false)).toBe("Validated");
    expect(statusLabel("provisional", true)).toMatch(/Synthetic/);
  });
  it("exports neutralise spreadsheet formulas", () => {
    expect(csv([{ a: "=HYPERLINK(1)", b: -5, c: 'x"y' }])).toBe("a,b,c\n'=HYPERLINK(1),-5,\"x\"\"y\"\n");
  });
});
