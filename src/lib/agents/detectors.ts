// Event-driven and scheduled triggers. Each detector looks for conditions in the
// company's own records (through the agent principal) and opens an investigation
// at most once per subject and evidence state — the dedupe key encodes the evidence
// (e.g. the due date), so a case closed by management is not reopened until
// something material changes.
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { isoWeek } from "./manual";
import type { Db } from "./principal";
import { ACTIVE_STATUSES, type AgentConfig, type AgentKey } from "./registry";
import { openInvestigation } from "./engine";

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
    const { data: overdue } = await db.from("actions").select("id, title, due_date, owner_id").eq("company_id", companyId).eq("status", "open").lt("due_date", today).order("due_date").limit(50);
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
    const material = snap.metrics.filter((v) => {
      if (!(v.metric.is_key || v.metric.in_weekly_scorecard)) return false;
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

export const DETECTORS: Detector[] = [overdueActions, kpiExceptions, pipelineReview, marketScan];
