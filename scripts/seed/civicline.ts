// Company D — Civicline: a fictional UK public-sector software platform (records, information
// requests and casework for councils, housing associations, police forces and central
// government). It demonstrates Revenue & Cost Intelligence on clearly labelled synthetic
// governed data before Infoshare+'s Snowflake/dbt layer exists. Its financial KPIs are bound
// to the governed metrics, so Mission Control and the intelligence modules show the same
// numbers. Story: NRR has slipped from ~108% to ~101% as police forces cut scope at renewal,
// while hosting and Policing & Justice delivery costs push gross margin below plan.
import { TODAY, at, lastWeekday, type CompanySpec, type SeriesCtx } from "./lib";
import { intelligenceFor } from "./intelligence";

const Y = TODAY.getUTCFullYear();
const m = (mn: number) => mn * 1_000_000;
const { data } = intelligenceFor("civicline");
const k = (c: SeriesCtx) => data.kpis.get(c.period);
const b = (c: SeriesCtx) => data.budgets.get(c.period);
const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 1000) / 10);

export const civicline: CompanySpec = {
  company: {
    slug: "civicline",
    name: "Civicline",
    legal_name: "Civicline Software Ltd",
    sector: "Public-sector software",
    description: "Records management, information-request and casework software for UK councils, housing associations, police forces and central government. Fictional company: all data is synthetic.",
    headquarters: "Leeds, UK",
    brand_color: "#5B2A86",
    acquired_on: `${Y - 2}-05-31`,
    fiscal_year_start_month: 4,
  },
  branding: { primary: "#5B2A86", secondary: "#8E5CC2", accent: "#E7DAF5" },
  onboardingDay: 520,
  intelligence: {
    slug: "civicline",
    ccOwners: { CC100: "ceo", CC110: "cfo", CC120: "people", CC200: "cro", CC210: "cro", CC220: "cro", CC300: "cpto", CC310: "cpto", CC320: "cpto", CC400: "coo", CC410: "coo", CC500: "coo", CC600: "coo" },
    grants: { cfo: ["revenue", "cost", "people", "transactions"], cro: ["revenue"], coo: ["revenue", "cost"], cpto: ["cost"], people: ["people"] },
    agentDomains: { ceo: ["revenue", "cost", "people"], commercial: ["revenue"] },
    crm: true,
  },
  people: [
    { key: "ceo", full_name: "Hannah Lowe", title: "Chief Executive Officer", seat: "CEO", responsibilities: ["Owns the business and the plan", "Leads the ELT", "Board and Omni relationship"], email: "hannah@civicline.demo", login: "ceo", avatar_color: "#0EA5E9" },
    { key: "cfo", full_name: "Marcus Oyelaran", title: "Chief Financial Officer", seat: "Finance", responsibilities: ["Budget and reporting", "Revenue recognition and ARR governance", "Cost control", "Data owner: finance and billing"], reports_to: "ceo", email: "marcus.o@civicline.demo", login: "executive", avatar_color: "#8B5CF6" },
    { key: "cro", full_name: "Sophie Grant", title: "Chief Revenue Officer", seat: "Revenue", responsibilities: ["New ARR and renewals", "Retention (GRR/NRR)", "Account management", "CRM"], reports_to: "ceo", email: "sophie@civicline.demo", login: "executive", avatar_color: "#EF4444" },
    { key: "coo", full_name: "Tariq Hussain", title: "Chief Operating Officer", seat: "Operations", responsibilities: ["Implementation and support", "Gross margin", "Delivery partners", "Policing & Justice integration"], reports_to: "ceo", email: "tariq@civicline.demo", login: "executive", avatar_color: "#F59E0B" },
    { key: "cpto", full_name: "Elena Fischer", title: "Chief Product & Technology Officer", seat: "Product & Technology", responsibilities: ["Roadmap", "Classic → Records migration", "Hosting and platform costs"], reports_to: "ceo", email: "elena@civicline.demo", login: "executive", avatar_color: "#10B981" },
    { key: "people", full_name: "Dan Reilly", title: "People Director", seat: "People", responsibilities: ["Hiring plan", "Retention", "Employee listening"], reports_to: "ceo", email: "dan@civicline.demo", login: "executive", avatar_color: "#14B8A6" },
  ],
  observers: [{ email: "ruth@civicline.demo", full_name: "Ruth Ambrose", title: "Chair" }],
  northStar: {
    vision: "Every public body runs its records, requests and casework on one trusted platform.",
    mission: "We help public servants find, share and act on information quickly, lawfully and safely.",
    values: [
      { name: "Public value first", description: "We judge ourselves by the outcomes our customers deliver for citizens." },
      { name: "Trust by design", description: "Security, accessibility and lawful handling of information are never optional." },
      { name: "Keep our promises", description: "We do what we commit to, on time, and say early when we can't." },
    ],
    target_end_state: `By ${Y + 3}, a £20m EBITDA public-sector software platform with 85% recurring revenue, sustained GRR above 93% and NRR above 106%, 80% gross margin and every customer on the modern platform.`,
    strategic_positioning: "The specialist platform for information-heavy public bodies: records, statutory requests and casework in one place, built for UK public-sector procurement and assurance.",
    market_opportunity: "Over 1,000 UK councils, housing associations, police forces and central bodies, most still on legacy or fragmented systems.",
    strategic_value: "Sticky, statutory workloads; high retention; cross-sell across products; expansion into adjacent policing and justice workflows.",
    financial_ambition: "Grow EBITDA from £8m to £20m while sustaining high recurring-revenue retention.",
    exit_equity_story: "A category-leading UK public-sector SaaS platform with proven retention, net expansion and operating leverage.",
    buyer_proposition: "Durable public-sector ARR with demonstrable net retention and margin expansion.",
    potential_buyers: ["Public-sector software strategics", "Large-cap software sponsors"],
    target_year: Y + 3,
    target_revenue: m(90),
    target_ebitda: m(20),
    target_ev: m(400),
    baseline_revenue: m(42),
    baseline_ebitda: m(8),
    assumptions: ["Public-sector budgets remain flat in real terms; customers consolidate suppliers.", "Classic customers migrate to Records within 24 months without material churn.", "Hosting cost per £ of ARR can be held at or below 7%."],
  },
  conditions: [
    { title: "Net retention above 106%", description: "Expansion outpaces contraction and churn in every major sector.", status: "off_track", owner: "cro" },
    { title: "80% gross margin", description: "Hosting and delivery costs scale below revenue.", status: "at_risk", owner: "coo" },
    { title: "One modern platform", description: "All customers off Classic and on Records.", status: "at_risk", owner: "cpto" },
  ],
  moves: [
    { key: "retention", title: "Sustain NRR above 106% across every sector", description: "Renewal discipline, customer success coverage and cross-sell of Requests and Insight.", outcome: "NRR ≥106%, GRR ≥93%", owner: "cro", status: "off_track", progress: 40 },
    { key: "margin", title: "80% gross margin through platform efficiency", description: "Retire Classic, right-size hosting, bring police implementations in-house.", outcome: "80% gross margin", owner: "coo", status: "at_risk", progress: 35 },
    { key: "platform", title: "Every customer on the modern platform", description: "Complete the Classic → Records migration and integrate Evidence Vault.", outcome: "Classic retired; Evidence Vault on the Civicline platform", owner: "cpto", status: "at_risk", progress: 55 },
  ],
  milestones: [
    { title: "Omni investment completes", date: `${Y - 2}-05-31`, status: "done" },
    { title: "Bluefield Digital (Evidence Vault) acquired", date: `${Y - 1}-07-01`, status: "done", move: "platform" },
    { title: "Schools product sold", date: `${Y}-03-31`, status: "done" },
    { title: "Classic retired", date: `${Y + 1}-03-31`, status: "at_risk", move: "platform" },
  ],
  goals: [
    { key: "nrr", move: "retention", title: "Lift NRR back to 106%", outcome: "Trailing 12-month NRR ≥106% by March", unit: "percent", baseline: 108, target: 106, current: 101, owner: "cro", status: "off_track", progress: 15 },
    { key: "gm", move: "margin", title: "Hold gross margin at 78%", outcome: "Gross margin ≥78% each month", unit: "percent", baseline: 79, target: 78, current: 76, owner: "coo", status: "at_risk", progress: 30 },
    { key: "classic", move: "platform", title: "Migrate the remaining Classic customers", outcome: "No customer on Classic by March", unit: "percent", baseline: 40, target: 100, current: 78, owner: "cpto", status: "at_risk", progress: 60 },
  ],
  previousPriorities: [
    { key: "q-ev", goal: "classic", title: "Complete Evidence Vault day-100 integration", outcome: "Bluefield on Civicline finance, CRM and support", owner: "coo", status: "done", progress: 100, result: "achieved" },
  ],
  priorities: [
    { key: "police", goal: "nrr", title: "Stabilise Policing & Justice renewals", outcome: "Every police renewal in the next 120 days has an agreed plan", successCriteria: "Renewal plans for all police renewals due this quarter; no further contraction above 10%", owner: "cro", status: "off_track", progress: 20, milestones: [{ title: "Renewal list agreed", week: 2, done: true }, { title: "Exec sponsor on every force", week: 6, done: false }] },
    { key: "hosting", goal: "gm", title: "Bring hosting back to 7% of ARR", outcome: "Hosting cost ≤7% of ARR by quarter end", successCriteria: "Duplicate Classic environments decommissioned; Northcloud renewal renegotiated", owner: "cpto", status: "at_risk", progress: 35, milestones: [{ title: "Environment inventory", week: 2, done: true }, { title: "Decommission plan approved", week: 5, done: false }] },
    { key: "classic", goal: "classic", title: "Migrate 60 Classic customers to Records", outcome: "60 migrations completed", successCriteria: "60 customers live on Records with no contraction at migration", owner: "cpto", status: "on_track", progress: 55 },
  ],
  metrics: [
    { key: "arr", name: "Total ARR", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", tolerance: 2, owner: "cfo", comparable: "arr", isKey: true, scorecard: true, history: 12, analytics: "arr_total", links: [{ move: "retention" }],
      series: (c) => ({ value: k(c)?.arr ?? null, target: k(c)?.arrBudget ?? null }) },
    { key: "nrr", name: "Net Revenue Retention (LTM)", category: "commercial", unit: "percent", decimals: 1, frequency: "monthly", direction: "higher_is_better", target: 105, tolerance: 2, owner: "cro", comparable: "nrr", isKey: true, scorecard: true, history: 12, analytics: "nrr", links: [{ goal: "nrr" }, { priority: "police" }],
      series: (c) => ({ value: pct(k(c)?.nrr), target: 105 }) },
    { key: "grr", name: "Gross Revenue Retention (LTM)", category: "commercial", unit: "percent", decimals: 1, frequency: "monthly", direction: "higher_is_better", target: 93, tolerance: 2, owner: "cro", comparable: "grr", isKey: true, history: 12, analytics: "grr", links: [{ goal: "nrr" }],
      series: (c) => ({ value: pct(k(c)?.grr), target: 93 }) },
    { key: "gm", name: "Gross margin", category: "financial", unit: "percent", decimals: 1, frequency: "monthly", direction: "higher_is_better", target: 78, tolerance: 2, owner: "coo", comparable: "gross_margin", isKey: true, scorecard: true, history: 12, analytics: "gross_margin", links: [{ goal: "gm" }, { priority: "hosting" }],
      series: (c) => ({ value: pct(k(c)?.grossMargin), target: 78 }) },
    { key: "ebitda", name: "EBITDA", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", tolerance: 8, aggregation: "flow", owner: "cfo", comparable: "ebitda", isKey: true, scorecard: true, history: 12, futureTargets: 3, analytics: "ebitda",
      series: (c) => ({ value: c.future ? null : (k(c)?.ebitda ?? null), target: b(c)?.ebitda ?? null }) },
    { key: "revenue", name: "Revenue", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", tolerance: 3, aggregation: "flow", owner: "cfo", comparable: "revenue", isKey: true, history: 12, futureTargets: 3, analytics: "revenue",
      series: (c) => ({ value: c.future ? null : (k(c)?.revenue ?? null), target: b(c)?.revenue ?? null }) },
    { key: "renewals", name: "Renewals due in 90 days without a plan", category: "commercial", unit: "number", frequency: "weekly", direction: "lower_is_better", target: 5, tolerance: 20, owner: "cro", isKey: true, scorecard: true, history: 6,
      series: (c) => ({ value: Math.round(14 - c.i * 0.6 + (c.noise(0.15) - 1) * 10) }) },
    { key: "sla", name: "Support tickets breaching SLA", category: "operational", unit: "number", frequency: "weekly", direction: "lower_is_better", target: 12, tolerance: 25, owner: "coo", scorecard: true, history: 6,
      series: (c) => ({ value: Math.round(11 + (c.noise(0.3) - 1) * 12) }) },
  ],
  meetings: [
    { key: "w-2", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(2) - 14, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "coo", "cpto", "people"], summary: "Classic migrations ahead of plan; two police forces signalled reduced scope at renewal.", rating: 7 },
    { key: "w-1", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(2) - 7, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "coo", "cpto"], absent: ["people"], summary: "Hosting invoice up again; inventory of duplicate environments started.", rating: 6 },
    { key: "w0", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(2) + 7, 9, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "coo", "cpto", "people"] },
    { key: "mb", type: "board_monthly", title: "Monthly Board", at: at(-12, 10, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo"], summary: "ARR slightly behind budget; retention and gross margin the two areas of focus.", rating: 7 },
    { key: "qo", type: "quarterly", title: "Quarterly offsite", at: at(64, 9, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "coo", "cpto", "people"] },
  ],
  issues: [
    { key: "classic-env", title: "Duplicate Classic environments still running after migration", description: "Migrated customers' Classic environments are kept for 90 days; several are past that date.", priority: "medium", status: "open", owner: "cpto", raisedBy: "cpto", priorityKey: "hosting", raisedIn: "w-1", createdDaysAgo: 7 },
  ],
  decisions: [
    { key: "scorecard", title: "Bind the financial KPIs to the governed revenue and cost metrics", rationale: "One set of numbers: Mission Control, the Monday scorecard and Revenue/Cost Intelligence read the same definitions.", owner: "cfo", meeting: "w-2", decidedDaysAgo: 14 },
  ],
  actions: [
    { title: "Decommission Classic environments older than 90 days", owner: "cpto", due: 12, status: "open", issue: "classic-env", meeting: "w-1", createdDaysAgo: 7 },
  ],
  orgActions: [{ type: "capability", title: "Customer success coverage for Policing & Justice", description: "Agree the coverage model for police forces before the April renewal round.", priority: "high", status: "open", owner: "cro", priorityKey: "police", targetDays: 45 }],
  comments: [],
  listening: [
    { kind: "customer", daysAgo: 40, method: "Annual customer survey", nps: 31, satisfaction: 74, retention: 93, churn: 2.4, themes: ["Records migration well received", "Police budgets under pressure", "Requests reporting valued"], summary: "Positive on the platform; police customers cite budget pressure and national consolidation.", actions: [] },
  ],
  investmentCase: {
    entry_date: `${Y - 2}-05-31`,
    entry_ev: m(160),
    entry_multiple: 20,
    target_exit_date: `${Y + 3}-06-30`,
    target_exit_ev: m(400),
    target_moic: 2.8,
    target_irr: 0.24,
    internal_thesis: "Public-sector SaaS platform with statutory workloads; retention-led growth and operating leverage.",
    key_risks: "Police sector consolidation; hosting cost discipline; Classic migration execution.",
  },
  omniNotes: [{ body: "Retention slipping in Policing & Justice; asked for a sector view in the next Board pack.", level: "monitor", daysAgo: 5 }],
};
