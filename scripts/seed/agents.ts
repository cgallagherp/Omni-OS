// Agentic layer demo data: agent principals, configurations, sandbox connections,
// a sandbox CRM (Clinara) and an approved acquisition thesis with a sandbox
// market-intelligence dataset (Kestrel). All fictional.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { ensureAgentPrincipal } from "../../src/lib/agents/principal";
import { AGENT_KEYS, defaultConfig, type AgentKey, type Category, type Mode } from "../../src/lib/agents/registry";
import { TODAY, addDays, iso, rng } from "./lib";

type Db = SupabaseClient<Database>;

async function ins<T extends keyof Database["public"]["Tables"]>(db: Db, table: T, rows: Database["public"]["Tables"][T]["Insert"][]) {
  if (!rows.length) return [] as Database["public"]["Tables"][T]["Row"][];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from(table) as any).insert(rows).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as Database["public"]["Tables"][T]["Row"][];
}

/** Which agents each demo company has switched on, and the autonomy management has granted. */
const DEMO: Record<string, Partial<Record<AgentKey, { enabled: boolean; modes?: Partial<Record<Category, Mode>> }>>> = {
  // Clinara has given the Execution Agent Level 4 autonomy for routine follow-ups and escalations.
  clinara: {
    execution: { enabled: true, modes: { internal_followup: "auto", escalation: "auto", internal_task: "approval" } },
    ceo: { enabled: true },
    commercial: { enabled: true, modes: { internal_task: "approval" } },
  },
  // Kestrel keeps follow-ups approval-gated and lets the M&A Agent maintain its own pipeline.
  kestrel: {
    execution: { enabled: true },
    ceo: { enabled: true },
    ma: { enabled: true, modes: { pipeline_update: "auto", internal_task: "approval" } },
  },
  // Ashworth: conservative defaults (agents off) — the first 100 days.
  ashworth: {},
};

export async function seedAgents(db: Db, cid: string, slug: string, ceoUserId: string) {
  await ensureAgentPrincipal(db, cid, slug);
  const conns = await ins(db, "integration_connections", [
    { company_id: cid, provider: "omni_inbox", display_name: "Omni OS inbox", mode: "live", status: "connected", scopes: ["messages.send"], connected_by: ceoUserId },
    ...(slug === "clinara" ? [{ company_id: cid, provider: "crm_sandbox", display_name: "Sandbox CRM (fictional data)", mode: "sandbox", status: "connected", scopes: ["opportunities.read", "accounts.read", "tasks.write"], connected_by: ceoUserId }] : []),
    ...(slug === "kestrel" ? [{ company_id: cid, provider: "ma_sandbox", display_name: "Sandbox market-intelligence dataset (fictional)", mode: "sandbox", status: "connected", scopes: ["companies.search"], connected_by: ceoUserId }] : []),
  ]);
  const byProvider = new Map(conns.map((c) => [c.provider, c.id]));
  const demo = DEMO[slug] ?? {};
  for (const agent of AGENT_KEYS) {
    const d = defaultConfig(agent);
    const want = demo[agent];
    const allowed = [byProvider.get("omni_inbox"), agent === "commercial" ? byProvider.get("crm_sandbox") : undefined, agent === "ma" ? byProvider.get("ma_sandbox") : undefined].filter(Boolean) as string[];
    await ins(db, "agent_configs", [{
      company_id: cid, agent_key: agent, enabled: want?.enabled ?? false,
      category_modes: { ...d.category_modes, ...(want?.modes ?? {}) }, approvers: {}, schedules: d.schedules, escalation: d.escalation, limits: d.limits,
      notifications: d.notifications, allowed_connections: allowed, instructions: "", allow_external_ai: false, updated_by: ceoUserId,
    }]);
  }
  if (slug === "clinara") await seedCrm(db, cid);
}

// --- Clinara sandbox CRM -------------------------------------------------------
const SEGMENTS = ["Enterprise groups", "Veterinary", "Dental", "Physio"] as const;
const SOURCES = ["Inbound", "Outbound", "Partner", "Events"] as const;
const OWNERS = ["Ellie Morgan", "Josh Patel", "Hannah Reid", "Leo Brooks"];
const STAGES = ["Discovery", "Solution fit", "Proposal", "Negotiation"] as const;
const NAMES = ["Northfield", "Brightpaws", "Harbour", "Meadow", "Riverside", "Oakwood", "Kingsway", "Highland", "Elm Park", "Castlegate", "Greenacre", "Westbrook", "Fairview", "Stonebridge", "Ashgrove", "Lakeside", "Millbrook", "Hillcrest", "Rosewood", "Seaview", "Thornbury", "Willowdale", "Brookside", "Parkside", "Redhill", "Silverdale", "Bramley", "Foxley", "Hawthorn", "Larkspur"];
const SUFFIX: Record<(typeof SEGMENTS)[number], string> = { "Enterprise groups": "Healthcare Group", Veterinary: "Vets", Dental: "Dental", Physio: "Physio" };

async function seedCrm(db: Db, cid: string) {
  const r = rng(2026);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const accounts = await ins(db, "crm_sandbox_accounts", NAMES.map((n, i) => {
    const segment = SEGMENTS[i % 4];
    const red = i % 9 === 4;
    return {
      company_id: cid, external_id: `ACC-${1000 + i}`, name: `${n} ${SUFFIX[segment]}`, segment, owner_name: OWNERS[i % 4],
      arr: Math.round((segment === "Enterprise groups" ? 180000 : 24000) * (0.6 + r())), health: red ? "red" : i % 5 === 1 ? "amber" : "green",
      renewal_date: iso(addDays(TODAY, red ? 30 + i : 40 + Math.floor(r() * 300))),
    };
  }));
  const opps: Database["public"]["Tables"]["crm_sandbox_opportunities"]["Insert"][] = [];
  let n = 0;
  // closed history (last 12 months): enterprise converts slower and less often
  for (let i = 0; i < 34; i++) {
    const a = accounts[i % accounts.length];
    const ent = a.segment === "Enterprise groups";
    const created = addDays(TODAY, -(60 + Math.floor(r() * 300)));
    const cycle = ent ? 95 + Math.floor(r() * 60) : 35 + Math.floor(r() * 30);
    const won = r() < (ent ? 0.32 : 0.45);
    opps.push({
      company_id: cid, external_id: `OPP-${2000 + n++}`, account_id: a.id, name: `${a.name} — ${ent ? "group rollout" : "practice licence"}`, stage: won ? "Closed won" : "Closed lost",
      status: won ? "won" : "lost", amount: Math.round((ent ? 160000 : 18000) * (0.5 + r())), segment: a.segment, source: pick(SOURCES), owner_name: a.owner_name,
      created_on: iso(created), close_date: iso(addDays(created, cycle)), closed_on: iso(addDays(created, cycle)), last_activity_on: iso(addDays(created, cycle)),
    });
  }
  // open pipeline: enterprise deals have gone quiet and slipped
  for (let i = 0; i < 36; i++) {
    const a = accounts[(i * 7) % accounts.length];
    const ent = a.segment === "Enterprise groups";
    const stale = ent ? i % 3 !== 0 : i % 7 === 0;
    const slipped = ent && i % 4 === 1;
    const created = addDays(TODAY, -(20 + Math.floor(r() * 120)));
    opps.push({
      company_id: cid, external_id: `OPP-${2000 + n++}`, account_id: a.id, name: `${a.name} — ${ent ? "group rollout" : i % 2 ? "practice licence" : "payments add-on"}`,
      stage: STAGES[Math.min(3, Math.floor(r() * 4))], status: "open", amount: Math.round((ent ? 150000 : 16000) * (0.5 + r())), segment: a.segment,
      source: ent ? (i % 2 ? "Outbound" : "Events") : pick(SOURCES), owner_name: a.owner_name, created_on: iso(created),
      close_date: iso(slipped ? addDays(TODAY, -(5 + (i % 20))) : addDays(TODAY, 15 + Math.floor(r() * 110))),
      last_activity_on: iso(addDays(TODAY, -(stale ? 24 + Math.floor(r() * 30) : Math.floor(r() * 10)))),
    });
  }
  await ins(db, "crm_sandbox_opportunities", opps);
}

// --- Kestrel acquisition thesis and sandbox market dataset ----------------------
export async function seedMa(db: Db, cid: string, approverId: string, leadCrewId: string) {
  const [thesis] = await ins(db, "ma_theses", [{
    company_id: cid,
    title: "Regional fire & life-safety compliance businesses",
    rationale: "Four integrated acquisitions adding £16m revenue (Three-Year Outcome). Add regional density outside the Midlands and South, with planned-maintenance contracts that convert onto the Kestrel platform.",
    sectors: ["Fire safety", "Life safety", "Security systems"],
    keywords: ["fire", "alarm", "sprinkler", "extinguisher", "emergency lighting", "suppression"],
    geographies: ["North East England", "North West England", "Yorkshire", "Scotland", "Wales"],
    min_revenue: 3_000_000, max_revenue: 25_000_000, min_ebitda: 400_000, max_ev: 30_000_000,
    ownership_preferences: ["Founder-owned", "Family-owned"],
    exclusions: ["residential only", "insolvency", "administration"],
    integration_requirements: "Engineers on PAYE (not subcontract); maintenance contracts transferable; field-service data migratable to Kestrel FSM.",
    fit_threshold: 60, status: "approved", approved_by: approverId, approved_at: addDays(TODAY, -40).toISOString(),
  }]);
  // existing pipeline: one in diligence, one previously rejected
  await ins(db, "ma_targets", [
    { company_id: cid, thesis_id: thesis.id, name: "Aquila Fire Protection", normalized_name: "aquila fire protection", source: "Management", sector: "Fire safety", geography: "North West England", stage: "diligence", owner_crew_id: leadCrewId, revenue: 6_800_000, ebitda: 1_050_000, financials_source: "Management accounts FY2025 (in data room)", fit_score: 82 },
    { company_id: cid, thesis_id: thesis.id, name: "Beacon Alarms", normalized_name: "beacon alarms", source: "Broker", sector: "Security systems", geography: "Yorkshire", stage: "rejected", rejection_reason: "Mostly residential installations", fit_score: 41 },
  ]);
  const C = (name: string, geography: string, sector: string, description: string, ownership: string, revenue: number | null, ebitda: number | null, employees: number | null, reg: string, year: number | null = 2025) =>
    ({ company_id: cid, name, registration_number: reg, website: `https://${name.toLowerCase().replace(/[^a-z]+/g, "")}.example`, sector, geography, description, ownership, revenue, ebitda, employees, financials_year: revenue ? year : null });
  await ins(db, "ma_sandbox_companies", [
    C("Northumbria Fire & Safety", "North East England", "Fire safety", "Fire alarm and emergency lighting maintenance for commercial landlords and schools; 70% recurring contracts.", "Founder-owned", 8_200_000, 1_150_000, 74, "SB100231"),
    C("Caledonian Suppression Systems", "Scotland", "Fire safety", "Sprinkler and suppression design, installation and servicing for warehouses and distilleries.", "Family-owned", 11_500_000, 1_600_000, 96, "SB100245"),
    C("Pennine Alarm Services", "Yorkshire", "Life safety", "Commercial fire alarm servicing and monitoring across West and South Yorkshire.", "Founder-owned", null, null, 41, "SB100259"),
    C("Valleys Fire Protection", "Wales", "Fire safety", "Extinguisher and fire alarm maintenance for SMEs and housing associations across South Wales.", "Family-owned", 4_100_000, 520_000, 38, "SB100262"),
    C("Mersey Emergency Lighting", "North West England", "Life safety", "Emergency lighting testing and installation for retail and leisure estates.", "Private equity-backed", 6_000_000, 700_000, 52, "SB100277"),
    C("Aquila Fire Protection Ltd", "North West England", "Fire safety", "Fire protection services (already in Kestrel's pipeline).", "Founder-owned", 6_800_000, 1_050_000, 61, "SB100281"),
    C("Beacon Alarms", "Yorkshire", "Security systems", "Residential and small-business intruder and fire alarms.", "Founder-owned", 3_400_000, 300_000, 28, "SB100290"),
    C("Highland Safety Engineering", "Scotland", "Fire safety", "Fire safety engineering consultancy; small maintenance book. Entered administration in 2026.", "Founder-owned", 2_900_000, -150_000, 22, "SB100304"),
    C("Tyne Security Integrators", "North East England", "Security systems", "CCTV and access control for commercial sites; some fire alarm work.", "Founder-owned", 5_200_000, null, 47, "SB100318"),
    C("Kent Fire Extinguisher Co", "South East England", "Fire safety", "Extinguisher servicing across Kent and Sussex.", "Family-owned", 3_800_000, 450_000, 30, "SB100322"),
    C("Humber Sprinkler Contractors", "Yorkshire", "Fire safety", "Sprinkler installation contractor for new-build logistics sites; project-based revenue.", "Founder-owned", 14_000_000, 900_000, 88, "SB100336"),
    C("Celtic Life Safety", "Wales", "Life safety", "Fire alarm, emergency lighting and nurse-call maintenance for care homes.", "Founder-owned", null, null, null, "SB100340"),
  ]);
  return thesis.id;
}
