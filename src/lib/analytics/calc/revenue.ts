// Deterministic reference calculations for recurring revenue. In production the
// classification and aggregation run in dbt; these functions define the expected results,
// are unit-tested, act as the synthetic pipeline's "dbt", and check the governed query
// interface. Money is handled in integer pence to keep reconciliations exact.
import { CALC_VERSION, MOVEMENT_GROUP, MOVEMENT_TYPES, REASON_RULES, type ArrMonthlyRow, type CustomerAttrs, type MovementRow, type MovementTotal, type MovementType, type RetentionInputs, type RetentionPolicy } from "../contracts";
import { addMonths } from "../period";

export const p = (pounds: number | string | null | undefined) => Math.round(Number(pounds ?? 0) * 100);
export const gbp = (pence: number) => pence / 100;

// ---------------------------------------------------------------------------
// Movement classification (the dbt model fct_arr_movements)
// ---------------------------------------------------------------------------
/**
 * Classify month-on-month changes at customer × product grain.
 *  1. A source reason code (migration, transfer, correction, reclassification, acquisition,
 *     disposal) decides the type; an unknown code is "unclassified" — never guessed.
 *  2. Otherwise churn, new and reactivation are customer-level events: the customer's total
 *     ARR went to zero, or from zero (first time = new; again = reactivation).
 *  3. Otherwise increases are expansion and decreases contraction — including moving onto
 *     or off a product while the customer stays.
 * The first month of coverage is the opening position and has no movements.
 */
export function classifyMovements(rows: ArrMonthlyRow[], opts: { calcVersion?: string; firstMonth?: string } = {}): MovementRow[] {
  const byCust = new Map<string, Map<string, Map<string, { arr: number; reason: string | null }>>>();
  let first = opts.firstMonth ?? "9999-12-01";
  let globalLast = "0000-01-01";
  for (const r of rows) {
    if (!opts.firstMonth && r.month < first) first = r.month;
    if (r.month > globalLast) globalLast = r.month;
    let m = byCust.get(r.customer_id);
    if (!m) byCust.set(r.customer_id, (m = new Map()));
    let pm = m.get(r.month);
    if (!pm) m.set(r.month, (pm = new Map()));
    pm.set(r.product_key, { arr: p(r.arr), reason: r.change_reason ?? null });
  }
  const out: MovementRow[] = [];
  const calc_version = opts.calcVersion ?? CALC_VERSION;
  for (const [cid, months] of byCust) {
    // run to the end of coverage: a customer without a row has no ARR (an untagged drop is churn)
    const last = globalLast;
    let everHad = false;
    // positions before coverage count as history
    const firstState = months.get(first);
    if (firstState && [...firstState.values()].some((v) => v.arr > 0)) everHad = true;
    let prev = firstState ?? new Map<string, { arr: number; reason: string | null }>();
    for (let m = addMonths(first, 1); m <= last; m = addMonths(m, 1)) {
      const cur = months.get(m) ?? new Map<string, { arr: number; reason: string | null }>();
      const P = [...prev.values()].reduce((s, v) => s + v.arr, 0);
      const C = [...cur.values()].reduce((s, v) => s + v.arr, 0);
      const products = new Set([...prev.keys(), ...cur.keys()]);
      for (const prod of [...products].sort()) {
        const before = prev.get(prod)?.arr ?? 0;
        const after = cur.get(prod)?.arr ?? 0;
        const d = after - before;
        if (d === 0) continue;
        const reason = cur.get(prod)?.reason ?? null;
        let type: MovementType;
        let rule: string;
        if (reason && REASON_RULES[reason]) {
          type = REASON_RULES[reason].type;
          rule = `reason:${reason}`;
        } else if (reason) {
          type = "unclassified";
          rule = `unknown_reason:${reason}`;
        } else if (P === 0 && C > 0) {
          type = everHad ? "reactivation" : "new";
          rule = everHad ? "customer_returns_from_zero" : "customer_first_arr";
        } else if (P > 0 && C === 0) {
          type = "churn";
          rule = "customer_total_to_zero";
        } else {
          type = d > 0 ? "expansion" : "contraction";
          rule = d > 0 ? "existing_customer_increase" : "existing_customer_decrease";
        }
        out.push({ month: m, customer_id: cid, product_key: prod, type, amount: gbp(d), rule_key: rule, calc_version });
      }
      if (C > 0) everHad = true;
      prev = cur;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------
export type TypeTotals = Record<MovementType, number>; // pence
export const zeroTotals = (): TypeTotals => Object.fromEntries(MOVEMENT_TYPES.map((t) => [t, 0])) as TypeTotals;

export function sumByType(rows: Array<Pick<MovementTotal, "type" | "amount">>): TypeTotals {
  const t = zeroTotals();
  for (const r of rows) t[r.type] += p(r.amount);
  return t;
}

export interface BridgeItem { type: MovementType; amount: number }
export interface Bridge {
  opening: number;
  items: BridgeItem[];
  closing: number;
  /** opening + Σ movements */
  computed: number;
  /** closing − computed; zero when the bridge reconciles */
  difference: number;
  reconciles: boolean;
  organic: number;
  inorganic: number;
  adjustments: number;
  unclassified: number;
}

/** Opening + New + Expansion − Contraction − Churn + Reactivation + Acquired − Disposed ± adjustments = Closing (all pence). */
export function bridge(opening: number, totals: TypeTotals, closing: number): Bridge {
  const items = MOVEMENT_TYPES.map((type) => ({ type, amount: totals[type] }));
  const sumOf = (g: string) => items.filter((i) => MOVEMENT_GROUP[i.type] === g).reduce((s, i) => s + i.amount, 0);
  const computed = opening + items.reduce((s, i) => s + i.amount, 0);
  return {
    opening, items, closing, computed, difference: closing - computed, reconciles: closing === computed,
    organic: sumOf("organic"), inorganic: sumOf("inorganic"), adjustments: sumOf("adjustment"), unclassified: sumOf("unclassified"),
  };
}

/** Organic growth excludes acquisitions, disposals and data adjustments. */
export function organicGrowth(b: Bridge): number | null {
  return b.opening > 0 ? b.organic / b.opening : null;
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------
export interface Retention {
  opening: number;
  grr: number | null;
  nrr: number | null;
  logoRetention: number | null;
  expansion: number;
  contraction: number;
  churn: number;
  reactivation: number;
  transfer: number;
  /** opening + every cohort movement = cohort ARR at the end */
  reconciles: boolean;
}

/** GRR = (O − contraction − churn) / O; NRR = (O + expansion − contraction − churn) / O, under the governed policy. */
export function retention(r: RetentionInputs, policy: RetentionPolicy): Retention {
  const O = p(r.opening_arr);
  const exp = p(r.expansion), con = p(r.contraction), chu = p(r.churn), rea = p(r.reactivation), tr = p(r.transfer);
  const transferLoss = policy.transfers === "count_as_churn" ? Math.min(tr, 0) : 0;
  const lost = con + chu + transferLoss; // negative
  const reactivation = policy.reactivation === "include_in_nrr" ? rea : 0;
  const all = exp + con + chu + rea + tr + p(r.migration) + p(r.adjustment);
  return {
    opening: O,
    grr: O > 0 ? (O + lost) / O : null,
    nrr: O > 0 ? (O + exp + lost + reactivation) / O : null,
    logoRetention: r.opening_logos > 0 ? r.end_logos / r.opening_logos : null,
    expansion: exp, contraction: con, churn: chu, reactivation: rea, transfer: tr,
    reconciles: O + all === p(r.end_arr),
  };
}

// ---------------------------------------------------------------------------
// Independent reference implementations (used by tests and the synthetic pipeline)
// ---------------------------------------------------------------------------
export interface RefData {
  snapshots: ArrMonthlyRow[];
  movements: MovementRow[];
  customers: CustomerAttrs[];
}

export function indexSnapshots(rows: ArrMonthlyRow[]) {
  const at = new Map<string, Map<string, number>>(); // month → customer → pence
  for (const r of rows) {
    let m = at.get(r.month);
    if (!m) at.set(r.month, (m = new Map()));
    m.set(r.customer_id, (m.get(r.customer_id) ?? 0) + p(r.arr));
  }
  return at;
}

export function refArrTotal(idx: ReturnType<typeof indexSnapshots>, month: string, include?: (cid: string) => boolean) {
  let s = 0;
  for (const [cid, v] of idx.get(month) ?? []) if (!include || include(cid)) s += v;
  return s;
}

/** Customer-grain movement totals with expansion/contraction netted per customer and month. */
export function refMovementTotals(movements: MovementRow[], from: string, to: string, include?: (cid: string) => boolean): TypeTotals {
  const flex = new Map<string, number>();
  const t = zeroTotals();
  for (const m of movements) {
    if (m.month <= from || m.month > to || (include && !include(m.customer_id))) continue;
    if (m.type === "expansion" || m.type === "contraction" || m.type === "migration") {
      const k = `${m.customer_id}|${m.month}`;
      flex.set(k, (flex.get(k) ?? 0) + p(m.amount));
    } else t[m.type] += p(m.amount);
  }
  for (const v of flex.values()) if (v > 0) t.expansion += v; else t.contraction += v;
  return t;
}

export function refBridge(d: RefData, from: string, to: string, include?: (cid: string) => boolean): Bridge {
  const idx = indexSnapshots(d.snapshots);
  return bridge(refArrTotal(idx, from, include), refMovementTotals(d.movements, from, to, include), refArrTotal(idx, to, include));
}

export function refRetentionInputs(d: RefData, start: string, end: string, policy: RetentionPolicy, include?: (cid: string) => boolean): RetentionInputs {
  const idx = indexSnapshots(d.snapshots);
  const wait = addMonths(start, -policy.acquired_wait_months);
  const eligible = new Set(
    d.customers
      .filter((c) => (!include || include(c.id)) && (!c.acquired_on || c.acquired_on <= wait) && !(c.disposed_on && c.disposed_on > start && c.disposed_on <= end))
      .map((c) => c.id),
  );
  const open = idx.get(start) ?? new Map();
  const cohort = new Set([...open].filter(([cid, v]) => v > 0 && eligible.has(cid)).map(([cid]) => cid));
  const opening = [...cohort].reduce((s, cid) => s + open.get(cid)!, 0);
  const t = refMovementTotals(d.movements, start, end, (cid) => cohort.has(cid));
  const endIdx = idx.get(end) ?? new Map();
  const endArr = [...cohort].reduce((s, cid) => s + (endIdx.get(cid) ?? 0), 0);
  const adjustment = t.new + t.acquired + t.disposed + t.correction + t.reclassification + t.unclassified;
  return {
    grp: "all", opening_arr: gbp(opening), opening_logos: cohort.size,
    expansion: gbp(t.expansion), contraction: gbp(t.contraction), churn: gbp(t.churn), reactivation: gbp(t.reactivation),
    transfer: gbp(t.transfer), migration: gbp(t.migration), adjustment: gbp(adjustment),
    end_arr: gbp(endArr), end_logos: [...cohort].filter((cid) => (endIdx.get(cid) ?? 0) > 0).length,
  };
}

/** Cohort matrix: revenue and logo retention by age (in months) for customers grouped by a key. */
export function refCohortMatrix(d: RefData, cohorts: Array<{ customer_id: string; cohort_month: string; key: string }>, last: string, stepMonths: number) {
  const idx = indexSnapshots(d.snapshots);
  const cells = new Map<string, { cohort: string; age: number; members: number; initial: number; arr: number; active: number }>();
  for (const c of cohorts) {
    const initial = idx.get(c.cohort_month)?.get(c.customer_id) ?? 0;
    if (initial <= 0) continue;
    for (let age = 0; addMonths(c.cohort_month, age * stepMonths) <= last; age++) {
      const v = idx.get(addMonths(c.cohort_month, age * stepMonths))?.get(c.customer_id) ?? 0;
      const k = `${c.key}|${age}`;
      const cell = cells.get(k) ?? { cohort: c.key, age, members: 0, initial: 0, arr: 0, active: 0 };
      cell.members += 1;
      cell.initial += initial;
      cell.arr += v;
      if (v > 0) cell.active += 1;
      cells.set(k, cell);
    }
  }
  return [...cells.values()];
}
