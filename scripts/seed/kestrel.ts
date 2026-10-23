// Company B — Kestrel Compliance Services: technology-enabled fire, security and
// building-compliance services. ~£45m revenue, ~£6m EBITDA. Story: revenue on plan
// but gross margin and EBITDA behind on subcontractor costs; Omni support needed.
// Kestrel has personalised its workspace (green and white, with its logo).
import { TODAY, at, lastWeekday, type CompanySpec, type SeriesCtx } from "./lib";

const Y = TODAY.getUTCFullYear();
const m = (mn: number) => mn * 1_000_000;

function phased(jan: number, step: number, lyJan: number, lyStep: number) {
  return (c: SeriesCtx) => (c.year === Y ? jan + (c.month - 1) * step : lyJan + (c.month - 1) * lyStep);
}
const revenuePlan = phased(m(3.55), m(0.035), m(3.1), m(0.03));
const ebitdaPlan = phased(m(0.44), m(0.011), m(0.36), m(0.006));

export const kestrel: CompanySpec = {
  company: {
    slug: "kestrel",
    name: "Kestrel Compliance Services",
    legal_name: "Kestrel Compliance Group Ltd",
    sector: "Technology-enabled services",
    description: "Fire safety, security systems and statutory building-compliance services for commercial, public-sector and housing estates, delivered by 420 field engineers on a proprietary scheduling platform.",
    headquarters: "Leeds, UK",
    brand_color: "#0F7B4F",
    acquired_on: `${Y - 2}-09-30`,
  },
  branding: { primary: "#0F7B4F", secondary: "#2BB673", accent: "#B9E8CF", logo: "kestrel.png" },
  onboardingDay: 760,
  reporting: { flashHeadline: "September trading slightly ahead of budget; subcontractor costs still above plan.", latestCheckInDraft: true, approveThisWeek: true },
  people: [
    { key: "ceo", full_name: "Sarah Mitchell", title: "Chief Executive Officer", seat: "CEO", responsibilities: ["Owns the business and the plan", "M&A strategy", "Leads the ELT", "Board and Omni relationship"], email: "sarah@kestrel.demo", login: "ceo", avatar_color: "#0EA5E9" },
    { key: "cfo", full_name: "James Thornton", title: "Chief Financial Officer", seat: "Finance", responsibilities: ["Budget and reporting", "Cash and debtor management", "Procurement", "Deal finance"], reports_to: "ceo", email: "james@kestrel.demo", login: "executive", avatar_color: "#8B5CF6" },
    { key: "coo", full_name: "Nadia Petrova", title: "Chief Operating Officer", seat: "Operations", responsibilities: ["Service delivery", "Gross margin", "Scheduling and utilisation", "Subcontractor management"], reports_to: "ceo", email: "nadia@kestrel.demo", login: "executive", avatar_color: "#F59E0B" },
    { key: "cd", full_name: "Liam O'Connor", title: "Commercial Director", seat: "Commercial", responsibilities: ["Contracted revenue", "Renewals", "Bid management", "Pricing"], reports_to: "ceo", email: "liam@kestrel.demo", login: "executive", avatar_color: "#EF4444" },
    { key: "ma", full_name: "Grace Adeyemi", title: "Corporate Development Director", seat: "M&A and integration", responsibilities: ["Acquisition pipeline", "Due diligence", "Integration"], reports_to: "ceo", email: "grace@kestrel.demo", login: "executive", avatar_color: "#10B981" },
    { key: "people", full_name: "Owen Price", title: "People Director", seat: "People", responsibilities: ["Engineer recruitment", "Apprentice academy", "Retention", "Employee listening"], reports_to: "ceo", email: "owen@kestrel.demo", login: "executive", avatar_color: "#14B8A6" },
    { key: "cio", full_name: "Priya Shah", title: "Head of Systems", seat: "Systems", responsibilities: ["Field service platform rollout", "ERP", "Data and reporting"], reports_to: "coo", avatar_color: "#6366F1" },
    { key: "proc", full_name: "Group Procurement Director", title: "Group Procurement Director (open seat)", seat: "Procurement", responsibilities: ["Subcontractor rate cards", "Supplier consolidation"], reports_to: "cfo", open: true },
  ],
  northStar: {
    vision: "The UK's most trusted compliance partner — every statutory obligation for an estate, managed on one platform with one accountable team.",
    mission: "We keep the buildings people live and work in safe, compliant and running.",
    values: [
      { name: "Safety without compromise", description: "We never trade safety or compliance for speed or margin." },
      { name: "Fix it first time", description: "We take pride in doing the job right and leaving the site better." },
      { name: "One team", description: "Branches, engineers and acquired businesses work as one Kestrel." },
    ],
    target_end_state: `By ${Y + 1}, a £70m revenue, £12m EBITDA national compliance platform with 70% recurring contracted revenue, 34% gross margin, every branch on one operating platform and four integrated acquisitions.`,
    strategic_positioning: "A national single-supplier for statutory compliance across mixed estates, competing on coverage, evidence and technology rather than price.",
    market_opportunity: "A £4bn UK compliance-services market, fragmented across regional specialists, with demand rising under the Building Safety Act.",
    strategic_value: "High contracted visibility, a single operating platform that lifts margin, and a repeatable acquisition and integration engine.",
    financial_ambition: "Grow to £70m revenue with 70% contracted, lifting EBITDA margin from 11% to 17%.",
    exit_equity_story: "A national, tech-enabled compliance platform with contracted, regulation-driven revenue, proven margin expansion and a buy-and-build engine a buyer can continue.",
    buyer_proposition: "Contracted, regulation-driven revenue with demonstrable margin expansion and a pipeline of bolt-ons a buyer can continue to execute.",
    potential_buyers: ["Infrastructure-services strategics", "Facilities-management groups", "Mid-market sponsors"],
    target_year: Y + 1,
    target_revenue: m(70),
    target_ebitda: m(12),
    target_ev: m(150),
    baseline_revenue: m(36.5),
    baseline_ebitda: m(4.1),
    assumptions: [
      "Building Safety Act enforcement continues to increase the frequency of statutory inspections.",
      "Subcontractor rates can be reset to within 5% of the internal cost rate through consolidation.",
      "Two bolt-on acquisitions a year at ≤6x EBITDA are available in the pipeline.",
    ],
  },
  conditions: [
    { title: "Margin discipline through one operating platform", description: "All branches on the field service platform, with dynamic scheduling and subcontractor rate control.", status: "off_track", owner: "coo" },
    { title: "Contracted revenue majority", description: "At least 70% of revenue under multi-year planned-maintenance contracts.", status: "at_risk", owner: "cd" },
    { title: "Engineer capacity ahead of demand", description: "Apprentice academy and retention keep engineer attrition below 18%.", status: "at_risk", owner: "people" },
    { title: "A repeatable integration engine", description: "Each acquisition fully integrated onto Kestrel systems within six months.", status: "on_track", owner: "ma" },
  ],
  moves: [
    { key: "margin", title: "34% gross margin on one operating platform", description: "Reset subcontractor rate cards, deploy dynamic scheduling and remove unprofitable reactive work.", outcome: "34% gross margin; every branch on the field service platform", owner: "coo", status: "off_track", progress: 35 },
    { key: "contracted", title: "70% of revenue under contract", description: "Convert reactive customers onto planned-preventative maintenance contracts.", outcome: "70% contracted revenue", owner: "cd", status: "at_risk", progress: 52 },
    { key: "mna", title: "Four integrated acquisitions adding £16m revenue", description: "Disciplined buy-and-build of regional fire, security and water-hygiene specialists.", outcome: "Four bolt-ons integrated within six months each", owner: "ma", status: "on_track", progress: 45 },
  ],
  milestones: [
    { title: "Omni investment completes", date: `${Y - 2}-09-30`, status: "done" },
    { title: "Acquired Brightwater Water Hygiene", date: `${Y}-05-29`, status: "done", move: "mna" },
    { title: "Platform live in North and Scotland", date: `${Y}-07-31`, status: "done", move: "margin" },
    { title: "Aquila Fire SPA signed", date: `${Y}-12-15`, status: "at_risk", move: "mna" },
    { title: "Platform live in every branch", date: `${Y}-12-31`, status: "at_risk", move: "margin" },
    { title: "£70m revenue run-rate", date: `${Y + 1}-12-31`, status: "not_started" },
    { title: "Exit process", date: `${Y + 2}-03-31`, status: "not_started" },
  ],
  goals: [
    { key: "gm", move: "margin", title: "Exit the year at 32% gross margin", outcome: "December gross margin ≥32%", unit: "percent", baseline: 29.5, target: 32, current: 29.8, owner: "coo", status: "off_track", progress: 12 },
    { key: "contract", move: "contracted", title: "Reach 60% contracted revenue", outcome: "60% of monthly revenue under PPM contracts", unit: "percent", baseline: 51, target: 60, current: 55, owner: "cd", status: "at_risk", progress: 44 },
    { key: "fsm", move: "margin", title: "Every branch live on the field service platform", outcome: "11 of 11 branches live", unit: "percent", baseline: 18, target: 100, current: 64, owner: "cio", status: "at_risk", progress: 64 },
    { key: "bolt", move: "mna", title: "Complete two bolt-on acquisitions", outcome: "Two acquisitions completed, £8m acquired revenue", unit: "number", baseline: 0, target: 2, current: 1, owner: "ma", status: "on_track", progress: 50 },
    { key: "engineers", move: "margin", title: "Add 60 net field engineers with attrition below 18%", outcome: "Field engineers ≥440; attrition <18%", unit: "number", baseline: 380, target: 440, current: 421, owner: "people", status: "at_risk", progress: 68 },
  ],
  previousPriorities: [
    { key: "q-north", goal: "fsm", title: "Go live on the platform in North and Scotland", outcome: "Both regions scheduling 100% on the platform", owner: "cio", status: "done", progress: 100, result: "achieved" },
    { key: "q-bright", goal: "bolt", title: "Complete Brightwater integration by day 100", outcome: "Brightwater on Kestrel payroll, finance and platform", owner: "ma", status: "done", progress: 100, result: "achieved" },
    { key: "q-rates", goal: "gm", title: "Renegotiate top-10 subcontractor rates", outcome: "Average rate reduction of 8%", owner: "coo", status: "missed", progress: 30, result: "missed", resultNote: "No procurement owner; carried forward with a narrower South-region scope." },
    { key: "q-academy", goal: "engineers", title: "Launch apprentice academy cohort 2", outcome: "24 apprentices enrolled", owner: "people", status: "missed", progress: 50, result: "stopped", resultNote: "Stopped to concentrate on first-year retention; cohort 2 moved to Q1." },
  ],
  priorities: [
    {
      key: "subcon", goal: "gm", title: "Reset subcontractor rate cards in the South region",
      description: "Consolidate from 46 to 15 subcontractors on a standard rate card; route reactive work to internal engineers first.",
      outcome: "South subcontractor cost within 5% of the internal rate",
      successCriteria: "15 subcontractors on the standard rate card by 30 November; South gross margin ≥30% in December",
      owner: "coo", status: "off_track", progress: 20,
      milestones: [
        { title: "Internal-first routing live", week: 2, done: true },
        { title: "Rate card issued to top 15", week: 5, done: false },
        { title: "Contracts signed", week: 9, done: false },
      ],
    },
    {
      key: "ppm", goal: "contract", title: "Convert 40 reactive customers to planned-maintenance contracts",
      outcome: "40 contracts signed (£1.6m annualised)",
      successCriteria: "40 signed contracts by 31 December; contracted share ≥58%",
      owner: "cd", status: "on_track", progress: 55,
      milestones: [
        { title: "Top-50 reactive list qualified", week: 2, done: true },
        { title: "20 contracts signed", week: 7, done: true },
        { title: "40 contracts signed", week: 13, done: false },
      ],
    },
    {
      key: "aquila", goal: "bolt", title: "Sign the SPA for Aquila Fire Protection",
      outcome: "SPA signed at no more than 6x EBITDA",
      successCriteria: "SPA signed by 15 December within the approved price and earn-out",
      owner: "ma", status: "at_risk", progress: 60,
      milestones: [
        { title: "Confirmatory diligence complete", week: 4, done: true },
        { title: "Heads of terms agreed", week: 8, done: false },
        { title: "SPA signed", week: 11, done: false },
      ],
    },
  ],
  metrics: [
    {
      key: "revenue", scorecard: true, name: "Revenue", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", tolerance: 5,
      aggregation: "flow", owner: "cfo", comparable: "revenue", isKey: true, history: 21, futureTargets: 3,
      series: (c) => { const t = revenuePlan(c); return { target: t, value: c.future ? null : Math.round(t * (1.005 + 0.004 * c.t) * c.noise(0.015)) }; },
      links: [{ move: "contracted" }],
    },
    {
      key: "ebitda", scorecard: true, name: "EBITDA", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", tolerance: 8,
      aggregation: "flow", owner: "cfo", comparable: "ebitda", isKey: true, history: 21, futureTargets: 3,
      series: (c) => { const t = ebitdaPlan(c); return { target: t, value: c.future ? null : Math.round(t * (0.96 - 0.14 * c.t) * c.noise(0.04)) }; },
      links: [{ move: "margin" }],
    },
    {
      key: "gm", scorecard: true, name: "Gross margin", category: "financial", unit: "percent", decimals: 1, frequency: "monthly", direction: "higher_is_better",
      target: 32, tolerance: 4, owner: "coo", comparable: "gross_margin", isKey: true, history: 21,
      series: (c) => ({ value: +(30.6 - 1.4 * c.t + (c.noise(0.01) - 1) * 30).toFixed(1) }),
      links: [{ goal: "gm" }, { priority: "subcon" }],
    },
    {
      key: "contracted", scorecard: true, name: "Contracted revenue share", category: "commercial", unit: "percent", frequency: "monthly", direction: "higher_is_better",
      target: 60, tolerance: 8, owner: "cd", comparable: "recurring_revenue_pct", isKey: true, history: 21,
      series: (c) => ({ value: Math.round(49 + 6.5 * c.t + (c.noise(0.01) - 1) * 50) }),
      links: [{ goal: "contract" }, { priority: "ppm" }],
    },
    {
      key: "debtor", scorecard: true, name: "Debtor days", category: "financial", unit: "days", frequency: "monthly", direction: "lower_is_better",
      target: 45, tolerance: 10, owner: "cfo", comparable: "debtor_days", history: 21,
      series: (c) => ({ value: Math.round(46 + 7 * c.t * c.t + (c.noise(0.03) - 1) * 40) }),
    },
    {
      key: "cash", scorecard: true, name: "Cash conversion", category: "financial", unit: "percent", frequency: "monthly", direction: "higher_is_better",
      target: 85, tolerance: 8, owner: "cfo", comparable: "cash_conversion", history: 21,
      series: (c) => ({ value: Math.round(84 - 9 * c.t + (c.noise(0.04) - 1) * 80) }),
    },
    {
      key: "util", scorecard: true, name: "Engineer utilisation", description: "Productive hours ÷ available hours, field engineers.", category: "operational", unit: "percent", frequency: "weekly",
      direction: "range", min: 78, max: 88, tolerance: 30, owner: "coo", isKey: true, history: 20,
      series: (c) => ({ value: Math.round(75 + 3 * c.t + (c.noise(0.02) - 1) * 80) }),
      links: [{ priority: "subcon" }],
    },
    {
      key: "ftf", name: "First-time fix rate", category: "operational", unit: "percent", frequency: "weekly", direction: "higher_is_better",
      target: 85, tolerance: 5, owner: "coo", comparable: "first_time_fix", history: 20,
      series: (c) => ({ value: Math.round(83 + 2 * c.t + (c.noise(0.015) - 1) * 80) }),
    },
    {
      key: "sla", scorecard: true, name: "SLA compliance", category: "customer", unit: "percent", decimals: 1, frequency: "weekly", direction: "higher_is_better",
      target: 95, tolerance: 3, owner: "coo", isKey: true, history: 20,
      series: (c) => ({ value: +(95.5 - 1.5 * c.t + (c.noise(0.008) - 1) * 90).toFixed(1) }),
    },
    {
      key: "jobs", name: "Jobs completed", category: "operational", unit: "number", frequency: "weekly", direction: "higher_is_better",
      target: 2400, tolerance: 6, aggregation: "flow", owner: "coo", history: 20,
      series: (c) => ({ value: Math.round(2380 * (1 + 0.04 * c.t) * c.noise(0.03)) }),
    },
    {
      key: "fsm", name: "Branches live on FSM", category: "operational", unit: "percent", frequency: "monthly", direction: "higher_is_better",
      tolerance: 10, owner: "cio", history: 12, futureTargets: 3,
      series: (c) => {
        const plan = c.year === Y ? Math.min(100, 18 + (c.month - 1) * 7.5) : 9;
        const actual = c.year === Y ? Math.min(plan, 18 + (c.month - 1) * 5.5) : 9;
        return { target: Math.round(plan), value: c.future ? null : Math.round(actual) };
      },
      links: [{ goal: "fsm" }, { goal: "fsm" }],
    },
    {
      key: "renewal", name: "Contract renewal rate", category: "commercial", unit: "percent", frequency: "monthly", direction: "higher_is_better",
      target: 92, tolerance: 4, owner: "cd", history: 21,
      series: (c) => ({ value: Math.round(91 + 2 * c.t + (c.noise(0.015) - 1) * 90) }),
    },
    {
      key: "newcontract", name: "New contracted revenue (annualised)", category: "commercial", unit: "currency", frequency: "monthly", direction: "higher_is_better",
      target: 250_000, tolerance: 15, aggregation: "flow", owner: "cd", history: 21,
      series: (c) => ({ value: Math.round(250_000 * (0.85 + 0.25 * c.t) * c.noise(0.15)) }),
      links: [{ priority: "ppm" }],
    },
    {
      key: "pipeline", name: "Acquisition targets in diligence", category: "commercial", unit: "number", frequency: "monthly", direction: "higher_is_better",
      target: 3, tolerance: 34, owner: "ma", history: 12,
      series: (c) => ({ value: [2, 2, 3, 3, 4, 3, 2, 3, 3, 4, 3, 3][c.i % 12] }),
      links: [{ goal: "bolt" }],
    },
    {
      key: "nps", name: "Customer NPS", category: "customer", unit: "score", frequency: "monthly", direction: "higher_is_better",
      target: 40, tolerance: 12, owner: "cd", comparable: "nps", history: 21,
      series: (c) => ({ value: Math.round(36 + 3 * c.t + (c.noise(0.06) - 1) * 40) }),
    },
    {
      key: "complaints", name: "Complaints per 1,000 jobs", category: "customer", unit: "number", decimals: 1, frequency: "weekly", direction: "lower_is_better",
      target: 4, tolerance: 15, owner: "coo", history: 20,
      series: (c) => ({ value: +(4.1 + 0.4 * c.t + (c.noise(0.1) - 1) * 4).toFixed(1) }),
    },
    {
      key: "engineers", name: "Field engineers", category: "people", unit: "number", frequency: "monthly", direction: "range",
      min: 415, max: 445, tolerance: 15, owner: "people", comparable: "headcount", history: 21,
      series: (c) => ({ value: Math.round(386 + 35 * c.t) }),
      links: [{ goal: "engineers" }],
    },
    {
      key: "attrition", scorecard: true, name: "Engineer attrition (annualised)", category: "people", unit: "percent", frequency: "monthly", direction: "lower_is_better",
      target: 18, tolerance: 12, owner: "people", comparable: "attrition", history: 21,
      series: (c) => ({ value: Math.round(19 + 5 * c.t + (c.noise(0.05) - 1) * 20) }),
      links: [{ goal: "engineers" }],
    },
    {
      key: "cashbal", name: "Cash balance", category: "financial", unit: "currency", frequency: "monthly",
      direction: "higher_is_better", target: 3_000_000, tolerance: 15, owner: "cfo", comparable: "cash", history: 21,
      series: (c) => ({ value: Math.round((3_400_000 - 900_000 * c.t) * c.noise(0.05)) }),
    },
    {
      key: "netdebt", name: "Net debt", category: "financial", unit: "currency", frequency: "monthly",
      direction: "lower_is_better", target: 24_000_000, tolerance: 5, owner: "cfo", comparable: "net_debt", history: 21,
      series: (c) => ({ value: Math.round((22_000_000 + 3_500_000 * c.t) * c.noise(0.005)) }),
    },
  ],
  meetings: [
    { key: "w-4", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(1) - 28, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"], summary: "Q4 priorities launched. Subcontractor spend review requested for the South region.", rating: 7 },
    { key: "w-3", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(1) - 21, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma"], absent: ["people"], summary: "South subcontractor costs confirmed 18% above rate card. Aquila diligence progressing.", rating: 6 },
    { key: "w-1", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(1) - 7, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "people"], absent: ["ma"], summary: "Midlands go-live slipped two weeks on data quality. First-year retention plan approved.", rating: 6 },
    { key: "w0", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(1), 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"], summary: "Aquila vendor seeking a higher earn-out; escalated to Omni. Debtor days rising on NHS frameworks.", rating: 7 },
    { key: "w+1", type: "weekly", title: "Weekly ELT meeting", at: at(lastWeekday(1) + 7, 9, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"] },
    { key: "mb", type: "board_monthly", title: "Monthly Board", at: at(-9, 10, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo"], summary: "September EBITDA 19% behind budget, driven by gross margin. Decision: request Omni interim procurement support.", rating: 6 },
    { key: "mb+1", type: "board_monthly", title: "Monthly Board", at: at(21, 10, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo"] },
    { key: "qo", type: "quarterly", title: "Quarterly offsite", at: at(-23, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"], summary: "Q3: two achieved, one missed, one stopped. Three Q4 priorities agreed with margin recovery first.", rating: 7 },
    { key: "qo+1", type: "quarterly", title: "Quarterly offsite", at: at(78, 9, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"] },
    { key: "qb+1", type: "board_quarterly", title: "Quarterly Board", at: at(84, 10, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo"] },
  ],
  issues: [
    { key: "subcon", title: "South region subcontractor costs running 18% above rate card", description: "46 subcontractors on inconsistent rates; reactive call-outs routed to the nearest subcontractor rather than internal engineers.", priority: "critical", status: "in_discussion", owner: "coo", raisedBy: "cfo", metric: "gm", priorityKey: "subcon", raisedIn: "w-3", escalated: true, createdDaysAgo: 21 },
    { key: "midlands", title: "Midlands platform go-live delayed by asset data quality", description: "38% of asset records fail validation; go-live moved two weeks.", priority: "high", status: "open", owner: "cio", raisedBy: "coo", metric: "fsm", goal: "fsm", raisedIn: "w-1", createdDaysAgo: 8 },
    { key: "earnout", title: "Aquila Fire vendor pushing for a higher earn-out", description: "Vendor requesting an earn-out increase from £1.5m to £2.5m; would take the price above 6x.", priority: "high", status: "open", owner: "ma", raisedBy: "ma", priorityKey: "aquila", raisedIn: "w0", escalated: true, createdDaysAgo: 3 },
    { key: "attrition", title: "Engineer attrition concentrated in first-year hires", description: "62% of leavers in the last six months had less than 12 months' service.", priority: "high", status: "open", owner: "people", raisedBy: "people", metric: "attrition", goal: "engineers", raisedIn: "w-3", createdDaysAgo: 22 },
    { key: "debtors", title: "Debtor days rising on two NHS framework contracts", description: "Invoice approval delays at two trusts; £1.9m overdue.", priority: "medium", status: "open", owner: "cfo", raisedBy: "cfo", metric: "debtor", raisedIn: "w0", createdDaysAgo: 3 },
  ],
  decisions: [
    { key: "consolidate", title: "Consolidate South subcontractors from 46 to 15 on a standard rate card", rationale: "Volume concentration gives leverage for an 8–10% rate reduction; non-compliant suppliers removed.", owner: "coo", issue: "subcon", meeting: "w-3", decidedDaysAgo: 21 },
    { key: "datafix", title: "Delay the Midlands go-live by two weeks to cleanse asset data", rationale: "Going live with failing asset data would break planned maintenance for 1,400 sites.", owner: "cio", issue: "midlands", meeting: "w-1", decidedDaysAgo: 7 },
    { key: "retain", title: "Approve the first-year engineer retention plan (£180k a year)", rationale: "Each avoided leaver saves ~£14k recruitment and training; the plan pays back at 13 avoided leavers.", owner: "people", issue: "attrition", meeting: "w-1", decidedDaysAgo: 7 },
  ],
  actions: [
    { title: "Issue the standard rate card to the top 15 South subcontractors", owner: "coo", due: 8, status: "open", issue: "subcon", decision: "consolidate", meeting: "w-3", priorityKey: "subcon", metric: "gm", createdDaysAgo: 21 },
    { title: "Route South reactive work to internal engineers first", owner: "coo", due: -10, status: "done", issue: "subcon", meeting: "w-3", priorityKey: "subcon", createdDaysAgo: 21 },
    { title: "Appoint a data-cleansing contractor for Midlands assets", owner: "cio", due: -3, status: "done", decision: "datafix", meeting: "w-1", createdDaysAgo: 7 },
    { title: "Confirm the revised Midlands go-live date", owner: "cio", due: 2, status: "open", issue: "midlands", meeting: "w-1", createdDaysAgo: 7 },
    { title: "Prepare earn-out counter-proposal with the Omni deal team", owner: "ma", due: 5, status: "open", issue: "earnout", meeting: "w0", priorityKey: "aquila", createdDaysAgo: 3 },
    { title: "Launch a buddy scheme for all engineers under 12 months' service", owner: "people", due: 12, status: "open", decision: "retain", meeting: "w-1", metric: "attrition", createdDaysAgo: 7 },
    { title: "Escalate overdue invoices with both NHS trusts", owner: "cfo", due: 4, status: "open", issue: "debtors", meeting: "w0", metric: "debtor", createdDaysAgo: 3 },
    { title: "Sign 10 planned-maintenance conversions from the reactive top-50 list", owner: "cd", due: 8, status: "open", priorityKey: "ppm", meeting: "w-1", metric: "contracted", createdDaysAgo: 7 },
    { title: "Fortnightly margin review with Omni interim procurement support", owner: "cfo", due: 14, status: "open", metric: "ebitda", meeting: "w-3", createdDaysAgo: 30 },
    { title: "Deploy dynamic scheduling in the South and Midlands", owner: "coo", due: 20, status: "open", metric: "util", meeting: "w-4", createdDaysAgo: 30 },
    { title: "Daily SLA stand-up in the South until compliance is back above 95%", owner: "coo", due: 10, status: "open", metric: "sla", meeting: "w-3", createdDaysAgo: 30 },
    { title: "Shortlist Group Procurement Director candidates", owner: "cfo", due: -8, status: "open", meeting: "w-4", createdDaysAgo: 28 },
  ],
  orgActions: [
    { type: "hire", title: "Hire a Group Procurement Director by Q1", description: "No owner of £14m a year of subcontractor and supplier spend; critical to the margin outcome.", priority: "critical", status: "in_progress", owner: "cfo", priorityKey: "subcon", targetDays: 60 },
    { type: "hire", title: "Appoint a dedicated Integration Manager", description: "So the Corporate Development Director can focus on the acquisition pipeline.", priority: "high", status: "open", owner: "ma", goal: "bolt", targetDays: 90 },
    { type: "structure", title: "Move from a regional to a national operating model", description: "One national service-delivery structure with consistent branch roles and decision rights.", priority: "high", status: "in_progress", owner: "coo", goal: "gm", targetDays: 150 },
    { type: "capability", title: "Build pricing and commercial analytics", description: "Contract pricing is set branch by branch with no margin visibility at bid stage.", priority: "high", status: "open", owner: "cd", goal: "contract", targetDays: 90 },
  ],
  comments: [
    { priority: "subcon", author: "nadia@kestrel.demo", kind: "update", body: "Rate card drafted; 9 of the top 15 subcontractors have agreed in principle. Internal-first routing live.", daysAgo: 4 },
    { priority: "aquila", author: "grace@kestrel.demo", kind: "update", body: "Diligence clean. Vendor wants a larger earn-out; counter-proposal being prepared with Omni.", daysAgo: 2 },
  ],
  listening: [
    { kind: "employee", daysAgo: 190, method: "Engagement survey", responses: 388, engagement: 61, enps: 4, leadership_confidence: 57, strategy_confidence: 52, clarity_accountability: 49, themes: ["Scheduling changes communicated late", "First-year engineers feel unsupported", "Pride in safety record"], summary: "Engagement low among first-year engineers; scheduling communication the top frustration.", actions: [{ title: "Weekly schedule published by Thursday for the following week", owner: "coo", due: -150, status: "done" }] },
    { kind: "customer", daysAgo: 160, method: "NPS and senior-management calls (15 accounts)", nps: 37, satisfaction: 76, retention: 91, churn: 2.1, themes: ["Want one portal for all certificates", "Engineers professional", "Reactive response slower than promised"], summary: "Customers value evidence and coverage; reactive response times are the main complaint.", actions: [{ title: "Launch the customer compliance portal", owner: "cio", due: -40, status: "done" }] },
    { kind: "employee", daysAgo: 28, method: "Pulse survey", responses: 342, engagement: 64, enps: 9, leadership_confidence: 61, strategy_confidence: 58, clarity_accountability: 56, themes: ["Better schedule visibility", "Pay progression unclear for new engineers", "Confidence in the platform rollout"], summary: "Small improvement; pay progression for new engineers is the main theme.", actions: [{ title: "Publish the engineer pay-progression framework", owner: "people", due: 21, status: "open" }] },
    { kind: "customer", daysAgo: 35, method: "NPS survey", nps: 40, satisfaction: 78, retention: 92, churn: 1.9, themes: ["Portal well received", "Invoices hard to reconcile", "SLA misses in the South"], issues: "Two NHS trusts report invoices that do not match purchase orders.", summary: "Portal helped; invoicing accuracy and South SLAs are the issues.", actions: [{ title: "Fix purchase-order matching on NHS invoices", owner: "cfo", due: 9, status: "open" }] },
  ],
  reset: {
    wins: "Platform live in North and Scotland; Brightwater integrated by day 100; 30 planned-maintenance conversions.",
    misses: "Subcontractor rate renegotiation missed — no procurement owner and a fragmented supplier base. Apprentice cohort 2 stopped.",
    lessons: "Margin initiatives need a dedicated owner and weekly KPI review rather than quarterly.",
    constraints: "No procurement leadership. Systems team stretched across the platform rollout and Brightwater integration.",
  },
  investmentCase: {
    entry_date: `${Y - 2}-09-30`,
    entry_ev: m(42),
    entry_multiple: 10.2,
    target_exit_date: `${Y + 2}-03-31`,
    target_exit_ev: m(150),
    target_moic: 3.1,
    target_irr: 0.29,
    internal_thesis: "Platform for compliance-services consolidation. Margin expansion via systems underwritten at +4.5pts.",
    key_risks: "Gross margin recovery timing; integration capacity; earn-out discipline on bolt-ons.",
  },
  omniNotes: [
    { body: "EBITDA tracking ~19% behind budget. Margin recovery plan lacks a procurement owner — recommend Omni interim procurement support for three months and a fortnightly margin review.", level: "intervene", daysAgo: 6 },
    { body: "Aquila earn-out: hold at £1.5m. Deal team to support the counter-proposal.", level: "support", daysAgo: 2 },
  ],
};
