// Company B — Kestrel Compliance Services: technology-enabled fire, security and
// building-compliance services. ~£45m revenue, ~£6m EBITDA. Story: revenue on plan
// but gross margin and EBITDA behind on subcontractor costs; the FSM rollout and
// the buy-and-build programme need Omni's attention.
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
    brand_color: "#0F766E",
    acquired_on: `${Y - 2}-09-30`,
  },
  people: [
    { key: "ceo", full_name: "Sarah Mitchell", title: "Chief Executive Officer", seat: "Visionary & integrator", responsibilities: ["Value creation plan", "M&A strategy", "Leadership team", "Board & Omni relationship"], email: "sarah@kestrel.demo", login: "company_admin", avatar_color: "#0EA5E9" },
    { key: "cfo", full_name: "James Thornton", title: "Chief Financial Officer", seat: "Finance", responsibilities: ["Budget & reporting", "Cash & debtor management", "Procurement", "Deal finance"], reports_to: "ceo", email: "james@kestrel.demo", login: "executive", avatar_color: "#8B5CF6" },
    { key: "coo", full_name: "Nadia Petrova", title: "Chief Operating Officer", seat: "Operations", responsibilities: ["Service delivery", "Gross margin", "Scheduling & utilisation", "Subcontractor management"], reports_to: "ceo", email: "nadia@kestrel.demo", login: "executive", avatar_color: "#F59E0B" },
    { key: "cd", full_name: "Liam O'Connor", title: "Commercial Director", seat: "Commercial", responsibilities: ["Contracted revenue", "Renewals", "Bid management", "Pricing"], reports_to: "ceo", email: "liam@kestrel.demo", login: "executive", avatar_color: "#EF4444" },
    { key: "ma", full_name: "Grace Adeyemi", title: "Corporate Development Director", seat: "M&A & Integration", responsibilities: ["Acquisition pipeline", "Due diligence", "Integration"], reports_to: "ceo", email: "grace@kestrel.demo", login: "executive", avatar_color: "#10B981" },
    { key: "people", full_name: "Owen Price", title: "People Director", seat: "People", responsibilities: ["Engineer recruitment", "Apprentice academy", "Retention"], reports_to: "ceo", email: "owen@kestrel.demo", login: "executive", avatar_color: "#14B8A6" },
    { key: "cio", full_name: "Priya Shah", title: "Head of Systems", seat: "Systems", responsibilities: ["FSM rollout", "ERP", "Data & reporting"], reports_to: "coo", avatar_color: "#6366F1" },
    { key: "proc", full_name: "Group Procurement Director", title: "Group Procurement Director (open seat)", seat: "Procurement", responsibilities: ["Subcontractor rate cards", "Supplier consolidation"], reports_to: "cfo", open: true },
  ],
  northStar: {
    purpose: "Keep the buildings people live and work in safe, compliant and running.",
    vision: "The UK's most trusted compliance partner — every statutory obligation for an estate, managed on one platform with one accountable team.",
    five_year_ambition: "A £120m revenue national compliance platform with 75% contracted revenue, built through organic growth and a disciplined buy-and-build programme.",
    three_year_destination: `By ${Y + 1}, Kestrel will be a £70m revenue, £12m EBITDA business with 70% recurring contracted revenue, 34% gross margin, every branch on one operating platform, and four integrated acquisitions.`,
    investment_thesis: "Non-discretionary, regulation-driven demand with a fragmented supply base. Value creation through contract conversion, margin discipline from a single operating platform, and consolidation of regional specialists.",
    exit_equity_story: "A national, tech-enabled compliance platform with high contracted visibility, margin expansion proven through systems, and a repeatable acquisition and integration engine — attractive to infrastructure-services strategics and mid-market sponsors.",
    buyer_proposition: "Contracted, regulation-driven revenue with demonstrable margin expansion and a pipeline of bolt-ons that a buyer can continue to execute.",
    target_year: Y + 1,
    target_revenue: m(70),
    target_ebitda: m(12),
    target_ev: m(150),
    baseline_revenue: m(36.5),
    baseline_ebitda: m(4.1),
    assumptions: [
      "Building Safety Act enforcement continues to increase the frequency of statutory inspections.",
      "Subcontractor rates can be reset to within 5% of the internal cost rate through consolidation.",
      "Two bolt-on acquisitions per year at ≤6x EBITDA are available in the pipeline.",
      "The FSM platform delivers a 6-point utilisation uplift once all branches are live.",
    ],
  },
  conditions: [
    { title: "Margin discipline through one operating platform", description: "All branches on the FSM, with dynamic scheduling and subcontractor rate control.", status: "off_track", owner: "coo" },
    { title: "Contracted revenue majority", description: "At least 70% of revenue under multi-year planned-maintenance contracts.", status: "at_risk", owner: "cd" },
    { title: "Engineer capacity ahead of demand", description: "Apprentice academy and retention plan keep engineer attrition below 18%.", status: "at_risk", owner: "people" },
    { title: "A repeatable integration engine", description: "Each acquisition fully integrated onto Kestrel systems within 6 months of completion.", status: "on_track", owner: "ma" },
  ],
  moves: [
    { key: "margin", title: "Lift gross margin to 34%", description: "Reset subcontractor rate cards, deploy dynamic scheduling and remove unprofitable reactive work.", outcome: "Gross margin 32% exiting this year; 34% next year", owner: "coo", status: "off_track", progress: 35 },
    { key: "contracted", title: "Grow recurring contracted revenue to 70%", description: "Convert reactive customers onto planned-preventative maintenance contracts and launch compliance-as-a-service bundles.", outcome: "60% contracted revenue by December; 70% within two years", owner: "cd", status: "at_risk", progress: 52 },
    { key: "platform", title: "Implement one operating platform", description: "Field service management and finance ERP live across every branch and acquisition.", outcome: "100% of branches on FSM and ERP by year end", owner: "coo", status: "at_risk", progress: 64 },
    { key: "capacity", title: "Expand service capacity", description: "Grow engineer headcount through the apprentice academy and reduce first-year attrition.", outcome: "+60 net engineers; attrition below 18%", owner: "people", status: "at_risk", progress: 45 },
    { key: "mna", title: "Acquire complementary businesses", description: "Disciplined buy-and-build of regional fire, security and water-hygiene specialists.", outcome: "Two bolt-ons per year adding £8m revenue", owner: "ma", status: "on_track", progress: 55 },
  ],
  milestones: [
    { title: "Omni investment completes", date: `${Y - 2}-09-30`, status: "done" },
    { title: "Acquired Brightwater Water Hygiene", date: `${Y}-05-29`, status: "done", move: "mna" },
    { title: "FSM live in North & Scotland", date: `${Y}-07-31`, status: "done", move: "platform" },
    { title: "Aquila Fire SPA signed", date: `${Y}-12-15`, status: "at_risk", move: "mna" },
    { title: "FSM live in every branch", date: `${Y}-12-31`, status: "at_risk", move: "platform" },
    { title: "60% contracted revenue", date: `${Y}-12-31`, status: "at_risk", move: "contracted" },
    { title: "Gross margin 34%", date: `${Y + 1}-06-30`, status: "not_started", move: "margin" },
    { title: "£70m revenue run-rate", date: `${Y + 1}-12-31`, status: "not_started" },
    { title: "Exit process", date: `${Y + 2}-03-31`, status: "not_started" },
  ],
  goals: [
    { key: "gm", move: "margin", title: "Exit the year at 32% gross margin", outcome: "December gross margin ≥32%", unit: "percent", baseline: 29.5, target: 32, current: 29.8, owner: "coo", status: "off_track", progress: 12 },
    { key: "ebitda", move: "margin", title: "Deliver £6.0m EBITDA", outcome: "FY EBITDA of £6.0m", unit: "currency", target: m(6), current: m(3.8), owner: "cfo", status: "off_track", progress: 63 },
    { key: "contract", move: "contracted", title: "Reach 60% contracted revenue", outcome: "60% of monthly revenue under PPM contracts", unit: "percent", baseline: 51, target: 60, current: 55, owner: "cd", status: "at_risk", progress: 44 },
    { key: "fsm", move: "platform", title: "Every branch live on FSM and ERP", outcome: "11 of 11 branches live on FSM; ERP cut-over complete", unit: "percent", baseline: 18, target: 100, current: 64, owner: "cio", status: "at_risk", progress: 64 },
    { key: "engineers", move: "capacity", title: "Add 60 net field engineers", outcome: "Field engineer headcount ≥440 with attrition <18%", unit: "number", baseline: 380, target: 440, current: 421, owner: "people", status: "at_risk", progress: 68 },
    { key: "bolt", move: "mna", title: "Complete two bolt-on acquisitions", outcome: "Two acquisitions completed, £8m acquired revenue", unit: "number", baseline: 0, target: 2, current: 1, owner: "ma", status: "on_track", progress: 50 },
  ],
  previousPriorities: [
    { key: "q-north", goal: "fsm", title: "Go live on FSM in North & Scotland", outcome: "Both regions scheduling 100% in FSM", owner: "cio", status: "done", progress: 100 },
    { key: "q-bright", goal: "bolt", title: "Complete Brightwater integration day 100", outcome: "Brightwater on Kestrel payroll, finance & FSM", owner: "ma", status: "done", progress: 100 },
    { key: "q-rates", goal: "gm", title: "Renegotiate top-10 subcontractor rates", outcome: "Average rate reduction of 8%", owner: "coo", status: "missed", progress: 30 },
    { key: "q-ppm", goal: "contract", title: "Convert 30 reactive customers to PPM", outcome: "30 PPM contracts signed", owner: "cd", status: "done", progress: 100 },
    { key: "q-academy", goal: "engineers", title: "Launch apprentice academy cohort 1", outcome: "24 apprentices enrolled", owner: "people", status: "done", progress: 100 },
  ],
  priorities: [
    { key: "subcon", goal: "gm", title: "Reset subcontractor rate cards in the South region", description: "Consolidate from 46 to 15 subcontractors on a standard rate card; move high-volume work in-house.", outcome: "South subcontractor cost within 5% of internal rate", owner: "coo", status: "off_track", progress: 20 },
    { key: "sched", goal: "gm", title: "Deploy dynamic scheduling in South & Midlands", outcome: "Utilisation ≥82% in both regions", owner: "coo", status: "at_risk", progress: 40 },
    { key: "ppm", goal: "contract", title: "Convert 40 reactive customers to PPM contracts", outcome: "40 contracts signed (£1.6m annualised)", owner: "cd", status: "on_track", progress: 55 },
    { key: "midlands", goal: "fsm", title: "Go live on FSM in Midlands and South West", outcome: "Both regions live with legacy scheduler switched off", owner: "cio", status: "at_risk", progress: 45 },
    { key: "retention", goal: "engineers", title: "Launch first-year engineer retention plan", outcome: "Buddy scheme, pay progression and 90-day check-ins live", owner: "people", status: "on_track", progress: 50 },
    { key: "aquila", goal: "bolt", title: "Sign SPA for Aquila Fire Protection", outcome: "SPA signed at ≤6x EBITDA", owner: "ma", status: "at_risk", progress: 60 },
  ],
  metrics: [
    {
      key: "revenue", name: "Revenue", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", tolerance: 5,
      aggregation: "flow", owner: "cfo", comparable: "revenue", isKey: true, history: 21, futureTargets: 3,
      series: (c) => { const t = revenuePlan(c); return { target: t, value: c.future ? null : Math.round(t * (1.005 + 0.004 * c.t) * c.noise(0.015)) }; },
      links: [{ move: "contracted" }],
    },
    {
      key: "ebitda", name: "EBITDA", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", tolerance: 8,
      aggregation: "flow", owner: "cfo", comparable: "ebitda", isKey: true, history: 21, futureTargets: 3,
      series: (c) => { const t = ebitdaPlan(c); return { target: t, value: c.future ? null : Math.round(t * (0.96 - 0.14 * c.t) * c.noise(0.04)) }; },
      links: [{ goal: "ebitda" }],
    },
    {
      key: "gm", name: "Gross margin", category: "financial", unit: "percent", decimals: 1, frequency: "monthly", direction: "higher_is_better",
      target: 32, tolerance: 4, owner: "coo", comparable: "gross_margin", isKey: true, history: 21,
      series: (c) => ({ value: +(30.6 - 1.4 * c.t + (c.noise(0.01) - 1) * 30).toFixed(1) }),
      links: [{ goal: "gm" }, { priority: "subcon" }],
    },
    {
      key: "contracted", name: "Contracted revenue share", category: "commercial", unit: "percent", frequency: "monthly", direction: "higher_is_better",
      target: 60, tolerance: 8, owner: "cd", comparable: "recurring_revenue_pct", isKey: true, history: 21,
      series: (c) => ({ value: Math.round(49 + 6.5 * c.t + (c.noise(0.01) - 1) * 50) }),
      links: [{ goal: "contract" }, { priority: "ppm" }],
    },
    {
      key: "debtor", name: "Debtor days", category: "financial", unit: "days", frequency: "monthly", direction: "lower_is_better",
      target: 45, tolerance: 10, owner: "cfo", comparable: "debtor_days", history: 21,
      series: (c) => ({ value: Math.round(46 + 7 * c.t * c.t + (c.noise(0.03) - 1) * 40) }),
    },
    {
      key: "cash", name: "Cash conversion", category: "financial", unit: "percent", frequency: "monthly", direction: "higher_is_better",
      target: 85, tolerance: 8, owner: "cfo", comparable: "cash_conversion", history: 21,
      series: (c) => ({ value: Math.round(84 - 9 * c.t + (c.noise(0.04) - 1) * 80) }),
    },
    {
      key: "util", name: "Engineer utilisation", description: "Productive hours ÷ available hours, field engineers.", category: "operational", unit: "percent", frequency: "weekly",
      direction: "range", min: 78, max: 88, tolerance: 30, owner: "coo", isKey: true, history: 20,
      series: (c) => ({ value: Math.round(75 + 3 * c.t + (c.noise(0.02) - 1) * 80) }),
      links: [{ priority: "sched" }],
    },
    {
      key: "ftf", name: "First-time fix rate", category: "operational", unit: "percent", frequency: "weekly", direction: "higher_is_better",
      target: 85, tolerance: 5, owner: "coo", comparable: "first_time_fix", history: 20,
      series: (c) => ({ value: Math.round(83 + 2 * c.t + (c.noise(0.015) - 1) * 80) }),
    },
    {
      key: "sla", name: "SLA compliance", category: "customer", unit: "percent", decimals: 1, frequency: "weekly", direction: "higher_is_better",
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
      links: [{ goal: "fsm" }, { priority: "midlands" }],
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
      key: "attrition", name: "Engineer attrition (annualised)", category: "people", unit: "percent", frequency: "monthly", direction: "lower_is_better",
      target: 18, tolerance: 12, owner: "people", comparable: "attrition", history: 21,
      series: (c) => ({ value: Math.round(19 + 5 * c.t + (c.noise(0.05) - 1) * 20) }),
      links: [{ priority: "retention" }],
    },
  ],
  meetings: [
    { key: "w-4", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(1) - 28, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"], summary: "Q4 priorities launched. Subcontractor spend review requested for South region.", rating: 7 },
    { key: "w-3", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(1) - 21, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma"], absent: ["people"], summary: "South subcontractor costs confirmed 18% above rate card. Aquila Fire diligence progressing.", rating: 6 },
    { key: "w-1", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(1) - 7, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "people"], absent: ["ma"], summary: "Midlands FSM go-live slipped two weeks on data quality. Retention plan approved.", rating: 6 },
    { key: "w0", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(1), 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"], summary: "Aquila vendor seeking higher earn-out; escalated to Omni. Debtor days rising on NHS frameworks.", rating: 7 },
    { key: "w+1", type: "weekly", title: "Weekly Leadership Meeting", at: at(lastWeekday(1) + 7, 9, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"] },
    { key: "mor", type: "monthly", title: "Monthly Operating Review", at: at(-9, 10, 0), status: "completed", facilitator: "cfo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"], summary: "September EBITDA 19% behind plan, driven by gross margin (29.3% vs 32%). Agreed South subcontractor reset as the top priority and requested Omni procurement support.", rating: 6 },
    { key: "mor+1", type: "monthly", title: "Monthly Operating Review", at: at(21, 10, 0), status: "scheduled", facilitator: "cfo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"] },
    { key: "qp", type: "quarterly", title: "Quarterly Strategic Reset", at: at(-23, 9, 0), status: "completed", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"], summary: "Q3: 4 of 5 priorities delivered; subcontractor rate reset missed. Six Q4 priorities approved with margin recovery first.", rating: 7 },
    { key: "qp+1", type: "quarterly", title: "Quarterly Strategic Reset", at: at(78, 9, 0), status: "scheduled", facilitator: "ceo", attendees: ["ceo", "cfo", "coo", "cd", "ma", "people"] },
  ],
  issues: [
    { key: "subcon", title: "South region subcontractor costs running 18% above rate card", description: "46 subcontractors on inconsistent rates; reactive call-outs routed to the nearest subcontractor rather than internal engineers.", priority: "critical", status: "in_discussion", owner: "coo", raisedBy: "cfo", metric: "gm", priorityKey: "subcon", raisedIn: "w-3", escalated: true, createdDaysAgo: 21 },
    { key: "midlands", title: "Midlands FSM go-live delayed by asset data quality", description: "38% of asset records fail validation; go-live moved two weeks.", priority: "high", status: "open", owner: "cio", raisedBy: "coo", metric: "fsm", priorityKey: "midlands", raisedIn: "w-1", createdDaysAgo: 8 },
    { key: "earnout", title: "Aquila Fire vendor pushing for a higher earn-out", description: "Vendor requesting earn-out increase from £1.5m to £2.5m; would take price above 6x.", priority: "high", status: "open", owner: "ma", raisedBy: "ma", priorityKey: "aquila", raisedIn: "w0", escalated: true, createdDaysAgo: 3 },
    { key: "attrition", title: "Engineer attrition concentrated in first-year hires", description: "62% of leavers in the last six months had less than 12 months' service.", priority: "high", status: "open", owner: "people", raisedBy: "people", metric: "attrition", priorityKey: "retention", raisedIn: "w-3", createdDaysAgo: 22 },
    { key: "debtors", title: "Debtor days rising on two NHS framework contracts", description: "Invoice approval delays at two trusts; £1.9m overdue.", priority: "medium", status: "open", owner: "cfo", raisedBy: "cfo", metric: "debtor", raisedIn: "w0", createdDaysAgo: 3 },
  ],
  decisions: [
    { key: "consolidate", title: "Consolidate South subcontractors from 46 to 15 on a standard rate card", rationale: "Volume concentration gives leverage for an 8–10% rate reduction; non-compliant suppliers removed.", owner: "coo", issue: "subcon", meeting: "w-3", decidedDaysAgo: 21 },
    { key: "datafix", title: "Delay Midlands go-live by two weeks to cleanse asset data", rationale: "Going live with failing asset data would break PPM scheduling for 1,400 sites.", owner: "cio", issue: "midlands", meeting: "w-1", decidedDaysAgo: 7 },
    { key: "retain", title: "Approve first-year engineer retention plan (£180k annual cost)", rationale: "Each avoided leaver saves ~£14k recruitment and training cost; plan pays back at 13 avoided leavers.", owner: "people", issue: "attrition", meeting: "w-1", decidedDaysAgo: 7 },
  ],
  actions: [
    { title: "Issue standard rate card to the top 15 South subcontractors", owner: "coo", due: -4, status: "open", issue: "subcon", decision: "consolidate", meeting: "w-3", priorityKey: "subcon", createdDaysAgo: 21 },
    { title: "Route South reactive work to internal engineers first", owner: "coo", due: -10, status: "done", issue: "subcon", meeting: "w-3", priorityKey: "sched", createdDaysAgo: 21 },
    { title: "Appoint data-cleansing contractor for Midlands assets", owner: "cio", due: -3, status: "done", decision: "datafix", meeting: "w-1", priorityKey: "midlands", createdDaysAgo: 7 },
    { title: "Confirm revised Midlands go-live date", owner: "cio", due: 2, status: "open", issue: "midlands", meeting: "w-1", priorityKey: "midlands", createdDaysAgo: 7 },
    { title: "Prepare earn-out counter-proposal with Omni deal team", owner: "ma", due: 5, status: "open", issue: "earnout", meeting: "w0", priorityKey: "aquila", createdDaysAgo: 3 },
    { title: "Launch buddy scheme for all engineers under 12 months", owner: "people", due: -1, status: "open", decision: "retain", meeting: "w-1", priorityKey: "retention", createdDaysAgo: 7 },
    { title: "Escalate overdue invoices with both NHS trusts", owner: "cfo", due: 4, status: "open", issue: "debtors", meeting: "w0", createdDaysAgo: 3 },
    { title: "Shortlist Group Procurement Director candidates", owner: "cfo", due: -8, status: "open", meeting: "w-4", createdDaysAgo: 28 },
    { title: "Sign 10 PPM conversions from the reactive top-50 list", owner: "cd", due: 8, status: "open", priorityKey: "ppm", meeting: "w-1", createdDaysAgo: 7 },
  ],
  gaps: [
    { type: "hire", title: "Group Procurement Director", description: "No owner of subcontractor and supplier spend (£14m p.a.). Critical to the margin Winning Move.", priority: "critical", status: "in_progress", owner: "cfo", targetDays: 60 },
    { type: "hire", title: "Integration Manager", description: "Dedicated integration lead so M&A Director can focus on pipeline.", priority: "high", status: "open", owner: "ma", targetDays: 90 },
    { type: "capability", title: "Pricing & commercial analytics", description: "Contract pricing is set branch-by-branch with no margin visibility at bid stage.", priority: "high", status: "open", owner: "cd", targetDays: 90 },
    { type: "development", title: "COO operational leadership at scale", description: "Support Nadia in moving from regional to national operating model.", priority: "medium", status: "in_progress", owner: "ceo", person: "coo", targetDays: 180 },
  ],
  comments: [
    { priority: "subcon", author: "nadia@kestrel.demo", kind: "update", body: "Rate card drafted; 9 of top 15 subcontractors have agreed in principle. Internal-first routing live since last Monday.", daysAgo: 4 },
    { priority: "midlands", author: "james@kestrel.demo", kind: "comment", body: "Need the revised date before the MOR so we can re-phase the utilisation savings in the forecast.", daysAgo: 2 },
  ],
  reset: {
    wins: "FSM live in North & Scotland; Brightwater integrated by day 100; 30 PPM conversions; apprentice academy launched with 24 apprentices.",
    misses: "Subcontractor rate renegotiation missed — no procurement owner and fragmented supplier base.",
    lessons: "Margin initiatives need a dedicated owner and weekly KPI review rather than quarterly.",
    constraints: "No procurement leadership. Systems team stretched across FSM rollout and Brightwater integration.",
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
    { body: "EBITDA tracking ~19% behind plan. Margin recovery plan lacks a procurement owner — recommend Omni interim procurement support for 3 months and fortnightly margin review.", level: "intervene", daysAgo: 6 },
    { body: "Aquila earn-out: hold at £1.5m. Deal team to support counter-proposal.", level: "support", daysAgo: 2 },
  ],
};
