// M&A integration: pure logic — extraction, grounding, rule-based analysis, the Claude path
// (with a recorded response; no live API call), plan adaptation, status and learning.
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chunkText, extractDocument } from "@/lib/integration/extract";
import { analyseWithRules } from "@/lib/integration/analyse-rules";
import { groundPlaybook, quoteSupported, type SourceChunk } from "@/lib/integration/grounding";
import { generatePlaybook } from "@/lib/integration/generate-playbook";
import { adaptWithRules, parseSynergies } from "@/lib/integration/generate-plan";
import { applyChange, reviewIntegration } from "@/lib/integration/learning";
import { humanOnly, playbookContent, type PlaybookContent } from "@/lib/integration/schema";
import { nextWorkingTime } from "@/lib/integration/monitor";
import { assessSynergy, recommendPlaybook, summariseIntegration, synergyTotals, verifiedComplete, type ActivityLike } from "@/lib/domain/integration";
import type { ClaudeClient } from "@/lib/integration/claude";

const DIR = "scripts/seed/integration-docs";
const TYPES: Record<string, string> = {
  "clinara-integration-playbook-v2.docx": "playbook", "dentaldesk-integration-plan-2023.xlsx": "integration_plan", "optibook-100-day-plan-2024.pptx": "integration_plan",
  "carenotes-integration-checklist-2025.pdf": "checklist", "post-acquisition-review-dentaldesk.docx": "post_acquisition_review", "lessons-learned-optibook-carenotes.md": "lessons_learned", "buy-and-build-strategy-board-2026.pdf": "strategy",
};
async function corpus(): Promise<SourceChunk[]> {
  const out: SourceChunk[] = [];
  for (const f of readdirSync(DIR).filter((x) => TYPES[x])) {
    const r = await extractDocument(new Uint8Array(readFileSync(`${DIR}/${f}`)), f);
    if (r.status !== "ready") throw new Error(f);
    const sid = randomUUID();
    for (const c of chunkText(r.text)) out.push({ id: randomUUID(), source_id: sid, source_title: f, doc_type: TYPES[f], heading: c.heading, text: c.text, ordinal: c.ordinal });
  }
  return out;
}

describe("document extraction", () => {
  it("reads Word, PowerPoint, Excel, PDF and Markdown with their structure", async () => {
    const docx = await extractDocument(new Uint8Array(readFileSync(`${DIR}/clinara-integration-playbook-v2.docx`)), "x.docx");
    expect(docx.status === "ready" && docx.text).toMatch(/# Workstream: Finance\n- Day 1: take control of bank accounts/);
    const xlsx = await extractDocument(new Uint8Array(readFileSync(`${DIR}/dentaldesk-integration-plan-2023.xlsx`)), "x.xlsx");
    expect(xlsx.status === "ready" && xlsx.text).toMatch(/Commercial \| Customer data cleansing \| Head of RevOps/);
    const pptx = await extractDocument(new Uint8Array(readFileSync(`${DIR}/optibook-100-day-plan-2024.pptx`)), "x.pptx");
    expect(pptx.status === "ready" && pptx.pageCount).toBe(5);
    const pdf = await extractDocument(new Uint8Array(readFileSync(`${DIR}/carenotes-integration-checklist-2025.pdf`)), "x.pdf");
    expect(pdf.status === "ready" && pdf.pageCount).toBe(2);
  });
  it("refuses unsupported and empty files with a reason", async () => {
    expect(await extractDocument(new Uint8Array([1, 2]), "deck.ppt")).toMatchObject({ status: "unsupported", error: expect.stringMatching(/Legacy/) });
    expect(await extractDocument(new Uint8Array([1, 2]), "photo.png")).toMatchObject({ status: "unsupported" });
    expect(await extractDocument(new TextEncoder().encode("  "), "a.txt")).toMatchObject({ status: "failed" });
  });
  it("chunks keep their section headings", () => {
    const c = chunkText("# Finance\n- a\n- b\n# People\n- c");
    expect(c.map((x) => x.heading)).toEqual(["Finance", "People"]);
  });
});

describe("grounding", () => {
  it("accepts exact and lightly reformatted quotes, rejects invented ones", () => {
    const t = "Day 60: migrate customer records into the Clinara CRM (Owner: Head of RevOps). Critical path.";
    expect(quoteSupported("migrate customer records into the Clinara CRM", t)).toBe(true);
    expect(quoteSupported("Day 60 — migrate customer records into the Clinara CRM, Owner Head of RevOps", t)).toBe(true);
    expect(quoteSupported("migrate all production databases on Day 1", t)).toBe(false);
  });
});

describe("rule-based playbook extraction", () => {
  it("builds the company's workstreams with sources, and separates practice from suggestions", async () => {
    const chunks = await corpus();
    const c = groundPlaybook(playbookContent.parse(analyseWithRules(chunks)), chunks);
    const acts = c.workstreams.flatMap((w) => w.activities);
    expect(c.workstreams.map((w) => w.name)).toEqual(expect.arrayContaining(["Finance", "Commercial", "People", "Technology", "Legal and compliance"]));
    expect(acts.filter((a) => a.basis !== "recommended").every((a) => a.citations.length > 0)).toBe(true);
    expect(c.stats!.citations_rejected).toBe(0);
    const clean = acts.find((a) => /data cleansing/i.test(a.title))!;
    expect(clean.basis).toBe("established"); // consistently evidenced across all three previous integrations
    expect(clean.critical).toBe(true); // late in more than one
    expect(acts.find((a) => /penetration/i.test(a.title))!.basis).toBe("inferred"); // one integration only
    expect(acts.filter((a) => a.basis === "recommended").every((a) => a.decision === "pending" && a.citations.length === 0)).toBe(true);
    expect(acts.find((a) => /migrate billing/i.test(a.title))!.depends_on).toContain(acts.find((a) => /migrate customer records/i.test(a.title))!.key);
  });
  it("flags timing conflicts between sources and with lessons", async () => {
    const c = analyseWithRules(await corpus());
    expect(c.conflicts.map((x) => x.topic)).toEqual(expect.arrayContaining([expect.stringMatching(/announcement/i), expect.stringMatching(/data cleansing/i)]));
    expect(c.gaps.length).toBeGreaterThan(0);
  });
});

describe("the Claude path (recorded response)", () => {
  it("maps passages to citations, verifies them and demotes unsupported practice", async () => {
    const chunks = (await corpus()).slice(0, 12);
    const target = chunks.find((c) => /bank accounts/i.test(c.text))!;
    const idx = chunks.indexOf(target) + 1;
    const response = {
      name: "Clinara playbook", applies_when: "Software acquisitions", acquisition_type_names: ["Full integration"], summary: "s",
      philosophy: [], acquisition_types: [], risks: [], kpis: [], synergy_rules: [], conflicts: [], gaps: [], lessons: [],
      workstreams: [{ name: "Finance", objective: "o", accountable_function: "CFO", basis: "established", rationale: "", citations: [], activities: [
        { title: "Take control of bank accounts", description: "", accountable_function: "CFO", timing_anchor: "day_1", start_offset_days: 0, due_offset_days: 0, timing_label: "Day 1", milestone: false, critical: true, completion_criteria: "", evidence_required: "", approval_required: null, depends_on_titles: [], basis: "established", rationale: "", citations: [{ passage: `P${idx}`, quote: "take control of bank accounts and payment authorities" }], applies_to: [] },
        { title: "Terminate duplicate finance roles", description: "", accountable_function: "CFO", timing_anchor: "days", start_offset_days: 1, due_offset_days: 30, timing_label: "First 30 days", milestone: false, critical: false, completion_criteria: "", evidence_required: "", approval_required: null, depends_on_titles: ["Take control of bank accounts"], basis: "established", rationale: "", citations: [{ passage: `P${idx}`, quote: "terminate duplicate roles immediately" }], applies_to: [] },
      ] }],
    };
    const client = { beta: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: "end_turn", model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify(response) }] }) }) } } } as unknown as ClaudeClient;
    const d = await generatePlaybook(chunks, { useClaude: true, client });
    expect(d.generator).toBe("claude");
    const [bank, term] = d.content.workstreams[0].activities;
    expect(bank.basis).toBe("established");
    expect(bank.citations[0].chunk_id).toBe(target.id);
    expect(term.basis).toBe("recommended"); // invented quote rejected → not company practice
    expect(term.decision).toBe("pending");
    expect(term.human_only).toBe(true); // employment decisions are people's, whatever the model says
    expect(term.depends_on).toEqual([bank.key]);
    expect(d.content.stats!.citations_rejected).toBe(1);
  });
  it("surfaces a refusal instead of storing anything", async () => {
    const client = { beta: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: "refusal", model: "m", usage: { input_tokens: 0, output_tokens: 0 }, content: [] }) }) } } } as unknown as ClaudeClient;
    await expect(generatePlaybook((await corpus()).slice(0, 3), { useClaude: true, client })).rejects.toThrow(/declined/);
  });
});

describe("acquisition-specific plans", () => {
  const crew = [
    { id: "00000000-0000-4000-8000-000000000001", full_name: "Ceo", title: "Chief Executive Officer", seat: "CEO" },
    { id: "00000000-0000-4000-8000-000000000002", full_name: "Cfo", title: "Chief Financial Officer", seat: "Finance" },
    { id: "00000000-0000-4000-8000-000000000003", full_name: "Cro", title: "Chief Revenue Officer", seat: "Revenue" },
    { id: "00000000-0000-4000-8000-000000000004", full_name: "Cto", title: "Chief Product & Technology Officer", seat: "Tech" },
  ];
  const acq = (o = {}) => ({ name: "Vetora", completion_date: "2026-09-01", rationale: "", objectives: "", operating_model: "Full integration", integration_model: "Full integration", expected_synergies: "£1m annual cross-selling revenue by month 18", key_risks: "", diligence_findings: "", commitments: "", systems_info: "", org_info: "", sponsor_crew_id: crew[0].id, leader_crew_id: crew[1].id, ...o });
  it("parses synergy expectations without inventing figures", () => {
    expect(parseSynergies("£1m annual cross-selling revenue by month 18\n£250k hosting savings within 12 months")).toMatchObject([
      { category: "cross_sell", target: 1_000_000, measurement: "annual_run_rate", realisation_offset_days: 540 },
      { category: "technology", target: 250_000 },
    ]);
    expect(parseSynergies("Better cross-selling")).toEqual([]);
  });
  it("adapts to the operating model and diligence, explaining each deviation", async () => {
    const chunks = await corpus();
    const pb = groundPlaybook(playbookContent.parse(analyseWithRules(chunks)), chunks);
    const plain = adaptWithRules(pb, acq(), crew);
    const kept = adaptWithRules(pb, acq({ operating_model: "Keep the brand and keep their own systems and product", diligence_findings: "No MFA; weak patching." }), crew);
    const titles = (p: typeof plain) => p.workstreams.flatMap((w) => w.activities.map((a) => a.title));
    expect(titles(plain)).toContain("Product migration plan agreed");
    expect(titles(kept)).not.toContain("Product migration plan agreed");
    expect(kept.deviations.some((d) => d.kind === "omitted" && /own systems/.test(d.reason))).toBe(true);
    expect(titles(kept)).toContain("Remediate cybersecurity findings from due diligence");
    expect(plain.synergies[0].supporting_activity_keys.length).toBeGreaterThan(0);
    expect(plain.workstreams.flatMap((w) => w.activities).find((a) => /bank accounts/i.test(a.title))!.owner_crew_id).toBe(crew[1].id);
  });
  it("flags consequential work for people", () => {
    expect(humanOnly("Migrate customer records into the CRM")).toMatch(/data migrations/);
    expect(humanOnly("Change customer contractual terms")).toMatch(/contractual/);
    expect(humanOnly("Prepare the weekly status report")).toBeNull();
  });
});

describe("integration status", () => {
  const act = (id: string, o: Partial<ActivityLike> = {}): ActivityLike => ({ id, key: id, title: id, workstream_id: "w", owner_crew_id: null, status: "not_started", start_date: "2026-10-01", due_date: "2026-11-10", baseline_due_date: "2026-11-10", completed_at: null, milestone: true, critical: false, completion_criteria: "Reconciled", criteria_met: null, approval_status: "not_required", ...o });
  it("does not count done as complete until criteria are verified", () => {
    expect(verifiedComplete(act("a", { status: "done" }))).toBe(false);
    expect(verifiedComplete(act("a", { status: "done", criteria_met: true }))).toBe(true);
    expect(verifiedComplete(act("a", { status: "done", completion_criteria: "" }))).toBe(true);
  });
  it("puts a dependent at risk when its prerequisite is unfinished close to its date", () => {
    const s = summariseIntegration([act("clean", { due_date: "2026-10-20" }), act("crm", { due_date: "2026-11-05" })], [{ from_activity_id: "clean", to_activity_id: "crm" }], "2026-10-29");
    expect(s.assessments.get("crm")!.health).toBe("at_risk");
    expect(s.assessments.get("clean")!.health).toBe("off_track");
    expect(s.nextMilestone!.id).toBe("crm");
  });
  it("realises synergies from verified actuals only, never forecasts, and counts each once", () => {
    const syn = { id: "s", key: "x", category: "cross_sell", description: "d", unit: "currency", baseline: 0, target: 1_000_000, measurement: "annual_run_rate", start_date: "2026-01-01", expected_realisation_date: "2027-01-01", supporting_activity_ids: [] };
    const r = assessSynergy(syn, [{ synergy_id: "s", period_start: "2026-07-01", value: 100_000, kind: "actual", verified: true }, { synergy_id: "s", period_start: "2026-08-01", value: 900_000, kind: "forecast", verified: false }, { synergy_id: "s", period_start: "2026-08-01", value: 800_000, kind: "actual", verified: false }], new Map(), "2026-08-15");
    expect(r.realised).toBe(100_000);
    expect(r.forecast).toBe(900_000);
    expect(r.unverifiedActuals).toBe(1);
    expect(r.status).toBe("off_track");
    expect(synergyTotals([syn, { ...syn, id: "s2" }], new Map([["s", r], ["s2", r]]))).toEqual({ target: 1_000_000, realised: 100_000 });
  });
  it("recommends a playbook transparently", () => {
    const pbs = [{ id: "a", name: "Full", applies_when: "", acquisition_types: ["Full integration"] }, { id: "b", name: "Partial", applies_when: "keep brand", acquisition_types: ["Partial integration"] }];
    expect(recommendPlaybook(pbs, { rationale: "", operating_model: "", integration_model: "Partial integration", objectives: "" })!.p.id).toBe("b");
  });
  it("holds messages to working hours", () => {
    const sat = new Date("2026-10-31T10:00:00Z");
    expect(nextWorkingTime(sat, { start: 8, end: 18, weekdays_only: true }).toISOString()).toBe("2026-11-02T08:00:00.000Z");
    const tue = new Date("2026-11-03T12:00:00Z");
    expect(nextWorkingTime(tue).getTime()).toBe(tue.getTime());
  });
});

describe("learning", () => {
  it("proposes moving a repeatedly late activity earlier, and applies it only to a copy", async () => {
    const chunks = await corpus();
    const pb: PlaybookContent = groundPlaybook(playbookContent.parse(analyseWithRules(chunks)), chunks);
    const clean = pb.workstreams.flatMap((w) => w.activities).find((a) => /data cleansing/i.test(a.title))!;
    const r = reviewIntegration({
      acquisition: { name: "Vetora", completion_date: "2026-09-01", integration_model: "Full integration" }, playbook: pb, deps: [{ from_activity_id: "c", to_activity_id: "m" }], synergies: [], actuals: [], interventions: [], history: chunks, today: "2026-12-01",
      activities: [
        { id: "c", key: "c", title: clean.title, workstream_id: "w", workstream: "Commercial", owner_crew_id: null, status: "done", start_date: "2026-09-02", due_date: "2026-10-15", baseline_due_date: "2026-10-01", completed_at: "2026-10-30T00:00:00Z", milestone: false, critical: true, completion_criteria: "", criteria_met: true, approval_status: "not_required", playbook_key: clean.key, origin: "playbook" },
        { id: "m", key: "m", title: "Migrate customer records into the Clinara CRM", workstream_id: "w", workstream: "Commercial", owner_crew_id: null, status: "done", start_date: "2026-10-01", due_date: "2026-11-20", baseline_due_date: "2026-10-31", completed_at: "2026-11-20T00:00:00Z", milestone: true, critical: true, completion_criteria: "", criteria_met: true, approval_status: "not_required", playbook_key: null, origin: "playbook" },
      ],
    });
    const p = r.proposals.find((x) => /before completion/.test(x.title))!;
    expect(p.evidence.filter((e) => e.kind === "document").length).toBeGreaterThan(0);
    const next = applyChange(pb, p.change);
    expect(next.workstreams.flatMap((w) => w.activities).find((a) => a.key === clean.key)!.timing.anchor).toBe("pre_completion");
    expect(clean.timing.anchor).not.toBe("pre_completion"); // original untouched
  });
});
