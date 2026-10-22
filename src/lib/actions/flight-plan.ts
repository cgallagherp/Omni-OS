"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { deleteScoped, insertScoped, revalidateCompany, updateScoped } from "./common";
import {
  ActionError,
  dbError,
  formObject,
  run,
  zDate,
  zNumber,
  zOptional,
  zOptionalUuid,
  zPercent,
  zRequired,
  zUuid,
  type ActionResult,
} from "./result";

const rag = z.enum(["on_track", "at_risk", "off_track", "done", "missed", "not_started"]);
const unit = z
  .enum(["currency", "percent", "number", "days", "ratio", "score", ""])
  .optional()
  .transform((v) => (v ? v : null));

const base = {
  title: zRequired("Title"),
  description: zOptional(),
  measurable_outcome: zOptional(500),
  owner_id: zUuid,
  status: rag,
  progress: zPercent,
  start_date: zDate,
  due_date: zDate,
};

const winningMoveSchema = z.object(base);
const annualGoalSchema = z.object({
  ...base,
  winning_move_id: zUuid,
  fiscal_year: z.coerce.number().int().min(2000).max(2100),
  unit,
  baseline_value: zNumber,
  target_value: zNumber,
  current_value: zNumber,
});
const prioritySchema = z.object({ ...base, quarter_id: zUuid, annual_goal_id: zUuid });
const actionSchema = z.object({
  title: zRequired("Title"),
  description: zOptional(),
  owner_id: zUuid,
  due_date: zDate,
  status: z.enum(["open", "done", "cancelled"]).default("open"),
  quarterly_priority_id: zOptionalUuid,
  issue_id: zOptionalUuid,
  decision_id: zOptionalUuid,
  meeting_id: zOptionalUuid,
});

export async function saveWinningMove(companyId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = winningMoveSchema.parse(formObject(fd));
    if (id) await updateScoped(ctx, "winning_moves", id, data);
    else await insertScoped(ctx, "winning_moves", { ...data, sort_order: 99 });
    revalidateCompany(ctx);
    return { ok: true, message: id ? "Winning Move updated" : "Winning Move added" };
  });
}

export async function archiveWinningMove(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    await updateScoped(ctx, "winning_moves", id, { archived: true });
    revalidateCompany(ctx);
    return { ok: true, message: "Winning Move archived" };
  });
}

export async function saveAnnualGoal(companyId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = annualGoalSchema.parse(formObject(fd));
    if (id) await updateScoped(ctx, "annual_goals", id, data);
    else await insertScoped(ctx, "annual_goals", { ...data, sort_order: 99 });
    revalidateCompany(ctx);
    return { ok: true, message: id ? "Annual goal updated" : "Annual goal added" };
  });
}

export async function savePriority(companyId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = prioritySchema.parse(formObject(fd));
    if (id) await updateScoped(ctx, "quarterly_priorities", id, data);
    else await insertScoped(ctx, "quarterly_priorities", { ...data, sort_order: 99 });
    revalidateCompany(ctx);
    return { ok: true, message: id ? "Priority updated" : "Priority added" };
  });
}

export async function saveAction(companyId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = actionSchema.parse(formObject(fd));
    if (id) await updateScoped(ctx, "actions", id, data);
    else await insertScoped(ctx, "actions", { ...data, created_by: ctx.viewer.id });
    revalidateCompany(ctx);
    return { ok: true, message: id ? "Action updated" : "Action assigned" };
  });
}

export async function setActionStatus(companyId: string, id: string, status: "open" | "done" | "cancelled"): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    await updateScoped(ctx, "actions", id, { status });
    revalidateCompany(ctx);
  });
}

const ENTITY_TABLE = {
  winning_move: "winning_moves",
  annual_goal: "annual_goals",
  quarterly_priority: "quarterly_priorities",
} as const;
export type PlanEntity = keyof typeof ENTITY_TABLE;

/** Inline status / progress update for a Flight Plan item. */
export async function updatePlanItem(companyId: string, entity: PlanEntity, id: string, patch: { status?: string; progress?: number }): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const parsed = z.object({ status: rag.optional(), progress: zPercent.optional() }).parse(patch);
    if (!ENTITY_TABLE[entity]) throw new ActionError("Unknown item type");
    await updateScoped(ctx, ENTITY_TABLE[entity], id, parsed);
    revalidateCompany(ctx);
  });
}

export async function deletePlanItem(companyId: string, entity: PlanEntity | "action", id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    await deleteScoped(ctx, entity === "action" ? "actions" : ENTITY_TABLE[entity], id);
    revalidateCompany(ctx);
    return { ok: true, message: "Deleted" };
  });
}

const commentSchema = z.object({
  body: zRequired("Update", 5000),
  kind: z.enum(["comment", "update"]).default("comment"),
  status: rag.optional().or(z.literal("").transform(() => undefined)),
  progress: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
    .pipe(z.number().int().min(0).max(100).optional()),
});
const COMMENTABLE = ["winning_move", "annual_goal", "quarterly_priority", "action", "issue", "decision", "metric", "meeting", "north_star"] as const;

/** Adds a comment or status update. Updates on plan items can also move status/progress. */
export async function addComment(companyId: string, entityType: (typeof COMMENTABLE)[number], entityId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    if (!COMMENTABLE.includes(entityType)) throw new ActionError("Cannot comment on this item");
    const data = commentSchema.parse(formObject(fd));
    if (entityType in ENTITY_TABLE && (data.status || data.progress !== undefined)) {
      await updateScoped(ctx, ENTITY_TABLE[entityType as PlanEntity], entityId, {
        ...(data.status ? { status: data.status } : {}),
        ...(data.progress !== undefined ? { progress: data.progress } : {}),
      });
    }
    await insertScoped(ctx, "comments", { entity_type: entityType, entity_id: entityId, kind: data.kind, body: data.body, author_id: ctx.viewer.id });
    revalidateCompany(ctx);
    return { ok: true, message: data.kind === "update" ? "Update posted" : "Comment added" };
  });
}

const depTypes = z.enum(["winning_move", "annual_goal", "quarterly_priority", "action"]);
export async function addDependency(companyId: string, fromType: string, fromId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const [toType, toId] = String(fd.get("target") ?? "").split(":");
    const parsed = z.object({ fromType: depTypes, toType: depTypes, fromId: zUuid, toId: zUuid, note: zOptional(300) }).parse({ fromType, toType, fromId, toId, note: fd.get("note") ?? undefined });
    if (parsed.fromId === parsed.toId) throw new ActionError("An item cannot depend on itself");
    // Both ends must belong to this company (RLS would hide other tenants' rows anyway).
    for (const [t, i] of [[parsed.fromType, parsed.fromId], [parsed.toType, parsed.toId]] as const) {
      const table = t === "action" ? "actions" : ENTITY_TABLE[t];
      const { data, error } = await ctx.supabase.from(table).select("id").eq("company_id", companyId).eq("id", i).maybeSingle();
      dbError(error);
      if (!data) throw new ActionError("Dependency target not found");
    }
    await insertScoped(ctx, "dependencies", { from_type: parsed.fromType, from_id: parsed.fromId, to_type: parsed.toType, to_id: parsed.toId, note: parsed.note });
    revalidateCompany(ctx);
    return { ok: true, message: "Dependency added" };
  });
}

export async function removeDependency(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    await deleteScoped(ctx, "dependencies", id);
    revalidateCompany(ctx);
  });
}
