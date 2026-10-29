// Continuous improvement: compare an integration's plan with what actually happened, look
// for the same problem in previous integrations, and propose evidence-backed changes to the
// master playbook. Proposals are structured operations, applied only when management
// accepts them — and then only to a new draft version that still needs approval.
import { z } from "zod";
import { similarity, titleTokens } from "./analyse-rules";
import { callStructured, claudeConfigured, UNTRUSTED, type ClaudeClient } from "./claude";
import type { SourceChunk } from "./grounding";
import { omit, playbookContent, timing, uniqueKey, type PlaybookContent } from "./schema";
import { assessSynergy, daysBetween, verifiedComplete, type ActivityLike, type ActualLike, type DependencyLike, type SynergyLike } from "@/lib/domain/integration";

export const changeOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_timing"), activity_key: z.string(), timing, critical: z.boolean().optional() }),
  z.object({ op: z.literal("set_critical"), activity_key: z.string(), critical: z.boolean() }),
  z.object({ op: z.literal("edit_criteria"), activity_key: z.string(), completion_criteria: z.string().max(1000) }),
  z.object({ op: z.literal("add_dependency"), activity_key: z.string(), depends_on: z.string() }),
  z.object({ op: z.literal("set_applies_to"), activity_key: z.string(), applies_to: z.array(z.string().max(80)).max(10) }),
  z.object({
    op: z.literal("add_activity"),
    workstream_key: z.string(),
    activity: z.object({ title: z.string().min(2).max(300), accountable_function: z.string().max(120), timing, completion_criteria: z.string().max(1000), critical: z.boolean(), rationale: z.string().max(1500) }),
  }),
]);
export type ChangeOp = z.infer<typeof changeOp>;

export function describeChange(c: ChangeOp, p: PlaybookContent) {
  const title = (k: string) => p.workstreams.flatMap((w) => w.activities).find((a) => a.key === k)?.title ?? k;
  switch (c.op) {
    case "set_timing": return `Move "${title(c.activity_key)}" to ${c.timing.label}${c.critical ? " and make it critical-path" : ""}`;
    case "set_critical": return `${c.critical ? "Make" : "Remove"} "${title(c.activity_key)}" ${c.critical ? "critical-path" : "from the critical path"}`;
    case "edit_criteria": return `Completion criteria for "${title(c.activity_key)}": ${c.completion_criteria}`;
    case "add_dependency": return `"${title(c.activity_key)}" depends on "${title(c.depends_on)}"`;
    case "set_applies_to": return `"${title(c.activity_key)}" applies to ${c.applies_to.join(", ") || "all acquisitions"}`;
    case "add_activity": return `Add "${c.activity.title}" (${c.activity.timing.label}) to ${p.workstreams.find((w) => w.key === c.workstream_key)?.name ?? c.workstream_key}`;
  }
}

/** Apply an accepted change to a copy of the playbook (for a new draft version). */
export function applyChange(p: PlaybookContent, c: ChangeOp): PlaybookContent {
  const next: PlaybookContent = structuredClone(p);
  const act = (k: string) => {
    const a = next.workstreams.flatMap((w) => w.activities).find((x) => x.key === k);
    if (!a) throw new Error(`The playbook no longer has the activity "${k}"`);
    return a;
  };
  switch (c.op) {
    case "set_timing": {
      const a = act(c.activity_key);
      a.timing = c.timing;
      if (c.critical !== undefined) a.critical = c.critical;
      break;
    }
    case "set_critical": act(c.activity_key).critical = c.critical; break;
    case "edit_criteria": act(c.activity_key).completion_criteria = c.completion_criteria; break;
    case "add_dependency": {
      act(c.depends_on);
      const a = act(c.activity_key);
      if (!a.depends_on.includes(c.depends_on)) a.depends_on.push(c.depends_on);
      break;
    }
    case "set_applies_to": act(c.activity_key).applies_to = c.applies_to; break;
    case "add_activity": {
      const w = next.workstreams.find((x) => x.key === c.workstream_key);
      if (!w) throw new Error(`The playbook no longer has the workstream "${c.workstream_key}"`);
      const keys = new Set(next.workstreams.flatMap((x) => x.activities.map((a) => a.key)));
      w.activities.push({
        key: uniqueKey(c.activity.title, keys), title: c.activity.title, description: "", accountable_function: c.activity.accountable_function, timing: c.activity.timing,
        milestone: false, critical: c.activity.critical, completion_criteria: c.activity.completion_criteria, evidence_required: "", approval_required: null, depends_on: [],
        basis: "inferred", rationale: `Added after a post-integration review: ${c.activity.rationale}`.slice(0, 1500), citations: [], decision: "accepted", human_only: false, human_only_reason: null, applies_to: [],
      });
      break;
    }
  }
  return playbookContent.parse(next);
}

export interface ReviewInput {
  acquisition: { name: string; completion_date: string | null; integration_model: string };
  playbook: PlaybookContent;
  activities: Array<ActivityLike & { playbook_key: string | null; origin: string; workstream: string }>;
  deps: DependencyLike[];
  synergies: SynergyLike[];
  actuals: ActualLike[];
  interventions: Array<{ title: string; status: string }>;
  history: SourceChunk[];
  today: string;
}

export interface Proposal {
  title: string;
  what_happened: string;
  evidence: Array<{ kind: "this_integration" | "document"; text: string; source_id?: string; chunk_id?: string; source_title?: string }>;
  change: ChangeOp;
  expected_benefit: string;
  applies_to: string;
}

export interface ReviewContent {
  summary: string;
  milestones: { total: number; on_time: number; late: number; average_slip_days: number };
  delays: Array<{ title: string; workstream: string; slip_days: number; delayed_dependents: string[] }>;
  unnecessary: string[];
  unexpected: string[];
  synergies: Array<{ description: string; target: number; realised: number | null; status: string; supporting_done: string }>;
  interventions: Array<{ title: string; status: string }>;
  patterns: Array<{ theme: string; occurrences: number; sources: string[] }>;
  proposals: Proposal[];
  generator: "claude" | "rules";
}

const slipOf = (a: ActivityLike, today: string) => {
  if (!a.baseline_due_date) return 0;
  const end = a.status === "done" && a.completed_at ? a.completed_at.slice(0, 10) : a.status === "not_needed" ? a.baseline_due_date : today;
  return Math.max(0, daysBetween(a.baseline_due_date, end));
};

export function reviewIntegration(i: ReviewInput): ReviewContent {
  const byId = new Map(i.activities.map((a) => [a.id, a]));
  const milestones = i.activities.filter((a) => a.milestone || a.critical);
  const slips = i.activities.map((a) => ({ a, slip: slipOf(a, i.today) }));
  const delays = slips
    .filter((s) => s.slip >= 7)
    .sort((x, y) => y.slip - x.slip)
    .map(({ a, slip }) => ({
      a,
      title: a.title,
      workstream: a.workstream,
      slip_days: slip,
      delayed_dependents: i.deps.filter((d) => d.from_activity_id === a.id).map((d) => byId.get(d.to_activity_id)).filter((x): x is NonNullable<typeof x> => !!x && slipOf(x, i.today) >= 7).map((x) => x.title),
    }));
  const late = milestones.filter((a) => slipOf(a, i.today) > 0);
  const synergies = i.synergies.map((s) => {
    const r = assessSynergy(s, i.actuals, byId, i.today);
    return { s, r, row: { description: s.description, target: s.target, realised: r.realised, status: r.status, supporting_done: `${r.supportingDone}/${r.supportingTotal}` } };
  });

  // Recurring problems: the same activity delayed in previous integrations too
  const reviewChunks = i.history.filter((c) => ["post_acquisition_review", "lessons_learned", "integration_plan", "checklist"].includes(c.doc_type));
  const patterns: ReviewContent["patterns"] = [];
  const proposals: Proposal[] = [];
  const pbActs = i.playbook.workstreams.flatMap((w) => w.activities.map((a) => ({ a, w })));
  for (const d of delays.filter((x) => x.slip_days >= 14)) {
    const tk = titleTokens(d.title);
    const hits = reviewChunks.filter((c) => /late|delay|slipp|longer than planned/i.test(c.text) && c.text.split(/\n/).some((line) => /late|delay|slipp|longer/i.test(line) && similarity(titleTokens(line), tk) >= 0.5));
    const sources = [...new Set(hits.map((h) => h.source_title))];
    if (!sources.length) continue;
    patterns.push({ theme: `"${d.title}" delayed`, occurrences: sources.length + 1, sources: [`${i.acquisition.name} (this integration)`, ...sources] });
    const pb = (d.a.playbook_key && pbActs.find((x) => x.a.key === d.a.playbook_key)) || pbActs.find((x) => similarity(titleTokens(x.a.title), tk) >= 0.8);
    if (!pb) continue;
    const evidence: Proposal["evidence"] = [
      { kind: "this_integration", text: `${i.acquisition.name}: "${d.title}" finished ${d.slip_days} days after its approved date${d.delayed_dependents.length ? `, delaying ${d.delayed_dependents.map((x) => `"${x}"`).join(", ")}` : ""}.` },
      ...hits.slice(0, 4).map((h) => ({ kind: "document" as const, text: h.text.split(/\n/).find((line) => /late|delay|slipp|longer/i.test(line))!.slice(0, 400), source_id: h.source_id, chunk_id: h.id, source_title: h.source_title })),
    ];
    const occurrences = sources.length + 1;
    if (pb.a.timing.anchor !== "pre_completion") {
      proposals.push({
        title: `Move "${pb.a.title}" before completion`,
        what_happened: `"${pb.a.title}" was late in ${occurrences} integrations (${[i.acquisition.name, ...sources].join("; ")}) and each time held up ${d.delayed_dependents.length ? d.delayed_dependents.join(", ") : "dependent work"}.`,
        evidence,
        change: { op: "set_timing", activity_key: pb.a.key, timing: { anchor: "pre_completion", start_offset_days: -28, due_offset_days: -1, label: "Pre-completion" }, critical: true },
        expected_benefit: `Dependent work (${d.delayed_dependents.join(", ") || "the commercial integration"}) can start on time, protecting the related synergies.`,
        applies_to: i.playbook.acquisition_types.map((t) => t.name).join(", ") || "All acquisitions",
      });
    } else if (!pb.a.critical) {
      proposals.push({ title: `Make "${pb.a.title}" critical-path`, what_happened: `It was late in ${occurrences} integrations.`, evidence, change: { op: "set_critical", activity_key: pb.a.key, critical: true }, expected_benefit: "Earlier escalation when it slips.", applies_to: "All acquisitions" });
    }
  }

  // Completed work that did not produce the benefit → add a checkpoint
  for (const { s, r } of synergies) {
    if (r.status === "off_track" && r.supportingTotal > 0 && r.supportingDone === r.supportingTotal) {
      const gov = i.playbook.workstreams.find((w) => /governance/i.test(w.name)) ?? i.playbook.workstreams[0];
      if (!gov || gov.activities.some((a) => /synergy checkpoint/i.test(a.title))) continue;
      proposals.push({
        title: "Add a 100-day synergy checkpoint",
        what_happened: `In ${i.acquisition.name} every activity supporting "${s.description}" was completed, but only ${Math.round((r.attainment ?? 0) * 100)}% of the expected benefit had been realised.`,
        evidence: [{ kind: "this_integration", text: `${s.description}: realised ${r.realised ?? 0} against ${Math.round(r.expectedByNow)} expected by ${r.realisedPeriod ?? i.today}; supporting activities ${r.supportingDone}/${r.supportingTotal} complete.` }],
        change: { op: "add_activity", workstream_key: gov.key, activity: { title: "Synergy checkpoint: benefits versus plan", accountable_function: "CFO", timing: { anchor: "days", start_offset_days: 90, due_offset_days: 100, label: "Day 100" }, completion_criteria: "Each synergy's verified actuals compared with plan; corrective actions agreed for any shortfall.", critical: false, rationale: "Completing the activities did not on its own deliver the benefit." } },
        expected_benefit: "Shortfalls are found and acted on while the integration team is still in place.",
        applies_to: "All acquisitions with synergy targets",
      });
    }
  }

  // Acquisition-specific work that the playbook did not have, and which history also points to
  for (const a of i.activities.filter((x) => x.origin === "acquisition" && verifiedComplete(x))) {
    const tk = titleTokens(a.title);
    const already = pbActs.some((x) => similarity(titleTokens(x.a.title), tk) >= 0.8);
    const hist = reviewChunks.filter((c) => similarity(titleTokens(c.text), tk) >= 0.5);
    if (already || !hist.length) continue;
    const w = i.playbook.workstreams.find((x) => x.name.toLowerCase() === a.workstream.toLowerCase());
    if (!w) continue;
    proposals.push({
      title: `Add "${a.title}" to the standard playbook`,
      what_happened: `${i.acquisition.name} needed "${a.title}", which the playbook did not include; previous documents point to the same need.`,
      evidence: [{ kind: "this_integration", text: `Added for ${i.acquisition.name} and completed.` }, ...hist.slice(0, 2).map((h) => ({ kind: "document" as const, text: h.text.slice(0, 300), source_id: h.source_id, chunk_id: h.id, source_title: h.source_title }))],
      change: { op: "add_activity", workstream_key: w.key, activity: { title: a.title, accountable_function: "", timing: { anchor: "days", start_offset_days: 1, due_offset_days: a.baseline_due_date && i.acquisition.completion_date ? Math.max(1, daysBetween(i.acquisition.completion_date, a.baseline_due_date)) : 30, label: "First 30 days" }, completion_criteria: a.completion_criteria, critical: false, rationale: "Needed in this and previous integrations." } },
      expected_benefit: "Future plans start with it rather than adding it late.",
      applies_to: "All acquisitions",
    });
  }

  const avg = late.length ? Math.round(late.reduce((n, a) => n + slipOf(a, i.today), 0) / late.length) : 0;
  return {
    summary: `${milestones.length - late.length} of ${milestones.length} milestones on time; ${delays.length} activities finished at least a week late; ${synergies.filter((x) => x.r.status === "achieved" || x.r.status === "on_track").length} of ${synergies.length} synergies on plan.`,
    milestones: { total: milestones.length, on_time: milestones.length - late.length, late: late.length, average_slip_days: avg },
    delays: delays.map((d) => omit(d, ["a"])).slice(0, 30),
    unnecessary: i.activities.filter((a) => a.status === "not_needed").map((a) => a.title),
    unexpected: i.activities.filter((a) => a.origin === "acquisition").map((a) => a.title),
    synergies: synergies.map((x) => x.row),
    interventions: i.interventions,
    patterns,
    proposals: dedupeProposals(proposals).slice(0, 12),
    generator: "rules",
  };
}

const dedupeProposals = (ps: Proposal[]) => ps.filter((p, i) => ps.findIndex((q) => q.title === p.title) === i);

const genReview = z.object({
  proposals: z.array(z.object({ title: z.string(), what_happened: z.string(), evidence_passages: z.array(z.string()), change: changeOp, expected_benefit: z.string(), applies_to: z.string() })),
});

/** Claude reviews the computed facts and the company's history and may add proposals. */
export async function reviewWithClaude(i: ReviewInput, base: ReviewContent, opts: { client?: ClaudeClient }) {
  if (!opts.client && !claudeConfigured()) return base;
  const ids = new Map(i.history.map((c, n) => [`P${n + 1}`, c]));
  const passages = [...ids].map(([k, c]) => `[${k}] (${c.source_title})\n${c.text}`).join("\n\n").slice(0, 300_000);
  const pb = i.playbook.workstreams.map((w) => ({ key: w.key, name: w.name, activities: w.activities.map((a) => ({ key: a.key, title: a.title, timing: a.timing, critical: a.critical })) }));
  const system = `You review a completed acquisition integration for its portfolio company and propose improvements to the company's master playbook. Management decides on every proposal; nothing changes without approval.
Only propose changes supported by the facts of this integration and the company's own history (cite passage ids). Each proposal is one structured change operation against an existing playbook activity or workstream key. Do not repeat the proposals already made. Never assess named individuals.
${UNTRUSTED}
UK English.`;
  const user = `FACTS (computed from the integration records):\n${JSON.stringify({ ...base, proposals: base.proposals.map((p) => p.title) })}\n\nPLAYBOOK:\n${JSON.stringify(pb)}\n\nHISTORY:\n${passages}`;
  const r = await callStructured(genReview, system, user, { client: opts.client, effort: "high", maxTokens: 32000 });
  const keys = new Set(i.playbook.workstreams.flatMap((w) => w.activities.map((a) => a.key)));
  const wkeys = new Set(i.playbook.workstreams.map((w) => w.key));
  const extra: Proposal[] = r.data.proposals.flatMap((p) => {
    const c = p.change;
    const valid = c.op === "add_activity" ? wkeys.has(c.workstream_key) : keys.has(c.activity_key) && (c.op !== "add_dependency" || keys.has(c.depends_on));
    if (!valid || !p.evidence_passages.length) return [];
    const evidence = p.evidence_passages.flatMap((pid) => {
      const ch = ids.get(pid);
      return ch ? [{ kind: "document" as const, text: ch.text.slice(0, 300), source_id: ch.source_id, chunk_id: ch.id, source_title: ch.source_title }] : [];
    });
    return evidence.length ? [{ title: p.title.slice(0, 300), what_happened: p.what_happened.slice(0, 3000), evidence, change: c, expected_benefit: p.expected_benefit.slice(0, 1500), applies_to: p.applies_to.slice(0, 300) }] : [];
  });
  return { ...base, proposals: dedupeProposals([...base.proposals, ...extra]).slice(0, 12), generator: "claude" as const };
}
