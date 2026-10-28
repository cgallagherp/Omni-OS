// Pure agent logic: authority caps, finding classification, fit scoring and dedupe.
import { describe, expect, it } from "vitest";
import { modeFor } from "@/lib/agents/registry";
import { assessOverdue, type OverdueInput } from "@/lib/agents/analysis/execution";
import { assessKpi, type KpiInput } from "@/lib/agents/analysis/ceo";
import { assessPipeline } from "@/lib/agents/analysis/commercial";
import { approachDraft, normalizeName, scoreFit, screen, type Candidate, type Thesis } from "@/lib/agents/analysis/ma";
import type { CrmOpportunity } from "@/lib/agents/connectors/crm";

const ref = (id: string) => ({ type: "x", id, label: id, path: `/${id}` });
const money = (v: number) => `£${Math.round(v / 1000)}k`;

describe("authority", () => {
  it("never exceeds a category's cap, and a disabled agent does nothing", () => {
    expect(modeFor({ enabled: true, category_modes: { propose_issue: "auto" } }, "propose_issue")).toBe("approval");
    expect(modeFor({ enabled: true, category_modes: { external_communication: "auto" } }, "external_communication")).toBe("approval");
    expect(modeFor({ enabled: true, category_modes: { commercial_terms: "approval" } }, "commercial_terms")).toBe("off");
    expect(modeFor({ enabled: true, category_modes: { internal_followup: "auto" } }, "internal_followup")).toBe("auto");
    expect(modeFor({ enabled: false, category_modes: { internal_followup: "auto" } }, "internal_followup")).toBe("off");
    expect(modeFor(null, "record_findings")).toBe("off");
  });
});

describe("Execution Agent analysis", () => {
  const base: OverdueInput = {
    today: "2026-10-28", companyName: "Co",
    action: { id: "a1", title: "Ship it", status: "open", due_date: "2026-10-20", owner_id: "c1", updated_at: "2026-10-01T00:00:00Z" },
    owner: { id: "c1", full_name: "Open Seat", user_id: null, reports_to: "c2" },
    manager: { id: "c2", full_name: "Mo Manager", user_id: "u2" },
    ceo: { id: "c3", full_name: "Cee Eo", user_id: "u3" },
    priority: null, issue: null, metric: null, comments: [], audit: [], dependencies: [], siblings: [],
  };
  it("asks the manager when the owner has no login, and counts days overdue", () => {
    const a = assessOverdue(base, { action: ref("a1") });
    expect(a.overdue).toBe(true);
    expect(a.daysOverdue).toBe(8);
    expect(a.recipient?.name).toBe("Mo Manager");
  });
  it("holds off when someone updated the action after it fell due", () => {
    const a = assessOverdue({ ...base, comments: [{ body: "On it", created_at: "2026-10-27T10:00:00Z" }] }, { action: ref("a1") });
    expect(a.recentlyUpdated).not.toBeNull();
  });
});

describe("CEO Agent analysis", () => {
  const kpi = (over: Partial<KpiInput> = {}): KpiInput => ({
    today: "2026-10-28",
    metric: { id: "m", name: "New ARR booked", unit: "currency", category: "commercial", comparable_key: "new_arr", direction: "higher_is_better", owner_name: "Marcus" },
    points: ["06", "07", "08", "09"].map((m, k) => ({ period: `2026-${m}-01`, value: [600, 520, 510, 500][k], target: 667, status: k === 0 ? "at_risk" : "off_track" })),
    fmt: (v) => String(v), links: [], related: [], correctiveActions: [], issues: [], northStar: null, financial: null, metricRef: ref("m"),
    ...over,
  });
  it("classifies a material deviation, asks for deal-level evidence and needs an intervention", () => {
    const a = assessKpi(kpi());
    expect(a.material).toBe(true);
    expect(a.offTrackRun).toBe(3);
    expect(a.delegateTo).toContain("commercial");
    expect(a.needsIntervention).toBe(true);
    expect(a.findings.some((f) => f.kind === "missing")).toBe(true);
  });
  it("does not propose a second intervention when a corrective action is already agreed", () => {
    const a = assessKpi(kpi({ correctiveActions: [{ id: "x", title: "Recovery plan", due_date: "2026-11-05", status: "open", ref: ref("x") }] }));
    expect(a.needsIntervention).toBe(false);
  });
});

describe("Commercial Agent analysis", () => {
  const opp = (id: string, o: Partial<CrmOpportunity>): CrmOpportunity => ({
    id, externalId: id, name: `Deal ${id}`, account: null, stage: "proposal", status: "open", amount: 100_000, segment: "Mid-market", source: "Inbound", owner: "Ann",
    createdOn: "2026-06-01", closeDate: "2026-12-01", closedOn: null, lastActivityOn: "2026-10-25", ...o,
  });
  it("flags stalled and slipped deals and names the segment driving them", () => {
    const a = assessPipeline({
      today: "2026-10-28", crmLabel: "CRM", coverage: null, fmtMoney: money,
      opportunities: [opp("1", { segment: "Enterprise", lastActivityOn: "2026-08-01", amount: 400_000 }), opp("2", { segment: "Enterprise", closeDate: "2026-10-01" }), opp("3", {})],
    });
    expect(a.flagged.map((f) => f.opp.id)).toEqual(["1", "2"]);
    expect(a.topSegment).toBe("Enterprise");
    expect(a.staleValue).toBe(400_000);
    expect(a.findings.find((f) => /by owner/.test(f.text))?.text).toMatch(/Ann 2/);
  });
});

describe("M&A Agent analysis", () => {
  const thesis: Thesis = {
    id: "t", title: "Fire safety", sectors: ["Fire safety"], keywords: ["fire", "alarm"], geographies: ["Scotland", "Wales"],
    min_revenue: 3_000_000, max_revenue: 25_000_000, min_ebitda: 400_000, ownership_preferences: ["Founder-owned"], exclusions: ["administration"], fit_threshold: 60,
  };
  const c = (name: string, o: Partial<Candidate> = {}): Candidate => ({
    sourceId: name, source: "Sandbox", name, registrationNumber: null, website: null, sector: "Fire safety", geography: "Scotland",
    description: "Fire alarm maintenance contracts", ownership: "Founder-owned", revenue: 5_000_000, ebitda: 600_000, employees: 40, financialsSource: "FY2025", ...o,
  });
  it("normalises company names for duplicate detection", () => {
    expect(normalizeName("Aquila Fire Protection Ltd")).toBe(normalizeName("AQUILA FIRE PROTECTION LIMITED"));
    expect(normalizeName("Smith & Sons (UK) Ltd")).toBe("smith and sons");
  });
  it("scores unknown financials as unknown, never as met", () => {
    const f = scoreFit(thesis, c("X", { revenue: null, ebitda: null }), money);
    expect(f.unknownFinancials).toBe(true);
    expect(f.criteria.find((x) => x.key === "revenue")!.result).toBe("unknown");
    expect(f.score).toBe(100 - 15 - 10);
  });
  it("excludes duplicates, rejected companies, exclusions and companies outside the region", () => {
    const pipeline = [
      { normalized_name: "aquila", name: "Aquila", stage: "diligence", rejection_reason: null, registration_number: null },
      { normalized_name: "beacon", name: "Beacon", stage: "rejected", rejection_reason: "Residential", registration_number: null },
    ];
    const r = screen(thesis, [c("Aquila Ltd"), c("Beacon"), c("Highland", { description: "Fire alarm servicing; in administration" }), c("Kent", { geography: "South East England" }), c("Good"), c("Good Limited")], pipeline, money);
    const by = Object.fromEntries(r.screened.map((s) => [s.candidate.name, s.outcome]));
    expect(by).toEqual({ "Aquila Ltd": "duplicate", Beacon: "previously_rejected", Highland: "excluded", Kent: "below_threshold", Good: "shortlist", "Good Limited": "duplicate" });
  });
  it("drafts an approach with no financial or confidential detail", () => {
    const d = approachDraft("Kestrel", { name: "Good", sector: "Fire safety", geography: "Scotland", criteria: scoreFit(thesis, c("Good"), money).criteria });
    expect(d.body).toMatch(/fire safety work across Scotland/);
    expect(d.body).not.toMatch(/£|\d+%|valuation|offer/i);
  });
});

describe("credential encryption", () => {
  it("round-trips and fails closed when tampered with", async () => {
    process.env.AGENTS_ENCRYPTION_KEY = "unit-test-key";
    const { encryptSecret, decryptSecret } = await import("@/lib/agents/connectors/secrets");
    const sealed = encryptSecret("token-123");
    expect(sealed).not.toContain("token-123");
    expect(decryptSecret(sealed)).toBe("token-123");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
