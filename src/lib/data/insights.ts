import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import { formatDate, formatMetric, formatMoney, formatPct, targetLabel } from "@/lib/domain/format";
import { buildAgenda, AGENDA_SECTIONS } from "@/lib/domain/agenda";
import { exceptionReason } from "@/lib/domain/metric-view";
import { periodLabel } from "@/lib/domain/metrics";
import { quarterLabel, quarterProgress } from "@/lib/domain/quarters";
import { MEETING_TYPE_LABEL, STATUS_META } from "@/lib/domain/status";
import { healthOf, type CompanySnapshot } from "./snapshot";

/**
 * Deterministic analysis of a company's operating plan. Every statement is either
 * a FACT derived from records (with source references) or a RECOMMENDATION
 * (clearly labelled as suggested). The AI layer only narrates over these.
 */

export interface SourceRef {
  id: string; // S1, S2…
  type: "metric" | "priority" | "goal" | "move" | "issue" | "action" | "meeting" | "decision" | "north_star";
  label: string;
  href: string;
}
export interface Fact {
  text: string;
  sources: string[];
}
export interface BriefSection {
  title: string;
  facts: Fact[];
  recommendations: string[];
}
export interface Brief {
  task: TaskKey;
  title: string;
  generatedAt: string;
  sections: BriefSection[];
  sources: SourceRef[];
}

export const TASKS = [
  { key: "performance", label: "Management performance summary" },
  { key: "deteriorating", label: "Deteriorating metrics" },
  { key: "priorities", label: "Priorities at risk" },
  { key: "recurring", label: "Recurring execution problems" },
  { key: "strategy", label: "Position vs strategic plan" },
  { key: "agenda", label: "Prepare next meeting agenda" },
  { key: "summary", label: "Draft last meeting summary" },
  { key: "commentary", label: "Monthly operating commentary" },
] as const;
export type TaskKey = (typeof TASKS)[number]["key"];

class Refs {
  list: SourceRef[] = [];
  private seen = new Map<string, string>();
  constructor(private base: string) {}
  add(type: SourceRef["type"], key: string, label: string, path: string) {
    const k = `${type}:${key}`;
    const existing = this.seen.get(k);
    if (existing) return existing;
    const id = `S${this.list.length + 1}`;
    this.seen.set(k, id);
    this.list.push({ id, type, label, href: `${this.base}${path}` });
    return id;
  }
}

export async function buildBrief(supabase: Supabase, s: CompanySnapshot, task: TaskKey): Promise<Brief> {
  const base = `/c/${s.company.slug}`;
  const refs = new Refs(base);
  const cur = s.company.currency;
  const today = new Date().toISOString().slice(0, 10);
  const who = (id: string) => s.crewById.get(id)?.full_name ?? "Unassigned";
  const metricRef = (v: CompanySnapshot["metrics"][number]) => refs.add("metric", v.metric.id, v.metric.name, `/scoreboard/${v.metric.id}`);
  const fmt = (v: CompanySnapshot["metrics"][number], value: number | null | undefined) => formatMetric(value, v.metric.unit, { decimals: v.metric.decimals, currency: cur });
  const metricFact = (v: CompanySnapshot["metrics"][number]) =>
    `${v.metric.name} was ${fmt(v, v.latest?.value)} for ${v.latest ? periodLabel(v.latest.period, v.metric.frequency) : "the latest period"} against a target of ${targetLabel(v.metric, v.latest?.target ?? v.metric.target_value, cur)} (${STATUS_META[v.status].label.toLowerCase()}${v.deteriorating ? ", deteriorating" : ""}; trend ${v.trend}). Owner: ${who(v.metric.owner_id)}.`;
  const priRef = (p: CompanySnapshot["priorities"][number]) => refs.add("priority", p.id, p.title, `/flight-plan/quarterly_priority/${p.id}`);
  const sections: BriefSection[] = [];

  const financialFacts = (): Fact[] => {
    const out: Fact[] = [];
    const r = s.financials.revenue;
    const e = s.financials.ebitda;
    if (r && s.financials.revenueMetric)
      out.push({ text: `Revenue year to date is ${formatMoney(r.actual, cur)} versus plan of ${formatMoney(r.plan, cur)} (${formatPct(r.variancePct, 1, true)}) over ${r.periods} months.`, sources: [refs.add("metric", s.financials.revenueMetric.id, "Revenue", `/scoreboard/${s.financials.revenueMetric.id}`)] });
    if (e && s.financials.ebitdaMetric)
      out.push({ text: `EBITDA year to date is ${formatMoney(e.actual, cur)} versus plan of ${formatMoney(e.plan, cur)} (${formatPct(e.variancePct, 1, true)}).`, sources: [refs.add("metric", s.financials.ebitdaMetric.id, "EBITDA", `/scoreboard/${s.financials.ebitdaMetric.id}`)] });
    return out;
  };
  const offPriorities = s.priorities.filter((p) => p.status === "off_track" || p.status === "at_risk");
  const deteriorating = s.metrics.filter((v) => v.deteriorating || (v.trend === "declining" && v.status !== "on_track"));
  const offMetrics = s.metrics.filter((v) => v.status === "off_track");
  const notReported = s.metrics.filter((v) => v.missingLatest);

  if (task === "performance" || task === "commentary") {
    const h = healthOf(s);
    const facts: Fact[] = [...financialFacts()];
    facts.push({ text: `${s.priorityStatus.on_track + s.priorityStatus.done} of ${s.priorities.length} ${s.activeQuarter ? quarterLabel(s.activeQuarter) : ""} priorities are on track or done; ${s.priorityStatus.at_risk} at risk and ${s.priorityStatus.off_track} off track.`, sources: offPriorities.map(priRef) });
    facts.push({ text: `${s.kpi.on_track} of ${s.kpi.total} KPIs are on target; ${s.kpi.at_risk} at risk, ${s.kpi.off_track} off track.`, sources: offMetrics.slice(0, 6).map(metricRef) });
    facts.push({ text: `${s.overdueActions.length} of ${s.openActions.length} open actions are overdue; ${s.openIssues.length} issues are open (${s.openIssues.filter((i) => i.priority === "critical").length} critical, ${s.openIssues.filter((i) => i.escalated_to_omni).length} escalated to Omni).`, sources: s.openIssues.filter((i) => i.priority === "critical" || i.escalated_to_omni).map((i) => refs.add("issue", i.id, i.title, `/execution/issue/${i.id}`)) });
    facts.push({ text: `${s.meetingsLast4Weeks} of the last 4 weekly leadership meetings were held. Execution score ${h.score}/100.`, sources: s.lastWeekly ? [refs.add("meeting", s.lastWeekly.id, `${s.lastWeekly.title} ${formatDate(s.lastWeekly.scheduled_at)}`, `/meetings/${s.lastWeekly.id}`)] : [] });
    const recs: string[] = [];
    if ((s.financials.ebitda?.variancePct ?? 0) < -0.05) recs.push("Request an EBITDA bridge to plan at the next monthly operating review, separating timing from structural shortfall.");
    if (s.priorityStatus.off_track) recs.push("Ask each owner of an off-track priority for a recovery plan with a dated next step, or re-scope the priority explicitly.");
    if (s.overdueActions.length > 2) recs.push("Review overdue actions at the top of the next weekly meeting and re-commit dates or close them.");
    if (s.meetingsLast4Weeks < 4) recs.push("Re-establish the weekly leadership meeting cadence; a missed week is the first sign of execution drift.");
    sections.push({ title: task === "commentary" ? "Headline performance" : "Performance at a glance", facts, recommendations: recs });
  }

  if (task === "deteriorating" || task === "commentary") {
    sections.push({
      title: "Deteriorating and off-track KPIs",
      facts: [...new Set([...deteriorating, ...offMetrics])].slice(0, 10).map((v) => ({ text: metricFact(v), sources: [metricRef(v)] })),
      recommendations: [
        ...deteriorating.slice(0, 3).map((v) => {
          const hasIssue = s.openIssues.some((i) => i.metric_id === v.metric.id);
          return hasIssue ? `${v.metric.name}: an issue is already open — confirm the action plan is moving the KPI.` : `${v.metric.name}: raise an issue at the next weekly meeting so the decline has an owner and an action.`;
        }),
        ...(notReported.length ? [`${notReported.length} KPI(s) were not reported for the last completed period (${notReported.map((v) => v.metric.name).join(", ")}); agree reporting deadlines with owners.`] : []),
      ],
    });
  }

  if (task === "priorities" || task === "commentary") {
    const facts = offPriorities.map((p) => {
      const goal = s.annualGoals.find((g) => g.id === p.annual_goal_id);
      const issues = s.openIssues.filter((i) => i.quarterly_priority_id === p.id);
      const overdue = s.overdueActions.filter((a) => a.quarterly_priority_id === p.id);
      const kpis = s.metricLinks.filter((l) => l.quarterly_priority_id === p.id).map((l) => s.metrics.find((v) => v.metric.id === l.metric_id)).filter(Boolean) as CompanySnapshot["metrics"];
      const srcs = [priRef(p)];
      if (goal) srcs.push(refs.add("goal", goal.id, goal.title, `/flight-plan/annual_goal/${goal.id}`));
      issues.forEach((i) => srcs.push(refs.add("issue", i.id, i.title, `/execution/issue/${i.id}`)));
      kpis.forEach((v) => srcs.push(metricRef(v)));
      return {
        text: `"${p.title}" (${who(p.owner_id)}) is ${STATUS_META[p.status].label.toLowerCase()} at ${p.progress}% with ${s.activeQuarter ? quarterProgress(s.activeQuarter).daysLeft : "?"} days left in the quarter${goal ? `, supporting "${goal.title}"` : ""}. ${issues.length} open issue(s), ${overdue.length} overdue action(s)${kpis.length ? `; linked KPIs: ${kpis.map((v) => `${v.metric.name} ${STATUS_META[v.status].label.toLowerCase()}`).join(", ")}` : ""}.`,
        sources: srcs,
      };
    });
    sections.push({
      title: "90-day priorities at risk",
      facts: facts.length ? facts : [{ text: "All 90-day priorities are on track or done.", sources: [] }],
      recommendations: offPriorities.filter((p) => !s.openIssues.some((i) => i.quarterly_priority_id === p.id)).map((p) => `"${p.title}" is ${STATUS_META[p.status].label.toLowerCase()} with no open issue — raise one so the blocker is discussed.`),
    });
  }

  if (task === "recurring") {
    const [{ data: actions }, { data: oldIssues }, { data: carried }] = await Promise.all([
      supabase.from("actions").select("id, title, owner_id, due_date, status, completed_at").eq("company_id", s.company.id),
      supabase.from("issues").select("id, title, created_at, priority").eq("company_id", s.company.id).neq("status", "resolved").lt("created_at", new Date(Date.now() - 21 * 86400000).toISOString()),
      supabase.from("quarterly_priorities").select("id, title, owner_id").eq("company_id", s.company.id).not("carried_from_id", "is", null),
    ]);
    const facts: Fact[] = [];
    const byOwner = new Map<string, { total: number; late: number }>();
    for (const a of actions ?? []) {
      const late = (a.status === "open" && a.due_date && a.due_date < today) || (a.status === "done" && a.completed_at && a.due_date && a.completed_at.slice(0, 10) > a.due_date);
      const o = byOwner.get(a.owner_id) ?? { total: 0, late: 0 };
      o.total += 1;
      if (late) o.late += 1;
      byOwner.set(a.owner_id, o);
    }
    for (const [owner, o] of [...byOwner.entries()].sort((a, b) => b[1].late - a[1].late)) {
      if (o.late >= 2 && o.late / o.total >= 0.4) facts.push({ text: `${who(owner)} has ${o.late} of ${o.total} actions overdue or completed late.`, sources: (actions ?? []).filter((a) => a.owner_id === owner && a.status === "open" && a.due_date && a.due_date < today).map((a) => refs.add("action", a.id, a.title, `/execution?view=actions&owner=${owner}`)) });
    }
    for (const i of oldIssues ?? []) facts.push({ text: `Issue "${i.title}" has been open for ${Math.round((Date.now() - new Date(i.created_at).getTime()) / 86400000)} days.`, sources: [refs.add("issue", i.id, i.title, `/execution/issue/${i.id}`)] });
    for (const p of carried ?? []) facts.push({ text: `"${p.title}" was carried over from a previous quarter (${who(p.owner_id)}).`, sources: [refs.add("priority", p.id, p.title, `/flight-plan/quarterly_priority/${p.id}`)] });
    if (s.meetingsLast4Weeks < 4) facts.push({ text: `Only ${s.meetingsLast4Weeks} of the last 4 weekly meetings were held.`, sources: [] });
    if (notReported.length) facts.push({ text: `${notReported.length} KPI(s) missing their latest result: ${notReported.map((v) => v.metric.name).join(", ")}.`, sources: notReported.map(metricRef) });
    sections.push({
      title: "Recurring execution patterns",
      facts: facts.length ? facts : [{ text: "No recurring execution problems detected.", sources: [] }],
      recommendations: [
        ...(facts.some((f) => f.text.includes("overdue or completed late")) ? ["Discuss workload and dependencies with owners whose actions repeatedly slip; fewer, clearer commitments beat many late ones."] : []),
        ...((oldIssues ?? []).length ? ["Issues open for more than three weeks should either be resolved with a decision or explicitly parked."] : []),
        ...((carried ?? []).length ? ["Priorities carried over a quarter need a changed approach, not just a new date."] : []),
      ],
    });
  }

  if (task === "strategy") {
    const ns = s.northStar;
    const facts: Fact[] = [];
    if (ns) {
      const nsRef = refs.add("north_star", ns.id, "North Star", "/north-star");
      const ltm = (key: string) => {
        const v = s.metrics.find((m) => m.metric.comparable_key === key);
        const pts = v?.points.filter((p) => p.value !== null).slice(-12) ?? [];
        return pts.length === 12 ? pts.reduce((a, p) => a + (p.value ?? 0), 0) : null;
      };
      const rev = ltm("revenue");
      const eb = ltm("ebitda");
      const acq = s.company.acquired_on ? new Date(s.company.acquired_on) : null;
      const totalYears = acq && ns.target_year ? ns.target_year + 1 - acq.getUTCFullYear() - acq.getUTCMonth() / 12 : null;
      const elapsed = acq ? (Date.now() - acq.getTime()) / (365.25 * 86400000) : null;
      const timePct = totalYears && elapsed ? Math.min(1, elapsed / totalYears) : null;
      const journey = (b: number | null, now: number | null, t: number | null) => (b != null && now != null && t != null && t !== b ? (now - b) / (t - b) : null);
      const rj = journey(ns.baseline_revenue === null ? null : Number(ns.baseline_revenue), rev, ns.target_revenue === null ? null : Number(ns.target_revenue));
      const ej = journey(ns.baseline_ebitda === null ? null : Number(ns.baseline_ebitda), eb, ns.target_ebitda === null ? null : Number(ns.target_ebitda));
      facts.push({ text: `The North Star targets ${formatMoney(Number(ns.target_revenue), cur)} revenue and ${formatMoney(Number(ns.target_ebitda), cur)} EBITDA by FY${ns.target_year} (exit EV ${formatMoney(Number(ns.target_ev), cur)}).`, sources: [nsRef] });
      if (rev !== null) facts.push({ text: `Last-twelve-months revenue is ${formatMoney(rev, cur)} — ${formatPct(rj)} of the way from entry (${formatMoney(Number(ns.baseline_revenue), cur)}) to target.`, sources: [nsRef] });
      if (eb !== null) facts.push({ text: `Last-twelve-months EBITDA is ${formatMoney(eb, cur)} — ${formatPct(ej)} of the way to target.`, sources: [nsRef] });
      if (timePct !== null) facts.push({ text: `About ${formatPct(timePct)} of the investment period to the target year has elapsed.`, sources: [nsRef] });
    }
    const { data: conditions } = await supabase.from("success_conditions").select("*").eq("company_id", s.company.id);
    for (const c of conditions ?? []) facts.push({ text: `Condition for success "${c.title}" is ${STATUS_META[c.status].label.toLowerCase()}.`, sources: ns ? [refs.add("north_star", ns.id, "North Star", "/north-star")] : [] });
    for (const w of s.winningMoves) facts.push({ text: `Three-Year Outcome "${w.title}" is ${STATUS_META[w.status].label.toLowerCase()} at ${w.progress}% (${who(w.owner_id)}).`, sources: [refs.add("move", w.id, w.title, `/flight-plan/winning_move/${w.id}`)] });
    const behind = s.winningMoves.filter((w) => w.status === "off_track" || w.status === "at_risk");
    sections.push({
      title: "Current position against the agreed strategic plan",
      facts,
      recommendations: [
        ...behind.map((w) => `Review whether "${w.title}" needs more resource, a different approach, or a revised milestone at the next quarterly offsite.`),
        "Where the EBITDA journey lags the time elapsed, quantify the gap in the exit equity story and agree the recovery levers with Omni.",
      ],
    });
  }

  if (task === "agenda") {
    const next = s.nextMeeting;
    const agenda = buildAgenda({
      meetingType: next?.type ?? "weekly",
      metrics: s.metrics.map((v) => ({ ...v, metric: { ...v.metric, tolerance_pct: Number(v.metric.tolerance_pct) } })),
      priorities: s.priorities,
      openActions: s.openActions,
      openIssues: s.openIssues,
      previouslyDiscussed: new Set(),
      today,
    });
    for (const sec of AGENDA_SECTIONS.slice(0, 4)) {
      const items = agenda.filter((i) => i.section === sec.key);
      sections.push({
        title: `${sec.label} (${items.length})`,
        facts: items.slice(0, 10).map((i) => {
          const snap = i.snapshot as Record<string, unknown>;
          if (i.entity_type === "metric") {
            const v = s.metrics.find((m) => m.metric.id === i.entity_id)!;
            return { text: `${i.title}: ${fmt(v, v.latest?.value)} vs ${targetLabel(v.metric, v.latest?.target ?? v.metric.target_value, cur)} — ${exceptionReason(v)}.`, sources: [metricRef(v)] };
          }
          if (i.entity_type === "quarterly_priority") return { text: `${i.title} — ${STATUS_META[snap.status as keyof typeof STATUS_META].label}, ${snap.progress}%.`, sources: [refs.add("priority", i.entity_id, i.title, `/flight-plan/quarterly_priority/${i.entity_id}`)] };
          if (i.entity_type === "action") return { text: `${i.title} — ${who(String(snap.owner_id))}, due ${formatDate(snap.due_date as string, { year: false })}${snap.overdue ? " (overdue)" : ""}.`, sources: [refs.add("action", i.entity_id, i.title, "/execution?view=actions")] };
          return { text: `${i.title} — ${String(snap.priority)} priority, owner ${who(String(snap.owner_id))}.`, sources: [refs.add("issue", i.entity_id, i.title, `/execution/issue/${i.entity_id}`)] };
        }),
        recommendations: [],
      });
    }
    if (next) sections.unshift({ title: `${MEETING_TYPE_LABEL[next.type]} — ${formatDate(next.scheduled_at)}`, facts: [{ text: `Agenda prepared from live data; it will be snapshotted when the meeting starts.`, sources: [refs.add("meeting", next.id, next.title, `/meetings/${next.id}`)] }], recommendations: ["Spend most of the time on the top two or three issues; resolve them with a decision and an owned action."] });
  }

  if (task === "summary") {
    const m = s.lastWeekly ?? s.lastReview;
    if (!m) sections.push({ title: "Last meeting", facts: [{ text: "No completed meetings yet.", sources: [] }], recommendations: [] });
    else {
      const mRef = refs.add("meeting", m.id, `${m.title} ${formatDate(m.scheduled_at)}`, `/meetings/${m.id}`);
      const [{ data: decisions }, { data: actions }, { data: raised }, { data: resolved }, { data: att }] = await Promise.all([
        supabase.from("decisions").select("id, title, owner_id").eq("meeting_id", m.id),
        supabase.from("actions").select("id, title, owner_id, due_date, status").eq("meeting_id", m.id),
        supabase.from("issues").select("id, title").eq("raised_in_meeting_id", m.id),
        supabase.from("issues").select("id, title").eq("resolved_in_meeting_id", m.id),
        supabase.from("meeting_attendees").select("crew_member_id, present").eq("meeting_id", m.id),
      ]);
      sections.push({
        title: `${m.title} — ${formatDate(m.scheduled_at)}`,
        facts: [
          { text: `Attendance: ${(att ?? []).filter((a) => a.present).map((a) => who(a.crew_member_id)).join(", ") || "not recorded"}.`, sources: [mRef] },
          ...(decisions ?? []).map((d) => ({ text: `Decision: ${d.title} (${who(d.owner_id)}).`, sources: [mRef] })),
          ...(actions ?? []).map((a) => ({ text: `Action: ${a.title} — ${who(a.owner_id)}, due ${formatDate(a.due_date, { year: false })} (${a.status}).`, sources: [refs.add("action", a.id, a.title, "/execution?view=actions")] })),
          ...(raised ?? []).map((i) => ({ text: `Issue raised: ${i.title}.`, sources: [refs.add("issue", i.id, i.title, `/execution/issue/${i.id}`)] })),
          ...(resolved ?? []).map((i) => ({ text: `Issue resolved: ${i.title}.`, sources: [refs.add("issue", i.id, i.title, `/execution/issue/${i.id}`)] })),
          ...(m.summary ? [{ text: `Recorded summary: ${m.summary}`, sources: [mRef] }] : []),
        ],
        recommendations: [],
      });
    }
  }

  if (task === "commentary") {
    sections.push({
      title: "Outlook and asks",
      facts: s.escalatedIssues.map((i) => ({ text: `Escalated/critical: ${i.title} (${who(i.owner_id)}).`, sources: [refs.add("issue", i.id, i.title, `/execution/issue/${i.id}`)] })),
      recommendations: ["Confirm support requested from Omni for each escalated issue, with an owner and date."],
    });
  }

  return { task, title: TASKS.find((t) => t.key === task)!.label, generatedAt: new Date().toISOString(), sections, sources: refs.list };
}

export function briefAsText(b: Brief, companyName: string) {
  const lines = [`# ${b.title} — ${companyName}`];
  for (const s of b.sections) {
    lines.push(`\n## ${s.title}\nFACTS:`);
    for (const f of s.facts) lines.push(`- ${f.text}${f.sources.length ? ` [${f.sources.join(", ")}]` : ""}`);
    if (s.recommendations.length) {
      lines.push("SUGGESTED (rule-based, not facts):");
      for (const r of s.recommendations) lines.push(`- ${r}`);
    }
  }
  lines.push("\nSOURCES:");
  for (const src of b.sources) lines.push(`${src.id}: ${src.type} — ${src.label}`);
  return lines.join("\n");
}
