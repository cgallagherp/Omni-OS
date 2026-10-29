// Company C — Ashworth Analytics: data and analytics services for UK retailers.
// Acquired 38 days ago and part-way through the first 100 days. It has not
// personalised its workspace, so it keeps the Omni identity.
import { TODAY, addDays, at, iso, lastWeekday, type CompanySpec } from "./lib";
import { intelligenceFor } from "./intelligence";

// Revenue and EBITDA come from the (synthetic) governed finance data, as they will from the
// warehouse; the other KPIs are entered by the team.
const { data } = intelligenceFor("ashworth");

const Y = TODAY.getUTCFullYear();
const m = (mn: number) => mn * 1_000_000;
const acquired = iso(addDays(TODAY, -38));


export const ashworth: CompanySpec = {
  company: {
    slug: "ashworth",
    name: "Ashworth Analytics",
    legal_name: "Ashworth Analytics Ltd",
    sector: "Data & analytics services",
    description: "Retail analytics, pricing science and managed data services for mid-market UK retailers.",
    headquarters: "Manchester, UK",
    brand_color: "#2E3331",
    acquired_on: acquired,
    fiscal_year_start_month: 4,
  },
  onboardingDay: 38,
  intelligence: {
    slug: "ashworth",
    ccOwners: { CC100: "ceo", CC110: "cfo", CC200: "commercial", CC320: "cto", CC400: "delivery" },
    grants: { cfo: ["revenue", "cost", "people", "transactions"], commercial: ["revenue"], delivery: ["cost"] },
    agentDomains: {},
  },
  people: [
    { key: "ceo", full_name: "Imogen Clarke", title: "Chief Executive Officer", seat: "CEO", responsibilities: ["Owns the business and the plan", "Leads the ELT", "Board and Omni relationship"], email: "imogen@ashworth.demo", login: "ceo", avatar_color: "#0EA5E9" },
    { key: "cfo", full_name: "Raj Patel", title: "Chief Financial Officer", seat: "Finance", responsibilities: ["Monthly reporting", "Cash", "Budget"], reports_to: "ceo", email: "raj@ashworth.demo", login: "executive", avatar_color: "#8B5CF6" },
    { key: "delivery", full_name: "Chloe Martin", title: "Head of Delivery", seat: "Delivery", responsibilities: ["Client delivery", "Utilisation", "Quality"], reports_to: "ceo", email: "chloe@ashworth.demo", login: "executive", avatar_color: "#10B981" },
    { key: "commercial", full_name: "Ollie Grant", title: "Commercial Director", seat: "Commercial", responsibilities: ["New business", "Account growth", "Pricing"], reports_to: "ceo", email: "ollie@ashworth.demo", login: "executive", avatar_color: "#F59E0B" },
    { key: "cto", full_name: "Chief Technology Officer", title: "Chief Technology Officer (open seat)", seat: "Technology", responsibilities: ["Data platform", "Product engineering"], reports_to: "ceo", open: true },
  ],
  northStar: {
    vision: "The analytics partner every mid-market retailer relies on to price, plan and sell with confidence.",
    mission: "We turn retailers' data into better commercial decisions, every week.",
    values: [
      { name: "Evidence over opinion", description: "We back recommendations with data and say what we don't know." },
      { name: "Client outcomes", description: "We measure ourselves by the commercial results our clients achieve." },
      { name: "Keep it simple", description: "Clear answers, clearly explained." },
    ],
    target_end_state: "A £25m revenue, £6m EBITDA analytics business with half its revenue from recurring software-enabled services.",
    strategic_positioning: "",
    market_opportunity: "",
    strategic_value: "",
    financial_ambition: "",
    exit_equity_story: "",
    buyer_proposition: "",
    potential_buyers: [],
    target_year: Y + 3,
    target_revenue: m(25),
    target_ebitda: m(6),
    target_ev: null,
    baseline_revenue: m(11.4),
    baseline_ebitda: m(1.9),
    assumptions: [],
  },
  conditions: [
    { title: "Recurring revenue majority", description: "Half of revenue from multi-year managed services.", status: "not_started", owner: "commercial" },
    { title: "A modern data platform", description: "One platform for all client data and models.", status: "not_started", owner: "ceo" },
  ],
  moves: [
    { key: "recurring", title: "Half of revenue from recurring managed services", description: "Package pricing science and reporting as subscriptions.", outcome: "50% recurring revenue", owner: "commercial", status: "not_started", progress: 0 },
    { key: "platform", title: "One data platform for every client", description: "Consolidate bespoke client pipelines onto one platform.", outcome: "All clients on one platform", owner: "ceo", status: "not_started", progress: 0 },
  ],
  milestones: [{ title: "Omni investment completes", date: acquired, status: "done" }],
  goals: [],
  previousPriorities: [],
  priorities: [],
  metrics: [
    {
      key: "revenue", name: "Revenue", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", tolerance: 5,
      aggregation: "flow", owner: "cfo", comparable: "revenue", isKey: true, scorecard: true, history: 12, futureTargets: 3,
      analytics: "revenue",
      series: (c) => ({ target: data.budgets.get(c.period)?.revenue ?? null, value: c.future ? null : (data.kpis.get(c.period)?.revenue ?? null) }),
    },
    {
      key: "ebitda", name: "EBITDA", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", tolerance: 10,
      aggregation: "flow", owner: "cfo", comparable: "ebitda", isKey: true, scorecard: true, history: 12, futureTargets: 3,
      analytics: "ebitda",
      series: (c) => ({ target: data.budgets.get(c.period)?.ebitda ?? null, value: c.future ? null : (data.kpis.get(c.period)?.ebitda ?? null) }),
    },
    {
      key: "cashbal", name: "Cash balance", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", target: 1_500_000, tolerance: 15,
      owner: "cfo", comparable: "cash", history: 12,
      series: (c) => ({ value: Math.round((1_700_000 + 200_000 * c.t) * c.noise(0.04)) }),
    },
    {
      key: "util", name: "Billable utilisation", category: "operational", unit: "percent", frequency: "weekly", direction: "range", min: 72, max: 85, tolerance: 25,
      owner: "delivery", isKey: true, scorecard: true, history: 5,
      series: (c) => ({ value: Math.round(70 + 3 * c.t + (c.noise(0.02) - 1) * 70) }),
    },
    {
      key: "pipeline", name: "Qualified pipeline", category: "commercial", unit: "currency", frequency: "weekly", direction: "higher_is_better", target: 3_000_000, tolerance: 15,
      owner: "commercial", isKey: true, scorecard: true, history: 5,
      series: (c) => ({ value: Math.round((2_400_000 + 300_000 * c.t) * c.noise(0.05)) }),
    },
    {
      key: "recurring", name: "Recurring revenue share", category: "commercial", unit: "percent", frequency: "monthly", direction: "higher_is_better", target: 30, tolerance: 10,
      owner: "commercial", comparable: "recurring_revenue_pct", isKey: true, scorecard: true, history: 12,
      series: (c) => ({ value: Math.round(24 + 3 * c.t) }),
    },
  ],
  meetings: [
    { key: "w-3", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(3) - 21, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "delivery", "commercial"], summary: "First weekly ELT meeting. Agreed the initial scorecard.", rating: 7 },
    { key: "w-2", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(3) - 14, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "delivery", "commercial"], summary: "Employee listening findings reviewed ahead of the offsite.", rating: 7 },
    { key: "w-1", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(3) - 7, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "delivery", "commercial"], summary: "Offsite preparation; utilisation below range in the pricing team.", rating: 8 },
    { key: "w0", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(3) + 7, 9, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "delivery", "commercial"] },
    { key: "offsite", type: "annual", title: "Leadership offsite: Vision, Mission, Values and North Star", at: at(-4, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "delivery", "commercial"], summary: "Vision, Mission and Values agreed; North Star destination drafted for Board review.", rating: 9 },
    { key: "mb", type: "board_monthly", title: "Monthly Board", at: at(12, 14, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo"] },
    { key: "qo", type: "quarterly", title: "First quarterly offsite", at: at(52, 9, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "delivery", "commercial"] },
  ],
  issues: [
    { key: "util", title: "Pricing-science team utilisation below range", description: "Two large projects ended early; bench time rising.", priority: "medium", status: "open", owner: "delivery", raisedBy: "delivery", metric: "util", raisedIn: "w-1", createdDaysAgo: 7 },
  ],
  decisions: [
    { key: "scorecard", title: "Adopt the initial six-KPI scorecard for the first 90 days", rationale: "Start small; revisit at the first quarterly offsite.", owner: "ceo", meeting: "w-3", decidedDaysAgo: 21 },
  ],
  actions: [
    { title: "Redeploy two pricing analysts onto the Larkfield replatforming", owner: "delivery", due: 5, status: "open", issue: "util", meeting: "w-1", metric: "util", createdDaysAgo: 7 },
    { title: "Circulate draft North Star to the Board", owner: "ceo", due: 3, status: "open", meeting: "w-1", createdDaysAgo: 4 },
  ],
  orgActions: [
    { type: "hire", title: "Hire a Chief Technology Officer by Q2", description: "The data-platform outcome needs a technology leader.", priority: "critical", status: "open", owner: "ceo", targetDays: 120 },
  ],
  comments: [],
  listening: [
    { kind: "employee", daysAgo: 18, method: "Baseline survey and six focus groups", responses: 104, engagement: 66, enps: 12, leadership_confidence: 62, strategy_confidence: 48, clarity_accountability: 51, themes: ["Unclear what the investment means for jobs", "Strong team culture", "Too many bespoke client builds"], summary: "Baseline set. People want clarity on direction and fewer one-off builds.", actions: [{ title: "CEO all-hands after the offsite on direction and what will not change", owner: "ceo", due: 6, status: "open" }] },
  ],
  investmentCase: {
    entry_date: acquired,
    entry_ev: m(19),
    entry_multiple: 10,
    target_exit_date: `${Y + 4}-03-31`,
    target_exit_ev: m(66),
    target_moic: 3.0,
    target_irr: 0.28,
    internal_thesis: "Productise pricing science into recurring managed services; consolidate onto one data platform.",
    key_risks: "Technology leadership gap; reliance on bespoke builds.",
  },
  omniNotes: [{ body: "First 100 days on track. North Star drafted at the offsite; Flight Plan work starts next week.", level: "monitor", daysAgo: 3 }],
};
