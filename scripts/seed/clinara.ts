// Company A — Clinara: B2B vertical SaaS for independent veterinary and dental clinics.
// ~£25m revenue, ~£8m EBITDA. Story: revenue broadly on plan, but enterprise
// pipeline coverage has just deteriorated below target — the chain from the
// North Star (£20m EBITDA) to this week's meeting agenda is visible end to end.
// Clinara has personalised its workspace (navy and light blue, with its logo).
import { TODAY, at, lastWeekday, type CompanySpec, type SeriesCtx } from "./lib";

const Y = TODAY.getUTCFullYear();
const m = (mn: number) => mn * 1_000_000;

/** Phased monthly budget: this year's plan, last year's actuals-based plan. */
function phased(thisYearJan: number, thisYearStep: number, lastYearJan: number, lastYearStep: number) {
  return (c: SeriesCtx) => (c.year === Y ? thisYearJan + (c.month - 1) * thisYearStep : lastYearJan + (c.month - 1) * lastYearStep);
}

const revenuePlan = phased(m(1.95), m(0.028), m(1.6), m(0.027));
const ebitdaPlan = phased(m(0.6), m(0.012), m(0.47), m(0.01));
const arrPlan = phased(m(23.6), m(0.31), m(19.6), m(0.33));

export const clinara: CompanySpec = {
  company: {
    slug: "clinara",
    name: "Clinara",
    legal_name: "Clinara Software Ltd",
    sector: "B2B Vertical SaaS",
    description: "Practice management, client engagement and payments software for independent veterinary and dental clinics across the UK and Ireland.",
    headquarters: "Bristol, UK",
    brand_color: "#14325C",
    acquired_on: `${Y - 1}-03-14`,
  },
  branding: { primary: "#14325C", secondary: "#5AA9E6", accent: "#9AD1F5", logo: "clinara.png" },
  onboardingDay: 400,
  reporting: { flashHeadline: "September revenue 2% below budget; enterprise bookings and EBITDA behind plan." },
  people: [
    { key: "ceo", full_name: "Daniel Okafor", title: "Chief Executive Officer", seat: "CEO", responsibilities: ["Owns the business and the plan", "Leads the ELT", "Keeps the meeting rhythm running", "Board and Omni relationship"], email: "daniel@clinara.demo", login: "ceo", avatar_color: "#0EA5E9" },
    { key: "cfo", full_name: "Rachel Lim", title: "Chief Financial Officer", seat: "Finance", responsibilities: ["Budget and forecasting", "Flash report and management accounts", "Cash and working capital", "Pricing governance"], reports_to: "ceo", email: "rachel@clinara.demo", login: "executive", avatar_color: "#8B5CF6" },
    { key: "cro", full_name: "Marcus Webb", title: "Chief Revenue Officer", seat: "Revenue", responsibilities: ["New ARR", "Sales process and forecasting", "Pipeline generation", "Enterprise sales"], reports_to: "ceo", email: "marcus@clinara.demo", login: "executive", avatar_color: "#F59E0B" },
    { key: "cpto", full_name: "Aisha Khan", title: "Chief Product & Technology Officer", seat: "Product & Technology", responsibilities: ["Product roadmap", "Platform integration", "Security and compliance", "Engineering delivery"], reports_to: "ceo", email: "aisha@clinara.demo", login: "executive", avatar_color: "#10B981" },
    { key: "cco", full_name: "Ben Carter", title: "Chief Customer Officer", seat: "Customer", responsibilities: ["Net revenue retention", "Onboarding", "Support", "Customer listening"], reports_to: "ceo", email: "ben@clinara.demo", login: "executive", avatar_color: "#EF4444" },
    { key: "cmo", full_name: "Ella Brooks", title: "Chief Marketing Officer", seat: "Marketing", responsibilities: ["Demand generation", "Brand", "Vertical launches"], reports_to: "cro", avatar_color: "#EC4899" },
    { key: "people", full_name: "Hannah Doyle", title: "People Director", seat: "People", responsibilities: ["Talent acquisition", "Employee listening", "Engagement"], reports_to: "ceo", avatar_color: "#14B8A6" },
    { key: "vpsales", full_name: "VP Enterprise Sales", title: "VP Enterprise Sales (open seat)", seat: "Enterprise sales", responsibilities: ["Enterprise and group accounts", "Sales methodology", "Enterprise forecast"], reports_to: "cro", open: true },
    { key: "payments", full_name: "Tomasz Nowak", title: "Head of Payments", seat: "Clinara Pay", responsibilities: ["Payments migration", "PCI DSS compliance"], reports_to: "cpto", leadership: false, avatar_color: "#6366F1" },
  ],
  observers: [{ email: "helen@clinara.demo", full_name: "Helen Fraser", title: "Non-Executive Chair" }],
  northStar: {
    vision: "The operating system for every independent clinic in the UK and Ireland — from appointment to payment to patient retention.",
    mission: "We give independent clinics the software, insight and payments infrastructure to out-compete the corporate groups.",
    values: [
      { name: "Clinic first", description: "We judge every decision by whether it makes a clinic's day easier." },
      { name: "Own the outcome", description: "One owner for every commitment; we say what we will do and do it." },
      { name: "Straight talk", description: "We raise problems early and debate openly, then commit." },
      { name: "Build to last", description: "Secure, reliable and simple beats clever." },
    ],
    target_end_state: `By ${Y + 2}, a £60m revenue, £20m EBITDA unified platform serving veterinary, dental and physiotherapy clinics, with more than 40% of revenue from payments and modules launched since acquisition.`,
    strategic_positioning: "The independent clinic's platform of choice: the only vertical suite combining practice management, client engagement and embedded payments for independents.",
    market_opportunity: "c.11,000 independent veterinary and dental sites in the UK and Ireland, under-digitised and under pressure from corporate consolidators; adjacent physiotherapy and optometry share the same workflow.",
    strategic_value: "Embedded payments on a sticky system of record, a proven multi-vertical playbook and a repeatable enterprise motion for multi-site groups.",
    financial_ambition: "Rule of 40 at scale: 20%+ organic growth and a 33% EBITDA margin, with NRR above 115%.",
    exit_equity_story: "A Rule-of-40 vertical SaaS leader with embedded payments, proven multi-vertical expansion and a repeatable enterprise motion.",
    buyer_proposition: "Strategic acquirers get a scaled, profitable platform with payments attach and a cross-sell runway into adjacent verticals; sponsors get predictable recurring revenue, 115%+ NRR and a proven integration capability.",
    potential_buyers: ["Healthcare software strategics", "Payments platforms seeking vertical distribution", "Large-cap software buy-and-build sponsors"],
    target_year: Y + 2,
    target_revenue: m(60),
    target_ebitda: m(20),
    target_ev: m(400),
    baseline_revenue: m(19.8),
    baseline_ebitda: m(5.9),
    assumptions: [
      "Independent clinics continue to represent ~55% of UK veterinary and dental sites through the plan period.",
      "Clinara Pay attach reaches 60% of customers by the end of next year at a blended 0.9% take rate.",
      "Physiotherapy shares ≥70% of the core scheduling and billing workflow with dental.",
      "Gross margin holds at or above 78% as payments revenue scales.",
    ],
  },
  conditions: [
    { title: "A repeatable enterprise sales engine", description: "Dedicated enterprise team, consistent qualification and ≥3x pipeline coverage every quarter.", status: "at_risk", owner: "cro" },
    { title: "One unified platform", description: "Every customer on the unified platform with Clinara Pay embedded.", status: "at_risk", owner: "cpto" },
    { title: "Retention-led growth", description: "Net revenue retention sustained above 115% through success plans, pricing discipline and module adoption.", status: "on_track", owner: "cco" },
    { title: "A proven adjacent-vertical playbook", description: "Physio edition reaching product-market fit within 12 months of launch, creating a playbook for optometry.", status: "on_track", owner: "cpto" },
  ],
  // Three-year outcomes: where we need to be by year three
  moves: [
    { key: "organic", title: "£36m ARR from organic growth in the core verticals", description: "New logos in veterinary and dental through partners, inbound demand and a sharper mid-market offer.", outcome: `£36m ARR by December ${Y + 1}`, owner: "cro", status: "on_track", progress: 55 },
    { key: "enterprise", title: "An enterprise engine generating £10m new ARR a year", description: "A dedicated enterprise team with consistent qualification, forecasting and a group-account playbook.", outcome: "£10m new ARR per year from groups of 10+ sites", owner: "cro", status: "at_risk", progress: 40 },
    { key: "platform", title: "Every customer on one platform with payments embedded", description: "Unified platform, Clinara Pay in every workflow, PCI DSS Level 1 certified.", outcome: "100% migrated; 60% payments attach", owner: "cpto", status: "off_track", progress: 58 },
    { key: "verticals", title: "Two adjacent verticals live and growing", description: "Clinara Physio, then optometry, reusing the core platform.", outcome: "Physio and optometry each >£3m ARR", owner: "cpto", status: "on_track", progress: 30 },
  ],
  milestones: [
    { title: "Omni investment completes", date: `${Y - 1}-03-14`, status: "done" },
    { title: "Clinara Pay launched", date: `${Y - 1}-11-10`, status: "done", move: "platform" },
    { title: "Physio edition general availability", date: `${Y}-11-25`, status: "on_track", move: "verticals" },
    { title: "Unified platform migration complete", date: `${Y}-12-18`, status: "at_risk", move: "platform" },
    { title: "£30m ARR", date: `${Y + 1}-06-30`, status: "not_started", move: "organic" },
    { title: "Optometry pilot", date: `${Y + 1}-09-30`, status: "not_started", move: "verticals" },
    { title: "£20m EBITDA run-rate", date: `${Y + 2}-09-30`, status: "not_started" },
    { title: "Exit process", date: `${Y + 2}-12-31`, status: "not_started" },
  ],
  // 12-month objectives: what this year has to deliver
  goals: [
    { key: "arr", move: "organic", title: "Reach £27m exit ARR", outcome: "£27.0m ARR at 31 December", unit: "currency", baseline: m(23.3), target: m(27), current: m(25.6), owner: "cro", status: "on_track", progress: 62 },
    { key: "newarr", move: "enterprise", title: "Book £8m new enterprise ARR", outcome: "£8.0m new ARR from groups of 10+ sites", unit: "currency", baseline: 0, target: m(8), current: m(5.2), owner: "cro", status: "at_risk", progress: 65 },
    { key: "migration", move: "platform", title: "Migrate 100% of customers to the unified platform", outcome: "All customers migrated with Clinara Pay enabled", unit: "percent", baseline: 22, target: 100, current: 65, owner: "cpto", status: "off_track", progress: 55 },
    { key: "physio", move: "verticals", title: "Launch Clinara Physio with 40 clinics live", outcome: "40 paying physio clinics live by 31 December", unit: "number", baseline: 0, target: 40, current: 14, owner: "cpto", status: "on_track", progress: 35 },
    { key: "nrr", move: "organic", title: "Deliver 112% net revenue retention", outcome: "NRR ≥112% (trailing 12 months) by December", unit: "percent", baseline: 106, target: 112, current: 111, owner: "cco", status: "on_track", progress: 83 },
  ],
  previousPriorities: [
    { key: "q-meddicc", goal: "newarr", title: "Roll out a single qualification method across sales", outcome: "Every opportunity over £50k qualified the same way", owner: "cro", status: "done", progress: 100, result: "achieved" },
    { key: "q-wave2", goal: "migration", title: "Migrate wave 2 customers (1,200 clinics)", outcome: "1,200 clinics live on the unified platform", owner: "cpto", status: "done", progress: 100, result: "achieved" },
    { key: "q-partners", goal: "arr", title: "Sign three referral partners", outcome: "Three partner agreements signed", owner: "cmo", status: "missed", progress: 67, result: "partly_achieved", resultNote: "Two of three signed; third paused while the partner restructures." },
    { key: "q-vphire", goal: "newarr", title: "Appoint a VP Enterprise Sales", outcome: "Offer accepted", owner: "cro", status: "missed", progress: 40, result: "missed", resultNote: "Internal search exhausted; carried forward with a retained recruiter." },
  ],
  priorities: [
    {
      key: "enterprise", goal: "newarr", title: "Hire a VP Enterprise Sales and launch the revised sales process",
      description: "Appoint a VP Enterprise Sales with group-account experience and run every enterprise opportunity through the revised process.",
      outcome: "VP Enterprise Sales in post and the revised enterprise process live",
      successCriteria: "Offer accepted by 30 November; 100% of enterprise opportunities in the revised process; pipeline coverage back to ≥3x",
      owner: "cro", status: "at_risk", progress: 45,
      milestones: [
        { title: "Retained search briefed", week: 1, done: true },
        { title: "Shortlist of four candidates", week: 5, done: true },
        { title: "Revised process live for all enterprise deals", week: 6, done: false },
        { title: "Offer accepted", week: 9, done: false },
      ],
    },
    {
      key: "migrate", goal: "migration", title: "Migrate the remaining 35% of customers and certify PCI DSS Level 1",
      outcome: "All customers on the unified platform; Attestation of Compliance issued",
      successCriteria: "Waves 3 and 4 migrated (1,900 clinics); legacy platform read-only; AoC issued by 18 December",
      owner: "cpto", status: "off_track", progress: 30,
      milestones: [
        { title: "PCI remediation evidence accepted", week: 4, done: false },
        { title: "Wave 3 migrated (900 clinics)", week: 8, done: false },
        { title: "Wave 4 migrated; legacy read-only", week: 12, done: false },
      ],
    },
    {
      key: "physio", goal: "physio", title: "Release Clinara Physio to general availability",
      outcome: "Physio edition generally available with 25 clinics live",
      successCriteria: "GA release by 25 November; 25 paying clinics; NPS ≥40 from design partners",
      owner: "cpto", status: "on_track", progress: 60,
      milestones: [
        { title: "Release candidate in UAT", week: 3, done: true },
        { title: "General availability", week: 8, done: false },
        { title: "25 clinics live", week: 12, done: false },
      ],
    },
  ],
  metrics: [
    {
      key: "revenue", scorecard: true, name: "Revenue", description: "Recognised monthly revenue (management accounts).", category: "financial", unit: "currency", frequency: "monthly",
      direction: "higher_is_better", tolerance: 5, aggregation: "flow", owner: "cfo", comparable: "revenue", isKey: true, history: 21, futureTargets: 3,
      series: (c) => { const t = revenuePlan(c); return { target: t, value: c.future ? null : Math.round(t * (0.995 - 0.022 * c.t) * c.noise(0.012)) }; },
      links: [{ move: "organic" }],
    },
    {
      key: "ebitda", scorecard: true, name: "EBITDA", description: "Adjusted EBITDA before exceptional items.", category: "financial", unit: "currency", frequency: "monthly",
      direction: "higher_is_better", tolerance: 8, aggregation: "flow", owner: "cfo", comparable: "ebitda", isKey: true, history: 21, futureTargets: 3,
      series: (c) => { const t = ebitdaPlan(c); return { target: t, value: c.future ? null : Math.round(t * (1.0 - 0.06 * c.t) * c.noise(0.03)) }; },
      links: [{ move: "organic" }],
    },
    {
      key: "arr", scorecard: true, name: "Annual recurring revenue", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better",
      tolerance: 3, owner: "cro", comparable: "arr", isKey: true, history: 21, futureTargets: 3,
      series: (c) => { const t = arrPlan(c); return { target: t, value: c.future ? null : Math.round(t * (1.0 - 0.012 * c.t) * c.noise(0.004)) }; },
      links: [{ goal: "arr" }],
    },
    {
      key: "gm", name: "Gross margin", category: "financial", unit: "percent", decimals: 1, frequency: "monthly", direction: "higher_is_better",
      target: 78, tolerance: 2, owner: "cfo", comparable: "gross_margin", history: 21,
      series: (c) => ({ value: +(79.4 - 0.9 * c.t + (c.noise(0.004) - 1) * 100).toFixed(1) }),
    },
    {
      key: "cash", name: "Cash conversion", description: "Operating cash flow as % of EBITDA (rolling 3 months).", category: "financial", unit: "percent", frequency: "monthly",
      direction: "higher_is_better", target: 90, tolerance: 8, owner: "cfo", comparable: "cash_conversion", history: 21,
      series: (c) => ({ value: Math.round(92 * c.noise(0.04)) }),
    },
    {
      key: "pipeline", scorecard: true, name: "Enterprise pipeline coverage", description: "Qualified enterprise pipeline for the next two quarters ÷ enterprise bookings target.", category: "commercial", unit: "ratio",
      decimals: 1, frequency: "weekly", direction: "higher_is_better", target: 3, tolerance: 15, owner: "cro", comparable: "pipeline_coverage", isKey: true, history: 20,
      series: (c) => {
        // Healthy for most of the history, then a sharp deterioration in the last five weeks.
        const back = c.n - 1 - c.i;
        const v = back <= 4 ? [2.3, 2.6, 2.8, 2.9, 3.1][back] : 3.2 + 0.25 * Math.sin(c.i / 2) + (c.noise(0.03) - 1);
        return { value: +v.toFixed(1) };
      },
      links: [{ goal: "newarr" }, { priority: "enterprise" }],
    },
    {
      key: "newarr", scorecard: true, name: "New ARR booked", description: "Signed new annual recurring revenue (all segments).", category: "commercial", unit: "currency", frequency: "monthly",
      direction: "higher_is_better", target: 667_000, tolerance: 15, aggregation: "flow", owner: "cro", comparable: "new_arr", isKey: true, history: 21,
      series: (c) => ({ value: Math.round(667_000 * (c.year === Y ? 0.86 : 0.8) * c.noise(0.16)) }),
      links: [{ goal: "newarr" }, { priority: "enterprise" }],
    },
    {
      key: "winrate", name: "Enterprise win rate", category: "commercial", unit: "percent", frequency: "monthly", direction: "higher_is_better",
      target: 28, tolerance: 15, owner: "cro", history: 21,
      series: (c) => ({ value: Math.round(29 - 6 * c.t + (c.noise(0.05) - 1) * 40) }),
      links: [{ priority: "enterprise" }],
    },
    {
      key: "sqls", name: "Sales-qualified opportunities", category: "commercial", unit: "number", frequency: "weekly", direction: "higher_is_better",
      target: 18, tolerance: 15, aggregation: "flow", owner: "cmo", history: 20,
      series: (c) => ({ value: Math.round(17 + 3 * c.t + (c.noise(0.12) - 1) * 18) }),
      links: [{ goal: "arr" }],
    },
    {
      key: "nrr", scorecard: true, name: "Net revenue retention", description: "Trailing-12-month NRR.", category: "customer", unit: "percent", decimals: 0, frequency: "monthly",
      direction: "higher_is_better", target: 112, tolerance: 4, owner: "cco", comparable: "nrr", isKey: true, history: 21,
      series: (c) => ({ value: Math.round(105 + 6 * c.t + (c.noise(0.005) - 1) * 100) }),
      links: [{ goal: "nrr" }, { goal: "nrr" }],
    },
    {
      key: "churn", name: "Gross logo churn (monthly)", category: "customer", unit: "percent", decimals: 2, frequency: "monthly", direction: "lower_is_better",
      target: 1, tolerance: 15, owner: "cco", comparable: "logo_churn", history: 21,
      series: (c) => ({ value: +(1.25 - 0.35 * c.t + (c.noise(0.08) - 1)).toFixed(2) }),
    },
    {
      key: "nps", name: "Customer NPS", category: "customer", unit: "score", frequency: "monthly", direction: "higher_is_better",
      target: 45, tolerance: 10, owner: "cco", comparable: "nps", history: 21,
      series: (c) => ({ value: Math.round(41 + 6 * c.t + (c.noise(0.05) - 1) * 40) }),
    },
    {
      key: "frt", scorecard: true, name: "Support first response (hours)", category: "customer", unit: "number", decimals: 1, frequency: "weekly", direction: "lower_is_better",
      target: 4, tolerance: 20, owner: "cco", history: 20,
      series: (c) => { const back = c.n - 1 - c.i; return { value: +((back < 3 ? 4.6 : 3.4) * c.noise(0.08)).toFixed(1) }; },
    },
    {
      key: "migrated", scorecard: true, name: "Customers on unified platform", category: "operational", unit: "percent", frequency: "monthly", direction: "higher_is_better",
      tolerance: 5, owner: "cpto", isKey: true, history: 12, futureTargets: 3,
      series: (c) => {
        // Plan: linear ramp to 100% by December; actual slipping since the PCI findings.
        const plan = c.year === Y ? Math.min(100, 30 + (c.month - 1) * 6.4) : 22;
        const actual = c.year === Y ? Math.min(plan, 28 + (c.month - 1) * 4.6) : 22;
        return { target: Math.round(plan), value: c.future ? null : Math.round(actual) };
      },
      links: [{ goal: "migration" }, { priority: "migrate" }],
    },
    {
      key: "uptime", name: "Platform uptime", category: "operational", unit: "percent", decimals: 2, frequency: "monthly", direction: "higher_is_better",
      target: 99.9, tolerance: 0.1, owner: "cpto", history: 21,
      series: (c) => ({ value: +Math.min(99.99, 99.93 + (c.noise(0.0004) - 1) * 100).toFixed(2) }),
    },
    {
      key: "predict", name: "Release predictability", description: "Committed sprint scope delivered.", category: "operational", unit: "percent", frequency: "monthly",
      direction: "higher_is_better", target: 85, tolerance: 10, owner: "cpto", history: 21,
      series: (c) => ({ value: Math.round(82 + 5 * c.t + (c.noise(0.04) - 1) * 80) }),
      links: [{ priority: "physio" }],
    },
    {
      key: "headcount", name: "Headcount", category: "people", unit: "number", frequency: "monthly", direction: "range",
      min: 228, max: 245, tolerance: 20, owner: "people", comparable: "headcount", history: 21,
      series: (c) => ({ value: Math.round(214 + 22 * c.t) }),
    },
    {
      key: "enps", name: "Employee NPS", category: "people", unit: "score", frequency: "monthly", direction: "higher_is_better",
      target: 30, tolerance: 15, owner: "people", comparable: "enps", history: 21,
      series: (c) => ({ value: Math.round(24 + 8 * c.t + (c.noise(0.06) - 1) * 50) }),
    },
    {
      key: "cashbal", name: "Cash balance", description: "Month-end cash (management accounts).", category: "financial", unit: "currency", frequency: "monthly",
      direction: "higher_is_better", target: 4_000_000, tolerance: 15, owner: "cfo", comparable: "cash", history: 21,
      series: (c) => ({ value: Math.round((3_600_000 + 2_400_000 * c.t) * c.noise(0.04)) }),
    },
    {
      key: "netdebt", name: "Net debt", description: "Senior debt less cash.", category: "financial", unit: "currency", frequency: "monthly",
      direction: "lower_is_better", target: 52_000_000, tolerance: 5, owner: "cfo", comparable: "net_debt", history: 21,
      series: (c) => ({ value: Math.round((56_000_000 - 6_000_000 * c.t) * c.noise(0.005)) }),
    },
  ],
  meetings: [
    { key: "w-5", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(2) - 35, 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"], summary: "Q3 close-out reviewed. PCI remediation prioritised ahead of migration wave 3.", rating: 8 },
    { key: "w-4", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(2) - 28, 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"], summary: "Q4 priorities confirmed. VP Enterprise Sales search moved to a retained recruiter.", rating: 8 },
    { key: "w-3", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(2) - 21, 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto"], absent: ["cco"], summary: "PCI audit findings raised; migration wave 3 delayed. Enterprise deals slipping on procurement.", rating: 7 },
    { key: "w-2", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(2) - 14, 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"], summary: "Enterprise forecast rebuild requested. Support response times reviewed after the physio beta.", rating: 7 },
    { key: "w-1", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(2) - 7, 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"], summary: "Pipeline coverage slipping towards 2.8x. Qualification playbook publication agreed.", rating: 8 },
    { key: "w0", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(2), 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"], summary: "Physio GA on track. Wave 3 migration re-planned for mid-November pending PCI remediation.", rating: 8 },
    { key: "w+1", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(2) + 7, 8, 30), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"] },
    { key: "mb", type: "board_monthly", title: "Monthly Board", at: at(-12, 14, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo"], summary: "September check-in: revenue 2% behind budget, EBITDA 6% behind on delayed migration savings. Decision: approve retained search fee for VP Enterprise Sales.", rating: 8 },
    { key: "mb+1", type: "board_monthly", title: "Monthly Board", at: at(18, 14, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo"] },
    { key: "qo", type: "quarterly", title: "Quarterly offsite", at: at(-25, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco", "people"], summary: "Q3 reviewed: two achieved, one partly achieved, one missed. Three Q4 priorities agreed.", rating: 9 },
    { key: "qo+1", type: "quarterly", title: "Quarterly offsite and annual strategy reset", at: at(72, 9, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco", "people"] },
    { key: "qb+1", type: "board_quarterly", title: "Quarterly Board", at: at(79, 10, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo"] },
  ],
  issues: [
    { key: "pci", title: "PCI DSS audit findings are delaying Clinara Pay migration", description: "The QSA raised six findings (two high) on key management and network segmentation. Migration wave 3 cannot proceed until remediation evidence is accepted.", priority: "critical", status: "in_discussion", owner: "cpto", raisedBy: "payments", priorityKey: "migrate", metric: "migrated", raisedIn: "w-3", escalated: true, createdDaysAgo: 22 },
    { key: "slip", title: "Enterprise deals slipping to Q1 on group procurement cycles", description: "Three group deals (£1.1m ARR) have moved close dates into Q1 as procurement teams add security reviews.", priority: "high", status: "open", owner: "cro", raisedBy: "cro", priorityKey: "enterprise", metric: "newarr", raisedIn: "w-3", createdDaysAgo: 21 },
    { key: "support", title: "Support response times rising after physio beta expansion", description: "First-response time above 4 hours for three consecutive weeks; physio queries take twice as long to resolve.", priority: "medium", status: "open", owner: "cco", raisedBy: "cco", metric: "frt", raisedIn: "w-2", createdDaysAgo: 15 },
    { key: "pricing", title: "Pushback from legacy customers on 7% price uplift", description: "40 legacy customers formally objected to the uplift.", priority: "medium", status: "resolved", owner: "cco", raisedBy: "cco", raisedIn: "w-5", resolvedIn: "w-4", resolution: "Uplift held with a 90-day notice period and an optional annual prepay discount.", createdDaysAgo: 38 },
  ],
  decisions: [
    { key: "recruiter", title: "Retain a specialist search firm for the VP Enterprise Sales hire", rationale: "Internal search exhausted after 14 weeks; a retained search with healthcare-group specialism gives the best chance of an offer before December.", owner: "cro", meeting: "w-4", decidedDaysAgo: 28 },
    { key: "pci-first", title: "Pause migration wave 3 until PCI remediation is accepted", rationale: "Migrating more merchants before certification increases audit scope and risk. Wave 3 re-planned for mid-November.", owner: "cpto", issue: "pci", meeting: "w-3", decidedDaysAgo: 21 },
    { key: "uplift", title: "Hold the 7% legacy price uplift with 90-day notice", rationale: "Churn modelling shows <2% incremental churn; notice period and prepay option address the main objections.", owner: "cco", issue: "pricing", meeting: "w-4", decidedDaysAgo: 28 },
    { key: "qualify", title: "Make the single qualification method mandatory for opportunities over £50k", rationale: "Win rate on qualified deals is twice that of unqualified ones; consistent qualification improves forecast accuracy.", owner: "cro", meeting: "w-1", decidedDaysAgo: 7 },
  ],
  actions: [
    { title: "Brief the search firm and agree shortlist timeline", owner: "cro", due: -20, status: "done", decision: "recruiter", meeting: "w-4", priorityKey: "enterprise", createdDaysAgo: 28 },
    { title: "Submit PCI remediation evidence to the QSA", description: "Key rotation runbook, segmentation test results and updated policies.", owner: "payments", due: -2, status: "open", issue: "pci", decision: "pci-first", meeting: "w-3", priorityKey: "migrate", metric: "migrated", createdDaysAgo: 21 },
    { title: "Re-plan migration waves 3 and 4 with revised dates", owner: "cpto", due: -6, status: "done", issue: "pci", meeting: "w-3", priorityKey: "migrate", createdDaysAgo: 21 },
    { title: "Rebuild Q4 enterprise forecast with deal-level close plans", owner: "cfo", due: 6, status: "open", issue: "slip", meeting: "w-2", priorityKey: "enterprise", metric: "newarr", createdDaysAgo: 14 },
    { title: "Publish the qualification playbook and train all account executives", owner: "cro", due: 6, status: "open", decision: "qualify", meeting: "w-1", priorityKey: "enterprise", createdDaysAgo: 7 },
    { title: "Add two support agents to the physio queue", owner: "cco", due: -3, status: "open", issue: "support", meeting: "w-2", metric: "frt", createdDaysAgo: 14 },
    { title: "Recover delayed migration savings: decommission legacy hosting in wave order", owner: "cfo", due: 25, status: "open", metric: "ebitda", meeting: "w-5", createdDaysAgo: 36 },
    { title: "Confirm physio GA launch date with design partners", owner: "cpto", due: 9, status: "open", priorityKey: "physio", meeting: "w0", createdDaysAgo: 2 },
    { title: "Send uplift notice letters with prepay option", owner: "cco", due: -24, status: "done", decision: "uplift", meeting: "w-4", createdDaysAgo: 28 },
  ],
  orgActions: [
    { type: "hire", title: "Hire a VP Enterprise Sales by 30 November", description: "Critical to the enterprise outcome: owns the group-account motion and the enterprise forecast.", priority: "critical", status: "in_progress", owner: "cro", priorityKey: "enterprise", targetDays: 38 },
    { type: "critical_role", title: "Head of Payments is a critical role for the platform outcome", description: "Name a deputy for PCI compliance and payments migration so delivery does not depend on one person.", priority: "high", status: "open", owner: "cpto", goal: "migration", targetDays: 60 },
    { type: "structure", title: "Clarify responsibilities between Sales and Customer Success for expansion revenue", description: "Agree who owns upsell on Tier 1 accounts and how hand-offs work.", priority: "high", status: "in_progress", owner: "ceo", goal: "nrr", targetDays: 30 },
    { type: "capability", title: "Build a revenue operations capability", description: "CRM hygiene, forecasting and pipeline analytics have no single owner.", priority: "high", status: "open", owner: "cfo", goal: "newarr", targetDays: 75 },
    { type: "capability", title: "Run a leadership development programme for the executive team", description: "Programme for the ELT on decision-making and leading through growth.", priority: "medium", status: "in_progress", owner: "people", targetDays: 150 },
  ],
  comments: [
    { priority: "enterprise", author: "marcus@clinara.demo", kind: "update", body: "Two candidates through to final round; three more being sourced. Revised process live from Monday.", daysAgo: 6 },
    { priority: "migrate", author: "aisha@clinara.demo", kind: "update", body: "Wave 3 blocked on PCI remediation. Engineering ready; restart 16 Nov if the QSA accepts evidence.", daysAgo: 3 },
    { priority: "physio", author: "aisha@clinara.demo", kind: "update", body: "Release candidate in UAT with six design partners. 14 clinics live and paying.", daysAgo: 2 },
  ],
  listening: [
    { kind: "employee", daysAgo: 200, method: "Engagement survey", responses: 196, engagement: 68, enps: 18, leadership_confidence: 64, strategy_confidence: 58, clarity_accountability: 55, themes: ["Unclear ownership between Sales and Customer Success", "Pride in the product", "Release pressure on engineering"], summary: "Engagement steady; clarity on who owns what is the main frustration.", actions: [{ title: "Publish the accountability chart to all staff", owner: "ceo", due: -170, status: "done" }] },
    { kind: "customer", daysAgo: 150, method: "Structured interviews (22 clinics) and NPS", nps: 44, satisfaction: 81, retention: 94, churn: 1.1, themes: ["Payments set-up is slow", "Support quality strong", "Physio clinics want multi-site reporting"], issues: "Payments onboarding takes 3 weeks on average.", summary: "Satisfaction high; payments onboarding is the main friction.", actions: [{ title: "Cut payments onboarding to one week", owner: "payments", due: -60, status: "done" }] },
    { kind: "employee", daysAgo: 30, method: "Pulse survey", responses: 171, engagement: 71, enps: 26, leadership_confidence: 69, strategy_confidence: 66, clarity_accountability: 63, themes: ["Clearer priorities since the offsite", "Support team stretched", "Want more visibility of the plan"], summary: "Clarity and confidence in strategy up; support workload is the concern.", actions: [{ title: "Share the quarterly priorities at every all-hands", owner: "ceo", due: 20, status: "open" }, { title: "Agree support staffing plan for physio growth", owner: "cco", due: 14, status: "open" }] },
    { kind: "customer", daysAgo: 21, method: "NPS survey and advisory group", nps: 49, satisfaction: 84, retention: 95, churn: 0.94, themes: ["Faster payments onboarding noticed", "Response times slipping", "Enterprise groups want consolidated billing"], issues: "First-response times above four hours since the physio beta.", summary: "NPS up five points; response times are the main complaint.", actions: [{ title: "Restore first response under four hours", owner: "cco", due: 10, status: "open" }] },
  ],
  reset: {
    wins: "Single qualification method rolled out; 1,200 clinics migrated in wave 2; physio beta adopted weekly by all ten design partners.",
    misses: "VP Enterprise Sales not appointed. Referral programme signed two of three partners.",
    lessons: "Retained search is required for senior enterprise hires. Migration waves need certification gates in the plan.",
    constraints: "Enterprise sales capacity limits new ARR. Payments compliance depends on one specialist.",
  },
  investmentCase: {
    entry_date: `${Y - 1}-03-14`,
    entry_ev: m(165),
    entry_multiple: 28,
    target_exit_date: `${Y + 2}-12-31`,
    target_exit_ev: m(400),
    target_moic: 2.9,
    target_irr: 0.31,
    internal_thesis: "Buy-and-build potential in adjacent verticals; payments and pricing provide ~£6m EBITDA upside not in the management case.",
    key_risks: "Enterprise sales capacity; PCI certification timing; physio product-market fit.",
  },
  omniNotes: [
    { body: "Enterprise capacity is the constraint. Omni talent network offered for the VP Enterprise Sales search. Weekly check-in on PCI remediation until certification.", level: "support", daysAgo: 12 },
    { body: "Revenue close to plan; EBITDA gap driven by delayed migration savings rather than cost overrun. Monitor through Q4.", level: "monitor", daysAgo: 40 },
  ],
};
