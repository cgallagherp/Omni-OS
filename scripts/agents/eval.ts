// Agent evaluation. Two parts:
//  1. Scenario checks — fixed cases with known right answers for the decision logic each
//     agent relies on (authority caps, escalation targets, materiality, dedupe/exclusion,
//     unknown financials, no figures in external drafts). Any failure exits non-zero.
//  2. Operating quality from the ledger (local or configured database, service role,
//     offline script only): approval acceptance, response rates, time to resolution,
//     failures and outcomes per agent — activity reported separately from results.
//
//   npm run agents:eval            # scenarios + every company
//   npm run agents:eval -- --offline
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { AGENT_KEYS, AGENTS, modeFor } from "../../src/lib/agents/registry";
import { assessKpi } from "../../src/lib/agents/analysis/ceo";
import { assessPipeline } from "../../src/lib/agents/analysis/commercial";
import { approachDraft, scoreFit, screen, type Candidate, type Thesis } from "../../src/lib/agents/analysis/ma";

config({ path: ".env.local" });

type Case = { agent: string; name: string; pass: () => boolean };
const ref = { type: "x", id: "x", label: "x", path: "/" };
const thesis: Thesis = { id: "t", title: "t", sectors: ["Fire safety"], keywords: ["fire"], geographies: ["Wales"], min_revenue: 1e6, max_revenue: 2e7, min_ebitda: 2e5, ownership_preferences: ["Founder-owned"], exclusions: ["administration"], fit_threshold: 60 };
const cand = (o: Partial<Candidate>): Candidate => ({ sourceId: "s", source: "s", name: "Co", registrationNumber: null, website: null, sector: "Fire safety", geography: "Wales", description: "fire alarm maintenance", ownership: "Founder-owned", revenue: 5e6, ebitda: 5e5, employees: 10, financialsSource: "x", ...o });
const kpi = (values: number[], status: string[], extra = {}) =>
  assessKpi({ today: "2026-10-28", metric: { id: "m", name: "Gross margin", unit: "percent", category: "financial", comparable_key: null, direction: "higher_is_better", owner_name: "A" }, points: values.map((v, k) => ({ period: `2026-0${k + 1}-01`, value: v, target: 32, status: status[k] })), fmt: String, links: [], related: [], correctiveActions: [], issues: [], northStar: null, financial: null, metricRef: ref, ...extra });

const CASES: Case[] = [
  { agent: "all", name: "Level 5 categories can never be automatic", pass: () => (["propose_issue", "commitment_change", "material_crm_change", "external_communication"] as const).every((c) => modeFor({ enabled: true, category_modes: { [c]: "auto" } }, c) === "approval") },
  { agent: "all", name: "Commercial terms are always off", pass: () => modeFor({ enabled: true, category_modes: { commercial_terms: "auto" } }, "commercial_terms") === "off" },
  { agent: "ceo", name: "One off-track period is not material", pass: () => !kpi([33, 30], ["on_track", "off_track"]).material },
  { agent: "ceo", name: "Two consecutive off-track periods are material", pass: () => kpi([33, 30, 29], ["on_track", "off_track", "off_track"]).material },
  { agent: "ceo", name: "No duplicate intervention when one is agreed", pass: () => !kpi([30, 29], ["off_track", "off_track"], { correctiveActions: [{ id: "a", title: "a", due_date: null, status: "open", ref }] }).needsIntervention },
  { agent: "ceo", name: "Non-commercial KPI is not sent to the Commercial Agent", pass: () => !kpi([30, 29], ["off_track", "off_track"]).delegateTo.includes("commercial") },
  { agent: "commercial", name: "Active, in-date deals are not flagged", pass: () => assessPipeline({ today: "2026-10-28", crmLabel: "c", coverage: null, fmtMoney: String, opportunities: [{ id: "1", externalId: "1", name: "d", account: null, stage: "s", status: "open", amount: 1, segment: null, source: null, owner: null, createdOn: "2026-09-01", closeDate: "2026-12-01", closedOn: null, lastActivityOn: "2026-10-27" }] }).flagged.length === 0 },
  { agent: "commercial", name: "Closed deals are never flagged", pass: () => assessPipeline({ today: "2026-10-28", crmLabel: "c", coverage: null, fmtMoney: String, opportunities: [{ id: "1", externalId: "1", name: "d", account: null, stage: "s", status: "lost", amount: 1, segment: null, source: null, owner: null, createdOn: "2026-01-01", closeDate: "2026-02-01", closedOn: "2026-02-01", lastActivityOn: "2026-02-01" }] }).flagged.length === 0 },
  { agent: "ma", name: "Unknown financials score nothing", pass: () => scoreFit(thesis, cand({ revenue: null, ebitda: null }), String).criteria.filter((c) => c.key === "revenue" || c.key === "ebitda").every((c) => c.result === "unknown") },
  { agent: "ma", name: "Exclusions override a high score", pass: () => screen(thesis, [cand({ description: "fire alarm maintenance; entered administration" })], [], String).shortlist.length === 0 },
  { agent: "ma", name: "Previously rejected companies are not re-proposed", pass: () => screen(thesis, [cand({ name: "Beacon Ltd" })], [{ normalized_name: "beacon", name: "Beacon", stage: "rejected", rejection_reason: "x", registration_number: null }], String).screened[0].outcome === "previously_rejected" },
  { agent: "ma", name: "Out-of-region companies are not shortlisted", pass: () => screen(thesis, [cand({ geography: "Kent" })], [], String).shortlist.length === 0 },
  { agent: "ma", name: "External drafts contain no figures or offers", pass: () => !/£|\d+%|offer|valuation/i.test(approachDraft("A", { name: "B", sector: "Fire safety", geography: "Wales", criteria: [] }).body) },
];

async function live() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return console.log("\n(no database configured — skipping operating-quality report)");
  const db = createClient<Database>(url, key, { auth: { persistSession: false } });
  const { data: companies } = await db.from("companies").select("id, name").order("name");
  for (const c of companies ?? []) {
    const [{ data: inv }, { data: aps }, { data: msgs }, { data: runs }] = await Promise.all([
      db.from("agent_investigations").select("agent_key, status, opened_at, resolved_at, outcome").eq("company_id", c.id),
      db.from("agent_approvals").select("agent_key, status").eq("company_id", c.id),
      db.from("agent_messages").select("agent_key, responded_at").eq("company_id", c.id),
      db.from("agent_runs").select("agent_key, status, attempts").eq("company_id", c.id),
    ]);
    if (!inv?.length) continue;
    console.log(`\n${c.name}`);
    for (const k of AGENT_KEYS) {
      const i = inv.filter((x) => x.agent_key === k);
      if (!i.length) continue;
      const a = (aps ?? []).filter((x) => x.agent_key === k);
      const decided = a.filter((x) => x.status !== "pending");
      const accepted = decided.filter((x) => ["approved", "executed"].includes(x.status));
      const m = (msgs ?? []).filter((x) => x.agent_key === k);
      const resolved = i.filter((x) => x.resolved_at);
      const hours = resolved.map((x) => (Date.parse(x.resolved_at!) - Date.parse(x.opened_at)) / 3600000);
      const failed = (runs ?? []).filter((x) => x.agent_key === k && x.status === "failed").length;
      const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
      console.log(`  ${AGENTS[k].name.padEnd(22)} activity: ${i.length} cases, ${a.length} proposals, ${m.length} messages · quality: ${pct(accepted.length, decided.length)} of decided proposals accepted, ${pct(m.filter((x) => x.responded_at).length, m.length)} messages answered, ${failed} failed runs · results: ${resolved.length} resolved${hours.length ? `, median ${Math.round(hours.sort((x, y) => x - y)[Math.floor(hours.length / 2)])}h to resolve` : ""}`);
    }
  }
}

async function main() {
  let failed = 0;
  console.log("Scenario checks");
  for (const c of CASES) {
    let ok = false;
    try { ok = c.pass(); } catch { ok = false; }
    if (!ok) failed++;
    console.log(`  ${ok ? "✓" : "✗"} [${c.agent}] ${c.name}`);
  }
  console.log(`  ${CASES.length - failed}/${CASES.length} passed`);
  if (!process.argv.includes("--offline")) await live();
  process.exit(failed ? 1 : 0);
}
main();
