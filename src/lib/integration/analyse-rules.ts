// Rule-based playbook extractor: used when no AI provider is configured, and labelled as
// such wherever its output appears. It reads the structure of company documents (sections,
// list items, table rows), recognises timing, owners, approvals, completion criteria and
// dependencies, merges the same activity across documents, and decides the basis from the
// evidence: written policy → established; three or more previous integrations →
// established (consistently evidenced); otherwise inferred. Timing disagreements become
// conflicts; lessons from reviews become lessons and conflicts. Additions not found in the
// documents are labelled as recommendations and wait for management to accept them.
import type { SourceChunk } from "./grounding";
import { omit, slug, timingLabel, uniqueKey, type Activity, type Basis, type Citation, type PlaybookContent, type Timing, type Workstream } from "./schema";

const POLICY_TYPES = new Set(["playbook", "sop"]);
const STRATEGY_TYPES = new Set(["strategy", "board_paper", "ic_paper"]);
const REVIEW_TYPES = new Set(["post_acquisition_review", "lessons_learned"]);

export const BUILDING_BLOCKS: Array<{ key: string; name: string; fn: string; re: RegExp; objective: string }> = [
  { key: "governance", name: "Strategy and governance", fn: "Integration leader", re: /\b(strategy and governance|governance|steering|integration management|decision rights)\b/i, objective: "Leadership, decision rights, reporting and the target operating model." },
  { key: "finance", name: "Finance", fn: "CFO", re: /\b(finance|financial|billing|bank|treasury|accounting|month-end)\b/i, objective: "Financial control, reporting, billing and cash from Day 1." },
  { key: "commercial", name: "Commercial", fn: "CCO", re: /\b(commercial|sales|go-to-market|crm|cross-sell)/i, objective: "Customers, account ownership, CRM, pricing and cross-selling." },
  { key: "people", name: "People", fn: "People Director", re: /\b(people|hr|human resources|payroll|employees?|retention arrangements)\b/i, objective: "Organisation, key people, payroll and internal communication." },
  { key: "technology", name: "Technology", fn: "CTO", re: /\b(technology|systems|cyber|security|identity|single sign-on|product migration|penetration)\b/i, objective: "Systems, security, identity, data and product integration." },
  { key: "operations", name: "Operations", fn: "COO", re: /\b(operations|procurement|suppliers?|service quality|capacity)\b/i, objective: "Processes, procurement, suppliers and service quality." },
  { key: "legal", name: "Legal and compliance", fn: "General Counsel", re: /\b(legal|compliance|regulatory|insurance|licen[cs]e|consents?|ico|data protection|statutory)\b/i, objective: "Regulatory obligations, consents, insurance and filings." },
  { key: "brand", name: "Brand and communications", fn: "CMO", re: /\b(brand|communications|website|marketing)\b/i, objective: "Brand architecture, announcements and marketing integration." },
];

type Special = "philosophy" | "types" | "risks" | "kpis" | "synergy" | "lessons" | "ignore";
const SPECIAL: Array<[RegExp, Special]> = [
  [/philosophy|principles/i, "philosophy"],
  [/acquisition types|integration models?|when to use/i, "types"],
  [/risks?|escalation/i, "risks"],
  [/\bkpis?\b|measures of success/i, "kpis"],
  [/synerg/i, "synergy"],
  [/lessons?|what went wrong|went well|recurring|differently|status at|outcome/i, "lessons"],
];

interface Item {
  text: string;
  chunk: SourceChunk;
  section: string | null;
  row?: string[];
  header?: string[];
}

function blockFor(s: string | null) {
  if (!s) return null;
  const clean = s.replace(/^workstream:\s*/i, "").replace(/^slide \d+:\s*/i, "").replace(/\bworkstream\b/i, "").trim();
  return BUILDING_BLOCKS.find((b) => b.name.toLowerCase() === clean.toLowerCase()) ?? BUILDING_BLOCKS.find((b) => b.re.test(clean)) ?? null;
}
const specialFor = (s: string | null): Special | null => (s ? (SPECIAL.find(([re]) => re.test(s))?.[1] ?? null) : null);

/** Lines → logical items: bullets, numbered items, table rows; wrapped PDF lines are rejoined. */
function itemsOf(chunk: SourceChunk): Item[] {
  const out: Item[] = [];
  let section = chunk.heading;
  let header: string[] | undefined;
  const lines = chunk.text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.includes(" | ")) {
      const cells = line.split(" | ").map((c) => c.trim());
      if (!header && cells.some((c) => /^(workstream|activity|task)$/i.test(c))) {
        header = cells.map((c) => c.toLowerCase());
        continue;
      }
      out.push({ text: cells.join(" — "), chunk, section, row: cells, header });
      continue;
    }
    const bullet = /^([-•*]|\d+[.)])\s+/.test(line);
    const words = line.split(/\s+/).length;
    if (!bullet && words <= 5 && !/[.:;,]$/.test(line) && (blockFor(line) || specialFor(line))) {
      section = line;
      continue;
    }
    const text = line.replace(/^([-•*]|\d+[.)])\s+/, "");
    const prev = out.at(-1);
    if (!bullet && prev && !prev.row && !/[.!?)]$/.test(prev.text)) prev.text += ` ${text}`;
    else out.push({ text, chunk, section });
  }
  return out;
}

function parseTiming(s: string): Timing | null {
  const t = s.toLowerCase();
  let m: RegExpMatchArray | null;
  if (/pre-?completion|before completion|during diligence|prior to completion/.test(t)) return { anchor: "pre_completion", start_offset_days: -30, due_offset_days: -1, label: "Pre-completion" };
  if ((m = t.match(/within (\d+) working days/))) return days(Math.ceil((Number(m[1]) * 7) / 5), `Within ${m[1]} working days`);
  if ((m = t.match(/(?:first|within) (\d+) days/))) return days(Number(m[1]), `First ${m[1]} days`);
  if ((m = t.match(/\bday (\d+)\b/)) && m[1] !== "1") return days(Number(m[1]), `Day ${m[1]}`);
  if (/\bday 1\b|on completion|completion day/.test(t)) return { anchor: "day_1", start_offset_days: 0, due_offset_days: 0, label: "Day 1" };
  if ((m = t.match(/\bmonth (\d+)\b|within (\d+) months/))) return days(Number(m[1] ?? m[2]) * 30, `Month ${m[1] ?? m[2]}`);
  if (/\bweekly|monthly|ongoing|throughout/.test(t)) return { anchor: "ongoing", start_offset_days: 0, due_offset_days: 100, label: "Ongoing" };
  return null;
}
const days = (n: number, label: string): Timing => ({ anchor: "days", start_offset_days: Math.max(1, n - Math.min(30, Math.round(n / 2))), due_offset_days: n, label });

const STOP = new Set(["the", "a", "an", "and", "of", "to", "for", "on", "onto", "into", "in", "with", "from", "our", "every", "all", "clinara", "acquired", "acquisition", "company", "be", "by", "is", "are", "it", "its", "at", "as", "first", "days", "day", "within", "after", "before", "not"]);
const SYN: Record<string, string> = {
  announcement: "communication", announce: "communication", communications: "communication", email: "", records: "record", migration: "migrate", migrated: "migrate",
  migrating: "migrate", cleanse: "quality", cleansing: "quality", assessment: "quality", assess: "quality", accounts: "account", owners: "owner", customers: "customer",
};
const stem = (w: string) => (SYN[w] ?? w).replace(/(ing|ed|es|s)$/, "");
export const titleTokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 -]+/g, " ").split(/[\s-]+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem).filter(Boolean));
export function similarity(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const min = Math.min(a.size, b.size);
  return min && inter >= 2 ? inter / min : 0;
}

interface Parsed {
  title: string;
  owner: string | null;
  timing: Timing | null;
  approval: string | null;
  criteria: string;
  critical: boolean;
  milestone: boolean;
  dependsText: string | null;
  quote: string;
  item: Item;
}

function parseActivity(it: Item): Parsed | null {
  const s = it.text;
  if (it.row && it.header) {
    const col = (n: string) => it.row![it.header!.indexOf(n)] ?? "";
    const title = col("activity") || col("task");
    if (!title) return null;
    return {
      title, owner: col("owner") || null, timing: parseTiming(col("timing") || title), approval: null, criteria: "", critical: false, milestone: false, dependsText: null,
      quote: it.row.slice(0, 4).join(" | "), item: it,
    };
  }
  const quote = s.slice(0, 400);
  const owner = s.match(/\((?:owner|accountable|responsible):\s*([^)]+)\)/i)?.[1]?.trim() ?? null;
  const approval = s.match(/\bapproval:\s*([^.]+)/i)?.[1]?.trim() ?? null;
  const criteria = s.match(/\b(?:completion criteria|done when):\s*(.+?)(?:\.\s*(?:[A-Z]|$)|$)/i)?.[1]?.trim() ?? "";
  const dependsText = s.match(/\bdepends on:\s*([^.]+)/i)?.[1]?.trim() ?? null;
  const critical = /critical path/i.test(s);
  const milestone = /\bmilestone\b/i.test(s);
  const timing = parseTiming(s);
  let title = s
    .replace(/\((?:owner|accountable|responsible):[^)]+\)/gi, "")
    .replace(/\b(?:approval|completion criteria|done when|depends on):[^.]*\.?/gi, "")
    .replace(/\b(critical path|milestone)\b\.?/gi, "")
    .replace(/^(pre-?completion|day \d+|first \d+ days|within \d+ (?:working )?days|weekly|monthly|month \d+)\s*[:,-]\s*/i, "")
    .replace(/,?\s*(?:because|not on|rather than|so that)\b.*$/i, "")
    .replace(/\s*\b(?:within \d+ (?:working )?days(?: (?:after|of) completion)?|(?:on|by) day \d+|before completion|after completion|before (?:the )?crm migration)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .trim();
  if (title.length < 4) return null;
  title = title[0].toUpperCase() + title.slice(1);
  if (title.length > 160) title = title.slice(0, 157).replace(/\s+\S*$/, "") + "…";
  return { title, owner, timing, approval, criteria, critical, milestone, dependsText, quote, item: it };
}

const cite = (it: Item, quote: string): Citation => ({ source_id: it.chunk.source_id, chunk_id: it.chunk.id, quote: quote.slice(0, 600), source_title: it.chunk.source_title });

export function analyseWithRules(chunks: SourceChunk[]): PlaybookContent {
  const items = chunks.flatMap(itemsOf);
  const sourceType = new Map(chunks.map((c) => [c.source_id, c.doc_type]));
  const sourceTitle = new Map(chunks.map((c) => [c.source_id, c.source_title]));
  const philosophy: PlaybookContent["philosophy"] = [];
  const types: PlaybookContent["acquisition_types"] = [];
  const risks: PlaybookContent["risks"] = [];
  const kpis: PlaybookContent["kpis"] = [];
  const synergy: PlaybookContent["synergy_rules"] = [];
  const lessons: PlaybookContent["lessons"] = [];
  const parsed: Array<Parsed & { block: (typeof BUILDING_BLOCKS)[number] }> = [];
  const keys = new Set<string>();
  const basisOf = (t: string | undefined): Basis => (t && (POLICY_TYPES.has(t) || STRATEGY_TYPES.has(t)) ? "established" : "inferred");

  for (const it of items) {
    const type = sourceType.get(it.chunk.source_id);
    const sp = specialFor(it.section) ?? (/^lesson:/i.test(it.text) ? "lessons" : null);
    if (type && STRATEGY_TYPES.has(type)) {
      if (/integration approach|integrate|agreed strategy|value creation/i.test(it.text)) philosophy.push({ text: it.text, basis: "established", citations: [cite(it, it.text)] });
      continue;
    }
    if (sp === "philosophy") { philosophy.push({ text: it.text, basis: basisOf(type), citations: [cite(it, it.text)] }); continue; }
    if (sp === "types") {
      const [name, ...rest] = it.text.split(":");
      if (rest.length) types.push({ name: name.trim().slice(0, 120), when: rest.join(":").trim(), basis: basisOf(type), citations: [cite(it, it.text)] });
      continue;
    }
    if (sp === "risks") {
      const m = it.text.match(/^(?:risk:\s*)?(.+?)\.\s*(escalate.*)$/i);
      risks.push({
        key: uniqueKey(`risk_${(m?.[1] ?? it.text).slice(0, 40)}`, keys), description: (m?.[1] ?? it.text).replace(/^risk:\s*/i, ""), escalation_trigger: m?.[2] ?? "",
        escalate_to: m?.[2]?.match(/escalate to (?:the )?([a-z ]+?)(?: if| on|$)/i)?.[1]?.trim() ?? "", basis: basisOf(type), citations: [cite(it, it.text)],
      });
      continue;
    }
    if (sp === "kpis") {
      const m = it.text.match(/^(.+?)\s*\((?:target[^)]*?)\s*([^)]*)\)/i);
      kpis.push({ key: uniqueKey(`kpi_${it.text.slice(0, 30)}`, keys), name: (m?.[1] ?? it.text).replace(/\.$/, ""), target: it.text.match(/\(target ([^)]+)\)/i)?.[1] ?? "", basis: basisOf(type), citations: [cite(it, it.text)] });
      continue;
    }
    if (sp === "synergy") { synergy.push({ text: it.text, basis: basisOf(type), citations: [cite(it, it.text)] }); continue; }
    if (sp === "lessons" || (type && REVIEW_TYPES.has(type))) {
      lessons.push({ key: uniqueKey(`lesson_${it.text.slice(0, 30)}`, keys), text: it.text.replace(/^lesson:\s*/i, ""), citations: [cite(it, it.text)], applied_in: null });
      continue;
    }
    // planned-vs-actual rows: late items are lessons as well as activities
    if (it.row && it.header) {
      const status = it.row[it.header.indexOf("status")] ?? "";
      const notes = it.row[it.header.indexOf("notes")] ?? "";
      if (/late|delay|slip/i.test(`${status} ${notes}`)) {
        const planned = it.row[it.header.indexOf("planned")];
        const actual = it.row[it.header.indexOf("actual")];
        const lateBy = planned && actual ? Math.round((Date.parse(actual) - Date.parse(planned)) / 86400000) : null;
        lessons.push({
          key: uniqueKey(`lesson_${it.row[1] ?? it.text}`.slice(0, 40), keys),
          text: `${sourceTitle.get(it.chunk.source_id)}: "${it.row[it.header.indexOf("activity")]}" finished ${lateBy !== null ? `${lateBy} days ` : ""}late${notes ? ` — ${notes}` : ""}.`,
          citations: [cite(it, it.row.join(" | "))], applied_in: null,
        });
      }
    }
    const block = it.row && it.header ? blockFor(it.row[it.header.indexOf("workstream")] ?? null) : blockFor(it.section);
    if (!block) continue;
    const p = parseActivity(it);
    if (p && (p.timing || p.owner || it.row)) parsed.push({ ...p, block });
  }

  // Merge the same activity across documents
  type Cluster = { block: (typeof BUILDING_BLOCKS)[number]; members: typeof parsed; tokens: Set<string>; lead: Set<string> };
  const clusters: Cluster[] = [];
  for (const p of parsed) {
    const tk = titleTokens(p.title);
    const c = clusters
      .filter((x) => x.block.key === p.block.key)
      .map((x) => ({ x, s: similarity(x.lead, tk) }))
      .filter((m) => m.s >= 0.8)
      .sort((a, b) => b.s - a.s)[0]?.x;
    if (c) {
      c.members.push(p);
      for (const t of tk) c.tokens.add(t);
    } else clusters.push({ block: p.block, members: [p], tokens: new Set(tk), lead: tk });
  }

  const conflicts: PlaybookContent["conflicts"] = [];
  const gaps: PlaybookContent["gaps"] = [];
  const actKeys = new Set<string>();
  const activities: Array<Activity & { block: string; tokens: Set<string>; dependsText: string[] }> = [];
  for (const c of clusters) {
    const policy = c.members.filter((m) => POLICY_TYPES.has(sourceType.get(m.item.chunk.source_id) ?? ""));
    const dealSources = new Set(c.members.filter((m) => !POLICY_TYPES.has(sourceType.get(m.item.chunk.source_id) ?? "")).map((m) => m.item.chunk.source_id));
    const basis: Basis = policy.length || dealSources.size >= 3 ? "established" : "inferred";
    const lead = policy[0] ?? c.members.find((m) => m.criteria) ?? [...c.members].sort((a, b) => a.title.length - b.title.length)[0];
    const timed = c.members.filter((m) => m.timing);
    const timing = (policy.find((m) => m.timing) ?? timed[0])?.timing ?? { anchor: "days" as const, start_offset_days: 1, due_offset_days: 30, label: "First 30 days" };
    const distinct = new Map<string, (typeof c.members)[number][]>();
    for (const m of timed) {
      const sig = `${m.timing!.anchor}:${Math.round(m.timing!.due_offset_days / 7)}`;
      distinct.set(sig, [...(distinct.get(sig) ?? []), m]);
    }
    const sourceList = [...new Set(c.members.map((m) => sourceTitle.get(m.item.chunk.source_id)))];
    const k = uniqueKey(lead.title, actKeys);
    if (distinct.size > 1) {
      conflicts.push({
        key: `timing_${k}`.slice(0, 64),
        topic: `Timing of "${lead.title}"`,
        positions: [...distinct.values()].map((ms) => ({ text: `${ms[0].timing!.label} — ${[...new Set(ms.map((m) => sourceTitle.get(m.item.chunk.source_id)))].join(", ")}`, citations: ms.slice(0, 3).map((m) => cite(m.item, m.quote)) })),
        resolution: "",
      });
    }
    const owner = c.members.find((m) => m.owner)?.owner ?? "";
    activities.push({
      key: k,
      title: lead.title,
      description: "",
      accountable_function: owner || c.block.fn,
      timing: { ...timing, label: timing.label || timingLabel(timing) },
      milestone: c.members.some((m) => m.milestone),
      critical: c.members.some((m) => m.critical),
      completion_criteria: c.members.find((m) => m.criteria)?.criteria ?? "",
      evidence_required: "",
      approval_required: c.members.find((m) => m.approval)?.approval ?? null,
      depends_on: [],
      basis,
      rationale:
        basis === "established" && policy.length
          ? `Written company practice (${sourceList.join(", ")}).`
          : basis === "established"
            ? `Consistently evidenced in ${dealSources.size} previous integrations (${sourceList.join(", ")}), though not in the written playbook.`
            : `Done in a previous integration (${sourceList.join(", ")}) but not written into company policy.`,
      citations: c.members.slice(0, 6).map((m) => cite(m.item, m.quote)),
      decision: "accepted",
      human_only: false,
      human_only_reason: null,
      applies_to: c.members.some((m) => /partial integration/i.test(m.item.text)) ? ["Partial integration"] : [],
      block: c.block.key,
      tokens: c.tokens,
      dependsText: c.members.flatMap((m) => (m.dependsText ? [m.dependsText] : [])),
    });
    if (!owner) gaps.push({ key: `owner_${k}`.slice(0, 64), question: `Who is accountable for "${lead.title}"?`, context: "No owner is named in the selected documents; the workstream's usual function has been assumed.", answer: "" });
    if ((c.members.some((m) => m.critical) || timing.anchor === "day_1") && !c.members.some((m) => m.criteria))
      gaps.push({ key: `criteria_${k}`.slice(0, 64), question: `What are the completion criteria for "${lead.title}"?`, context: "It is on the critical path or due on Day 1, but no document says how completion is judged.", answer: "" });
  }

  // Dependencies: "Depends on: CRM migration" → the activity whose title matches best
  for (const a of activities) {
    for (const d of a.dependsText) {
      const tk = titleTokens(d);
      const best = activities.filter((b) => b !== a).map((b) => ({ b, s: [...tk].filter((t) => b.tokens.has(t)).length / Math.max(1, tk.size) })).sort((x, y) => y.s - x.s)[0];
      if (best && best.s >= 0.6 && !a.depends_on.includes(best.b.key)) a.depends_on.push(best.b.key);
    }
  }

  // Lessons that say something should happen earlier than an existing activity → conflicts
  for (const l of lessons) {
    const t = parseTiming(l.text);
    if (!t || t.anchor !== "pre_completion") continue;
    const tk = titleTokens(l.text);
    const match = activities
      .filter((a) => a.timing.anchor !== "pre_completion")
      .map((a) => ({ a, s: similarity(a.tokens, tk) }))
      .filter((m) => m.s >= 0.66)
      .sort((x, y) => y.s - x.s)[0]?.a;
    if (match && conflicts.some((c) => c.key === `lesson_${match.key}`.slice(0, 64))) continue;
    if (match) {
      conflicts.push({
        key: `lesson_${match.key}`.slice(0, 64),
        topic: `When should "${match.title}" happen?`,
        positions: [
          { text: `${match.timing.label} — current practice`, citations: match.citations.slice(0, 2) },
          { text: `Before completion — lessons from previous integrations`, citations: l.citations },
        ],
        resolution: "",
      });
      l.applied_in = match.key;
    }
  }

  // Recurring problems (the same activity late in more than one integration)
  const lateLessons = lessons.filter((l) => /late|delay|slipp/i.test(l.text));
  for (const a of activities) {
    const hits = lateLessons.filter((l) => similarity(a.tokens, titleTokens(l.text)) >= 0.66);
    const deals = new Set(hits.flatMap((h) => h.citations.map((c) => c.source_id)));
    if (deals.size >= 2) {
      a.critical = true;
      a.rationale += ` Delayed in ${deals.size} previous integrations, so treated as critical-path.`;
    }
  }

  const byBlock = new Map<string, typeof activities>();
  for (const a of activities) byBlock.set(a.block, [...(byBlock.get(a.block) ?? []), a]);
  const workstreams: Workstream[] = BUILDING_BLOCKS.filter((b) => byBlock.has(b.key)).map((b) => {
    const acts = byBlock.get(b.key)!.sort((x, y) => x.timing.due_offset_days - y.timing.due_offset_days);
    const basis: Basis = acts.some((a) => a.basis === "established") ? "established" : "inferred";
    return {
      key: b.key,
      name: b.name,
      objective: b.objective,
      accountable_function: b.fn,
      basis,
      rationale: `${acts.length} activities found across ${new Set(acts.flatMap((a) => a.citations.map((c) => c.source_id))).size} documents.`,
      citations: acts.flatMap((a) => a.citations).slice(0, 3),
      decision: "accepted",
      applies_to: [],
      activities: acts.map((a) => omit(a, ["block", "tokens", "dependsText"])),
    };
  });

  // Recommendations: common integration practice the documents do not cover
  const has = (re: RegExp) => workstreams.some((w) => w.activities.some((a) => re.test(a.title)));
  const recommend = (block: string, a: Omit<Activity, "key" | "basis" | "citations" | "decision" | "human_only" | "human_only_reason" | "applies_to" | "depends_on" | "description" | "evidence_required"> & { description?: string; depends_on?: string[] }) => {
    let w = workstreams.find((x) => x.key === block);
    if (!w) {
      const b = BUILDING_BLOCKS.find((x) => x.key === block)!;
      w = { key: b.key, name: b.name, objective: b.objective, accountable_function: b.fn, basis: "recommended", rationale: "Not covered by the selected documents.", citations: [], decision: "pending", applies_to: [], activities: [] };
      workstreams.push(w);
    }
    w.activities.push({ key: uniqueKey(a.title, actKeys), basis: "recommended", citations: [], decision: "pending", human_only: false, human_only_reason: null, applies_to: [], depends_on: a.depends_on ?? [], description: a.description ?? "", evidence_required: "", ...a });
  };
  if (!has(/synerg|baseline/i))
    recommend("governance", { title: "Baseline the investment-case synergies", accountable_function: "CFO", timing: { anchor: "pre_completion", start_offset_days: -14, due_offset_days: -1, label: "Pre-completion" }, milestone: false, critical: false, completion_criteria: "Each synergy has a baseline, target, owner and measurement source agreed by the CFO.", approval_required: "CFO", rationale: "The documents require synergy tracking but no activity sets the baselines it needs." });
  if (!has(/post-?(?:integration|acquisition) review|lessons learned|retrospective/i))
    recommend("governance", { title: "Post-integration review", accountable_function: "Integration leader", timing: { anchor: "days", start_offset_days: 330, due_offset_days: 365, label: "Month 12" }, milestone: true, critical: false, completion_criteria: "Review of plan versus actual, synergies achieved and lessons presented to the Board.", approval_required: null, rationale: "Previous reviews exist, but no activity schedules one; a fixed review lets each integration improve the playbook." });
  if (!has(/penetration|security assessment|cyber/i))
    recommend("technology", { title: "Cybersecurity assessment of the acquired company", accountable_function: "CTO", timing: { anchor: "days", start_offset_days: 1, due_offset_days: 30, label: "First 30 days" }, milestone: false, critical: false, completion_criteria: "Assessment complete; high-severity findings have owners and dates.", approval_required: null, rationale: "No security assessment is described in the selected documents." });

  return {
    summary: `Built by the rule-based extractor from ${new Set(chunks.map((c) => c.source_id)).size} documents: ${workstreams.length} workstreams, ${workstreams.reduce((n, w) => n + w.activities.length, 0)} activities, ${conflicts.length} conflicts and ${gaps.length} questions for management.`,
    philosophy,
    acquisition_types: types,
    workstreams,
    risks,
    kpis,
    synergy_rules: synergy,
    conflicts,
    gaps: gaps.slice(0, 30),
    lessons: lessons.filter((l) => l.text.length >= 25 && !/fictional/i.test(l.text)),
  };
}

export { slug };
