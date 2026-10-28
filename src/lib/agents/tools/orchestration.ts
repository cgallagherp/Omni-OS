// Agent-to-agent delegation and strategic context. An agent may commission work only
// from agents its definition allows, only within the same company, and the commissioned
// agent runs with its own configuration — delegation never transfers permissions.
import { z } from "zod";
import { kpiContext } from "../context";
import { ACTIVE_STATUSES, AGENTS, type AgentKey } from "../registry";
import { defineTool, ToolError } from "../runtime";
import { openInvestigation } from "../engine";

export const readKpiContext = defineTool({
  name: "context.kpi",
  description: "A KPI's history with the North Star, Flight Plan items it measures, related KPIs, corrective actions and issues — with sources.",
  sideEffect: "read",
  input: z.object({ metricId: z.string().uuid() }),
  run: (rt, i: { metricId: string }) => kpiContext(rt, i.metricId),
  summarise: (_i, o) => `${o.metric.name}: ${o.points.length} periods, ${o.links.length} Flight Plan links, ${o.related.length} related KPIs`,
});

export const delegate = defineTool({
  name: "agents.delegate",
  description: "Commission a specialist agent to investigate part of the problem.",
  sideEffect: "internal",
  input: z.object({ to: z.enum(["commercial", "execution", "ma"]), workflow: z.string(), title: z.string().min(5).max(300), question: z.string().min(5).max(1000), subjectType: z.string().optional(), subjectId: z.string().uuid().optional() }),
  run: async (rt, i: { to: AgentKey; workflow: string; title: string; question: string; subjectType?: string; subjectId?: string }) => {
    if (!AGENTS[rt.agent].delegatesTo.includes(i.to)) throw new ToolError(`${AGENTS[rt.agent].name} may not commission the ${AGENTS[i.to].name}`);
    const { data: cfg } = await rt.db.from("agent_configs").select("enabled").eq("company_id", rt.companyId).eq("agent_key", i.to).maybeSingle();
    if (!cfg?.enabled) return { delegated: false as const, reason: `${AGENTS[i.to].name} is switched off` };
    // Join a case the specialist already has open on the same subject rather than duplicating its work
    let q = rt.db.from("agent_investigations").select("id, parent_id").eq("company_id", rt.companyId).eq("agent_key", i.to).eq("workflow", i.workflow).in("status", ACTIVE_STATUSES);
    q = i.subjectId ? q.eq("subject_id", i.subjectId) : q.is("subject_id", null);
    const { data: live } = await q.limit(1).maybeSingle();
    if (live) {
      if (!live.parent_id) await rt.db.from("agent_investigations").update({ parent_id: rt.inv.id }).eq("company_id", rt.companyId).eq("id", live.id);
      await rt.db.from("agent_events").insert({ company_id: rt.companyId, investigation_id: live.id, agent_key: i.to, kind: "delegation", summary: `The ${AGENTS[rt.agent].name} joined this investigation: ${i.question}`.slice(0, 500), data: { parent_id: rt.inv.id } });
      return { delegated: true as const, childId: live.id };
    }
    const r = await openInvestigation(rt.db, {
      companyId: rt.companyId, agent: i.to, workflow: i.workflow, title: i.title, dedupeKey: `delegated:${rt.inv.id}:${i.to}`,
      subjectType: i.subjectType, subjectId: i.subjectId, parentId: rt.inv.id,
      trigger: { type: "delegation", summary: `Commissioned by the ${AGENTS[rt.agent].name}: ${i.question}`, from: rt.agent, parent_id: rt.inv.id },
    });
    return { delegated: true as const, childId: r.id };
  },
  summarise: (i, o) => (o.delegated ? `commissioned the ${AGENTS[i.to].name}` : o.reason),
});
