// Company A — Clinara: B2B vertical SaaS for independent veterinary and dental clinics.
// ~£25m revenue, ~£8m EBITDA. Story: revenue broadly on plan, but enterprise
// pipeline coverage has just deteriorated below target — the chain from the
// North Star (£20m EBITDA) to this week's meeting agenda is visible end to end.
import { TODAY, day, lastWeekday, at, type CompanySpec, type SeriesCtx } from "./lib";

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
    brand_color: "#2563EB",
    acquired_on: `${Y - 1}-03-14`,
  },
  people: [
    { key: "ceo", full_name: "Daniel Okafor", title: "Chief Executive Officer", seat: "Visionary & integrator", responsibilities: ["Value creation plan", "Leadership team", "Board & Omni relationship", "Capital allocation"], email: "daniel@clinara.demo", login: "company_admin", avatar_color: "#0EA5E9" },
    { key: "cfo", full_name: "Rachel Lim", title: "Chief Financial Officer", seat: "Finance", responsibilities: ["Budget & forecasting", "Monthly reporting", "Cash & working capital", "Pricing governance"], reports_to: "ceo", email: "rachel@clinara.demo", login: "executive", avatar_color: "#8B5CF6" },
    { key: "cro", full_name: "Marcus Webb", title: "Chief Revenue Officer", seat: "Revenue", responsibilities: ["New ARR", "Sales process & forecasting", "Pipeline generation", "Enterprise sales"], reports_to: "ceo", email: "marcus@clinara.demo", login: "executive", avatar_color: "#F59E0B" },
    { key: "cpto", full_name: "Aisha Khan", title: "Chief Product & Technology Officer", seat: "Product & Technology", responsibilities: ["Product roadmap", "Platform integration", "Security & compliance", "Engineering delivery"], reports_to: "ceo", email: "aisha@clinara.demo", login: "executive", avatar_color: "#10B981" },
    { key: "cco", full_name: "Ben Carter", title: "Chief Customer Officer", seat: "Customer", responsibilities: ["Net revenue retention", "Onboarding", "Support", "Customer success"], reports_to: "ceo", email: "ben@clinara.demo", login: "executive", avatar_color: "#EF4444" },
    { key: "cmo", full_name: "Ella Brooks", title: "Chief Marketing Officer", seat: "Marketing", responsibilities: ["Demand generation", "Brand", "Vertical launches"], reports_to: "cro", avatar_color: "#EC4899" },
    { key: "people", full_name: "Hannah Doyle", title: "People Director", seat: "People", responsibilities: ["Talent acquisition", "Leadership development", "Engagement"], reports_to: "ceo", avatar_color: "#14B8A6" },
    { key: "vpsales", full_name: "VP Enterprise Sales", title: "VP Enterprise Sales (open seat)", seat: "Enterprise sales", responsibilities: ["Enterprise & group accounts", "Sales methodology", "Enterprise forecast"], reports_to: "cro", open: true },
    { key: "payments", full_name: "Tomasz Nowak", title: "Head of Payments", seat: "Clinara Pay", responsibilities: ["Payments migration", "PCI DSS compliance"], reports_to: "cpto", leadership: false, avatar_color: "#6366F1" },
  ],
  observers: [{ email: "helen@clinara.demo", full_name: "Helen Fraser", title: "Non-Executive Chair" }],
  northStar: {
    purpose: "Give independent clinics the software, insight and payments infrastructure to out-compete the corporate groups.",
    vision: "The operating system for every independent clinic in the UK and Ireland — from appointment to payment to patient retention.",
    five_year_ambition: "The category-defining platform for independent healthcare practices: 6,000+ clinics across four verticals, a payments business embedded in every workflow, and a recognised brand in Ireland and the Nordics.",
    three_year_destination: `By ${Y + 2}, Clinara will be a £60m revenue, £20m EBITDA unified platform serving veterinary, dental and physiotherapy clinics, with more than 40% of revenue from payments and modules launched since acquisition, an enterprise group sales engine generating £10m+ new ARR a year, and net revenue retention above 115%.`,
    investment_thesis: "Fragmented, under-digitised end market with sticky workflow software. Clear levers: professionalise go-to-market, monetise the installed base through payments and pricing, and extend the platform into adjacent verticals that share the same clinic workflow.",
    exit_equity_story: "A Rule-of-40 vertical SaaS leader with embedded payments, proven multi-vertical expansion and a repeatable enterprise motion — positioned for a strategic buyer seeking a UK healthcare software platform, or a large-cap sponsor seeking a buy-and-build vertical SaaS asset.",
    buyer_proposition: "Strategic acquirers get a scaled, profitable platform with payments attach and a cross-sell runway into adjacent verticals; sponsors get predictable recurring revenue, 115%+ NRR and a proven M&A integration capability.",
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
      "Enterprise groups (10+ sites) can be won with a dedicated sales team and a 6–9 month cycle.",
      "Gross margin holds at or above 78% as payments revenue scales.",
    ],
  },
  conditions: [
    { title: "A repeatable enterprise sales engine", description: "Dedicated enterprise team, consistent qualification (MEDDICC) and ≥3x pipeline coverage every quarter.", status: "at_risk", owner: "cro" },
    { title: "One unified platform", description: "Every customer on the unified platform with Clinara Pay embedded, enabling cross-sell and a single data model.", status: "at_risk", owner: "cpto" },
    { title: "Retention-led growth", description: "Net revenue retention sustained above 115% through success plans, pricing discipline and module adoption.", status: "on_track", owner: "cco" },
    { title: "Proven adjacent vertical playbook", description: "Physio edition reaching product-market fit within 12 months of launch, creating a playbook for optometry.", status: "on_track", owner: "cpto" },
  ],
  moves: [
    { key: "organic", title: "Accelerate organic ARR growth", description: "Grow new logos in the core veterinary and dental markets through partner channels, inbound demand and a sharper mid-market offer.", outcome: `£27m exit ARR by December ${Y}; £36m by December ${Y + 1}`, owner: "cmo", status: "on_track", progress: 62 },
    { key: "enterprise", title: "Professionalise enterprise sales", description: "Build a dedicated enterprise team with a consistent qualification methodology, forecasting cadence and group-account playbook.", outcome: "£8m new enterprise ARR this year; ≥3x pipeline coverage maintained", owner: "cro", status: "at_risk", progress: 48 },
    { key: "nrr", title: "Lift net revenue retention to 115%", description: "Tiered success plans, module adoption and disciplined pricing on the legacy cohort.", outcome: "NRR ≥115% and gross logo churn ≤1% monthly", owner: "cco", status: "on_track", progress: 66 },
    { key: "verticals", title: "Expand into adjacent verticals", description: "Launch Clinara Physio, then optometry, reusing the core scheduling, billing and payments platform.", outcome: "40 physio clinics live this year; optometry pilot next year", owner: "cpto", status: "on_track", progress: 41 },
    { key: "platform", title: "Complete product & payments integration", description: "Migrate every customer onto the unified platform with Clinara Pay embedded and PCI DSS Level 1 certified.", outcome: "100% of customers on the unified platform by year end", owner: "cpto", status: "off_track", progress: 58 },
  ],
  milestones: [
    { title: "Omni investment completes", date: `${Y - 1}-03-14`, status: "done" },
    { title: "Clinara Pay launched", date: `${Y - 1}-11-10`, status: "done", move: "platform" },
    { title: "MEDDICC rolled out across sales", date: `${Y}-09-30`, status: "done", move: "enterprise" },
    { title: "Physio edition general availability", date: `${Y}-11-25`, status: "on_track", move: "verticals" },
    { title: "Unified platform migration complete", date: `${Y}-12-18`, status: "at_risk", move: "platform" },
    { title: "£30m ARR", date: `${Y + 1}-06-30`, status: "not_started", move: "organic" },
    { title: "Optometry pilot", date: `${Y + 1}-09-30`, status: "not_started", move: "verticals" },
    { title: "Ireland enterprise launch", date: `${Y + 2}-03-31`, status: "not_started", move: "enterprise" },
    { title: "£20m EBITDA run-rate", date: `${Y + 2}-09-30`, status: "not_started" },
    { title: "Exit process", date: `${Y + 2}-12-31`, status: "not_started" },
  ],
  goals: [
    { key: "arr", move: "organic", title: "Reach £27m exit ARR", outcome: "£27.0m ARR at 31 December", unit: "currency", baseline: m(23.3), target: m(27), current: m(25.6), owner: "cro", status: "on_track", progress: 62 },
    { key: "newarr", move: "enterprise", title: "Book £8m new enterprise ARR", outcome: "£8.0m new ARR from groups of 10+ sites", unit: "currency", baseline: 0, target: m(8), current: m(5.2), owner: "cro", status: "at_risk", progress: 65 },
    { key: "nrr", move: "nrr", title: "Deliver 112% net revenue retention", outcome: "NRR ≥112% (trailing 12 months) by December", unit: "percent", baseline: 106, target: 112, current: 111, owner: "cco", status: "on_track", progress: 83 },
    { key: "physio", move: "verticals", title: "Launch Clinara Physio with 40 clinics live", outcome: "40 paying physio clinics live by 31 December", unit: "number", baseline: 0, target: 40, current: 14, owner: "cpto", status: "on_track", progress: 35 },
    { key: "migration", move: "platform", title: "Migrate 100% of customers to the unified platform", outcome: "All customers migrated with Clinara Pay enabled", unit: "percent", baseline: 22, target: 100, current: 65, owner: "cpto", status: "off_track", progress: 55 },
    { key: "ebitda", move: "organic", title: "Deliver £8.0m EBITDA", outcome: "FY EBITDA of £8.0m at ≥32% margin", unit: "currency", target: m(8), current: m(5.8), owner: "cfo", status: "at_risk", progress: 72 },
  ],
  previousPriorities: [
    { key: "q-meddicc", goal: "newarr", title: "Roll out MEDDICC across the sales team", outcome: "100% of opportunities >£50k qualified in MEDDICC", owner: "cro", status: "done", progress: 100 },
    { key: "q-paylaunch", goal: "migration", title: "Migrate wave 2 customers (1,200 clinics)", outcome: "1,200 clinics live on unified platform", owner: "cpto", status: "done", progress: 100 },
    { key: "q-physiobeta", goal: "physio", title: "Physio beta with 10 design partners", outcome: "10 clinics using physio beta weekly", owner: "cpto", status: "done", progress: 100 },
    { key: "q-price", goal: "nrr", title: "Legacy cohort price uplift", outcome: "7% uplift applied with <2% incremental churn", owner: "cco", status: "done", progress: 100 },
    { key: "q-partners", goal: "arr", title: "Sign 3 referral partners", outcome: "3 partner agreements signed", owner: "cmo", status: "missed", progress: 67 },
    { key: "q-vphire", goal: "newarr", title: "Appoint VP Enterprise Sales", outcome: "Offer accepted", owner: "cro", status: "missed", progress: 40 },
  ],
  priorities: [
    { key: "vpsales", goal: "newarr", title: "Hire a VP Enterprise Sales and launch the revised sales process", description: "Appoint a VP Enterprise Sales with group-account experience and launch the revised enterprise process (MEDDICC, deal desk, weekly forecast call).", outcome: "VP offer accepted; revised process live for all enterprise opportunities", owner: "cro", status: "at_risk", progress: 45 },
    { key: "deals", goal: "newarr", title: "Close six enterprise group deals", outcome: "6 signed group contracts (£2.4m new ARR)", owner: "cro", status: "at_risk", progress: 33 },
    { key: "migrate", goal: "migration", title: "Migrate the remaining 35% of customers to the unified platform", outcome: "Wave 3 & 4 migrated; legacy platform read-only", owner: "cpto", status: "off_track", progress: 30 },
    { key: "pci", goal: "migration", title: "Achieve PCI DSS Level 1 certification", outcome: "Attestation of Compliance issued", owner: "payments", status: "at_risk", progress: 55 },
    { key: "physio-ga", goal: "physio", title: "Release Clinara Physio to general availability", outcome: "GA release with 25 clinics live", owner: "cpto", status: "on_track", progress: 60 },
    { key: "success", goal: "nrr", title: "Launch tiered success plans for top 300 customers", outcome: "Success plans agreed with 300 customers", owner: "cco", status: "on_track", progress: 50 },
    { key: "partners", goal: "arr", title: "Launch partner referral programme", outcome: "3 partners live and 40 partner-sourced SQLs", owner: "cmo", status: "on_track", progress: 40 },
  ],
  metrics: [
    {
      key: "revenue", name: "Revenue", description: "Recognised monthly revenue (management accounts).", category: "financial", unit: "currency", frequency: "monthly",
      direction: "higher_is_better", tolerance: 5, aggregation: "flow", owner: "cfo", comparable: "revenue", isKey: true, history: 21, futureTargets: 3,
      series: (c) => { const t = revenuePlan(c); return { target: t, value: c.future ? null : Math.round(t * (0.995 - 0.022 * c.t) * c.noise(0.012)) }; },
      links: [{ move: "organic" }],
    },
    {
      key: "ebitda", name: "EBITDA", description: "Adjusted EBITDA before exceptional items.", category: "financial", unit: "currency", frequency: "monthly",
      direction: "higher_is_better", tolerance: 8, aggregation: "flow", owner: "cfo", comparable: "ebitda", isKey: true, history: 21, futureTargets: 3,
      series: (c) => { const t = ebitdaPlan(c); return { target: t, value: c.future ? null : Math.round(t * (1.0 - 0.06 * c.t) * c.noise(0.03)) }; },
      links: [{ goal: "ebitda" }],
    },
    {
      key: "arr", name: "Annual recurring revenue", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better",
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
      key: "pipeline", name: "Enterprise pipeline coverage", description: "Qualified enterprise pipeline for the next two quarters ÷ enterprise bookings target.", category: "commercial", unit: "ratio",
      decimals: 1, frequency: "weekly", direction: "higher_is_better", target: 3, tolerance: 15, owner: "cro", comparable: "pipeline_coverage", isKey: true, history: 20,
      series: (c) => {
        // Healthy for most of the history, then a sharp deterioration in the last five weeks.
        const back = c.n - 1 - c.i;
        const v = back <= 4 ? [2.3, 2.6, 2.8, 2.9, 3.1][back] : 3.2 + 0.25 * Math.sin(c.i / 2) + (c.noise(0.03) - 1);
        return { value: +v.toFixed(1) };
      },
      links: [{ goal: "newarr" }, { priority: "vpsales" }],
    },
    {
      key: "newarr", name: "New ARR booked", description: "Signed new annual recurring revenue (all segments).", category: "commercial", unit: "currency", frequency: "monthly",
      direction: "higher_is_better", target: 667_000, tolerance: 15, aggregation: "flow", owner: "cro", comparable: "new_arr", isKey: true, history: 21,
      series: (c) => ({ value: Math.round(667_000 * (c.year === Y ? 0.86 : 0.8) * c.noise(0.16)) }),
      links: [{ goal: "newarr" }, { priority: "deals" }],
    },
    {
      key: "winrate", name: "Enterprise win rate", category: "commercial", unit: "percent", frequency: "monthly", direction: "higher_is_better",
      target: 28, tolerance: 15, owner: "cro", history: 21,
      series: (c) => ({ value: Math.round(29 - 6 * c.t + (c.noise(0.05) - 1) * 40) }),
      links: [{ priority: "vpsales" }],
    },
    {
      key: "sqls", name: "Sales-qualified opportunities", category: "commercial", unit: "number", frequency: "weekly", direction: "higher_is_better",
      target: 18, tolerance: 15, aggregation: "flow", owner: "cmo", history: 20,
      series: (c) => ({ value: Math.round(17 + 3 * c.t + (c.noise(0.12) - 1) * 18) }),
      links: [{ priority: "partners" }],
    },
    {
      key: "nrr", name: "Net revenue retention", description: "Trailing-12-month NRR.", category: "customer", unit: "percent", decimals: 0, frequency: "monthly",
      direction: "higher_is_better", target: 112, tolerance: 4, owner: "cco", comparable: "nrr", isKey: true, history: 21,
      series: (c) => ({ value: Math.round(105 + 6 * c.t + (c.noise(0.005) - 1) * 100) }),
      links: [{ goal: "nrr" }, { priority: "success" }],
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
      key: "frt", name: "Support first response (hours)", category: "customer", unit: "number", decimals: 1, frequency: "weekly", direction: "lower_is_better",
      target: 4, tolerance: 20, owner: "cco", history: 20,
      series: (c) => { const back = c.n - 1 - c.i; return { value: +((back < 3 ? 4.6 : 3.4) * c.noise(0.08)).toFixed(1) }; },
    },
    {
      key: "migrated", name: "Customers on unified platform", category: "operational", unit: "percent", frequency: "monthly", direction: "higher_is_better",
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
      links: [{ priority: "physio-ga" }],
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
  ],
  meetings: [
    { key: "w-5", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(2) - 35, 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"], summary: "Reviewed Q3 close-out. Agreed to prioritise PCI remediation ahead of migration wave 3.", rating: 8 },
    { key: "w-4", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(2) - 28, 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"], summary: "Q4 priorities confirmed. VP Enterprise Sales search to move to retained recruiter.", rating: 8 },
    { key: "w-3", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(2) - 21, 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto"], absent: ["cco"], summary: "PCI audit findings raised; migration wave 3 delayed. Enterprise deals slipping on procurement.", rating: 7 },
    { key: "w-2", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(2) - 14, 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"], summary: "Forecast rebuild requested for enterprise. Support response times reviewed after physio beta.", rating: 7 },
    { key: "w-1", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(2) - 7, 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"], summary: "Pipeline coverage slipping towards 2.8x. MEDDICC playbook publication agreed.", rating: 8 },
    { key: "w0", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(2), 8, 30), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"], summary: "Physio GA on track. Wave 3 migration re-planned for mid-November pending PCI remediation.", rating: 8 },
    { key: "w+1", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(2) + 7, 8, 30), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco"] },
    { key: "mor", type: "monthly", title: "Monthly Operating Review", at: at(-14, 13, 0), status: "completed", facilitator: "cfo", attendees: ["ceo", "cfo", "cro", "cpto", "cco", "people"], summary: "September results: revenue 2% behind plan, EBITDA 6% behind on delayed migration savings. NRR improving. Agreed enterprise forecast rebuild and payments recovery plan.", rating: 8 },
    { key: "mor+1", type: "monthly", title: "Monthly Operating Review", at: at(16, 13, 0), status: "scheduled", facilitator: "cfo", attendees: ["ceo", "cfo", "cro", "cpto", "cco", "people"] },
    { key: "qp", type: "quarterly", title: "Quarterly Strategic Reset", at: at(-25, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco", "people"], summary: "Closed Q3 with 4 of 6 priorities delivered. Approved seven Q4 priorities focused on enterprise sales, migration and physio launch.", rating: 9 },
    { key: "qp+1", type: "quarterly", title: "Quarterly Strategic Reset", at: at(75, 9, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "cro", "cpto", "cco", "people"] },
  ],
  issues: [
    { key: "pci", title: "PCI DSS audit findings are delaying Clinara Pay migration", description: "The QSA raised 6 findings (2 high) on key management and network segmentation. Migration wave 3 cannot proceed until remediation evidence is accepted.", priority: "critical", status: "in_discussion", owner: "cpto", raisedBy: "payments", priorityKey: "migrate", metric: "migrated", raisedIn: "w-3", escalated: true, createdDaysAgo: 22 },
    { key: "slip", title: "Enterprise deals slipping to Q1 on group procurement cycles", description: "Three group deals (£1.1m ARR) have moved close dates into Q1 as procurement teams add security reviews.", priority: "high", status: "open", owner: "cro", raisedBy: "cro", priorityKey: "deals", metric: "newarr", raisedIn: "w-3", createdDaysAgo: 21 },
    { key: "shortlist", title: "VP Enterprise Sales shortlist lacks group-account experience", description: "First recruiter shortlist is strong on SMB SaaS but light on multi-site healthcare groups.", priority: "high", status: "open", owner: "cro", raisedBy: "ceo", priorityKey: "vpsales", raisedIn: "w-1", createdDaysAgo: 8 },
    { key: "support", title: "Support response times rising after physio beta expansion", description: "First-response time above 4 hours for three consecutive weeks; physio queries take 2x longer to resolve.", priority: "medium", status: "open", owner: "cco", raisedBy: "cco", metric: "frt", raisedIn: "w-2", createdDaysAgo: 15 },
    { key: "pricing", title: "Pushback from legacy customers on 7% price uplift", description: "40 legacy customers formally objected to the uplift.", priority: "medium", status: "resolved", owner: "cco", raisedBy: "cco", raisedIn: "w-5", resolvedIn: "w-4", resolution: "Uplift held with a 90-day notice period and an optional annual prepay discount.", createdDaysAgo: 38 },
  ],
  decisions: [
    { key: "recruiter", title: "Retain Hatton Search for the VP Enterprise Sales hire", rationale: "Internal search exhausted after 14 weeks; retained search with healthcare-group specialism gives the best chance of an offer before December.", owner: "cro", meeting: "w-4", decidedDaysAgo: 28 },
    { key: "pci-first", title: "Pause migration wave 3 until PCI remediation is accepted", rationale: "Migrating more merchants before certification increases audit scope and risk. Wave 3 re-planned for mid-November.", owner: "cpto", issue: "pci", meeting: "w-3", decidedDaysAgo: 21 },
    { key: "uplift", title: "Hold the 7% legacy price uplift with 90-day notice", rationale: "Churn modelling shows <2% incremental churn; notice period and prepay option address the main objections.", owner: "cco", issue: "pricing", meeting: "w-4", decidedDaysAgo: 28 },
    { key: "meddicc", title: "Adopt MEDDICC as the mandatory qualification standard for opportunities over £50k", rationale: "Win rate on MEDDICC-qualified deals is 2x unqualified; consistent qualification improves forecast accuracy.", owner: "cro", meeting: "w-1", decidedDaysAgo: 7 },
  ],
  actions: [
    { title: "Brief Hatton Search and agree shortlist timeline", owner: "cro", due: -20, status: "done", decision: "recruiter", meeting: "w-4", priorityKey: "vpsales", createdDaysAgo: 28 },
    { title: "Submit PCI remediation evidence to the QSA", description: "Key rotation runbook, segmentation test results and updated policies.", owner: "payments", due: -2, status: "open", issue: "pci", decision: "pci-first", meeting: "w-3", priorityKey: "pci", createdDaysAgo: 21 },
    { title: "Re-plan migration waves 3 and 4 with revised dates", owner: "cpto", due: -6, status: "done", issue: "pci", meeting: "w-3", priorityKey: "migrate", createdDaysAgo: 21 },
    { title: "Rebuild Q4 enterprise forecast with deal-level close plans", owner: "cfo", due: -1, status: "open", issue: "slip", meeting: "w-2", priorityKey: "deals", createdDaysAgo: 14 },
    { title: "Publish MEDDICC playbook and train all account executives", owner: "cro", due: 6, status: "open", decision: "meddicc", meeting: "w-1", priorityKey: "vpsales", createdDaysAgo: 7 },
    { title: "Ask Hatton for three additional candidates from multi-site healthcare", owner: "cro", due: 3, status: "open", issue: "shortlist", meeting: "w-1", priorityKey: "vpsales", createdDaysAgo: 7 },
    { title: "Add two support agents to the physio queue", owner: "cco", due: -3, status: "open", issue: "support", meeting: "w-2", createdDaysAgo: 14 },
    { title: "Draft success plan templates for Tier 1 customers", owner: "cco", due: 4, status: "open", priorityKey: "success", meeting: "w0", createdDaysAgo: 2 },
    { title: "Confirm physio GA launch date with design partners", owner: "cpto", due: 9, status: "open", priorityKey: "physio-ga", meeting: "w0", createdDaysAgo: 2 },
    { title: "Send uplift notice letters with prepay option", owner: "cco", due: -24, status: "done", decision: "uplift", meeting: "w-4", createdDaysAgo: 28 },
  ],
  gaps: [
    { type: "hire", title: "VP Enterprise Sales", description: "Critical to the enterprise Winning Move; owner of group-account motion and enterprise forecast.", priority: "critical", status: "in_progress", owner: "cro", targetDays: 45 },
    { type: "hire", title: "Head of Partnerships", description: "Own referral and integration partners for organic growth.", priority: "medium", status: "open", owner: "cmo", targetDays: 120 },
    { type: "capability", title: "Revenue operations & sales analytics", description: "No single owner of CRM hygiene, forecasting and pipeline analytics.", priority: "high", status: "open", owner: "cfo", targetDays: 60 },
    { type: "development", title: "Scaling engineering leadership", description: "Executive coaching for Aisha as the product organisation grows past 90 people.", priority: "medium", status: "in_progress", owner: "people", person: "cpto", targetDays: 180 },
    { type: "development", title: "Commercial expansion skills for customer success", description: "Equip CSMs to own expansion revenue on Tier 1 accounts.", priority: "medium", status: "open", owner: "cco", person: "cco", targetDays: 90 },
  ],
  comments: [
    { priority: "vpsales", author: "marcus@clinara.demo", kind: "update", body: "Two candidates through to final round. Hatton sourcing three more with multi-site healthcare experience. Revised process (deal desk + weekly forecast call) live from Monday.", daysAgo: 6 },
    { priority: "migrate", author: "aisha@clinara.demo", kind: "update", body: "Wave 3 (900 clinics) blocked on PCI remediation. Engineering ready; plan to restart 16 Nov if QSA accepts evidence.", daysAgo: 3 },
    { priority: "physio-ga", author: "aisha@clinara.demo", kind: "update", body: "Release candidate in UAT with 6 design partners. 14 clinics live and paying.", daysAgo: 2 },
  ],
  reset: {
    wins: "MEDDICC rolled out; 1,200 clinics migrated in wave 2; physio beta adopted weekly by all 10 design partners; legacy price uplift landed with minimal churn.",
    misses: "VP Enterprise Sales not appointed (internal search exhausted). Referral programme signed only 2 of 3 partners.",
    lessons: "Retained search is required for senior enterprise hires. Migration waves need certification gates built into the plan.",
    constraints: "Enterprise sales capacity is the binding constraint on new ARR. Payments compliance capacity is limited to one specialist.",
  },
  investmentCase: {
    entry_date: `${Y - 1}-03-14`,
    entry_ev: m(165),
    entry_multiple: 28,
    target_exit_date: `${Y + 2}-12-31`,
    target_exit_ev: m(400),
    target_moic: 2.9,
    target_irr: 0.31,
    internal_thesis: "Buy-and-build potential in adjacent verticals; payments and pricing provide ~£6m EBITDA upside not in management case.",
    key_risks: "Enterprise sales leadership gap; PCI certification timing; physio product-market fit.",
  },
  omniNotes: [
    { body: "Operating review: enterprise capacity is the constraint. Offered support from Omni talent network for VP Sales search. Recommend weekly check-in on PCI remediation until certification.", level: "support", daysAgo: 12 },
    { body: "Revenue tracking close to plan; EBITDA gap driven by delayed migration savings rather than cost overrun. Monitor through Q4.", level: "monitor", daysAgo: 40 },
  ],
};

export const clinaraToday = day(0);
