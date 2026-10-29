// Event-driven and scheduled triggers. Each detector looks for conditions in the
// company's own records (through the agent principal) and opens an investigation
// at most once per subject and evidence state — the dedupe key encodes the evidence
// (e.g. the due date), so a case closed by management is not reopened until
// something material changes.
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { assessSynergy, daysBetween, summariseIntegration, type ActivityLike } from "@/lib/domain/integration";
import { isoWeek } from "./manual";
import type { Db } from "./principal";
import { ACTIVE_STATUSES, type AgentConfig, type AgentKey } from "./registry";
import { openInvestigation } from "./engine";
import { currentExceptions } from "@/lib/analytics/exception-lookup";

export interface DetectorCtx {
  db: Db;
  companyId: string;
  config: AgentConfig;
  now: Date;
}

export interface Detector {
  agent: AgentKey;
  schedule: string;
  detect: (c: DetectorCtx) => Promise<number>;
}

const MAX_NEW_PER_TICK = 10;

async function seen(db: Db, companyId: string, keys: string[]) {
  if (!keys.length) return new Set<string>();
  const { data } = await db.from("agent_investigations").select("dedupe_key").eq("company_id", companyId).in("dedupe_key", keys);
  return new Set((data ?? []).map((d) => d.dedupe_key));
}

export const overdueActions: Detector = {
  agent: "execution",
  schedule: "overdue_actions",
  async detect({ db, companyId, now }) {
    const today = now.toISOString().slice(0, 10);
    // Actions linked to an integration are followed up by the M&A Integration Agent when it is enabled,
    // so the two agents never send competing reminders about the same commitment.
    const { data: integ } = await db.from("agent_configs").select("enabled").eq("company_id", companyId).eq("agent_key", "integration").maybeSingle();
    let q = db.from("actions").select("id, title, due_date, owner_id").eq("company_id", companyId).eq("status", "open").lt("due_date", today);
    if (integ?.enabled) q = q.is("acquisition_id", null);
    const { data: overdue } = await q.order("due_date").limit(50);
    const keyOf = (a: { id: string; due_date: string | null }) => `overdue:${a.id}:${a.due_date}`;
    const known = await seen(db, companyId, (overdue ?? []).map(keyOf));
    let opened = 0;
    for (const a of overdue ?? []) {
      if (opened >= MAX_NEW_PER_TICK) break;
      if (known.has(keyOf(a))) continue;
      const r = await openInvestigation(db, {
        companyId, agent: "execution", workflow: "execution.overdue_action", title: `Overdue: ${a.title}`.slice(0, 300),
        dedupeKey: keyOf(a), subjectType: "action", subjectId: a.id,
        trigger: { type: "event", summary: `Action passed its due date (${a.due_date}) without being completed`, due_date: a.due_date },
      });
      if (r.created) opened += 1;
    }
    return opened;
  },
};

/** Cases for this key that are live, or were closed within the cooldown. */
async function cooling(db: Db, companyId: string, keys: string[], days: number, now: Date) {
  if (!keys.length) return new Set<string>();
  const since = new Date(now.getTime() - days * 86400000).toISOString();
  const { data } = await db.from("agent_investigations").select("dedupe_key, status, updated_at").eq("company_id", companyId).in("dedupe_key", keys);
  return new Set((data ?? []).filter((d) => ACTIVE_STATUSES.includes(d.status as never) || d.updated_at >= since).map((d) => d.dedupe_key));
}

/** CEO Agent: a key or scorecard KPI off track for two consecutive reported periods. */
export const kpiExceptions: Detector = {
  agent: "ceo",
  schedule: "kpi_exceptions",
  async detect({ db, companyId, now }) {
    const snap = await loadCompanySnapshot(db as never, companyId, now);
    if (!snap) return 0;
    // KPIs bound to governed metrics are investigated through their governed exceptions instead
    const { data: governed } = await db.from("an_sources").select("company_id").eq("company_id", companyId).maybeSingle();
    const material = snap.metrics.filter((v) => {
      if (!(v.metric.is_key || v.metric.in_weekly_scorecard)) return false;
      if (governed && (v.metric as { analytics_metric_key?: string | null }).analytics_metric_key) return false;
      const reported = v.points.filter((p) => p.value !== null);
      return reported.length >= 2 && reported.slice(-2).every((p) => p.status === "off_track");
    });
    const known = await cooling(db, companyId, material.map((v) => `kpi:${v.metric.id}`), 28, now);
    let opened = 0;
    for (const v of material) {
      if (opened >= 3) break;
      if (known.has(`kpi:${v.metric.id}`)) continue;
      const r = await openInvestigation(db, {
        companyId, agent: "ceo", workflow: "ceo.kpi_deviation", title: `Strategic investigation: ${v.metric.name}`, dedupeKey: `kpi:${v.metric.id}`,
        subjectType: "metric", subjectId: v.metric.id, severity: "high",
        trigger: { type: "event", summary: `${v.metric.name} off track for two consecutive periods (latest ${v.latest?.period})`, period: v.latest?.period ?? null },
      });
      if (r.created) opened += 1;
    }
    return opened;
  },
};

async function allowedConnection(db: Db, companyId: string, config: AgentConfig, providers: string[]) {
  const { data } = await db.from("integration_connections").select("id").eq("company_id", companyId).in("provider", providers).eq("status", "connected");
  return (data ?? []).some((c) => config.allowed_connections.includes(c.id));
}

/** Commercial Agent: weekly pipeline review when a CRM is connected. */
export const pipelineReview: Detector = {
  agent: "commercial",
  schedule: "pipeline_review",
  async detect({ db, companyId, config, now }) {
    if (!(await allowedConnection(db, companyId, config, ["crm_sandbox", "hubspot"]))) return 0;
    const { data: live } = await db.from("agent_investigations").select("id").eq("company_id", companyId).eq("workflow", "commercial.pipeline_review").in("status", ACTIVE_STATUSES).limit(1);
    if (live?.length) return 0; // one pipeline case at a time, including ones the CEO Agent commissioned
    const key = `pipeline:${isoWeek(now)}`;
    if ((await seen(db, companyId, [key])).size) return 0;
    const r = await openInvestigation(db, {
      companyId, agent: "commercial", workflow: "commercial.pipeline_review", title: `Pipeline review — week ${isoWeek(now).split("-W")[1]}`, dedupeKey: key, subjectType: "pipeline",
      trigger: { type: "schedule", summary: "Weekly pipeline review" },
    });
    return r.created ? 1 : 0;
  },
};

/** M&A Agent: weekly search against each approved thesis. */
export const marketScan: Detector = {
  agent: "ma",
  schedule: "market_scan",
  async detect({ db, companyId, config, now }) {
    if (!(await allowedConnection(db, companyId, config, ["ma_sandbox", "companies_house"]))) return 0;
    const { data: theses } = await db.from("ma_theses").select("id, title").eq("company_id", companyId).eq("status", "approved");
    const keyOf = (t: { id: string }) => `ma:${t.id}:${isoWeek(now)}`;
    const known = await seen(db, companyId, (theses ?? []).map(keyOf));
    let opened = 0;
    for (const t of theses ?? []) {
      if (known.has(keyOf(t))) continue;
      const r = await openInvestigation(db, {
        companyId, agent: "ma", workflow: "ma.sourcing", title: `Target search: ${t.title}`, dedupeKey: keyOf(t), subjectType: "thesis", subjectId: t.id,
        trigger: { type: "schedule", summary: "Weekly market scan against the approved thesis" },
      });
      if (r.created) opened += 1;
    }
    return opened;
  },
};

/**
 * M&A Integration Agent: on every change and at least every 15 minutes, for each active
 * integration (not paused): activate plans whose transaction has completed, then look for
 * dependencies that threaten an upcoming milestone, overdue activities, missing approvals,
 * unverified completion criteria and synergies below plan. Dedupe keys encode the evidence
 * (e.g. the due date), so a resolved case reopens only if something material changes.
 */
export const integrationWatch: Detector = {
  agent: "integration",
  schedule: "integration_watch",
  async detect({ db, companyId, config, now }) {
    const today = now.toISOString().slice(0, 10);
    await db.rpc("agent_activate_integrations", { p_company: companyId });
    const { data: acqs } = await db.from("acquisitions").select("id, name").eq("company_id", companyId).eq("status", "active").eq("agent_paused", false);
    const lead = config.escalation.lead_days ?? 10;
    let opened = 0;
    for (const acq of acqs ?? []) {
      const [{ data: acts }, { data: deps }] = await Promise.all([
        db.from("integration_activities").select("*").eq("company_id", companyId).eq("acquisition_id", acq.id),
        db.from("integration_dependencies").select("from_activity_id, to_activity_id").eq("company_id", companyId).eq("acquisition_id", acq.id),
      ]);
      const activities = (acts ?? []) as unknown as Array<ActivityLike & { approval_required: string | null }>;
      const byId = new Map(activities.map((a) => [a.id, a]));
      const sum = summariseIntegration(activities, deps ?? [], today, lead);
      const want: Array<{ key: string; activity: (typeof activities)[number]; kind: string; dependent?: string; summary: string }> = [];
      // a prerequisite unfinished while its dependent is due within the lead time
      for (const d of deps ?? []) {
        const p = byId.get(d.from_activity_id);
        const t = byId.get(d.to_activity_id);
        if (!p || !t || ["done", "not_needed"].includes(p.status) || ["done", "not_needed"].includes(t.status) || !t.due_date) continue;
        const startSoon = t.start_date && daysBetween(today, t.start_date) <= lead;
        if (daysBetween(today, t.due_date) <= lead || startSoon)
          want.push({ key: `int-dep:${p.id}:${p.due_date}`, activity: p, kind: "dependency", dependent: t.id, summary: `"${t.title}" is due ${t.due_date} but depends on "${p.title}", which is not finished` });
      }
      for (const a of sum.overdue) want.push({ key: `int-overdue:${a.id}:${a.due_date}`, activity: byId.get(a.id)!, kind: "overdue", summary: `"${a.title}" passed its due date (${a.due_date})` });
      for (const a of sum.pendingApprovals) if (a.due_date && daysBetween(today, a.due_date) <= 3) want.push({ key: `int-approval:${a.id}`, activity: byId.get(a.id)!, kind: "approval", summary: `"${a.title}" needs approval before ${a.due_date}` });
      for (const a of sum.unverified) if (a.completed_at && daysBetween(a.completed_at.slice(0, 10), today) >= 1 && a.criteria_met === null) want.push({ key: `int-verify:${a.id}:${a.completed_at.slice(0, 10)}`, activity: byId.get(a.id)!, kind: "evidence", summary: `"${a.title}" is marked done but its completion criteria are not verified` });
      // one live case per activity, whatever triggered it
      const { data: live } = await db.from("agent_investigations").select("subject_id").eq("company_id", companyId).eq("workflow", "integration.activity_watch").in("status", ACTIVE_STATUSES);
      const busy = new Set((live ?? []).map((x) => x.subject_id));
      const known = await seen(db, companyId, want.map((w) => w.key));
      for (const w of want) {
        if (opened >= MAX_NEW_PER_TICK) break;
        if (known.has(w.key) || busy.has(w.activity.id)) continue;
        const r = await openInvestigation(db, {
          companyId, agent: "integration", workflow: "integration.activity_watch", title: `${acq.name}: ${w.activity.title}`.slice(0, 300), dedupeKey: w.key,
          subjectType: "integration_activity", subjectId: w.activity.id, severity: w.activity.critical ? "high" : "medium",
          trigger: { type: "event", kind: w.kind, summary: w.summary, acquisition_id: acq.id, dependent_id: w.dependent ?? null, due_date: w.activity.due_date },
        });
        if (r.created) {
          opened += 1;
          busy.add(w.activity.id);
        }
      }
    }
    return opened;
  },
};

/** Synergies below plan, checked whenever results are recorded (and monthly). */
export const synergyMonitor: Detector = {
  agent: "integration",
  schedule: "synergy_monitor",
  async detect({ db, companyId, now }) {
    const today = now.toISOString().slice(0, 10);
    const { data: acqs } = await db.from("acquisitions").select("id, name").eq("company_id", companyId).eq("status", "active").eq("agent_paused", false);
    let opened = 0;
    for (const acq of acqs ?? []) {
      const [{ data: syn }, { data: acts }] = await Promise.all([
        db.from("integration_synergies").select("*").eq("company_id", companyId).eq("acquisition_id", acq.id),
        db.from("integration_activities").select("*").eq("company_id", companyId).eq("acquisition_id", acq.id),
      ]);
      if (!syn?.length) continue;
      const { data: actuals } = await db.from("synergy_actuals").select("synergy_id, period_start, value, kind, verified").eq("company_id", companyId).in("synergy_id", syn.map((x) => x.id));
      const byId = new Map(((acts ?? []) as unknown as ActivityLike[]).map((a) => [a.id, a]));
      for (const x of syn) {
        const s = { ...x, baseline: Number(x.baseline), target: Number(x.target) };
        const r = assessSynergy(s, (actuals ?? []).map((a) => ({ ...a, value: Number(a.value), kind: a.kind as "actual" | "forecast" })), byId, today);
        if (r.status !== "off_track" || !r.realisedPeriod) continue;
        const key = `int-syn:${x.id}:${r.realisedPeriod}`;
        const res = await openInvestigation(db, {
          companyId, agent: "integration", workflow: "integration.synergy_shortfall", title: `${acq.name}: ${x.description}`.slice(0, 300), dedupeKey: key,
          subjectType: "synergy", subjectId: x.id, severity: "high",
          trigger: { type: "event", summary: `Verified result for ${r.realisedPeriod} is ${Math.round((r.attainment ?? 0) * 100)}% of plan`, acquisition_id: acq.id },
        });
        if (res.created) opened += 1;
      }
    }
    return opened;
  },
};

/** Weekly status per active integration. */
export const integrationStatus: Detector = {
  agent: "integration",
  schedule: "weekly_status",
  async detect({ db, companyId, now }) {
    const { data: acqs } = await db.from("acquisitions").select("id, name").eq("company_id", companyId).eq("status", "active").eq("agent_paused", false);
    const keyOf = (a: { id: string }) => `int-status:${a.id}:${isoWeek(now)}`;
    const known = await seen(db, companyId, (acqs ?? []).map(keyOf));
    let opened = 0;
    for (const a of acqs ?? []) {
      if (known.has(keyOf(a))) continue;
      const r = await openInvestigation(db, { companyId, agent: "integration", workflow: "integration.weekly_status", title: `${a.name}: weekly status — week ${isoWeek(now).split("-W")[1]}`, dedupeKey: keyOf(a), subjectType: "acquisition", subjectId: a.id, trigger: { type: "schedule", summary: "Weekly integration status review", acquisition_id: a.id } });
      if (r.created) opened += 1;
    }
    return opened;
  },
};

const lastFinancial = new Map<string, number>();
/** CEO Agent: material (high or critical) exceptions in governed revenue and cost data. */
export const financialVariance: Detector = {
  agent: "ceo",
  schedule: "financial_variance",
  async detect({ db, companyId, now }) {
    const last = lastFinancial.get(companyId) ?? 0;
    if (now.getTime() - last < 6 * 3600_000) return 0;
    lastFinancial.set(companyId, now.getTime());
    const { data: co } = await db.from("companies").select("slug").eq("id", companyId).single();
    if (!co) return 0;
    const { data: src } = await db.from("an_sources").select("company_id").eq("company_id", companyId).maybeSingle();
    if (!src) return 0;
    const exceptions = (await currentExceptions(db, companyId, co.slug)).filter((e) => e.severity !== "medium");
    // one case per exception: none while one is live or closed in the last 28 days
    const since = new Date(now.getTime() - 28 * 86400000).toISOString();
    const { data: prior } = await db.from("agent_investigations").select("dedupe_key, status, updated_at").eq("company_id", companyId).like("dedupe_key", "analytics:%");
    const blocked = new Set((prior ?? []).filter((p) => ACTIVE_STATUSES.includes(p.status as never) || p.updated_at >= since).map((p) => p.dedupe_key.split(":").slice(1, -1).join(":")));
    let opened = 0;
    for (const e of exceptions) {
      if (opened >= 2) break;
      if (blocked.has(e.key)) continue;
      const r = await openInvestigation(db, {
        companyId, agent: "ceo", workflow: "ceo.financial_variance", title: e.title.slice(0, 300), dedupeKey: `analytics:${e.key}:${e.period}`,
        subjectType: "analytics_exception", severity: e.severity === "critical" ? "critical" : "high",
        trigger: { type: "event", summary: `Governed data: ${e.title}`, exception_key: e.key, exception: e },
      });
      if (r.created) opened += 1;
    }
    return opened;
  },
};

export const DETECTORS: Detector[] = [overdueActions, kpiExceptions, financialVariance, pipelineReview, marketScan, integrationWatch, synergyMonitor, integrationStatus];
