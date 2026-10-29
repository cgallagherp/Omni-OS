// Synthetic governed data for Revenue & Cost Intelligence. Deterministic and entirely
// fictional: it imitates what the Snowflake/dbt layer will deliver (customer × product ARR
// snapshots, contracts, GL aggregates, departmental headcount), then runs the reference
// classifier exactly as dbt would, and derives data-quality results, reconciliation status,
// period closes and a restatement. Nothing here is real company performance.
import { randomUUID } from "node:crypto";
import { CALC_VERSION, type ArrMonthlyRow, type MovementRow, type PeopleRow, type RetentionPolicy } from "../../../src/lib/analytics/contracts";
import { classifyMovements, gbp, p, refBridge, refRetentionInputs, retention } from "../../../src/lib/analytics/calc/revenue";
import { pl } from "../../../src/lib/analytics/calc/cost";
import { addMonths, fiscalYear, monthRange, monthsBetween } from "../../../src/lib/analytics/period";
import { rng } from "../lib";

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export interface ProductSpec { key: string; name: string; group: string; launch?: number; origin?: "organic" | "acquired" | "disposed"; servicesPct: number; hostingPct: number }
export interface SectorSpec {
  key: string; label: string; bu: string; initial: number; newPerYear: number; arr: [number, number];
  primary: string[]; optional: Array<[string, number]>; april: number; namer: (r: () => number, place: string) => string;
}
export interface RenewalOdds { churn: number; contract: number; contractSize: [number, number]; upsell: number; upsellSize: [number, number]; uplift: [number, number] }
export interface Dept { key: string; cc: string; name: string; fn: string; location: string; fte: number; growth: number; cost: number; direct: boolean; origin?: "organic" | "acquired" | "disposed"; plannedGrowth?: number; from?: number; until?: number }
export interface Spend { account: string; cc: string; supplier: string | null; base: number; growth: number; story?: (i: number, n: number) => number; budgetGrowth?: number; product?: string; bu?: string; origin?: "organic" | "acquired" | "disposed"; from?: number; until?: number; invoices?: number }

export interface Profile {
  slug: string;
  seed: number;
  months: number;
  fyStart: number;
  model: "recurring_software" | "recurring_services";
  label: string;
  products: ProductSpec[];
  sectors: SectorSpec[];
  geographies: string[];
  contractTypes: Array<[string, number]>;
  owners: string[];
  segmentOf: (sector: string, arr: number) => string;
  renewal: (sector: string, i: number, n: number) => RenewalOdds;
  crossSellPerMonth: number;
  reactivationPerMonth: number;
  migration?: { from: string; to: string; perMonth: number; uplift: number };
  acquisition?: { at: number; label: string; customers: number; sector: string; product: string; arr: [number, number] };
  disposal?: { at: number; product: string; sector: string };
  transfer?: { at: number; from: number; into: string[] };
  restated?: { at: number; amount: number };
  correction?: { at: number; amount: number };
  reclass?: { at: number; amount: number };
  unclassified?: { at: number; count: number };
  attributes?: (sector: string, name: string) => Record<string, string>;
  depts: Dept[];
  spend: Spend[];
  accounts: Array<{ code: string; name: string; section: "revenue" | "cogs" | "opex"; line: string; behaviour: "fixed" | "variable" | "semi_variable" | null; controllable: boolean | null }>;
  suppliers: Array<{ key: string; name: string; category: string; origin?: string; contract_end?: number }>;
  hostingStory?: (i: number, n: number) => number;
  deliveryStory?: (i: number, n: number) => number;
  arrBudgetGrowth: number;
  targets: { nrr: number; grr: number; gross_margin: number };
  dimensions: Array<{ domain: "revenue" | "cost"; key: string; label: string; values?: Array<{ key: string; label: string }> }>;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
export interface Generated {
  coverage: { start: string; end: string };
  products: Array<{ key: string; name: string; business_unit: string; family: string }>;
  customers: Array<{ id: string; external_id: string; crm_id: string | null; name: string; segment: string; sector: string; geography: string; size_band: string; business_unit: string; contract_type: string; origin: "organic" | "acquired"; origin_label: string | null; acquired_on: string | null; disposed_on: string | null; first_arr_month: string; account_owner: string; attributes: Record<string, string> }>;
  snapshots: ArrMonthlyRow[];
  movements: MovementRow[];
  cohorts: Array<{ customer_id: string; cohort_month: string; origin: string; segment: string; sector: string; geography: string; size_band: string; business_unit: string; contract_type: string; primary_product: string }>;
  contracts: Array<{ customer_id: string; product_key: string; contract_ref: string; start_date: string | null; end_date: string | null; renewal_date: string | null; term_months: number; annual_value: number; status: string; source_system: string }>;
  costCentres: Array<{ code: string; name: string; department: string; function: string; business_unit: string | null; location: string }>;
  suppliers: Array<{ id: string; name: string; category: string; origin: string; contract_end: string | null }>;
  ledger: Array<{ month: string; scenario: "actual" | "budget" | "forecast"; account_code: string; cost_centre_code: string; supplier_id: string | null; product_key: string | null; business_unit: string | null; origin: string; amount: number }>;
  transactions: Array<{ posted_on: string; month: string; account_code: string; cost_centre_code: string; supplier_id: string | null; reference: string; description: string; amount: number; source_system: string }>;
  people: PeopleRow[];
  targets: Array<{ domain: "revenue" | "cost" | "people"; metric_key: string; month: string; scenario: "budget" | "forecast" | "target"; value: number }>;
  recon: Array<{ month: string; contractual_arr: number; invoiced_recurring_annualised: number; recognised_recurring_revenue: number; recognised_total_revenue: number; explained_difference: number; explanation: string; status: string }>;
  dq: Array<{ domain: "revenue" | "cost" | "people"; check_key: string; title: string; severity: "info" | "warning" | "error"; status: "pass" | "warn" | "fail"; month: string | null; affected_count: number; amount: number | null; sample: unknown[]; source_system: string; owner_function: string; remediation: string }>;
  periodStatus: Array<{ domain: "revenue" | "cost" | "people"; month: string; status: "validated" | "provisional" | "incomplete"; reason: string | null; validated_by: string | null }>;
  closes: Array<{ domain: "revenue" | "cost"; month: string; version: number; metrics: Record<string, number | null>; closed_at: string }>;
  restatements: Array<{ domain: "revenue"; month: string; subject: string; reason: string; previous: Record<string, unknown>; current: Record<string, unknown>; approved_by: string; restated_at: string }>;
  crm: { accounts: Array<{ external_id: string; name: string; segment: string; owner_name: string; arr: number; health: "green" | "amber" | "red"; renewal_date: string | null }>; opportunities: Array<{ external_id: string; account_external_id: string; name: string; stage: string; amount: number; segment: string; source: string; owner_name: string; created_on: string; close_date: string; last_activity_on: string }> };
  /** headline monthly series, computed with the reference calculations (feeds the bound KPIs) */
  /** budgeted P&L by month across every budget month (including beyond the last actual) */
  budgets: Map<string, { revenue: number; ebitda: number; grossMargin: number | null }>;
  kpis: Map<string, { arr: number; nrr: number | null; grr: number | null; revenue: number; grossMargin: number | null; ebitda: number; arrBudget: number; revenueBudget: number; ebitdaBudget: number; gmBudget: number | null }>;
  datasets: Array<{ key: string; domain: string; label: string; source_system: string; model: string; row_count: number; coverage_start: string; coverage_end: string }>;
}

const PLACES_A = ["Ash", "Bram", "Cal", "Dun", "Ever", "Fen", "Glen", "Hart", "Ivel", "Kings", "Lyn", "Mar", "Nor", "Oak", "Pen", "Quen", "Ral", "Stan", "Thorn", "Up", "Vale", "Wes", "Yarn", "Wex", "Bel", "Cor", "Dray", "Elm", "Fair", "Gold", "Hollin", "Kel", "Lark", "Mere", "Ottle", "Pell", "Rook", "Sil", "Tarn", "Wil"];
const PLACES_B = ["ford", "ham", "bury", "wick", "ton", "field", "mouth", "dale", "minster", "borough", "cliffe", "by", "stow", "worth", "ley", "combe", "mere", "brook", "gate", "holme"];

const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const between = (r: () => number, [a, b]: [number, number]) => a + r() * (b - a);
const logn = (r: () => number, median: number, sigma: number) => {
  const u = Math.max(r(), 1e-9), v = r();
  return median * Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
};
const weighted = <T,>(r: () => number, xs: Array<[T, number]>) => {
  const t = xs.reduce((s, [, w]) => s + w, 0);
  let x = r() * t;
  for (const [v, w] of xs) if ((x -= w) <= 0) return v;
  return xs[xs.length - 1][0];
};
const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const sizeBand = (arr: number) => (arr >= 150_000 ? "£150k+" : arr >= 50_000 ? "£50k–150k" : arr >= 15_000 ? "£15k–50k" : "Under £15k");

export function lastCompleteMonth(today = new Date()) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------
export function generate(pr: Profile, today = new Date()): Generated {
  const r = rng(pr.seed);
  const end = lastCompleteMonth(today);
  const start = addMonths(end, -(pr.months - 1));
  const months = monthRange(start, end);
  const n = months.length;
  const usedNames = new Set<string>();
  const place = () => {
    for (;;) {
      const base = pick(r, PLACES_A) + pick(r, PLACES_B);
      const s = usedNames.size > 400 && r() < 0.7 ? `${pick(r, ["East", "West", "North", "South", "Upper", "Great", "Little", "Old", "New"])} ${base}` : base;
      if (!usedNames.has(s)) { usedNames.add(s); return s; }
    }
  };

  type Cust = Generated["customers"][number] & { renewalMonth: number; arr: Map<string, number>; churnedAt: number | null; lastArr: number; everHad: boolean; contractTerm: number };
  const customers: Cust[] = [];
  const reasons = new Map<string, string>(); // `${i}|${cid}|${prod}` → reason
  const snaps: ArrMonthlyRow[] = [];
  let ext = 1000;

  const newCustomer = (sector: SectorSpec, i: number, origin: "organic" | "acquired" = "organic", productOverride?: string, arrRange?: [number, number]): Cust => {
    const pl = place();
    const name = sector.namer(r, pl);
    const arr0 = arrRange ? between(r, arrRange) : logn(r, sector.arr[0], sector.arr[1]);
    const total = Math.max(3_000, roundTo(arr0, 50));
    const first = i < 0 ? addMonths(start, i) : months[i];
    const segment = pr.segmentOf(sector.key, total);
    const c: Cust = {
      id: randomUUID(), external_id: `C${ext++}`, crm_id: `HS-${(400000 + ext * 7).toString()}`, name, segment, sector: sector.key,
      geography: pick(r, pr.geographies), size_band: sizeBand(total), business_unit: sector.bu, contract_type: weighted(r, pr.contractTypes),
      origin, origin_label: origin === "acquired" ? pr.acquisition!.label : null, acquired_on: origin === "acquired" ? months[i] : null, disposed_on: null,
      first_arr_month: first, account_owner: pick(r, pr.owners), attributes: pr.attributes?.(sector.key, name) ?? {},
      renewalMonth: r() < sector.april ? pr.fyStart : Number(first.slice(5, 7)), arr: new Map(), churnedAt: null, lastArr: 0, everHad: true,
      contractTerm: r() < 0.45 ? 36 : 12,
    };
    const prods = productOverride ? [productOverride] : [pick(r, sector.primary)];
    for (const [k, prob] of sector.optional) if (!productOverride && r() < prob && !prods.includes(k)) {
      const ps = pr.products.find((x) => x.key === k);
      if (!ps?.launch || ps.launch <= Math.max(i, 0)) prods.push(k);
    }
    const weights = prods.map((_, j) => (j === 0 ? 1 : 0.25 + r() * 0.35));
    const wsum = weights.reduce((s, w) => s + w, 0);
    prods.forEach((k, j) => c.arr.set(k, roundTo((total * weights[j]) / wsum, 10)));
    customers.push(c);
    return c;
  };

  // opening book
  for (const s of pr.sectors) for (let k = 0; k < s.initial; k++) newCustomer(s, -Math.floor(6 + r() * 90));
  const sectorOf = new Map(pr.sectors.map((s) => [s.key, s]));

  const tag = (i: number, c: Cust, prod: string, reason: string) => reasons.set(`${i}|${c.id}|${prod}`, reason);
  const restatedCustomer: { c?: Cust; months?: number[] } = {};

  for (let i = 0; i < n; i++) {
    const m = months[i];
    const mon = Number(m.slice(5, 7));
    if (i > 0) {
      // renewals on the anniversary month
      for (const c of customers) {
        if (c.churnedAt !== null || c.disposed_on || sumArr(c) === 0) continue;
        if (c.renewalMonth !== mon) continue;
        if (c.contractTerm === 36 && r() < 0.6) continue; // mid-term on a multi-year contract: no change this year
        const o = pr.renewal(c.sector, i, n);
        if (r() < o.churn) {
          for (const k of c.arr.keys()) c.arr.set(k, 0);
          c.churnedAt = i;
          continue;
        }
        if (r() < o.contract) {
          const f = 1 - between(r, o.contractSize);
          for (const [k, v] of c.arr) c.arr.set(k, roundTo(v * f, 10));
        } else {
          const up = 1 + between(r, o.uplift);
          for (const [k, v] of c.arr) c.arr.set(k, roundTo(v * up, 10));
          if (r() < o.upsell) {
            const k = pick(r, [...c.arr.keys()]);
            c.arr.set(k, roundTo(c.arr.get(k)! * (1 + between(r, o.upsellSize)), 10));
          }
        }
      }
      // mid-term cross-sell
      for (const c of customers) {
        if (c.churnedAt !== null || c.disposed_on || sumArr(c) === 0 || r() > pr.crossSellPerMonth) continue;
        const s = sectorOf.get(c.sector)!;
        const options = s.optional.map(([k]) => k).filter((k) => !c.arr.get(k) && (pr.products.find((x) => x.key === k)?.launch ?? 0) <= i && k !== pr.migration?.from);
        if (!options.length) continue;
        c.arr.set(pick(r, options), roundTo(sumArr(c) * between(r, [0.12, 0.3]), 10));
      }
      // legacy migration (tagged in the source system); the uplift follows a month later, untagged
      if (pr.migration) {
        for (const c of customers) {
          const old = c.arr.get(pr.migration.from) ?? 0;
          if (!old || c.churnedAt !== null || r() > pr.migration.perMonth) continue;
          c.arr.set(pr.migration.from, 0);
          c.arr.set(pr.migration.to, (c.arr.get(pr.migration.to) ?? 0) + old);
          tag(i, c, pr.migration.from, "migration");
          tag(i, c, pr.migration.to, "migration");
          (c as Cust & { upliftAt?: number }).upliftAt = i + 1;
        }
        for (const c of customers as Array<Cust & { upliftAt?: number }>) {
          if (c.upliftAt === i && c.churnedAt === null) c.arr.set(pr.migration.to, roundTo(c.arr.get(pr.migration.to)! * (1 + pr.migration.uplift), 10));
        }
      }
      // reactivations
      for (const c of customers) {
        if (c.churnedAt === null || c.disposed_on || i - c.churnedAt < 5 || r() > pr.reactivationPerMonth) continue;
        const s = sectorOf.get(c.sector)!;
        c.arr.set(pick(r, s.primary), roundTo(c.lastArr * between(r, [0.5, 0.9]), 10));
        c.churnedAt = null;
        c.renewalMonth = mon;
      }
      // new logos
      for (const s of pr.sectors) {
        const lambda = (s.newPerYear / 12) * (mon >= pr.fyStart && mon < pr.fyStart + 3 ? 1.5 : 0.85);
        // Poisson arrivals
        let count = -1;
        for (let prob = 1, lim = Math.exp(-lambda); prob > lim; prob *= r()) count++;
        for (let j = 0; j < count; j++) newCustomer(s, i);
      }
      // events
      if (pr.acquisition && i === pr.acquisition.at) {
        const s = sectorOf.get(pr.acquisition.sector)!;
        for (let j = 0; j < pr.acquisition.customers; j++) {
          const c = newCustomer(s, i, "acquired", pr.acquisition.product, pr.acquisition.arr);
          for (const k of c.arr.keys()) tag(i, c, k, "acquisition");
        }
      }
      if (pr.disposal && i === pr.disposal.at) {
        for (const c of customers) {
          const v = c.arr.get(pr.disposal.product) ?? 0;
          if (!v) continue;
          c.arr.set(pr.disposal.product, 0);
          tag(i, c, pr.disposal.product, "disposal");
          if (sumArr(c) === 0) c.disposed_on = m;
        }
      }
      if (pr.transfer && i === pr.transfer.at) {
        // local government reorganisation: district councils merge into new unitary authorities
        const s = sectorOf.get("local_authority")!;
        const districts = customers.filter((c) => c.sector === "local_authority" && c.origin === "organic" && sumArr(c) > 0 && c.churnedAt === null && /District/.test(c.name)).slice(0, pr.transfer.from);
        const succ = pr.transfer.into.map((nm) => {
          const c = newCustomer(s, i);
          c.name = nm;
          c.arr.clear();
          c.renewalMonth = pr.fyStart;
          return c;
        });
        districts.forEach((d, j) => {
          const to = succ[j % succ.length];
          for (const [k, v] of d.arr) {
            if (!v) continue;
            to.arr.set(k, (to.arr.get(k) ?? 0) + v);
            d.arr.set(k, 0);
            tag(i, d, k, "transfer");
            tag(i, to, k, "transfer");
          }
          d.attributes = { ...d.attributes, successor: to.name };
        });
      }
      if (pr.correction && i === pr.correction.at) {
        const c = customers.find((x) => x.sector === "central_government" && x.churnedAt === null && sumArr(x) > 100_000)!;
        const k = [...c.arr.keys()][0];
        c.arr.set(k, c.arr.get(k)! - pr.correction.amount);
        tag(i, c, k, "correction");
      }
      if (pr.reclass && i === pr.reclass.at) {
        const c = customers.find((x) => x.sector === "health" && x.churnedAt === null && sumArr(x) > 30_000)!;
        const k = [...c.arr.keys()][0];
        c.arr.set(k, c.arr.get(k)! - pr.reclass.amount);
        tag(i, c, k, "reclassification");
      }
      if (pr.unclassified && i === pr.unclassified.at) {
        const cs = customers.filter((x) => x.sector === "housing_association" && x.churnedAt === null && sumArr(x) > 10_000).slice(0, pr.unclassified.count);
        for (const c of cs) {
          const k = [...c.arr.keys()][0];
          c.arr.set(k, roundTo(c.arr.get(k)! * 0.82, 10));
          tag(i, c, k, "AMD-PENDING");
        }
      }
    }
    // a restated history: ARR overstated for three months, corrected retroactively
    if (pr.restated && i === pr.restated.at) {
      restatedCustomer.c = customers.find((x) => x.sector === "local_authority" && x.churnedAt === null && sumArr(x) > 60_000);
      restatedCustomer.months = [i, i + 1, i + 2];
    }
    // emit the month
    for (const c of customers) {
      const total = sumArr(c);
      if (total > 0) { c.lastArr = total; }
      for (const [k, v] of c.arr) {
        const reason = reasons.get(`${i}|${c.id}|${k}`) ?? null;
        if (v > 0 || reason) snaps.push({ month: m, customer_id: c.id, product_key: k, arr: v, change_reason: reason });
      }
      for (const [k, v] of [...c.arr]) if (v === 0 && !reasons.get(`${i}|${c.id}|${k}`)) c.arr.delete(k);
    }
  }

  // data-quality defects as the source systems would really contain them
  const active = customers.filter((c) => sumArr(c) > 0);
  for (const c of active.filter((x) => x.sector === "other_public").slice(0, 9)) c.crm_id = null;
  const dupOf = active.find((c) => c.sector === "local_authority" && /Borough/.test(c.name)) ?? active[0];
  const inconsistent = active.filter((c) => c.sector === "housing_association").slice(5, 8);

  const movements = classifyMovements(snaps, { firstMonth: start });
  const custOut: Generated["customers"] = customers.map((c) => ({
    id: c.id, external_id: c.external_id, crm_id: c.crm_id, name: c.name, segment: c.segment, sector: c.sector, geography: c.geography, size_band: c.size_band,
    business_unit: c.business_unit, contract_type: c.contract_type, origin: c.origin, origin_label: c.origin_label, acquired_on: c.acquired_on, disposed_on: c.disposed_on,
    first_arr_month: c.first_arr_month, account_owner: c.account_owner, attributes: c.attributes,
  }));
  // duplicate record: the same authority under a second billing id, with no ARR (an orphan)
  custOut.push({ ...custOut.find((c) => c.id === dupOf.id)!, id: randomUUID(), external_id: `C${ext++}`, crm_id: dupOf.crm_id, first_arr_month: dupOf.first_arr_month });

  // cohorts: assigned once, attributes frozen at assignment
  const firstMonthOf = new Map<string, string>();
  const productAtStart = new Map<string, string>();
  for (const s of snaps) if (s.arr > 0 && (!firstMonthOf.has(s.customer_id) || s.month < firstMonthOf.get(s.customer_id)!)) firstMonthOf.set(s.customer_id, s.month);
  for (const s of snaps) if (s.month === firstMonthOf.get(s.customer_id) && s.arr > 0 && !productAtStart.has(s.customer_id)) productAtStart.set(s.customer_id, s.product_key);
  const cohorts: Generated["cohorts"] = customers.map((c) => ({
    customer_id: c.id, cohort_month: c.first_arr_month < start ? c.first_arr_month : firstMonthOf.get(c.id) ?? c.first_arr_month, origin: c.origin,
    segment: c.segment, sector: c.sector, geography: c.geography, size_band: c.size_band, business_unit: c.business_unit, contract_type: c.contract_type,
    primary_product: productAtStart.get(c.id) ?? [...c.arr.keys()][0] ?? pr.products[0].key,
  }));
  for (const c of custOut) {
    const fm = cohorts.find((k) => k.customer_id === c.id)?.cohort_month;
    if (fm) c.first_arr_month = fm;
  }

  // contracts (renewal dates are not inferred where the source has none)
  const endSnap = new Map<string, Map<string, number>>();
  for (const s of snaps) if (s.month === end) { const mm = endSnap.get(s.customer_id) ?? new Map(); mm.set(s.product_key, s.arr); endSnap.set(s.customer_id, mm); }
  const contracts: Generated["contracts"] = [];
  let missingRenewal = 0;
  for (const c of customers) {
    for (const [k, v] of endSnap.get(c.id) ?? []) {
      if (!v) continue;
      const startDate = `${(firstMonthOf.get(c.id) ?? c.first_arr_month).slice(0, 7)}-01`;
      const nextRenewal = (() => {
        const y = Number(end.slice(0, 4)), mm = c.renewalMonth;
        const candidate = `${mm > Number(end.slice(5, 7)) ? y : y + 1}-${String(mm).padStart(2, "0")}-01`;
        return candidate;
      })();
      const noDate = r() < 0.025;
      if (noDate) missingRenewal++;
      contracts.push({
        customer_id: c.id, product_key: k, contract_ref: `${c.external_id}-${k.toUpperCase()}`, start_date: r() < 0.01 ? null : startDate,
        end_date: noDate ? null : nextRenewal, renewal_date: noDate ? null : nextRenewal, term_months: c.contractTerm, annual_value: v, status: "active", source_system: "Billing",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // P&L, people and budgets
  // ---------------------------------------------------------------------------
  const arrByMonthProduct = new Map<string, Map<string, { arr: number; origin: string; bu: Map<string, number> }>>();
  const custById = new Map(customers.map((c) => [c.id, c]));
  for (const s of snaps) {
    const c = custById.get(s.customer_id)!;
    const mm = arrByMonthProduct.get(s.month) ?? new Map();
    const prodOrigin = pr.products.find((x) => x.key === s.product_key)?.origin ?? "organic";
    const x = mm.get(s.product_key) ?? { arr: 0, origin: prodOrigin, bu: new Map() };
    x.arr += s.arr;
    x.bu.set(c.business_unit, (x.bu.get(c.business_unit) ?? 0) + s.arr);
    mm.set(s.product_key, x);
    arrByMonthProduct.set(s.month, mm);
  }
  const supplierIds = new Map(pr.suppliers.map((s) => [s.key, randomUUID()]));
  const ledger: Generated["ledger"] = [];
  const transactions: Generated["transactions"] = [];
  const people: PeopleRow[] = [];
  const fyStartOf = (m: string) => fiscalYear(m, pr.fyStart).start;
  const noise = (pct: number) => 1 + (r() * 2 - 1) * pct;
  const push = (row: Generated["ledger"][number]) => { if (Math.abs(row.amount) >= 0.5) ledger.push({ ...row, amount: Math.round(row.amount * 100) / 100 }); };

  // forecast is struck after the first quarter of the current financial year
  const fyCur = fyStartOf(end);
  const fcBase = addMonths(fyCur, 2);
  const fyEnd = addMonths(fyCur, 11);
  const forecastMonths = monthRange(fyCur, fyEnd);
  const arrBudget = new Map<string, number>();

  // revenue: recognised recurring revenue = average ARR / 12 (plus services), by product and BU
  for (let i = 0; i < n; i++) {
    const m = months[i];
    const prev = arrByMonthProduct.get(months[Math.max(i - 1, 0)]) ?? new Map();
    const cur = arrByMonthProduct.get(m) ?? new Map();
    for (const prod of pr.products) {
      const a = cur.get(prod.key), b = prev.get(prod.key);
      const bus = new Set([...(a?.bu.keys() ?? []), ...(b?.bu.keys() ?? [])]);
      for (const bu of bus) {
        const rec = (((a?.bu.get(bu) ?? 0) + (b?.bu.get(bu) ?? a?.bu.get(bu) ?? 0)) / 2) / 12;
        if (!rec) continue;
        const origin = prod.origin ?? "organic";
        push({ month: m, scenario: "actual", account_code: "4000", cost_centre_code: "CC010", supplier_id: null, product_key: prod.key, business_unit: bu, origin, amount: rec });
        push({ month: m, scenario: "actual", account_code: "4100", cost_centre_code: "CC400", supplier_id: null, product_key: prod.key, business_unit: bu, origin, amount: rec * prod.servicesPct * noise(0.35) });
        // hosting, licences and other direct costs scale with the product's revenue
        const hosting = rec * prod.hostingPct * (pr.hostingStory?.(i, n) ?? 1) * noise(0.04);
        push({ month: m, scenario: "actual", account_code: "5000", cost_centre_code: "CC320", supplier_id: supplierIds.get(origin === "acquired" ? "archway" : r() < 0.7 ? "northcloud" : "stratus")!, product_key: prod.key, business_unit: bu, origin, amount: hosting });
        push({ month: m, scenario: "actual", account_code: "5300", cost_centre_code: "CC320", supplier_id: supplierIds.get(r() < 0.6 ? "mapwise" : "lexend")!, product_key: prod.key, business_unit: bu, origin, amount: rec * 0.022 * noise(0.1) });
        push({ month: m, scenario: "actual", account_code: "5400", cost_centre_code: "CC400", supplier_id: supplierIds.get("quillon")!, product_key: prod.key, business_unit: bu, origin, amount: rec * 0.009 * noise(0.2) });
        // third-party delivery partners, concentrated in Policing & Justice implementations
        const delivery = rec * (bu === "Policing & Justice" ? 0.05 * (pr.deliveryStory?.(i, n) ?? 1) : 0.012) * noise(0.15);
        push({ month: m, scenario: "actual", account_code: "5200", cost_centre_code: "CC400", supplier_id: supplierIds.get(bu === "Policing & Justice" ? "pellam" : "fernhill")!, product_key: prod.key, business_unit: bu, origin, amount: delivery });
      }
    }
  }
  // budgets for revenue and direct costs: the plan struck at the start of each financial year
  for (const fy of [...new Set(months.map(fyStartOf))]) {
    const base = arrByMonthProduct.get(fy) ?? arrByMonthProduct.get(start)!;
    const fyMonths = monthRange(fy, addMonths(fy, 11));
    fyMonths.forEach((m, k) => {
      const g = 1 + pr.arrBudgetGrowth * ((k + 0.5) / 12);
      let total = 0;
      for (const prod of pr.products) {
        const x = base.get(prod.key);
        if (!x) continue;
        for (const [bu, v] of x.bu) {
          const rec = (v * g) / 12;
          total += v * g;
          const origin = prod.origin ?? "organic";
          if (origin === "disposed" && pr.disposal && m >= months[pr.disposal.at]) continue;
          push({ month: m, scenario: "budget", account_code: "4000", cost_centre_code: "CC010", supplier_id: null, product_key: prod.key, business_unit: bu, origin, amount: rec });
          push({ month: m, scenario: "budget", account_code: "4100", cost_centre_code: "CC400", supplier_id: null, product_key: prod.key, business_unit: bu, origin, amount: rec * prod.servicesPct });
          push({ month: m, scenario: "budget", account_code: "5000", cost_centre_code: "CC320", supplier_id: supplierIds.get(origin === "acquired" ? "archway" : "northcloud")!, product_key: prod.key, business_unit: bu, origin, amount: rec * prod.hostingPct });
          push({ month: m, scenario: "budget", account_code: "5300", cost_centre_code: "CC320", supplier_id: supplierIds.get("mapwise")!, product_key: prod.key, business_unit: bu, origin, amount: rec * 0.022 });
          push({ month: m, scenario: "budget", account_code: "5400", cost_centre_code: "CC400", supplier_id: supplierIds.get("quillon")!, product_key: prod.key, business_unit: bu, origin, amount: rec * 0.009 });
          push({ month: m, scenario: "budget", account_code: "5200", cost_centre_code: "CC400", supplier_id: supplierIds.get(bu === "Policing & Justice" ? "pellam" : "fernhill")!, product_key: prod.key, business_unit: bu, origin, amount: rec * (bu === "Policing & Justice" ? 0.05 : 0.012) });
        }
      }
      // acquired business: budgeted only from the first full financial year after completion
      arrBudget.set(m, Math.round(total));
    });
  }

  // people: departmental FTE and employment cost; salaries in the ledger equal these totals
  const productShares = (m: string) => {
    const cur = arrByMonthProduct.get(m) ?? new Map();
    const tot = [...cur.values()].reduce((s, x) => s + x.arr, 0) || 1;
    return [...cur.entries()].map(([k, x]) => ({ k, share: x.arr / tot, origin: x.origin }));
  };
  for (const d of pr.depts) {
    let fteA = d.fte, fteB = d.fte;
    for (let i = 0; i < n; i++) {
      const m = months[i];
      const live = (d.from === undefined || i >= d.from) && (d.until === undefined || i < d.until);
      const isFyStart = m === fyStartOf(m);
      // budgets reset to the planned path each financial year
      if (isFyStart) fteB = Math.max(fteA, 1);
      const monthlyGrowthB = (d.plannedGrowth ?? d.growth) / 12;
      const monthlyGrowthA = d.growth / 12;
      // the plan: smooth growth, with expected attrition back-filled
      const hiresB = live ? Math.round(fteB * (monthlyGrowthB + 0.01)) : 0;
      const leaversA = live ? (r() < 0.012 * fteA ? Math.max(1, Math.round(fteA * 0.008)) : 0) : 0;
      const hiresA = live ? Math.max(0, Math.round(fteA * monthlyGrowthA + leaversA * (r() < 0.8 ? 1 : 0) + (r() < 0.25 ? 1 : 0) - (r() < 0.2 ? 1 : 0))) : 0;
      if (live) {
        fteA = Math.max(1, fteA + hiresA - leaversA);
        fteB = fteB * (1 + monthlyGrowthB);
      }
      const payRise = Math.pow(1.04, Math.floor(monthsBetween(start, m) / 12));
      const costA = live ? (fteA * d.cost * payRise) / 12 * noise(0.015) : 0;
      const costB = live ? (fteB * d.cost * payRise) / 12 : 0;
      const budgetLive = live && (d.origin !== "acquired" || m >= addMonths(fyStartOf(months[d.from ?? 0]), 12));
      if (live) {
        people.push({ month: m, scenario: "actual", department: d.name, headcount: Math.round(fteA * 1.06), fte: Math.round(fteA * 10) / 10, employment_cost: Math.round(costA * 100) / 100, hires: hiresA, leavers: leaversA, open_roles: Math.max(0, Math.round(fteB - fteA)) });
      }
      if (budgetLive) people.push({ month: m, scenario: "budget", department: d.name, headcount: Math.round(fteB * 1.06), fte: Math.round(fteB * 10) / 10, employment_cost: Math.round(costB * 100) / 100, hires: hiresB, leavers: 0, open_roles: 0 });
      const origin = d.origin ?? "organic";
      const bu = origin === "acquired" ? "Policing & Justice" : origin === "disposed" ? "Education" : null;
      for (const [scenario, cost, ok] of [["actual", costA, live], ["budget", costB, budgetLive]] as const) {
        if (!ok || !cost) continue;
        if (d.direct) {
          for (const s of productShares(m)) push({ month: m, scenario, account_code: "5100", cost_centre_code: d.cc, supplier_id: null, product_key: s.k, business_unit: bu, origin: s.origin, amount: cost * s.share });
        } else push({ month: m, scenario, account_code: "6000", cost_centre_code: d.cc, supplier_id: null, product_key: null, business_unit: bu, origin, amount: cost });
      }
    }
  }

  // non-people spend by supplier, with invoices that sum to the ledger
  let inv = 1;
  for (const s of pr.spend) {
    for (let i = 0; i < n; i++) {
      if ((s.from !== undefined && i < s.from) || (s.until !== undefined && i >= s.until)) continue;
      const m = months[i];
      const t = monthsBetween(start, m) / 12;
      const actual = s.base * Math.pow(1 + s.growth, t) * (s.story?.(i, n) ?? 1) * noise(0.08);
      const fy = fyStartOf(m);
      const budget = s.base * Math.pow(1 + s.growth, monthsBetween(start, fy) / 12) * (1 + (s.budgetGrowth ?? s.growth) * (monthsBetween(fy, m) / 12));
      const sup = s.supplier ? supplierIds.get(s.supplier)! : null;
      const origin = s.origin ?? "organic";
      push({ month: m, scenario: "actual", account_code: s.account, cost_centre_code: s.cc, supplier_id: sup, product_key: s.product ?? null, business_unit: s.bu ?? null, origin, amount: actual });
      if (origin !== "acquired" || m >= addMonths(fyStartOf(months[s.from ?? 0]), 12)) push({ month: m, scenario: "budget", account_code: s.account, cost_centre_code: s.cc, supplier_id: sup, product_key: s.product ?? null, business_unit: s.bu ?? null, origin, amount: budget });
    }
  }
  // one-off migration egress charge (temporary, not structural)
  if (pr.hostingStory) {
    ledger.push({ month: months[n - 3], scenario: "actual", account_code: "5000", cost_centre_code: "CC320", supplier_id: supplierIds.get("northcloud")!, product_key: pr.migration?.to ?? pr.products[0].key, business_unit: "Local Government", origin: "organic", amount: 38_400 });
  }

  // transactions: supplier invoices for every actual supplier row in the last 18 months
  const supplierName = new Map<string, string>(pr.suppliers.map((s) => [supplierIds.get(s.key)!, s.name]));
  const accName = new Map(pr.accounts.map((a) => [a.code, a.name]));
  const recent = new Set(months.slice(-18));
  const grouped = new Map<string, { month: string; account: string; cc: string; supplier: string; amount: number }>();
  for (const l of ledger) {
    if (l.scenario !== "actual" || !l.supplier_id || !recent.has(l.month)) continue;
    const k = `${l.month}|${l.account_code}|${l.cost_centre_code}|${l.supplier_id}`;
    const g = grouped.get(k) ?? { month: l.month, account: l.account_code, cc: l.cost_centre_code, supplier: l.supplier_id, amount: 0 };
    g.amount += l.amount;
    grouped.set(k, g);
  }
  for (const g of grouped.values()) {
    const parts = g.amount > 20_000 ? 3 : g.amount > 5_000 ? 2 : 1;
    let left = Math.round(g.amount * 100);
    for (let j = 0; j < parts; j++) {
      const amt = j === parts - 1 ? left : Math.round((left / (parts - j)) * (0.8 + r() * 0.4));
      left -= amt;
      const day = String(3 + Math.floor(r() * 24)).padStart(2, "0");
      transactions.push({
        posted_on: `${g.month.slice(0, 8)}${day}`, month: g.month, account_code: g.account, cost_centre_code: g.cc, supplier_id: g.supplier,
        reference: `INV-${String(inv++).padStart(6, "0")}`, description: `${supplierName.get(g.supplier)} — ${accName.get(g.account)}`, amount: amt / 100, source_system: "Finance system (purchase ledger)",
      });
    }
  }

  // forecast: actuals to the reforecast point, then the reforecast projection to year end
  const actualByKey = new Map<string, Generated["ledger"][number]>();
  for (const l of ledger) if (l.scenario === "actual") {
    const k = `${l.month}|${l.account_code}|${l.cost_centre_code}|${l.supplier_id}|${l.product_key}|${l.business_unit}|${l.origin}`;
    const x = actualByKey.get(k);
    if (x) x.amount += l.amount; else actualByKey.set(k, { ...l });
  }
  const baseRows = [...actualByKey.values()].filter((l) => l.month === fcBase);
  for (const m of forecastMonths) {
    if (m <= fcBase) {
      for (const l of actualByKey.values()) if (l.month === m) push({ ...l, scenario: "forecast" });
    } else {
      const k = monthsBetween(fcBase, m);
      for (const l of baseRows) push({ ...l, month: m, scenario: "forecast", amount: l.amount * (1 + 0.006 * k) });
    }
  }

  // ---------------------------------------------------------------------------
  // KPIs, reconciliation, data quality, closes
  // ---------------------------------------------------------------------------
  const policy: RetentionPolicy = { window_months: 12, acquired_wait_months: 12, reactivation: "include_in_nrr", transfers: "neutral", adjustments: "exclude", currency: "GBP" };
  const refData = { snapshots: snaps, movements, customers: customers.map((c) => ({ id: c.id, origin: c.origin, acquired_on: c.acquired_on, disposed_on: c.disposed_on })) };
  const ledgerRows = ledger.map((l) => ({ grp: "all", month: l.month, scenario: l.scenario, section: pr.accounts.find((a) => a.code === l.account_code)!.section, line: pr.accounts.find((a) => a.code === l.account_code)!.line, amount: l.amount }));
  const byMonth = new Map<string, typeof ledgerRows>();
  for (const l of ledgerRows) { const x = byMonth.get(l.month) ?? []; x.push(l); byMonth.set(l.month, x); }
  const kpis: Generated["kpis"] = new Map();
  for (let i = 0; i < n; i++) {
    const m = months[i];
    const arr = gbp(refBridge(refData, addMonths(m, -1), m).closing);
    const ret = i >= 12 ? retention(refRetentionInputs(refData, months[i - 12], m, policy), policy) : null;
    const a = pl(byMonth.get(m) ?? [], "actual"), b = pl(byMonth.get(m) ?? [], "budget");
    kpis.set(m, {
      arr, nrr: ret?.nrr ?? null, grr: ret?.grr ?? null, revenue: gbp(a.revenue), grossMargin: a.grossMargin, ebitda: gbp(a.ebitda),
      arrBudget: arrBudget.get(m) ?? arr, revenueBudget: gbp(b.revenue), ebitdaBudget: gbp(b.ebitda), gmBudget: b.grossMargin,
    });
  }

  const budgets: Generated["budgets"] = new Map();
  for (const [m, rows] of [...byMonth.entries()].sort()) {
    if (!rows.some((x) => x.scenario === "budget")) continue;
    const b = pl(rows, "budget");
    budgets.set(m, { revenue: gbp(b.revenue), ebitda: gbp(b.ebitda), grossMargin: b.grossMargin });
  }
  const targets: Generated["targets"] = [];
  for (const [m, v] of arrBudget) targets.push({ domain: "revenue", metric_key: "arr_total", month: m, scenario: "budget", value: v });
  for (const m of months) {
    targets.push({ domain: "revenue", metric_key: "nrr", month: m, scenario: "target", value: pr.targets.nrr });
    targets.push({ domain: "revenue", metric_key: "grr", month: m, scenario: "target", value: pr.targets.grr });
    targets.push({ domain: "cost", metric_key: "gross_margin", month: m, scenario: "target", value: pr.targets.gross_margin });
  }

  const recon: Generated["recon"] = months.map((m, i) => {
    const k = kpis.get(m)!;
    const trailing = months.slice(Math.max(0, i - 11), i + 1).map((x) => kpis.get(x)!.arr);
    const invoiced = Math.round((trailing.reduce((s, v) => s + v, 0) / trailing.length) * noise(0.004));
    const rows = byMonth.get(m) ?? [];
    const recurring = rows.filter((x) => x.scenario === "actual" && x.line === "recurring_revenue").reduce((s, x) => s + x.amount, 0);
    const unexplained = i === n - 4 ? 41_250 : 0;
    const status = i === n - 1 ? "pending" : unexplained ? "unexplained" : "explained";
    return {
      month: m, contractual_arr: k.arr, invoiced_recurring_annualised: invoiced, recognised_recurring_revenue: Math.round(recurring * 100) / 100, recognised_total_revenue: k.revenue,
      explained_difference: k.arr - invoiced - unexplained,
      explanation: status === "pending" ? "Month-end close not complete." : "Timing: renewals invoiced annually in advance; contracts signed but not yet invoiced; billing in arrears for framework call-offs." + (unexplained ? " £41,250 not yet explained." : ""),
      status,
    };
  });

  const unclassified = movements.filter((x) => x.type === "unclassified");
  const dq: Generated["dq"] = [
    { domain: "revenue", check_key: "bridge_reconciles", title: "ARR bridge reconciles every month (opening + movements = closing)", severity: "error", status: "pass", month: null, affected_count: 0, amount: 0, sample: [], source_system: "dbt test: arr_bridge_reconciles", owner_function: "Finance", remediation: "None needed." },
    { domain: "revenue", check_key: "unclassified_movements", title: "ARR changes with an unrecognised reason code", severity: "error", status: unclassified.length ? "fail" : "pass", month: unclassified[0]?.month ?? null, affected_count: unclassified.length, amount: unclassified.reduce((s, x) => s + x.amount, 0), sample: unclassified.slice(0, 5).map((x) => ({ customer_id: x.customer_id, product: x.product_key, amount: x.amount, reason: "AMD-PENDING" })), source_system: "Billing (contract amendments)", owner_function: "Revenue operations", remediation: "Complete the pending contract amendments in billing with a valid reason code (expansion, contraction, migration, correction). The movements are shown as Unclassified until then; they are not reallocated." },
    { domain: "revenue", check_key: "missing_crm_id", title: "Customers without a CRM account id", severity: "warning", status: "warn", month: end, affected_count: 9, amount: null, sample: active.filter((x) => x.sector === "other_public").slice(0, 5).map((x) => ({ customer_id: x.id, name: x.name })), source_system: "Billing ↔ CRM mapping", owner_function: "Revenue operations", remediation: "Link the billing customer to its CRM account. CRM context is unavailable for these customers until then." },
    { domain: "revenue", check_key: "duplicate_customers", title: "Possible duplicate customer records", severity: "warning", status: "warn", month: end, affected_count: 2, amount: null, sample: [{ name: dupOf.name, external_ids: [dupOf.external_id, custOut[custOut.length - 1].external_id] }], source_system: "Billing", owner_function: "Finance", remediation: "Merge the duplicate billing record; the second id holds no ARR, so totals are unaffected." },
    { domain: "revenue", check_key: "inconsistent_sector", title: "Sector differs between billing and CRM", severity: "warning", status: "warn", month: end, affected_count: inconsistent.length, amount: null, sample: inconsistent.map((x) => ({ customer_id: x.id, name: x.name, billing: "housing_association", crm: "local_authority" })), source_system: "Billing ↔ CRM", owner_function: "Revenue operations", remediation: "Agree the sector in the CRM; billing classification is used for reporting until then." },
    { domain: "revenue", check_key: "missing_renewal_date", title: "Active contracts without a renewal date", severity: "warning", status: missingRenewal ? "warn" : "pass", month: end, affected_count: missingRenewal, amount: null, sample: [], source_system: "Billing (contracts)", owner_function: "Commercial operations", remediation: "Record the renewal date in the contract system. Omni OS shows \"not recorded\" and never infers it." },
    { domain: "revenue", check_key: "arr_vs_invoiced", title: "Contractual ARR vs invoiced recurring revenue explained", severity: "warning", status: "warn", month: months[n - 4], affected_count: 1, amount: 41_250, sample: [{ month: months[n - 4], unexplained: 41_250 }], source_system: "Finance reconciliation", owner_function: "Finance", remediation: "Explain or correct the difference in the month-end reconciliation." },
    { domain: "revenue", check_key: "restatement", title: "Historical ARR restated", severity: "info", status: pr.restated ? "warn" : "pass", month: pr.restated ? months[pr.restated.at] : null, affected_count: pr.restated ? 3 : 0, amount: pr.restated?.amount ?? 0, sample: [], source_system: "Billing", owner_function: "Finance", remediation: "Restatement approved and recorded; as-reported figures are kept." },
    { domain: "cost", check_key: "accounts_mapped", title: "Every GL account maps to a P&L line", severity: "error", status: "pass", month: null, affected_count: 0, amount: 0, sample: [], source_system: "dbt test: gl_account_mapping", owner_function: "Finance", remediation: "None needed." },
    { domain: "people", check_key: "people_ledger_agreement", title: "Employment cost in the ledger agrees to the headcount model", severity: "error", status: "pass", month: null, affected_count: 0, amount: 0, sample: [], source_system: "dbt test: payroll_to_gl", owner_function: "Finance", remediation: "None needed." },
    { domain: "cost", check_key: "budget_coverage", title: "Cost centres without a budget", severity: "warning", status: pr.acquisition ? "warn" : "pass", month: pr.acquisition ? months[pr.acquisition.at] : null, affected_count: pr.acquisition ? 1 : 0, amount: null, sample: pr.acquisition ? [{ cost_centre: "CC500", note: "Acquired business: budgeted from the first full financial year after completion" }] : [], source_system: "Budgeting", owner_function: "Finance", remediation: "Budget variances for the acquired business are not shown before its first budget year." },
    { domain: "cost", check_key: "latest_month_close", title: "Latest month still in close", severity: "info", status: "warn", month: end, affected_count: 1, amount: null, sample: [], source_system: "Finance system", owner_function: "Finance", remediation: "Figures for the latest month are provisional until the close is signed off." },
  ];

  const periodStatus: Generated["periodStatus"] = [];
  for (const [i, m] of months.entries()) {
    const unc = unclassified.some((x) => x.month === m);
    periodStatus.push({ domain: "revenue", month: m, status: i === n - 1 ? "provisional" : unc ? "incomplete" : "validated", reason: i === n - 1 ? "Month-end close in progress" : unc ? "Unclassified movements awaiting correction in billing" : null, validated_by: i === n - 1 || unc ? null : "Finance (month-end close)" });
    periodStatus.push({ domain: "cost", month: m, status: i === n - 1 ? "provisional" : "validated", reason: i === n - 1 ? "Month-end close in progress" : null, validated_by: i === n - 1 ? null : "Finance (month-end close)" });
    periodStatus.push({ domain: "people", month: m, status: i === n - 1 ? "provisional" : "validated", reason: i === n - 1 ? "Payroll accruals not final" : null, validated_by: i === n - 1 ? null : "People & Finance" });
  }

  const closes: Generated["closes"] = [];
  const restatements: Generated["restatements"] = [];
  for (const [i, m] of months.entries()) {
    const ps = periodStatus.find((x) => x.domain === "revenue" && x.month === m)!;
    if (ps.status !== "validated") continue;
    const k = kpis.get(m)!;
    const closedAt = new Date(Date.parse(addMonths(m, 1)) + 9 * 86400000).toISOString();
    const over = pr.restated && restatedCustomer.months?.includes(i) ? pr.restated.amount : 0;
    closes.push({ domain: "revenue", month: m, version: 1, metrics: { arr_total: k.arr + over, nrr: k.nrr, grr: k.grr }, closed_at: closedAt });
    if (over) closes.push({ domain: "revenue", month: m, version: 2, metrics: { arr_total: k.arr, nrr: k.nrr, grr: k.grr }, closed_at: new Date(Date.parse(addMonths(months[pr.restated!.at], 4))).toISOString() });
    const cs = periodStatus.find((x) => x.domain === "cost" && x.month === m)!;
    if (cs.status === "validated") closes.push({ domain: "cost", month: m, version: 1, metrics: { revenue: k.revenue, gross_margin: k.grossMargin, ebitda: k.ebitda }, closed_at: closedAt });
  }
  if (pr.restated && restatedCustomer.c) {
    const ms = restatedCustomer.months!.map((i) => months[i]);
    restatements.push({
      domain: "revenue", month: ms[0], subject: `customer:${restatedCustomer.c.id}`,
      reason: `ARR for ${restatedCustomer.c.name} was overstated by £${pr.restated.amount.toLocaleString("en-GB")} for three months: a contract amendment was keyed twice in billing. History corrected in the source system and the governed model re-run.`,
      previous: Object.fromEntries(ms.map((m) => [m, { arr_total: kpis.get(m)!.arr + pr.restated!.amount }])), current: Object.fromEntries(ms.map((m) => [m, { arr_total: kpis.get(m)!.arr }])),
      approved_by: "Chief Financial Officer", restated_at: new Date(Date.parse(addMonths(ms[0], 4))).toISOString(),
    });
  }

  // CRM sandbox: accounts and upcoming renewals (the analytical layer links to these)
  const health = (c: Cust) => {
    const recent = movements.filter((x) => x.customer_id === c.id && x.month > addMonths(end, -12) && (x.type === "contraction" || x.type === "churn"));
    return recent.length >= 1 ? (c.sector === "police" ? "red" : "amber") : r() < 0.08 ? "amber" : "green";
  };
  const crmAccounts: Generated["crm"]["accounts"] = [];
  const opps: Generated["crm"]["opportunities"] = [];
  let oppN = 1;
  for (const c of customers) {
    if (!c.crm_id || sumArrAt(endSnap, c.id) === 0) continue;
    const ct = contracts.find((x) => x.customer_id === c.id);
    crmAccounts.push({ external_id: c.crm_id, name: c.name, segment: inconsistent.includes(c) ? "local_authority" : c.sector, owner_name: c.account_owner, arr: sumArrAt(endSnap, c.id), health: health(c), renewal_date: ct?.renewal_date ?? null });
    if (ct?.renewal_date && monthsBetween(end, ct.renewal_date) <= 6) {
      const ageDays = Math.floor(r() * 50);
      opps.push({
        external_id: `OPP-${oppN++}`, account_external_id: c.crm_id, name: `${c.name} — renewal`, stage: pick(r, ["Renewal: discovery", "Renewal: proposal", "Renewal: negotiation"]),
        amount: sumArrAt(endSnap, c.id), segment: c.sector, source: "Renewal", owner_name: c.account_owner,
        created_on: addDaysIso(end, -90), close_date: ct.renewal_date, last_activity_on: addDaysIso(addMonths(end, 1), -ageDays),
      });
    }
  }

  return {
    coverage: { start, end },
    products: pr.products.map((x) => ({ key: x.key, name: x.name, business_unit: x.group, family: x.group })),
    customers: custOut, snapshots: snaps, movements, cohorts, contracts,
    costCentres: costCentresOf(pr),
    suppliers: pr.suppliers.map((s) => ({ id: supplierIds.get(s.key)!, name: s.name, category: s.category, origin: s.origin ?? "organic", contract_end: s.contract_end === undefined ? null : addMonths(end, s.contract_end) })),
    ledger, transactions, people, targets, recon, dq, periodStatus, closes, restatements,
    crm: { accounts: crmAccounts, opportunities: opps }, kpis, budgets,
    datasets: [
      { key: "fct_arr_monthly", domain: "revenue", label: "Customer × product ARR (month end)", source_system: "Billing", model: "fct_arr_monthly", row_count: snaps.length, coverage_start: start, coverage_end: end },
      { key: "fct_arr_movements", domain: "revenue", label: "Classified ARR movements", source_system: "Billing → dbt", model: "fct_arr_movements", row_count: movements.length, coverage_start: start, coverage_end: end },
      { key: "dim_customer", domain: "revenue", label: "Customers and cohorts", source_system: "Billing + CRM", model: "dim_customer", row_count: custOut.length, coverage_start: start, coverage_end: end },
      { key: "fct_gl_monthly", domain: "cost", label: "General ledger (monthly, by account, cost centre, supplier)", source_system: "Finance system", model: "fct_gl_monthly", row_count: ledger.length, coverage_start: start, coverage_end: fyEnd },
      { key: "fct_gl_transactions", domain: "transactions", label: "Purchase-ledger transactions (last 18 months)", source_system: "Finance system", model: "fct_gl_transactions", row_count: transactions.length, coverage_start: months[Math.max(0, n - 18)], coverage_end: end },
      { key: "fct_headcount_monthly", domain: "people", label: "Departmental headcount and employment cost", source_system: "HR and payroll (aggregated)", model: "fct_headcount_monthly", row_count: people.length, coverage_start: start, coverage_end: end },
      { key: "fct_targets", domain: "shared", label: "Budgets and targets", source_system: "Budgeting", model: "fct_targets", row_count: targets.length, coverage_start: start, coverage_end: fyEnd },
      { key: "fct_reconciliation", domain: "revenue", label: "ARR, invoiced and recognised revenue reconciliation", source_system: "Finance", model: "fct_reconciliation", row_count: recon.length, coverage_start: start, coverage_end: end },
    ],
  };
}

function sumArr(c: { arr: Map<string, number> }) {
  let s = 0;
  for (const v of c.arr.values()) s += v;
  return s;
}
function sumArrAt(m: Map<string, Map<string, number>>, cid: string) {
  let s = 0;
  for (const v of m.get(cid)?.values() ?? []) s += v;
  return s;
}
function addDaysIso(iso: string, d: number) {
  return new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);
}
function costCentresOf(pr: Profile): Generated["costCentres"] {
  const out: Generated["costCentres"] = [{ code: "CC010", name: "Revenue", department: "Revenue", function: "Revenue", business_unit: null, location: "Head office" }];
  for (const d of pr.depts) out.push({ code: d.cc, name: d.name, department: d.name, function: d.fn, business_unit: d.origin === "acquired" ? "Policing & Justice" : d.origin === "disposed" ? "Education" : null, location: d.location });
  return out;
}

export { p as pence, CALC_VERSION };
