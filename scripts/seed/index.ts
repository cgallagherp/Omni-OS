/**
 * Seeds the fictional demonstration companies (flagged is_demo = true).
 *
 *   npm run db:seed
 *
 * Refuses to run against a non-local Supabase unless SEED_ALLOW_REMOTE=true.
 * Only ever deletes companies flagged is_demo and users with *.demo emails.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { GOVERNANCE_TEMPLATE, ONBOARDING_TEMPLATE } from "../../src/lib/domain/operating-system";
import { buildMetricView } from "../../src/lib/domain/metric-view";
import { buildWeeklyScorecard, scorecardEmailHtml, weekStartOf } from "../../src/lib/domain/weekly-scorecard";
import { fiscalYearOf } from "../../src/lib/domain/metrics";
import { reportDue } from "../../src/lib/domain/reporting";
import { TODAY, addDays, day, iso, prevQuarter, quarterBounds, quarterOf, rng, type CompanySpec, type MetricSpec } from "./lib";
import { seedAgents, seedMa } from "./agents";
import { clinara } from "./clinara";
import { kestrel } from "./kestrel";
import { ashworth } from "./ashworth";

config({ path: ".env.local" });
config();

export const DEMO_PASSWORD = "OmniDemo!2026";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const isLocal = /127\.0\.0\.1|localhost/.test(url);
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "true") {
  throw new Error(`Refusing to seed demo data into ${url}. Set SEED_ALLOW_REMOTE=true to seed a non-local project.`);
}

const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Tbl = keyof Database["public"]["Tables"];
async function insert<T extends Tbl>(table: T, rows: Database["public"]["Tables"][T]["Insert"][]) {
  if (rows.length === 0) return [] as Database["public"]["Tables"][T]["Row"][];
  const out: Database["public"]["Tables"][T]["Row"][] = [];
  for (let i = 0; i < rows.length; i += 500) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db.from(table) as any).insert(rows.slice(i, i + 500)).select();
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
  }
  return out;
}

const OMNI_USERS = [
  { email: "sam@omni.demo", full_name: "Sam Ellis", title: "Head of Portfolio Operations", platform_role: "platform_admin" as const, companies: [] as string[] },
  { email: "priya@omni.demo", full_name: "Priya Raman", title: "Operating Partner", platform_role: "omni_team" as const, companies: ["clinara", "kestrel", "ashworth"] },
  { email: "tom@omni.demo", full_name: "Tom Becker", title: "Investment Director", platform_role: "omni_team" as const, companies: ["clinara"] },
];

async function cleanup() {
  const { error } = await db.from("companies").delete().eq("is_demo", true);
  if (error) throw error;
  for (let page = 1; ; page++) {
    const { data, error: e } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (e) throw e;
    for (const u of data.users) if (u.email?.endsWith(".demo") || u.email?.endsWith("@agents.omni-os.invalid")) await db.auth.admin.deleteUser(u.id);
    if (data.users.length < 200) break;
  }
}

async function createUser(email: string, full_name: string, title: string, platform_role: Database["public"]["Enums"]["platform_role"] | null = null) {
  const { data, error } = await db.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name } });
  if (error) throw new Error(`${email}: ${error.message}`);
  const id = data.user.id;
  const { error: pe } = await db.from("profiles").update({ full_name, title, platform_role }).eq("id", id);
  if (pe) throw pe;
  return id;
}

function periodsFor(spec: MetricSpec) {
  const out: Array<{ period: string; future: boolean }> = [];
  if (spec.frequency === "monthly") {
    const last = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - 1, 1));
    for (let i = spec.history - 1; i >= 0; i--) out.push({ period: iso(new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() - i, 1))), future: false });
    for (let i = 1; i <= (spec.futureTargets ?? 0); i++) out.push({ period: iso(new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + i, 1))), future: true });
  } else {
    const dow = (TODAY.getUTCDay() + 6) % 7;
    const last = addDays(addDays(TODAY, -dow), -7);
    for (let i = spec.history - 1; i >= 0; i--) out.push({ period: iso(addDays(last, -7 * i)), future: false });
  }
  return out;
}

function need(map: Map<string, string>, key: string) {
  const v = map.get(key);
  if (!v) throw new Error(`Unknown seed key "${key}"`);
  return v;
}

/** Reads PNG dimensions from the IHDR chunk. */
function pngSize(buf: Buffer) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function seedCompany(spec: CompanySpec, userIds: Map<string, string>, seed: number) {
  const rand = rng(seed);
  const noise = (pct: number) => 1 + (rand() * 2 - 1) * pct;
  const acquiredOn = new Date(`${spec.company.acquired_on}T00:00:00Z`);

  const [company] = await insert("companies", [
    {
      ...spec.company,
      fiscal_year_start_month: spec.company.fiscal_year_start_month ?? 1,
      is_demo: true,
      settings: { max_three_year_outcomes: 5, priority_target: 3, max_priorities: 5 },
    },
  ]);
  const cid = company.id;

  if (spec.branding) {
    const logo = spec.branding.logo ? readFileSync(path.join(import.meta.dirname, "assets", spec.branding.logo)) : null;
    await insert("company_branding", [
      {
        company_id: cid,
        primary_color: spec.branding.primary,
        secondary_color: spec.branding.secondary,
        accent_color: spec.branding.accent,
        logo_data: logo ? logo.toString("base64") : null,
        logo_mime: logo ? "image/png" : null,
        logo_width: logo ? pngSize(logo).width : null,
        logo_height: logo ? pngSize(logo).height : null,
        logo_updated_at: logo ? new Date().toISOString() : null,
      },
    ]);
  }

  // People & logins
  for (const p of spec.people) if (p.email && p.login) userIds.set(p.email, await createUser(p.email, p.full_name, p.title));
  for (const o of spec.observers ?? []) userIds.set(o.email, await createUser(o.email, o.full_name, o.title));
  const memberships: Database["public"]["Tables"]["company_memberships"]["Insert"][] = [];
  for (const p of spec.people) if (p.email && p.login) memberships.push({ company_id: cid, user_id: userIds.get(p.email)!, role: p.login });
  for (const o of spec.observers ?? []) memberships.push({ company_id: cid, user_id: userIds.get(o.email)!, role: "observer" });
  for (const u of OMNI_USERS) if (u.companies.includes(spec.company.slug)) memberships.push({ company_id: cid, user_id: userIds.get(u.email)!, role: "omni" });
  await insert("company_memberships", memberships);

  const crewRows = await insert(
    "crew_members",
    spec.people.map((p, i) => ({
      company_id: cid,
      full_name: p.full_name,
      title: p.title,
      email: p.email ?? null,
      seat: p.seat ?? null,
      responsibilities: p.responsibilities ?? [],
      user_id: p.email ? (userIds.get(p.email) ?? null) : null,
      is_open_seat: p.open ?? false,
      is_leadership: p.leadership ?? true,
      avatar_color: p.avatar_color ?? null,
      sort_order: i,
    })),
  );
  const crew = new Map(spec.people.map((p, i) => [p.key, crewRows[i].id]));
  for (const p of spec.people) if (p.reports_to) await db.from("crew_members").update({ reports_to: crew.get(p.reports_to)! }).eq("id", crew.get(p.key)!);
  const owner = (k: string) => {
    const id = crew.get(k);
    if (!id) throw new Error(`Unknown person ${k} in ${spec.company.slug}`);
    return id;
  };
  const nameOf = (crewId: string) => spec.people.find((p) => crew.get(p.key) === crewId)?.full_name ?? "—";

  // North Star
  await insert("north_stars", [{ ...spec.northStar, company_id: cid, last_change_summary: "Agreed at the leadership offsite" }]);
  await insert("success_conditions", spec.conditions.map((c, i) => ({ company_id: cid, title: c.title, description: c.description, status: c.status, owner_id: owner(c.owner), sort_order: i })));

  // Flight Plan: three-year outcomes → 12-month objectives → 90-day priorities
  const year = TODAY.getUTCFullYear();
  const fy = fiscalYearOf(TODAY, spec.company.fiscal_year_start_month ?? 1);
  const moveRows = await insert(
    "winning_moves",
    spec.moves.map((m, i) => ({
      company_id: cid, title: m.title, description: m.description, measurable_outcome: m.outcome, owner_id: owner(m.owner),
      status: m.status, progress: m.progress, start_date: spec.company.acquired_on, due_date: `${year + 2}-12-31`, sort_order: i,
    })),
  );
  const moves = new Map(spec.moves.map((m, i) => [m.key, moveRows[i].id]));
  await insert("milestones", spec.milestones.map((m) => ({ company_id: cid, title: m.title, description: m.description ?? null, target_date: m.date, status: m.status, winning_move_id: m.move ? moves.get(m.move)! : null })));
  const goalRows = await insert(
    "annual_goals",
    spec.goals.map((g, i) => ({
      company_id: cid, winning_move_id: moves.get(g.move)!, fiscal_year: fy, title: g.title, description: g.description ?? null,
      measurable_outcome: g.outcome, unit: g.unit ?? null, baseline_value: g.baseline ?? null, target_value: g.target ?? null,
      current_value: g.current ?? null, owner_id: owner(g.owner), status: g.status, progress: g.progress,
      start_date: `${year}-01-01`, due_date: `${year}-12-31`, sort_order: i,
    })),
  );
  const goals = new Map(spec.goals.map((g, i) => [g.key, goalRows[i].id]));

  const q = quarterOf(TODAY);
  const pq = prevQuarter(year, q);
  const cur = quarterBounds(year, q);
  const prev = quarterBounds(pq.year, pq.q);
  const hasPrev = spec.previousPriorities.length > 0;
  const quarterRows = await insert("quarters", [
    ...(hasPrev ? [{ company_id: cid, year: pq.year, quarter: pq.q, start_date: prev.start, end_date: prev.end, status: "closed" as const, approved_at: new Date(`${prev.start}T09:00:00Z`).toISOString() }] : []),
    { company_id: cid, year, quarter: q, start_date: cur.start, end_date: cur.end, status: "active" as const, approved_at: new Date(`${cur.start}T12:00:00Z`).toISOString() },
  ]);
  const prevQuarterRow = hasPrev ? quarterRows[0] : null;
  const curQuarterRow = quarterRows[quarterRows.length - 1];

  const mkPriorities = (list: CompanySpec["priorities"], quarter: { start: string; end: string }, quarterId: string) =>
    list.map((p, i) => ({
      company_id: cid, quarter_id: quarterId, annual_goal_id: goals.get(p.goal)!, title: p.title, description: p.description ?? null,
      measurable_outcome: p.outcome, success_criteria: p.successCriteria ?? null, owner_id: owner(p.owner), status: p.status, progress: p.progress,
      outcome: p.result ?? null, outcome_note: p.resultNote ?? null,
      start_date: quarter.start, due_date: p.dueOffsetWeeks ? iso(addDays(new Date(`${quarter.start}T00:00:00Z`), 7 * p.dueOffsetWeeks)) : quarter.end, sort_order: i,
    }));
  const prevPRows = prevQuarterRow ? await insert("quarterly_priorities", mkPriorities(spec.previousPriorities, prev, prevQuarterRow.id)) : [];
  const curPRows = await insert("quarterly_priorities", mkPriorities(spec.priorities, cur, curQuarterRow.id));
  const priorities = new Map([...spec.previousPriorities.map((p, i) => [p.key, prevPRows[i].id] as const), ...spec.priorities.map((p, i) => [p.key, curPRows[i].id] as const)]);
  for (const p of spec.priorities) {
    const carried = spec.previousPriorities.find((pp) => pp.result === "missed" && pp.goal === p.goal && pp.owner === p.owner);
    if (carried) await db.from("quarterly_priorities").update({ carried_from_id: priorities.get(carried.key)! }).eq("id", priorities.get(p.key)!);
  }
  await insert(
    "priority_milestones",
    spec.priorities.flatMap((p) =>
      (p.milestones ?? []).map((ms, i) => {
        const due = addDays(new Date(`${cur.start}T00:00:00Z`), 7 * ms.week);
        return { company_id: cid, priority_id: priorities.get(p.key)!, title: ms.title, due_date: iso(due), done: ms.done, done_at: ms.done ? due.toISOString() : null, sort_order: i };
      }),
    ),
  );

  // Scorecard
  const metricRows = await insert(
    "metrics",
    spec.metrics.map((m, i) => ({
      company_id: cid, name: m.name, description: m.description ?? null, category: m.category, unit: m.unit, decimals: m.decimals ?? 0,
      frequency: m.frequency, direction: m.direction, target_value: m.target ?? null, target_min: m.min ?? null, target_max: m.max ?? null,
      tolerance_pct: m.tolerance ?? 10, aggregation: m.aggregation ?? "stock", owner_id: owner(m.owner), comparable_key: m.comparable ?? null,
      is_key: m.isKey ?? false, in_weekly_scorecard: m.scorecard ?? false, sort_order: i,
    })),
  );
  const metrics = new Map(spec.metrics.map((m, i) => [m.key, metricRows[i].id]));
  const values: Database["public"]["Tables"]["metric_values"]["Insert"][] = [];
  for (const m of spec.metrics) {
    const periods = periodsFor(m);
    const n = periods.filter((p) => !p.future).length;
    periods.forEach((p, i) => {
      const d = new Date(`${p.period}T00:00:00Z`);
      const r = m.series({ i, n, t: n > 1 ? Math.min(1, i / (n - 1)) : 1, period: p.period, month: d.getUTCMonth() + 1, year: d.getUTCFullYear(), noise, future: p.future });
      values.push({ company_id: cid, metric_id: metrics.get(m.key)!, period_start: p.period, value: r.value, target: r.target ?? null, source: "seed" });
    });
  }
  await insert("metric_values", values);
  await insert(
    "metric_links",
    spec.metrics.flatMap((m) =>
      (m.links ?? []).map((l) => ({
        company_id: cid, metric_id: metrics.get(m.key)!,
        winning_move_id: l.move ? need(moves, l.move) : null,
        annual_goal_id: l.goal ? need(goals, l.goal) : null,
        quarterly_priority_id: l.priority ? need(priorities, l.priority) : null,
      })),
    ),
  );

  // Meetings
  const meetingRows = await insert(
    "meetings",
    spec.meetings.map((m) => {
      const start = new Date(m.at);
      const minutes = m.type === "weekly" ? 90 : m.type === "board_monthly" ? 60 : 300;
      const done = m.status === "completed";
      return {
        company_id: cid, type: m.type, title: m.title, scheduled_at: m.at, status: m.status, facilitator_id: owner(m.facilitator),
        started_at: done ? m.at : null, ended_at: done ? new Date(start.getTime() + minutes * 60000).toISOString() : null,
        summary: m.summary ?? null, rating: m.rating ?? null,
      };
    }),
  );
  const meetings = new Map(spec.meetings.map((m, i) => [m.key, meetingRows[i].id]));
  await insert(
    "meeting_attendees",
    spec.meetings.flatMap((m) => [
      ...m.attendees.map((a) => ({ company_id: cid, meeting_id: meetings.get(m.key)!, crew_member_id: owner(a), present: true })),
      ...(m.absent ?? []).map((a) => ({ company_id: cid, meeting_id: meetings.get(m.key)!, crew_member_id: owner(a), present: false })),
    ]),
  );

  // Issues, decisions, actions
  const issueRows = await insert(
    "issues",
    spec.issues.map((i) => ({
      company_id: cid, title: i.title, description: i.description, priority: i.priority, status: i.status, owner_id: owner(i.owner),
      raised_by_id: owner(i.raisedBy), metric_id: i.metric ? metrics.get(i.metric)! : null,
      quarterly_priority_id: i.priorityKey ? priorities.get(i.priorityKey)! : null, annual_goal_id: i.goal ? goals.get(i.goal)! : null,
      raised_in_meeting_id: i.raisedIn ? meetings.get(i.raisedIn)! : null, resolved_in_meeting_id: i.resolvedIn ? meetings.get(i.resolvedIn)! : null,
      escalated_to_omni: i.escalated ?? false, resolution: i.resolution ?? null,
      created_at: addDays(TODAY, -i.createdDaysAgo).toISOString(),
      resolved_at: i.status === "resolved" ? addDays(TODAY, -i.createdDaysAgo + 7).toISOString() : null,
    })),
  );
  const issues = new Map(spec.issues.map((i, n) => [i.key, issueRows[n].id]));
  const decisionRows = await insert(
    "decisions",
    spec.decisions.map((d) => ({
      company_id: cid, title: d.title, rationale: d.rationale, owner_id: owner(d.owner), issue_id: d.issue ? issues.get(d.issue)! : null,
      meeting_id: d.meeting ? meetings.get(d.meeting)! : null, decided_on: day(-d.decidedDaysAgo), created_at: addDays(TODAY, -d.decidedDaysAgo).toISOString(),
    })),
  );
  const decisions = new Map(spec.decisions.map((d, n) => [d.key, decisionRows[n].id]));
  const actionRows = await insert(
    "actions",
    spec.actions.map((a) => ({
      company_id: cid, title: a.title, description: a.description ?? null, owner_id: owner(a.owner), due_date: day(a.due), status: a.status,
      quarterly_priority_id: a.priorityKey ? priorities.get(a.priorityKey)! : null, issue_id: a.issue ? issues.get(a.issue)! : null,
      decision_id: a.decision ? decisions.get(a.decision)! : null, meeting_id: a.meeting ? meetings.get(a.meeting)! : null,
      metric_id: a.metric ? metrics.get(a.metric)! : null,
      created_at: addDays(TODAY, -a.createdDaysAgo).toISOString(),
      completed_at: a.status === "done" ? addDays(TODAY, Math.min(a.due, 0)).toISOString() : null,
    })),
  );

  // Meeting history: agenda snapshots for completed weekly meetings
  const agenda: Database["public"]["Tables"]["meeting_agenda_items"]["Insert"][] = [];
  for (const m of spec.meetings.filter((mm) => mm.status === "completed" && mm.type === "weekly")) {
    const mid = meetings.get(m.key)!;
    let order = 0;
    for (const i of spec.issues.filter((ii) => ii.raisedIn === m.key || ii.resolvedIn === m.key))
      agenda.push({ company_id: cid, meeting_id: mid, section: "issues", entity_type: "issue", entity_id: issues.get(i.key)!, title: i.title, snapshot: { priority: i.priority }, reviewed: true, sort_order: order++ });
    for (const a of spec.actions.filter((aa) => aa.meeting === m.key))
      agenda.push({ company_id: cid, meeting_id: mid, section: "new_actions", entity_type: null, entity_id: null, title: a.title, snapshot: {}, reviewed: true, sort_order: order++ });
  }
  await insert("meeting_agenda_items", agenda);

  // Crew: agreed organisational actions only
  await insert(
    "org_actions",
    spec.orgActions.map((g) => ({
      company_id: cid, type: g.type, title: g.title, description: g.description, priority: g.priority, status: g.status, owner_id: owner(g.owner),
      quarterly_priority_id: g.priorityKey ? priorities.get(g.priorityKey)! : null, annual_goal_id: g.goal ? goals.get(g.goal)! : null, target_date: day(g.targetDays),
    })),
  );

  await insert(
    "comments",
    spec.comments.map((c) => ({
      company_id: cid, entity_type: "quarterly_priority", entity_id: priorities.get(c.priority)!, kind: c.kind ?? "comment", body: c.body,
      author_id: userIds.get(c.author)!, created_at: addDays(TODAY, -c.daysAgo).toISOString(),
    })),
  );

  // Listening (headline results and agreed actions only)
  for (const l of spec.listening) {
    const { actions: la, daysAgo, ...rest } = l;
    const [round] = await insert("listening_rounds", [{ ...rest, company_id: cid, held_on: day(-daysAgo), themes: rest.themes }]);
    await insert(
      "actions",
      (la ?? []).map((a) => ({
        company_id: cid, title: a.title, owner_id: owner(a.owner), due_date: day(a.due), status: a.status, listening_round_id: round.id,
        created_at: addDays(TODAY, -daysAgo + 2).toISOString(), completed_at: a.status === "done" ? addDays(TODAY, a.due).toISOString() : null,
      })),
    );
  }

  // First 100 days
  const ceoId = owner("ceo");
  await insert(
    "onboarding_milestones",
    ONBOARDING_TEMPLATE.map((t, i) => {
      const status = t.endWeek * 7 <= spec.onboardingDay ? "done" : t.startWeek * 7 <= spec.onboardingDay ? "in_progress" : "not_started";
      const due = addDays(acquiredOn, Math.max(1, t.endWeek * 7));
      return {
        company_id: cid, step: t.step, title: t.title, description: t.description, deliverable: t.deliverable, lead: t.lead,
        owner_id: t.lead.includes("CEO") || t.lead === "Company administrator" ? ceoId : null, start_week: t.startWeek, end_week: t.endWeek,
        due_date: iso(due), status, completed_at: status === "done" ? due.toISOString() : null, link_path: t.link, sort_order: i,
      };
    }),
  );

  // Governance requirements
  const fyStart = new Date(Date.UTC(TODAY.getUTCMonth() + 1 >= (spec.company.fiscal_year_start_month ?? 1) ? year + 1 : year, (spec.company.fiscal_year_start_month ?? 1) - 1, 1));
  await insert(
    "governance_items",
    GOVERNANCE_TEMPLATE.map((g, i) => {
      const due = g.firstDue({ acquiredOn, fyStart, today: TODAY });
      const oneOffDone = g.cadenceMonths === null && spec.onboardingDay >= 100;
      return {
        company_id: cid, title: g.title, requirement: g.requirement, owner_label: g.owner, cadence_label: g.cadenceLabel, cadence_months: g.cadenceMonths,
        next_due: oneOffDone ? null : iso(due), last_completed_on: oneOffDone ? iso(addDays(acquiredOn, 96)) : g.cadenceMonths === 1 && spec.onboardingDay > 40 ? iso(addDays(due, -30)) : null,
        sort_order: i,
      };
    }),
  );

  // Previous quarterly offsite (approved) — retained history
  const ceoUser = userIds.get(spec.people[0].email!)!;
  if (prevQuarterRow && spec.reset) {
    await insert("quarterly_resets", [
      {
        company_id: cid, from_quarter_id: prevQuarterRow.id, to_quarter_id: curQuarterRow.id, status: "approved",
        wins: spec.reset.wins, misses: spec.reset.misses, lessons: spec.reset.lessons, constraints_notes: spec.reset.constraints, north_star_confirmed: true,
        summary_snapshot: {
          achieved: spec.previousPriorities.filter((p) => p.result === "achieved").length,
          partly_achieved: spec.previousPriorities.filter((p) => p.result === "partly_achieved").length,
          missed: spec.previousPriorities.filter((p) => p.result === "missed").length,
          stopped: spec.previousPriorities.filter((p) => p.result === "stopped").length,
          total: spec.previousPriorities.length,
        },
        approved_at: new Date(`${cur.start}T12:00:00Z`).toISOString(), approved_by: ceoUser, created_by: ceoUser,
        company_update: `Thank you for a strong quarter. ${spec.reset.wins}\n\nOur three priorities for the next 90 days:\n${spec.priorities.map((p) => `• ${p.title} — ${spec.people.find((x) => x.key === p.owner)?.full_name}`).join("\n")}`,
      },
    ]);
  }

  // Board reporting: the last two months' flash and Board check-in, and last quarter's pack,
  // each published a day before it was due (the latest check-in is left in draft for Kestrel).
  if (spec.onboardingDay > 60) {
    const boardMeetings = spec.meetings.filter((m) => m.type === "board_monthly" || m.type === "board_quarterly").map((m) => ({ type: m.type, scheduled_at: m.at }));
    const cfo = userIds.get(spec.people.find((x) => x.key === "cfo")?.email ?? "") ?? ceoUser;
    const publishedBefore = (kind: "flash" | "monthly_board" | "quarterly_board", period: string) => {
      const due = new Date(`${reportDue(kind, period, boardMeetings)}T09:00:00Z`);
      const before = addDays(due, -1);
      return (before < TODAY ? before : addDays(TODAY, -1)).toISOString();
    };
    const months = [2, 1].map((back) => iso(new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - back, 1))));
    const rows: Database["public"]["Tables"]["board_reports"]["Insert"][] = [];
    for (const m of months) {
      const latest = m === months[1];
      rows.push({
        company_id: cid, kind: "flash", period_start: m, status: "published", published_by: cfo, published_at: publishedBefore("flash", m),
        content: { headline: latest ? spec.reporting?.flashHeadline ?? "Trading broadly in line with the prior month." : "Trading in line with the prior month.", cash: "Cash in line with the forecast; headroom comfortable.", exceptions: "See the KPI exceptions below; corrective actions are owned in Mission Control." },
      });
      const draft = latest && spec.reporting?.latestCheckInDraft;
      rows.push({
        company_id: cid, kind: "monthly_board", period_start: m, status: draft ? "draft" : "published", published_by: draft ? null : ceoUser, published_at: draft ? null : publishedBefore("monthly_board", m),
        content: {
          financials: "Revenue and EBITDA against budget as shown; variances explained in the management accounts.",
          trends: "Recurring revenue continues to build; margin recovery behind plan.",
          cash: "Cash and liquidity within covenant headroom.",
          people_risks: "Organisational actions on track; no serious employment issues. Cyber and health and safety: nil return.",
          changes: "Exceptions recorded against the Flight Plan with owned corrective actions.",
          decisions: draft ? "" : "None this month beyond those recorded in Mission Control.",
        },
      });
    }
    if (prevQuarterRow) {
      rows.push({
        company_id: cid, kind: "quarterly_board", period_start: prev.start, status: "published", published_by: ceoUser, published_at: publishedBefore("quarterly_board", prev.start),
        content: {
          strategy: "On course for the North Star; the quarter's priorities are recorded with their results in the quarterly offsite.",
          budget: "Year-to-date trading against budget as shown; full-year outlook maintained.",
          capital: "Capital deployed in line with the annual business plan.",
          mna: "Pipeline reviewed; see the acquisition update where buy-and-build is live.",
          risk: spec.reset?.constraints ?? "Principal risks reviewed; no change in rating.",
          leadership: "Agreed organisational actions progressing; see Crew.",
          decisions: "Approve the next 90-day priorities.",
        },
      });
    }
    await insert("board_reports", rows);
  }

  // Monday KPI scorecards: the last three weeks, approved and delivered to Omni
  const recipients = OMNI_USERS.filter((u) => u.companies.includes(spec.company.slug)).map((u) => u.email);
  if (spec.onboardingDay > 60) {
    const thisMonday = new Date(`${weekStartOf(TODAY)}T00:00:00Z`);
    for (let w = 3; w >= (spec.reporting?.approveThisWeek ? 0 : 1); w--) {
      const monday = addDays(thisMonday, -7 * w);
      const mviews = metricRows.map((mr) => buildMetricView({ ...mr, tolerance_pct: Number(mr.tolerance_pct) }, values.filter((v) => v.metric_id === mr.id && v.period_start < iso(monday)).map((v) => ({ period_start: v.period_start, value: v.value ?? null, target: v.target ?? null })), monday));
      const openAt = actionRows
        .filter((a) => a.created_at < monday.toISOString() && (a.status === "open" || (a.completed_at ?? "") > monday.toISOString()))
        .map((a) => ({ id: a.id, title: a.title, owner_id: a.owner_id, due_date: a.due_date, status: "open", metric_id: a.metric_id, issue_metric_id: a.issue_id ? (issueRows.find((i) => i.id === a.issue_id)?.metric_id ?? null) : null }));
      const rows = buildWeeklyScorecard(mviews as never, openAt, nameOf, "GBP");
      const [sc] = await insert("weekly_scorecards", [
        { company_id: cid, week_start: iso(monday), rows: rows as never, recipients, approved_by: ceoUser, approved_at: new Date(monday.getTime() + 8 * 3600000).toISOString(), sent_at: new Date(monday.getTime() + 8.1 * 3600000).toISOString() },
      ]);
      await insert("email_outbox", [
        { company_id: cid, kind: "weekly_scorecard", subject: `${spec.company.name} — KPI scorecard, week of ${iso(monday)}`, html: scorecardEmailHtml({ company: spec.company.name, weekStart: iso(monday), rows, brandColor: spec.branding?.primary }), recipients, status: "not_configured", ref_id: sc.id, created_by: ceoUser, created_at: new Date(monday.getTime() + 8.1 * 3600000).toISOString() },
      ]);
    }
  }

  // Omni-only (company-level investment information; never assessments of individuals)
  await insert("investment_cases", [{ ...spec.investmentCase, company_id: cid }]);
  await insert("omni_notes", spec.omniNotes.map((n) => ({ company_id: cid, body: n.body, intervention_level: n.level, author_id: userIds.get("priya@omni.demo")!, created_at: addDays(TODAY, -n.daysAgo).toISOString() })));

  // Agentic layer: principal, configuration, sandbox connections and data
  await seedAgents(db, cid, spec.company.slug, ceoUser);
  if (spec.company.slug === "kestrel") await seedMa(db, cid, ceoUser, owner("ma"));

  return { cid, metricValues: values.length };
}

async function main() {
  console.log(`Seeding demonstration data into ${url}`);
  await cleanup();
  const userIds = new Map<string, string>();
  for (const u of OMNI_USERS) userIds.set(u.email, await createUser(u.email, u.full_name, u.title, u.platform_role));
  const a = await seedCompany(clinara, userIds, 7);
  const b = await seedCompany(kestrel, userIds, 11);
  const c = await seedCompany(ashworth, userIds, 13);
  // seeding is not news: the agents start from a quiet signal queue
  await db.from("agent_signals").update({ processed_at: new Date().toISOString() }).is("processed_at", null);
  console.log(`✓ Clinara (${a.metricValues} KPI observations), Kestrel (${b.metricValues}), Ashworth (${c.metricValues})`);
  console.log(`✓ ${userIds.size} demo users — password: ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
