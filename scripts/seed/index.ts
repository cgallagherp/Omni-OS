/**
 * Seeds the two fictional demonstration companies (flagged is_demo = true).
 *
 *   npm run db:seed
 *
 * Refuses to run against a non-local Supabase unless SEED_ALLOW_REMOTE=true.
 * Only ever deletes companies flagged is_demo and users with *.demo emails.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import {
  TODAY,
  addDays,
  day,
  iso,
  nextQuarter,
  prevQuarter,
  quarterBounds,
  quarterOf,
  rng,
  type CompanySpec,
  type MetricSpec,
} from "./lib";
import { clinara } from "./clinara";
import { kestrel } from "./kestrel";

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
  { email: "priya@omni.demo", full_name: "Priya Raman", title: "Operating Partner", platform_role: "omni_team" as const, companies: ["clinara", "kestrel"] },
  { email: "tom@omni.demo", full_name: "Tom Becker", title: "Investment Director", platform_role: "omni_team" as const, companies: ["clinara"] },
];

async function cleanup() {
  const { error } = await db.from("companies").delete().eq("is_demo", true);
  if (error) throw error;
  for (let page = 1; ; page++) {
    const { data, error: e } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (e) throw e;
    for (const u of data.users) {
      if (u.email?.endsWith(".demo")) await db.auth.admin.deleteUser(u.id);
    }
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
    const thisMonday = addDays(TODAY, -dow);
    const last = addDays(thisMonday, -7);
    for (let i = spec.history - 1; i >= 0; i--) out.push({ period: iso(addDays(last, -7 * i)), future: false });
  }
  return out;
}

async function seedCompany(spec: CompanySpec, userIds: Map<string, string>, seed: number) {
  const rand = rng(seed);
  const noise = (pct: number) => 1 + (rand() * 2 - 1) * pct;

  const [company] = await insert("companies", [
    { ...spec.company, is_demo: true, settings: { max_winning_moves: spec.company.max_winning_moves ?? 5 } },
  ]);
  const cid = company.id;

  // People & logins
  for (const p of spec.people) {
    if (p.email && p.login) userIds.set(p.email, await createUser(p.email, p.full_name, p.title));
  }
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
  for (const p of spec.people) {
    if (p.reports_to) await db.from("crew_members").update({ reports_to: crew.get(p.reports_to)! }).eq("id", crew.get(p.key)!);
  }
  const owner = (k: string) => {
    const id = crew.get(k);
    if (!id) throw new Error(`Unknown person ${k} in ${spec.company.slug}`);
    return id;
  };

  // North Star
  await insert("north_stars", [{ ...spec.northStar, company_id: cid, last_change_summary: "Agreed at investment completion" }]);
  await insert(
    "success_conditions",
    spec.conditions.map((c, i) => ({ company_id: cid, title: c.title, description: c.description, status: c.status, owner_id: owner(c.owner), sort_order: i })),
  );

  // Flight plan
  const year = TODAY.getUTCFullYear();
  const moveRows = await insert(
    "winning_moves",
    spec.moves.map((m, i) => ({
      company_id: cid, title: m.title, description: m.description, measurable_outcome: m.outcome, owner_id: owner(m.owner),
      status: m.status, progress: m.progress, start_date: spec.company.acquired_on, due_date: `${year + 2}-12-31`, sort_order: i,
    })),
  );
  const moves = new Map(spec.moves.map((m, i) => [m.key, moveRows[i].id]));
  await insert(
    "milestones",
    spec.milestones.map((m) => ({ company_id: cid, title: m.title, description: m.description ?? null, target_date: m.date, status: m.status, winning_move_id: m.move ? moves.get(m.move)! : null })),
  );
  const goalRows = await insert(
    "annual_goals",
    spec.goals.map((g, i) => ({
      company_id: cid, winning_move_id: moves.get(g.move)!, fiscal_year: year, title: g.title, description: g.description ?? null,
      measurable_outcome: g.outcome, unit: g.unit ?? null, baseline_value: g.baseline ?? null, target_value: g.target ?? null,
      current_value: g.current ?? null, owner_id: owner(g.owner), status: g.status, progress: g.progress,
      start_date: `${year}-01-01`, due_date: `${year}-12-31`, sort_order: i,
    })),
  );
  const goals = new Map(spec.goals.map((g, i) => [g.key, goalRows[i].id]));

  const q = quarterOf(TODAY);
  const pq = prevQuarter(year, q);
  const nq = nextQuarter(year, q);
  const cur = quarterBounds(year, q);
  const prev = quarterBounds(pq.year, pq.q);
  const [prevQuarterRow, curQuarterRow] = await insert("quarters", [
    { company_id: cid, year: pq.year, quarter: pq.q, start_date: prev.start, end_date: prev.end, status: "closed", approved_at: new Date(`${prev.start}T09:00:00Z`).toISOString() },
    { company_id: cid, year, quarter: q, start_date: cur.start, end_date: cur.end, status: "active", approved_at: new Date(`${cur.start}T12:00:00Z`).toISOString(), theme: q === 4 ? "Finish the year strong" : null },
  ]);
  void nq;

  const mkPriorities = (list: CompanySpec["priorities"], quarter: { start: string; end: string }, quarterId: string) =>
    list.map((p, i) => ({
      company_id: cid, quarter_id: quarterId, annual_goal_id: goals.get(p.goal)!, title: p.title, description: p.description ?? null,
      measurable_outcome: p.outcome, owner_id: owner(p.owner), status: p.status, progress: p.progress,
      start_date: quarter.start, due_date: p.dueOffsetWeeks ? iso(addDays(new Date(`${quarter.start}T00:00:00Z`), 7 * p.dueOffsetWeeks)) : quarter.end, sort_order: i,
    }));
  const prevPRows = await insert("quarterly_priorities", mkPriorities(spec.previousPriorities, prev, prevQuarterRow.id));
  const curPRows = await insert("quarterly_priorities", mkPriorities(spec.priorities, cur, curQuarterRow.id));
  const priorities = new Map([
    ...spec.previousPriorities.map((p, i) => [p.key, prevPRows[i].id] as const),
    ...spec.priorities.map((p, i) => [p.key, curPRows[i].id] as const),
  ]);
  // A missed priority carried into this quarter
  for (const p of spec.priorities) {
    const prevMatch = spec.previousPriorities.find((pp) => pp.status === "missed" && pp.goal === p.goal && pp.owner === p.owner);
    if (prevMatch) await db.from("quarterly_priorities").update({ carried_from_id: priorities.get(prevMatch.key)! }).eq("id", priorities.get(p.key)!);
  }

  // Scoreboard
  const metricRows = await insert(
    "metrics",
    spec.metrics.map((m, i) => ({
      company_id: cid, name: m.name, description: m.description ?? null, category: m.category, unit: m.unit, decimals: m.decimals ?? 0,
      frequency: m.frequency, direction: m.direction, target_value: m.target ?? null, target_min: m.min ?? null, target_max: m.max ?? null,
      tolerance_pct: m.tolerance ?? 10, aggregation: m.aggregation ?? "stock", owner_id: owner(m.owner), comparable_key: m.comparable ?? null,
      is_key: m.isKey ?? false, sort_order: i,
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
        winning_move_id: l.move ? moves.get(l.move)! : null,
        annual_goal_id: l.goal ? goals.get(l.goal)! : null,
        quarterly_priority_id: l.priority ? priorities.get(l.priority)! : null,
      })),
    ),
  );

  // Meetings
  const meetingRows = await insert(
    "meetings",
    spec.meetings.map((m) => {
      const start = new Date(m.at);
      const minutes = m.type === "weekly" ? 90 : m.type === "monthly" ? 150 : 300;
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
      ...m.attendees.map((a) => ({ company_id: cid, meeting_id: meetings.get(m.key)!, crew_member_id: owner(a), present: m.status === "completed" ? true : true })),
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
  await insert(
    "actions",
    spec.actions.map((a) => ({
      company_id: cid, title: a.title, description: a.description ?? null, owner_id: owner(a.owner), due_date: day(a.due), status: a.status,
      quarterly_priority_id: a.priorityKey ? priorities.get(a.priorityKey)! : null, issue_id: a.issue ? issues.get(a.issue)! : null,
      decision_id: a.decision ? decisions.get(a.decision)! : null, meeting_id: a.meeting ? meetings.get(a.meeting)! : null,
      created_at: addDays(TODAY, -a.createdDaysAgo).toISOString(),
      completed_at: a.status === "done" ? addDays(TODAY, Math.min(a.due, 0)).toISOString() : null,
    })),
  );

  // Meeting history: agenda snapshots for completed meetings
  const agenda: Database["public"]["Tables"]["meeting_agenda_items"]["Insert"][] = [];
  for (const m of spec.meetings.filter((mm) => mm.status === "completed")) {
    const mid = meetings.get(m.key)!;
    let order = 0;
    for (const i of spec.issues.filter((ii) => ii.raisedIn === m.key || ii.resolvedIn === m.key)) {
      agenda.push({ company_id: cid, meeting_id: mid, section: "issues", entity_type: "issue", entity_id: issues.get(i.key)!, title: i.title, snapshot: { priority: i.priority }, reviewed: true, sort_order: order++ });
    }
    for (const a of spec.actions.filter((aa) => aa.meeting === m.key)) {
      agenda.push({ company_id: cid, meeting_id: mid, section: "new_actions", entity_type: null, entity_id: null, title: a.title, snapshot: {}, reviewed: true, sort_order: order++ });
    }
  }
  await insert("meeting_agenda_items", agenda);

  // Crew gaps
  await insert(
    "org_gaps",
    spec.gaps.map((g) => ({
      company_id: cid, type: g.type, title: g.title, description: g.description, priority: g.priority, status: g.status,
      owner_id: owner(g.owner), crew_member_id: g.person ? owner(g.person) : null, target_date: day(g.targetDays),
    })),
  );

  // Updates on priorities
  await insert(
    "comments",
    spec.comments.map((c) => ({
      company_id: cid, entity_type: "quarterly_priority", entity_id: priorities.get(c.priority)!, kind: c.kind ?? "comment", body: c.body,
      author_id: userIds.get(c.author)!, created_at: addDays(TODAY, -c.daysAgo).toISOString(),
    })),
  );

  // Previous quarterly reset (approved) — retained history
  const prevAll = spec.previousPriorities;
  await insert("quarterly_resets", [
    {
      company_id: cid, from_quarter_id: prevQuarterRow.id, to_quarter_id: curQuarterRow.id, status: "approved",
      wins: spec.reset.wins, misses: spec.reset.misses, lessons: spec.reset.lessons, constraints_notes: spec.reset.constraints,
      summary_snapshot: {
        completed: prevAll.filter((p) => p.status === "done").length,
        missed: prevAll.filter((p) => p.status === "missed").length,
        total: prevAll.length,
      },
      approved_at: new Date(`${cur.start}T12:00:00Z`).toISOString(),
      approved_by: userIds.get(spec.people[0].email!)!,
      created_by: userIds.get(spec.people[0].email!)!,
    },
  ]);

  // Omni-only
  await insert("investment_cases", [{ ...spec.investmentCase, company_id: cid }]);
  await insert(
    "omni_notes",
    spec.omniNotes.map((n) => ({ company_id: cid, body: n.body, intervention_level: n.level, author_id: userIds.get("priya@omni.demo")!, created_at: addDays(TODAY, -n.daysAgo).toISOString() })),
  );

  return { cid, metricValues: values.length };
}

async function main() {
  console.log(`Seeding demonstration data into ${url}`);
  await cleanup();
  const userIds = new Map<string, string>();
  for (const u of OMNI_USERS) userIds.set(u.email, await createUser(u.email, u.full_name, u.title, u.platform_role));
  const a = await seedCompany(clinara, userIds, 7);
  const b = await seedCompany(kestrel, userIds, 11);
  console.log(`✓ Clinara (${a.metricValues} KPI observations), Kestrel (${b.metricValues} KPI observations)`);
  console.log(`✓ ${userIds.size} demo users — password: ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
