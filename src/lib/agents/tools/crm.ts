import { z } from "zod";
import { crmFor, type CrmTaskInput } from "../connectors/crm";
import { defineTool, ToolError } from "../runtime";

export const listOpportunities = defineTool({
  name: "crm.list_opportunities",
  description: "Read open and recently closed opportunities from the company's connected CRM.",
  sideEffect: "read",
  input: z.object({}),
  run: async (rt) => {
    const crm = await crmFor(rt);
    if (!crm) throw new ToolError("No CRM is connected and allowed for the Commercial Agent");
    return { crm: { provider: crm.provider, label: crm.label }, opportunities: await crm.listOpportunities() };
  },
  summarise: (_i, o) => `${o.opportunities.length} opportunities from ${o.crm.label}`,
});

export const createCrmTask = defineTool({
  name: "crm.create_task",
  description: "Create a follow-up task on an opportunity in the connected CRM (authority-checked; idempotent).",
  sideEffect: "internal",
  input: z.object({ key: z.string(), task: z.object({ opportunityId: z.string(), subject: z.string().max(200), notes: z.string().max(2000), owner: z.string().nullable(), due: z.string() }), approvalId: z.string().uuid().optional() }),
  run: async (rt, i: { key: string; task: CrmTaskInput; approvalId?: string }) => {
    const crm = await crmFor(rt);
    if (!crm) throw new ToolError("No CRM is connected and allowed for the Commercial Agent");
    await rt.checkLimit("actions");
    const key = `crm:${rt.inv.id}:${i.key}`;
    const create = async () => {
      const r = await crm.createTask(i.task, key, i.approvalId);
      await rt.bumpUsage("actions");
      return r;
    };
    // The sandbox CRM is idempotent by key, so an interrupted call can be safely repeated;
    // for an external CRM an interrupted write is left for a person to check.
    return rt.once(key, "crm.create_task", create, crm.provider === "crm_sandbox" ? create : undefined);
  },
  summarise: (i, o) => `${o.mode === "sandbox" ? "recorded (sandbox)" : "created"} "${i.task.subject}"`,
});

export const crmTaskStatus = defineTool({
  name: "crm.task_status",
  description: "Check whether follow-up tasks have been completed.",
  sideEffect: "read",
  input: z.object({ ids: z.array(z.string()).max(50) }),
  run: async (rt, i: { ids: string[] }) => {
    const crm = await crmFor(rt);
    if (!crm) throw new ToolError("No CRM is connected");
    return crm.taskStatus(i.ids);
  },
  summarise: (_i, o) => `${o.filter((t) => t.status === "completed").length}/${o.length} completed`,
});
