// Acquisition-specific plan generation: the approved master playbook adapted to one
// acquisition's rationale, operating model, diligence findings, commitments and expected
// synergies. Every material deviation from the playbook is recorded with its reason;
// acquisition-specific requirements are kept separate from suggested improvements.
import { z } from "zod";
import { callStructured, claudeConfigured, UNTRUSTED, type ClaudeClient } from "./claude";
import { passagesForPrompt, type SourceChunk } from "./grounding";
import { similarity, titleTokens } from "./analyse-rules";
import { enforceHumanOnly, planContent, uniqueKey, type PlanActivity, type PlanContent, type PlanSynergy, type PlanWorkstream, type PlaybookContent } from "./schema";

export interface AcquisitionInput {
  name: string;
  completion_date: string | null;
  rationale: string;
  objectives: string;
  operating_model: string;
  integration_model: string;
  expected_synergies: string;
  key_risks: string;
  diligence_findings: string;
  commitments: string;
  systems_info: string;
  org_info: string;
  sponsor_crew_id: string | null;
  leader_crew_id: string | null;
}
export interface CrewInput {
  id: string;
  full_name: string;
  title: string;
  seat: string | null;
}

// ---------------------------------------------------------------------------
// Owners: accountable function → the crew member who holds that seat
// ---------------------------------------------------------------------------
const FN: Array<[RegExp, RegExp]> = [
  [/\bceo\b|chief executive/i, /chief executive|^ceo$/i],
  [/\bcfo\b|finance/i, /chief financial|finance director|\bcfo\b/i],
  [/revops|revenue operations/i, /revops|revenue operations|chief revenue/i],
  [/\bcco\b|\bcro\b|commercial|sales|revenue/i, /chief commercial|chief revenue|commercial director|sales director|\bcco\b/i],
  [/customer success|customer service/i, /chief customer|customer success/i],
  [/\bcto\b|cpto|technology|product|it\b/i, /chief technology|chief product|cpto|\bcto\b|technology director/i],
  [/people|hr\b/i, /people|human resources|\bhr\b/i],
  [/counsel|legal/i, /counsel|legal/i],
  [/\bcoo\b|operations/i, /chief operating|operations director|\bcoo\b/i],
  [/\bcmo\b|marketing|brand/i, /marketing|\bcmo\b/i],
];
export function ownerFor(fn: string, crew: CrewInput[], leaderId: string | null): string | null {
  if (/integration (leader|lead|manager)|steering/i.test(fn) && leaderId) return leaderId;
  for (const [fnRe, titleRe] of FN) {
    if (!fnRe.test(fn)) continue;
    const c = crew.find((x) => titleRe.test(x.title) || (x.seat ? titleRe.test(x.seat) : false));
    if (c) return c.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Synergy expectations: "£1m annual cross-selling revenue by month 18"
// ---------------------------------------------------------------------------
export function parseSynergies(text: string): Array<Omit<PlanSynergy, "key" | "supporting_activity_keys" | "owner_crew_id"> & { raw: string }> {
  const out: Array<Omit<PlanSynergy, "key" | "supporting_activity_keys" | "owner_crew_id"> & { raw: string }> = [];
  for (const raw of text.split(/\n|;|(?<=\.)\s+/).map((s) => s.replace(/^[-•*]\s*/, "").trim()).filter(Boolean)) {
    const m = raw.match(/£\s?([\d.,]+)\s*(k|m|bn|million|thousand)?/i);
    if (!m) continue;
    const mult = /^(m|million)$/i.test(m[2] ?? "") ? 1e6 : /^(k|thousand)$/i.test(m[2] ?? "") ? 1e3 : /^bn$/i.test(m[2] ?? "") ? 1e9 : 1;
    const target = Math.round(Number(m[1].replace(/,/g, "")) * mult);
    const t = raw.toLowerCase();
    const category = /cross-?sell|upsell/.test(t) ? "cross_sell" : /procure|supplier|purchas/.test(t) ? "procurement" : /hosting|licen[cs]|tool|technology|infrastructure/.test(t) ? "technology" : /saving|cost|overhead|duplicat/.test(t) ? "cost" : /revenue|growth|price/.test(t) ? "revenue" : "other";
    const months = Number(t.match(/(?:by|within|in) (?:month )?(\d+)(?: months)?/)?.[1] ?? 12);
    out.push({
      raw, category, description: raw.slice(0, 1000), unit: "currency", baseline: 0, target,
      measurement: /annual|a year|per year|run-?rate|arr/.test(t) ? "annual_run_rate" : "cumulative",
      evidence_source: category === "cross_sell" || category === "revenue" ? "Invoiced revenue from acquired customers (CRM and billing)" : "Booked savings confirmed by the CFO",
      realisation_offset_days: Math.min(1825, Math.max(30, months * 30)),
    });
  }
  return out;
}

const has = (s: string, re: RegExp) => re.test(s);
const excerpt = (s: string, re: RegExp) => {
  const sentence = s.split(/(?<=[.;\n])\s*/).find((x) => re.test(x)) ?? s;
  return sentence.trim().slice(0, 300);
};

/** Rule-based adaptation of the approved playbook. */
export function adaptWithRules(playbook: PlaybookContent, a: AcquisitionInput, crew: CrewInput[]): PlanContent {
  const deviations: PlanContent["deviations"] = [];
  const missing: string[] = [];
  const decisions: PlanContent["decisions_required"] = [];
  const risks: PlanContent["risks"] = [];
  const model = a.integration_model || a.operating_model;
  const om = `${a.operating_model} ${a.integration_model}`.toLowerCase();
  const dd = a.diligence_findings.toLowerCase();
  const all = `${a.rationale} ${a.objectives} ${a.operating_model} ${a.expected_synergies} ${a.key_risks} ${a.diligence_findings} ${a.commitments} ${a.systems_info}`.toLowerCase();
  const keepBrand = has(om, /(retain|keep|keeps|retains|retained)[^.]{0,40}brand|brand[^.]{0,20}(retained|kept|stays)|standalone brand|endorsed brand/);
  const keepSystems = has(om, /(retain|keep|keeps|retains|retained)[^.]{0,40}(systems|product|platform|own software)|no (product|platform) migration|standalone product/);
  const wsKeys = new Set<string>();
  const actKeys = new Set<string>();

  const workstreams: PlanWorkstream[] = [];
  for (const w of playbook.workstreams) {
    if (w.decision === "rejected") continue;
    const acts: PlanActivity[] = [];
    for (const x of w.activities) {
      if (x.decision === "rejected" || (x.basis === "recommended" && x.decision !== "accepted")) continue;
      const text = `${x.title} ${x.description}`;
      if (x.applies_to.length && !x.applies_to.some((t) => model.toLowerCase().includes(t.toLowerCase().split(" ")[0]))) {
        deviations.push({ kind: "omitted", text: `Omitted "${x.title}"`, reason: `The playbook applies it to ${x.applies_to.join(", ")} only; this acquisition is "${model || "unspecified"}".` });
        continue;
      }
      if (keepBrand && /brand|website|rebrand|retire/i.test(text) && !/retain|retained/i.test(text)) {
        deviations.push({ kind: "omitted", text: `Omitted "${x.title}"`, reason: `The operating model retains the ${a.name} brand: "${excerpt(a.operating_model, /brand/i)}"` });
        continue;
      }
      if (keepSystems && /product migration|migrate .*platform|application consolidation|decommission/i.test(text)) {
        deviations.push({ kind: "omitted", text: `Omitted "${x.title}"`, reason: `The operating model keeps ${a.name}'s own systems: "${excerpt(a.operating_model, /system|product|platform/i)}"` });
        continue;
      }
      if (/brand retained|no brand migration/i.test(text) && !keepBrand) {
        deviations.push({ kind: "omitted", text: `Omitted "${x.title}"`, reason: "Applies when the acquired brand is retained; this operating model does not retain it." });
        continue;
      }
      acts.push(
        enforceHumanOnly({
          key: uniqueKey(x.key, actKeys),
          title: x.title,
          description: x.description,
          accountable_function: x.accountable_function,
          owner_crew_id: ownerFor(x.accountable_function, crew, a.leader_crew_id),
          start_offset_days: x.timing.start_offset_days,
          due_offset_days: x.timing.due_offset_days,
          timing_label: x.timing.label,
          milestone: x.milestone,
          critical: x.critical,
          completion_criteria: x.completion_criteria,
          evidence_required: x.evidence_required,
          approval_required: x.approval_required,
          depends_on: x.depends_on,
          origin: "playbook",
          playbook_activity_key: x.key,
          deviation_note: null,
          basis: x.basis,
          citations: x.citations,
          decision: "accepted",
          included: true,
          human_only: x.human_only,
          human_only_reason: x.human_only_reason,
        }),
      );
    }
    if (!acts.length) {
      deviations.push({ kind: "omitted", text: `Workstream "${w.name}" not included`, reason: "None of its activities apply to this acquisition." });
      continue;
    }
    workstreams.push({
      key: uniqueKey(w.key, wsKeys), name: w.name, objective: w.objective, accountable_function: w.accountable_function,
      owner_crew_id: ownerFor(w.accountable_function, crew, a.leader_crew_id), origin: "playbook", included: true, deviation_note: null, activities: acts,
    });
  }

  const ws = (key: string, name: string, fn: string) => {
    let w = workstreams.find((x) => x.key === key || x.name.toLowerCase() === name.toLowerCase());
    if (!w) {
      w = { key: uniqueKey(key, wsKeys), name, objective: "", accountable_function: fn, owner_crew_id: ownerFor(fn, crew, a.leader_crew_id), origin: "acquisition", included: true, deviation_note: `Added for ${a.name}.`, activities: [] };
      workstreams.push(w);
    }
    return w;
  };
  const find = (re: RegExp) => workstreams.flatMap((w) => w.activities).find((x) => re.test(x.title));
  const add = (wkey: string, wname: string, fn: string, x: Partial<PlanActivity> & Pick<PlanActivity, "title" | "start_offset_days" | "due_offset_days" | "origin">, reason: string) => {
    const w = ws(wkey, wname, fn);
    const act = enforceHumanOnly(planActivity({ ...x, key: uniqueKey(x.title, actKeys), accountable_function: x.accountable_function ?? fn, owner_crew_id: ownerFor(x.accountable_function ?? fn, crew, a.leader_crew_id), deviation_note: reason }));
    w.activities.push(act);
    deviations.push({ kind: "added", text: `Added "${act.title}"`, reason });
    return act;
  };

  // Diligence findings → acquisition-specific requirements
  if (has(dd, /cyber|security|mfa|multi-factor|penetration|vulnerab|patch/)) {
    const finding = excerpt(a.diligence_findings, /cyber|security|mfa|multi-factor|penetration|vulnerab|patch/i);
    add("technology", "Technology", "CTO", { title: "Remediate cybersecurity findings from due diligence", description: `Diligence finding: ${finding}`, start_offset_days: 1, due_offset_days: 45, origin: "acquisition", critical: true, completion_criteria: "Every high-severity finding closed and re-tested; MFA enforced for all staff and administrators.", evidence_required: "Re-test report from the security assessor." }, `Diligence identified security weaknesses: "${finding}"`);
    const sso = find(/single sign-on|identity|mfa/i);
    if (sso) {
      sso.critical = true;
      sso.deviation_note = "Made critical-path because diligence found weak access controls.";
      deviations.push({ kind: "changed", text: `"${sso.title}" made critical-path`, reason: "Diligence found weak access controls." });
    }
    risks.push({ text: `Security weaknesses found in diligence: ${finding}`, mitigation: "Remediation activity in the Technology workstream, critical-path.", source: "Diligence findings" });
  }
  if (has(dd, /data quality|duplicate|crm data|customer data|incomplete records/)) {
    const finding = excerpt(a.diligence_findings, /data quality|duplicate|crm data|customer data|incomplete/i);
    const clean = find(/data (quality|cleans|assess)/i);
    if (clean) {
      clean.critical = true;
      if (!clean.completion_criteria) clean.completion_criteria = "Duplicates merged and every active account has a billing contact; reconciliation signed off by the CRM owner.";
      clean.deviation_note = `Critical-path for ${a.name}: ${finding}`;
      deviations.push({ kind: "changed", text: `"${clean.title}" made critical-path`, reason: `Diligence: "${finding}"` });
    } else add("commercial", "Commercial", "Head of RevOps", { title: "Customer data cleansing before CRM migration", start_offset_days: 1, due_offset_days: 30, origin: "acquisition", critical: true, completion_criteria: "Duplicates merged, every active account has a billing contact; reconciliation signed off by RevOps." }, `Diligence: "${finding}"`);
    risks.push({ text: `Customer data quality: ${finding}`, mitigation: "Data cleansing is a prerequisite for the CRM migration and is tracked on the critical path.", source: "Diligence findings" });
  }
  if (has(dd + a.key_risks.toLowerCase(), /key (person|people|employee|engineer)|founder|retention risk/)) {
    const people = find(/key employees|retention/i);
    if (people) {
      people.critical = true;
      deviations.push({ kind: "changed", text: `"${people.title}" made critical-path`, reason: "Key-person risk recorded for this acquisition." });
    }
  }
  if (has(all, /gdpr|data protection|dpia|patient data|special category/)) {
    if (!find(/data protection|dpia/i))
      add("legal", "Legal and compliance", "General Counsel", { title: "Data protection impact assessment for acquired customer data", start_offset_days: 1, due_offset_days: 30, origin: "acquisition", completion_criteria: "DPIA approved by the DPO." }, "The acquisition involves personal or patient data.");
  }

  // Commitments made in the transaction
  if (has(a.commitments.toLowerCase(), /earn-?out/)) add("finance", "Finance", "CFO", { title: "Track earn-out measures and reporting", start_offset_days: 1, due_offset_days: 30, origin: "acquisition", completion_criteria: "Earn-out measures, data sources and reporting dates agreed with the sellers' representative." }, `Transaction commitment: "${excerpt(a.commitments, /earn-?out/i)}"`);
  if (has(a.commitments.toLowerCase(), /transitional service|\btsa\b/)) add("technology", "Technology", "CTO", { title: "Plan the exit from the transitional services agreement", start_offset_days: 1, due_offset_days: 60, origin: "acquisition", completion_criteria: "Exit plan with dates for every TSA service." }, `Transaction commitment: "${excerpt(a.commitments, /transitional|tsa/i)}"`);
  if (has(a.commitments.toLowerCase(), /no redundanc|retain all (staff|employees)|employment (terms|conditions) (protected|unchanged)/)) {
    risks.push({ text: `Employment commitment: ${excerpt(a.commitments, /redundanc|retain|employment/i)}`, mitigation: "No organisational change activity may breach this commitment; people execute any change after approval.", source: "Transaction commitments" });
    decisions.push({ text: "Confirm how the employment commitment constrains the organisation design", by: "CEO" });
  }

  // Expected synergies → targets, and the workstreams that deliver them
  const synergies: PlanSynergy[] = [];
  const synKeys = new Set<string>();
  for (const s of parseSynergies(a.expected_synergies)) {
    const support: string[] = [];
    if (s.category === "cross_sell" || s.category === "revenue") {
      let cross = find(/cross-?sell/i);
      if (!cross) cross = add("commercial", "Commercial", "CCO", { title: "Launch cross-selling to acquired customers", start_offset_days: 30, due_offset_days: 100, origin: "acquisition", critical: true, completion_criteria: "Cross-sell pipeline reported weekly by account owner." }, `Needed to deliver the expected synergy: "${s.raw}"`);
      cross.critical = true;
      support.push(cross.key, ...cross.depends_on);
      const owners = find(/account owner/i);
      if (owners) support.push(owners.key);
    }
    if (s.category === "technology" && !find(/hosting|consolidat/i)) {
      const t = add("technology", "Technology", "CTO", { title: "Consolidate hosting and tooling onto Clinara contracts", start_offset_days: 60, due_offset_days: 240, origin: "acquisition", completion_criteria: "Duplicate contracts ended at their notice dates; savings confirmed by the CFO." }, `Needed to deliver the expected synergy: "${s.raw}"`);
      support.push(t.key);
    }
    const isRevenue = s.category === "cross_sell" || s.category === "revenue";
    synergies.push({
      ...s,
      key: uniqueKey(`${s.category}_${s.target}`, synKeys),
      owner_crew_id: ownerFor(isRevenue ? "CCO" : "CFO", crew, a.leader_crew_id),
      supporting_activity_keys: [...new Set(support)].slice(0, 20),
    });
  }
  if (!synergies.length) missing.push("Expected synergies with amounts and dates (e.g. '£1m annual cross-selling revenue by month 18')");

  // Recommended improvement from the playbook's own lessons: start data work early if CRM migration is critical
  const crm = find(/crm/i);
  const clean = find(/data (quality|cleans|assess)/i);
  if (crm && clean && !crm.depends_on.includes(clean.key)) {
    crm.depends_on.push(clean.key);
    deviations.push({ kind: "changed", text: `"${crm.title}" now depends on "${clean.title}"`, reason: "Previous integrations show the CRM migration cannot start before the data is cleansed." });
  }
  if (clean && clean.due_offset_days > 0 && !playbook.conflicts.some((c) => c.resolution && /before completion|pre-?completion/i.test(c.resolution) && similarity(titleTokens(c.topic), titleTokens(clean.title)) >= 0.5)) {
    const w = workstreams.find((x) => x.activities.includes(clean))!;
    w.activities.push(planActivity({
      key: uniqueKey("assess_customer_data_before_completion", actKeys), title: "Assess customer data quality before completion", start_offset_days: -21, due_offset_days: -1,
      timing_label: "Pre-completion", origin: "recommended", accountable_function: clean.accountable_function, owner_crew_id: clean.owner_crew_id,
      completion_criteria: "Data quality report (duplicates, missing contacts, field mapping) shared with RevOps before completion.",
      deviation_note: "Suggested improvement: customer data delayed commercial integration in previous acquisitions.", decision: "pending",
    }));
    clean.depends_on.push(w.activities.at(-1)!.key);
  }

  // Missing information the agent will ask for
  if (!a.completion_date) missing.push("Completion date");
  if (!a.leader_crew_id) missing.push("Integration leader");
  if (!a.sponsor_crew_id) missing.push("Integration sponsor");
  if (!a.diligence_findings.trim()) missing.push("Relevant diligence findings");
  if (!a.systems_info.trim()) missing.push("Systems inventory of the acquired company");
  for (const w of workstreams) for (const x of w.activities) if (!x.owner_crew_id) missing.push(`An owner for "${x.title}" (${x.accountable_function || "no function named"})`);
  for (const w of workstreams) for (const x of w.activities) if (x.approval_required) decisions.push({ text: `Approve: ${x.title}`, by: x.approval_required });
  for (const r of a.key_risks.split(/\n|;/).map((s) => s.trim()).filter(Boolean)) risks.push({ text: r.slice(0, 1000), mitigation: "", source: "Acquisition risks" });

  const content: PlanContent = {
    summary: `${a.name}: ${workstreams.length} workstreams and ${workstreams.reduce((n, w) => n + w.activities.length, 0)} activities adapted from the approved playbook; ${deviations.length} deviations explained.`,
    integration_model: model.slice(0, 200),
    workstreams,
    synergies,
    deviations: deviations.slice(0, 60),
    risks: risks.slice(0, 30),
    decisions_required: decisions.slice(0, 30),
    missing_information: [...new Set(missing)].slice(0, 30),
    critical_path: [],
  };
  return finalisePlan(content);
}

const planActivity = (x: Partial<PlanActivity> & Pick<PlanActivity, "key" | "title" | "start_offset_days" | "due_offset_days" | "origin">): PlanActivity => ({
  description: "", accountable_function: "", owner_crew_id: null, timing_label: x.due_offset_days < 0 ? "Pre-completion" : x.due_offset_days === 0 ? "Day 1" : `By day ${x.due_offset_days}`,
  milestone: false, critical: false, completion_criteria: "", evidence_required: "", approval_required: null, depends_on: [], playbook_activity_key: null, deviation_note: null,
  basis: null, citations: [], decision: x.origin === "recommended" ? "pending" : "accepted", included: true, human_only: false, human_only_reason: null, ...x,
});

/** Dependencies resolved, human-only enforced, critical path computed, validated. */
export function finalisePlan(c: PlanContent): PlanContent {
  const acts = c.workstreams.flatMap((w) => w.activities);
  const keys = new Set(acts.map((x) => x.key));
  for (const x of acts) x.depends_on = [...new Set(x.depends_on.filter((d) => keys.has(d) && d !== x.key))];
  // dependencies of a critical activity are on the critical path too
  const byKey = new Map(acts.map((x) => [x.key, x]));
  const mark = (k: string, seen = new Set<string>()) => {
    if (seen.has(k)) return;
    seen.add(k);
    const x = byKey.get(k);
    if (!x) return;
    x.critical = true;
    x.depends_on.forEach((d) => mark(d, seen));
  };
  acts.filter((x) => x.critical).forEach((x) => mark(x.key));
  const critical = acts.filter((x) => x.critical && x.included).sort((p, q) => p.due_offset_days - q.due_offset_days).map((x) => x.key);
  return planContent.parse({ ...c, workstreams: c.workstreams.map((w) => ({ ...w, activities: w.activities.map(enforceHumanOnly) })), critical_path: critical.slice(0, 40) });
}

// ---------------------------------------------------------------------------
// Claude adaptation
// ---------------------------------------------------------------------------
const genPlan = z.object({
  summary: z.string(),
  integration_model: z.string(),
  workstreams: z.array(z.object({
    playbook_workstream_key: z.string().nullable(),
    name: z.string(),
    objective: z.string(),
    accountable_function: z.string(),
    included: z.boolean(),
    deviation_note: z.string().nullable(),
    activities: z.array(z.object({
      playbook_activity_key: z.string().nullable().describe("Key of the playbook activity this comes from; null if new"),
      title: z.string(),
      description: z.string(),
      accountable_function: z.string(),
      owner_crew_id: z.string().nullable().describe("Id from the crew list, or null"),
      start_offset_days: z.number().int(),
      due_offset_days: z.number().int(),
      timing_label: z.string(),
      milestone: z.boolean(),
      critical: z.boolean(),
      completion_criteria: z.string(),
      evidence_required: z.string(),
      approval_required: z.string().nullable(),
      depends_on_titles: z.array(z.string()),
      origin: z.enum(["playbook", "acquisition", "recommended"]),
      deviation_note: z.string().nullable(),
    })),
  })),
  omitted: z.array(z.object({ playbook_activity_key: z.string(), reason: z.string() })),
  synergies: z.array(z.object({ category: z.enum(["revenue", "cross_sell", "cost", "procurement", "operational", "product", "technology", "capability", "other"]), description: z.string(), unit: z.enum(["currency", "number", "percent"]), baseline: z.number(), target: z.number(), measurement: z.enum(["annual_run_rate", "cumulative", "monthly"]), supporting_activity_titles: z.array(z.string()), evidence_source: z.string(), realisation_offset_days: z.number().int() })),
  risks: z.array(z.object({ text: z.string(), mitigation: z.string(), source: z.string() })),
  decisions_required: z.array(z.object({ text: z.string(), by: z.string() })),
  missing_information: z.array(z.string()),
});

const PLAN_SYSTEM = `You adapt a portfolio company's approved master integration playbook into an executable plan for one acquisition in Omni OS. Management reviews and approves the plan before execution.

Start from the playbook. Keep what applies; adapt timing, owners and completion criteria to this acquisition; omit what does not apply (and say why in "omitted"); add acquisition-specific activities that the rationale, operating model, diligence findings, commitments or expected synergies require.
- origin "playbook": from the playbook (give its key). "acquisition": required by this acquisition's facts. "recommended": your suggestion — kept separate for management to accept or reject.
- If the acquired company keeps its brand or systems, do not impose a brand merger or full technology migration.
- If diligence reveals weaknesses (e.g. cybersecurity), add remediation. If synergies are expected, include the commercial or operational work that delivers them and link it.
- Every material deviation gets a deviation_note explaining it.
- Offsets are days relative to completion (day 0). Owners must be ids from the crew list or null.
- Synergies: targets only from the stated expectations; never invent figures.
- Activities that terminate employees, change employment or customer contracts, commit expenditure, cancel supplier agreements, migrate or delete production data, change regulated procedures, make legally binding commitments or disclose confidential information are executed by people after approval — describe them as such.
- Never include assessments of named individuals.

${UNTRUSTED}

UK English.`;

export async function generatePlan(
  playbook: PlaybookContent,
  a: AcquisitionInput,
  crew: CrewInput[],
  docs: SourceChunk[],
  opts: { useClaude: boolean; client?: ClaudeClient },
): Promise<{ content: PlanContent; generator: "claude" | "rules"; model: string | null; note: string }> {
  if (!(opts.useClaude && (opts.client || claudeConfigured()))) {
    return { content: adaptWithRules(playbook, a, crew), generator: "rules", model: null, note: "Adapted by the rule-based planner because no AI provider is configured. It applies the operating model, diligence findings, commitments and synergy expectations to the approved playbook; review every deviation." };
  }
  const { text } = passagesForPrompt(docs.slice(0, 400));
  const compact = playbook.workstreams.map((w) => ({ key: w.key, name: w.name, activities: w.activities.filter((x) => x.decision !== "rejected").map((x) => ({ key: x.key, title: x.title, fn: x.accountable_function, timing: x.timing, critical: x.critical, criteria: x.completion_criteria, approval: x.approval_required, depends_on: x.depends_on, applies_to: x.applies_to })) }));
  const user = `APPROVED PLAYBOOK (JSON):\n${JSON.stringify({ workstreams: compact, conflicts_resolved: playbook.conflicts.map((c) => ({ topic: c.topic, resolution: c.resolution })), lessons: playbook.lessons.map((l) => l.text) })}\n\nACQUISITION:\n${JSON.stringify({ ...a, sponsor_crew_id: undefined, leader_crew_id: undefined })}\n\nCREW (owners): ${JSON.stringify(crew)}\nIntegration leader id: ${a.leader_crew_id ?? "none"}\n\nACQUISITION DOCUMENTS:\n${text || "(none)"}\n\nProduce the plan.`;
  const r = await callStructured(genPlan, PLAN_SYSTEM, user, { client: opts.client, effort: "high" });
  const g = r.data;
  const crewIds = new Set(crew.map((c) => c.id));
  const pbActs = new Map(playbook.workstreams.flatMap((w) => w.activities).map((x) => [x.key, x]));
  const wsKeys = new Set<string>();
  const actKeys = new Set<string>();
  const workstreams: PlanWorkstream[] = g.workstreams.map((w) => ({
    key: uniqueKey(w.playbook_workstream_key ?? w.name, wsKeys), name: w.name.slice(0, 120), objective: w.objective.slice(0, 1000), accountable_function: w.accountable_function.slice(0, 120),
    owner_crew_id: ownerFor(w.accountable_function, crew, a.leader_crew_id), origin: w.playbook_workstream_key ? "playbook" : "acquisition", included: w.included, deviation_note: w.deviation_note?.slice(0, 1500) ?? null,
    activities: w.activities.map((x) => {
      const pb = x.playbook_activity_key ? pbActs.get(x.playbook_activity_key) : undefined;
      return planActivity({
        key: uniqueKey(pb?.key ?? x.title, actKeys), title: x.title.slice(0, 300), description: x.description.slice(0, 2000), accountable_function: x.accountable_function.slice(0, 120),
        owner_crew_id: x.owner_crew_id && crewIds.has(x.owner_crew_id) ? x.owner_crew_id : ownerFor(x.accountable_function, crew, a.leader_crew_id),
        start_offset_days: Math.max(-365, Math.min(1095, x.start_offset_days)), due_offset_days: Math.max(-365, Math.min(1095, x.due_offset_days)), timing_label: x.timing_label.slice(0, 80),
        milestone: x.milestone, critical: x.critical, completion_criteria: x.completion_criteria.slice(0, 1000), evidence_required: x.evidence_required.slice(0, 1000),
        approval_required: x.approval_required?.slice(0, 200) ?? null, depends_on: x.depends_on_titles as string[], origin: pb ? x.origin : x.origin === "playbook" ? "acquisition" : x.origin,
        playbook_activity_key: pb?.key ?? null, deviation_note: x.deviation_note?.slice(0, 1500) ?? null, basis: pb?.basis ?? null, citations: pb?.citations ?? [],
      });
    }),
  }));
  // depends_on titles → keys
  const acts = workstreams.flatMap((w) => w.activities);
  for (const x of acts) {
    x.depends_on = (x.depends_on as string[]).flatMap((t) => {
      const tk = titleTokens(t);
      const m = acts.filter((y) => y !== x).map((y) => ({ y, s: y.title.toLowerCase() === t.toLowerCase() ? 2 : similarity(titleTokens(y.title), tk) })).filter((z) => z.s >= 0.8).sort((p, q) => q.s - p.s)[0];
      return m ? [m.y.key] : [];
    });
  }
  const deviations: PlanContent["deviations"] = [
    ...g.omitted.map((o) => ({ kind: "omitted" as const, text: `Omitted "${pbActs.get(o.playbook_activity_key)?.title ?? o.playbook_activity_key}"`, reason: o.reason.slice(0, 1500) })),
    ...acts.filter((x) => x.deviation_note).map((x) => ({ kind: (x.origin === "playbook" ? "changed" : "added") as "changed" | "added", text: `${x.origin === "playbook" ? "Changed" : "Added"} "${x.title}"`, reason: x.deviation_note! })),
  ];
  // any accepted playbook activity neither kept nor explained is flagged, never silently dropped
  const kept = new Set(acts.map((x) => x.playbook_activity_key));
  const explained = new Set(g.omitted.map((o) => o.playbook_activity_key));
  for (const [k, x] of pbActs) if (x.decision !== "rejected" && !kept.has(k) && !explained.has(k)) deviations.push({ kind: "omitted", text: `Omitted "${x.title}"`, reason: "Left out by the generator without an explanation — review before approval." });
  const synKeys = new Set<string>();
  const synergies = g.synergies.map((s) => ({
    key: uniqueKey(`${s.category}_${s.target}`, synKeys), category: s.category, description: s.description.slice(0, 1000), unit: s.unit, baseline: s.baseline, target: s.target, measurement: s.measurement,
    owner_crew_id: ownerFor(s.category === "cross_sell" || s.category === "revenue" ? "CCO" : "CFO", crew, a.leader_crew_id),
    supporting_activity_keys: s.supporting_activity_titles.flatMap((t) => acts.filter((y) => similarity(titleTokens(y.title), titleTokens(t)) >= 0.8).map((y) => y.key)).slice(0, 20),
    evidence_source: s.evidence_source.slice(0, 500), realisation_offset_days: Math.max(0, Math.min(1825, s.realisation_offset_days)),
  }));
  const content = finalisePlan({
    summary: g.summary.slice(0, 3000), integration_model: g.integration_model.slice(0, 200), workstreams, synergies,
    deviations: deviations.slice(0, 60), risks: g.risks.slice(0, 30).map((x) => ({ text: x.text.slice(0, 1000), mitigation: x.mitigation.slice(0, 1000), source: x.source.slice(0, 300) })),
    decisions_required: g.decisions_required.slice(0, 30).map((d) => ({ text: d.text.slice(0, 1000), by: d.by.slice(0, 120) })), missing_information: g.missing_information.slice(0, 30).map((m) => m.slice(0, 500)), critical_path: [],
  });
  return { content, generator: "claude", model: r.model, note: `Generated by ${r.model}. ${deviations.length} deviations from the playbook are listed for review.` };
}
