// Investigations people can ask for directly. Dedupe keys match the automatic triggers,
// so asking manually never creates a second case for something already in hand.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AgentKey } from "./registry";

type Db = SupabaseClient<Database>;

export interface ManualSpec {
  agent: AgentKey;
  subject: "action" | "metric" | "thesis" | "pipeline" | "integration_activity" | "synergy" | "acquisition";
  label: string;
  describe: (db: Db, companyId: string, subjectId: string | undefined, now: Date) => Promise<{ title: string; dedupeKey: string; trigger?: Record<string, unknown> }>;
}

const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)}`;
};
export { isoWeek };

export const WORKFLOW_SUBJECTS: Record<string, ManualSpec> = {
  "integration.activity_watch": {
    agent: "integration",
    subject: "integration_activity",
    label: "Investigate an integration activity",
    describe: async (db, cid, id) => {
      const { data } = await db.from("integration_activities").select("title, due_date, acquisition_id, acquisitions(name)").eq("company_id", cid).eq("id", id!).single();
      const acq = (data?.acquisitions as unknown as { name: string } | null)?.name ?? "Integration";
      return { title: `${acq}: ${data?.title ?? "activity"}`.slice(0, 300), dedupeKey: `int-manual:${id}:${data?.due_date}`, trigger: { kind: data?.due_date && data.due_date < new Date().toISOString().slice(0, 10) ? "overdue" : "dependency", acquisition_id: data?.acquisition_id, dependent_id: null } };
    },
  },
  "integration.synergy_shortfall": {
    agent: "integration",
    subject: "synergy",
    label: "Investigate a synergy against plan",
    describe: async (db, cid, id, now) => {
      const { data } = await db.from("integration_synergies").select("description, acquisition_id").eq("company_id", cid).eq("id", id!).single();
      return { title: `Synergy: ${data?.description ?? ""}`.slice(0, 300), dedupeKey: `int-syn-manual:${id}:${isoWeek(now)}`, trigger: { acquisition_id: data?.acquisition_id } };
    },
  },
  "integration.weekly_status": {
    agent: "integration",
    subject: "acquisition",
    label: "Prepare an integration status report",
    describe: async (db, cid, id, now) => {
      const { data } = await db.from("acquisitions").select("name").eq("company_id", cid).eq("id", id!).single();
      return { title: `${data?.name ?? "Integration"}: status report`, dedupeKey: `int-status-manual:${id}:${now.toISOString().slice(0, 13)}`, trigger: { acquisition_id: id } };
    },
  },
  "ceo.integration_review": {
    agent: "ceo",
    subject: "acquisition",
    label: "Assess an integration against its objectives",
    describe: async (db, cid, id, now) => {
      const { data } = await db.from("acquisitions").select("name").eq("company_id", cid).eq("id", id!).single();
      return { title: `Integration review: ${data?.name ?? ""}`, dedupeKey: `ceo-int:${id}:${isoWeek(now)}`, trigger: { acquisition_id: id } };
    },
  },
  "execution.overdue_action": {
    agent: "execution",
    subject: "action",
    label: "Follow up an action",
    describe: async (db, cid, id) => {
      const { data } = await db.from("actions").select("title, due_date").eq("company_id", cid).eq("id", id!).single();
      return { title: `Follow up: ${data?.title ?? "action"}`.slice(0, 300), dedupeKey: `overdue:${id}:${data?.due_date}` };
    },
  },
  "ceo.kpi_deviation": {
    agent: "ceo",
    subject: "metric",
    label: "Investigate a KPI against the plan",
    describe: async (db, cid, id) => {
      const { data } = await db.from("metrics").select("name").eq("company_id", cid).eq("id", id!).single();
      return { title: `Strategic investigation: ${data?.name ?? "KPI"}`, dedupeKey: `kpi:${id}` };
    },
  },
  "commercial.pipeline_review": {
    agent: "commercial",
    subject: "pipeline",
    label: "Review pipeline coverage and conversion",
    describe: async (_db, _cid, _id, now) => ({ title: `Pipeline review — week ${isoWeek(now).split("-W")[1]}`, dedupeKey: `pipeline:${isoWeek(now)}` }),
  },
  "ma.sourcing": {
    agent: "ma",
    subject: "thesis",
    label: "Search for targets against the thesis",
    describe: async (db, cid, id, now) => {
      const { data } = await db.from("ma_theses").select("title").eq("company_id", cid).eq("id", id!).single();
      return { title: `Target search: ${data?.title ?? "acquisition thesis"}`, dedupeKey: `ma:${id}:${isoWeek(now)}` };
    },
  },
};
