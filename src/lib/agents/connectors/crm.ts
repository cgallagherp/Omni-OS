// CRM connectors. Agents work with the company's own CRM rather than a CRM inside
// Omni OS. Two implementations share one interface: the sandbox CRM (fictional data in
// Omni OS, for evaluation) and HubSpot (official CRM v3 API with a private-app token).
// Reading a CRM never implies authority to change it: writes are separate, authority-
// checked calls, and in sandbox mode a live CRM is never written to.
import type { Runtime } from "../runtime";
import { ToolError } from "../runtime";
import { activeConnections } from "./channels";
import { connectionSecret } from "./secrets";

export interface CrmOpportunity {
  id: string;
  externalId: string;
  name: string;
  account: string | null;
  stage: string;
  status: "open" | "won" | "lost";
  amount: number;
  segment: string | null;
  source: string | null;
  owner: string | null;
  createdOn: string;
  closeDate: string | null;
  closedOn: string | null;
  lastActivityOn: string | null;
}

export interface CrmTaskInput {
  opportunityId: string;
  subject: string;
  notes: string;
  owner: string | null;
  due: string;
}

export interface CrmConnector {
  provider: string;
  label: string;
  listOpportunities(): Promise<CrmOpportunity[]>;
  createTask(t: CrmTaskInput, idempotencyKey: string, approvalId?: string): Promise<{ id: string; mode: "written" | "sandbox" }>;
  taskStatus(ids: string[]): Promise<Array<{ id: string; status: "open" | "completed"; opportunityId: string | null }>>;
}

export async function crmFor(rt: Runtime): Promise<CrmConnector | null> {
  const [conn] = await activeConnections(rt, ["crm_sandbox", "hubspot"]);
  if (!conn) return null;
  return conn.provider === "crm_sandbox" ? sandboxCrm(rt, conn.display_name) : hubspotCrm(rt, conn.id, conn.display_name, conn.mode as "sandbox" | "live");
}

function sandboxCrm(rt: Runtime, label: string): CrmConnector {
  return {
    provider: "crm_sandbox",
    label,
    async listOpportunities() {
      const { data, error } = await rt.db.from("crm_sandbox_opportunities").select("*, crm_sandbox_accounts(name)").eq("company_id", rt.companyId);
      if (error) throw new ToolError(error.message, true);
      return (data ?? []).map((o) => ({
        id: o.id, externalId: o.external_id, name: o.name, account: (o.crm_sandbox_accounts as unknown as { name: string } | null)?.name ?? null, stage: o.stage, status: o.status as CrmOpportunity["status"],
        amount: Number(o.amount), segment: o.segment, source: o.source, owner: o.owner_name, createdOn: o.created_on, closeDate: o.close_date, closedOn: o.closed_on, lastActivityOn: o.last_activity_on,
      }));
    },
    async createTask(t, key, approvalId) {
      const { data, error } = await rt.db.rpc("agent_crm_create_task", { p_company: rt.companyId, p_agent: rt.agent, p_opportunity: t.opportunityId, p_subject: t.subject, p_notes: t.notes, p_owner: t.owner ?? "", p_due: t.due, p_key: key, p_approval: approvalId });
      if (error) throw new ToolError(error.message, error.code !== "42501");
      return { id: data as string, mode: "written" };
    },
    async taskStatus(ids) {
      if (!ids.length) return [];
      const { data } = await rt.db.from("crm_sandbox_tasks").select("id, status, opportunity_id").eq("company_id", rt.companyId).in("id", ids);
      return (data ?? []).map((t) => ({ id: t.id, status: t.status as "open" | "completed", opportunityId: t.opportunity_id }));
    },
  };
}

/** HubSpot CRM v3 (deals and tasks). Requires a private-app token with crm.objects.deals.read and tasks write scopes. */
function hubspotCrm(rt: Runtime, connectionId: string, label: string, mode: "sandbox" | "live"): CrmConnector {
  const api = async (path: string, init?: RequestInit) => {
    const token = await connectionSecret(rt.companyId, connectionId);
    if (!token) throw new ToolError("HubSpot is not authorised for this company");
    const res = await fetch(`https://api.hubapi.com${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 429) throw new ToolError("HubSpot rate limit — will retry", true);
    if (!res.ok) throw new ToolError(`HubSpot responded ${res.status}`, res.status >= 500);
    return res.json();
  };
  return {
    provider: "hubspot",
    label,
    async listOpportunities() {
      const props = ["dealname", "dealstage", "amount", "closedate", "createdate", "hs_lastmodifieddate", "notes_last_updated", "hubspot_owner_id", "pipeline", "hs_is_closed_won", "hs_is_closed", "deal_segment", "hs_analytics_source"];
      const out: CrmOpportunity[] = [];
      let after: string | undefined;
      for (let page = 0; page < 20; page++) {
        const body = await api("/crm/v3/objects/deals/search", { method: "POST", body: JSON.stringify({ limit: 100, after, properties: props, filterGroups: [] }) });
        for (const d of body.results ?? []) {
          const p = d.properties ?? {};
          const closed = p.hs_is_closed === "true";
          out.push({
            id: String(d.id), externalId: String(d.id), name: p.dealname ?? "Deal", account: null, stage: p.dealstage ?? "", status: closed ? (p.hs_is_closed_won === "true" ? "won" : "lost") : "open",
            amount: Number(p.amount ?? 0), segment: p.deal_segment ?? null, source: p.hs_analytics_source ?? null, owner: p.hubspot_owner_id ?? null,
            createdOn: (p.createdate ?? "").slice(0, 10), closeDate: p.closedate ? p.closedate.slice(0, 10) : null, closedOn: closed && p.closedate ? p.closedate.slice(0, 10) : null,
            lastActivityOn: (p.notes_last_updated ?? p.hs_lastmodifieddate ?? "").slice(0, 10) || null,
          });
        }
        after = body.paging?.next?.after;
        if (!after) break;
      }
      return out;
    },
    async createTask(t) {
      if (mode === "sandbox") return { id: `sandbox:${t.opportunityId}`, mode: "sandbox" };
      const body = await api("/crm/v3/objects/tasks", {
        method: "POST",
        body: JSON.stringify({
          properties: { hs_task_subject: t.subject, hs_task_body: t.notes, hs_timestamp: new Date(`${t.due}T09:00:00Z`).toISOString(), hs_task_status: "NOT_STARTED" },
          associations: [{ to: { id: t.opportunityId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 216 }] }],
        }),
      });
      return { id: String(body.id), mode: "written" };
    },
    async taskStatus(ids) {
      if (mode === "sandbox" || !ids.length) return ids.map((id) => ({ id, status: "open" as const, opportunityId: null }));
      const body = await api("/crm/v3/objects/tasks/batch/read", { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })), properties: ["hs_task_status"] }) });
      return (body.results ?? []).map((t: { id: string; properties: { hs_task_status?: string } }) => ({ id: t.id, status: t.properties.hs_task_status === "COMPLETED" ? ("completed" as const) : ("open" as const), opportunityId: null }));
    },
  };
}
