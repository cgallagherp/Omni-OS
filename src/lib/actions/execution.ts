"use server";
import { z } from "zod";
import { requireCompanyPermission, type CompanyContext } from "@/lib/auth";
import { insertScoped, revalidateCompany, updateScoped } from "./common";
import { formObject, run, zDate, zOptional, zOptionalUuid, zRequired, zUuid, type ActionResult } from "./result";

async function viewerCrewId(ctx: CompanyContext) {
  const { data } = await ctx.supabase.from("crew_members").select("id").eq("company_id", ctx.company.companyId).eq("user_id", ctx.viewer.id).maybeSingle();
  return data?.id ?? null;
}

const issueSchema = z.object({
  title: zRequired("Title"),
  description: zOptional(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "in_discussion", "resolved"]).default("open"),
  owner_id: zUuid,
  metric_id: zOptionalUuid,
  quarterly_priority_id: zOptionalUuid,
  annual_goal_id: zOptionalUuid,
  raised_in_meeting_id: zOptionalUuid,
  escalated_to_omni: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export async function saveIssue(companyId: string, id: string | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = issueSchema.parse(formObject(fd));
    let issueId = id;
    if (id) {
      const { raised_in_meeting_id: _ignored, ...patch } = data;
      void _ignored;
      await updateScoped(ctx, "issues", id, patch);
    } else {
      issueId = await insertScoped(ctx, "issues", { ...data, raised_by_id: await viewerCrewId(ctx) });
      // Raised during a live meeting: put it on that meeting's agenda.
      if (data.raised_in_meeting_id) {
        await insertScoped(ctx, "meeting_agenda_items", {
          meeting_id: data.raised_in_meeting_id,
          section: "issues",
          entity_type: "issue",
          entity_id: issueId,
          title: data.title,
          snapshot: { priority: data.priority, raised_live: true },
          sort_order: 900,
        });
      }
    }
    revalidateCompany(ctx);
    return { ok: true, message: id ? "Issue updated" : "Issue raised", data: { id: issueId! } };
  });
}

export async function setIssueStatus(companyId: string, id: string, status: "open" | "in_discussion" | "resolved"): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    await updateScoped(ctx, "issues", id, { status });
    revalidateCompany(ctx);
  });
}

export async function resolveIssue(companyId: string, id: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = z.object({ resolution: zRequired("Resolution", 2000), meeting_id: zOptionalUuid }).parse(formObject(fd));
    await updateScoped(ctx, "issues", id, { status: "resolved", resolution: data.resolution, resolved_in_meeting_id: data.meeting_id });
    revalidateCompany(ctx);
    return { ok: true, message: "Issue resolved" };
  });
}

export async function reopenIssue(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    await updateScoped(ctx, "issues", id, { status: "open", resolution: null, resolved_in_meeting_id: null });
    revalidateCompany(ctx);
    return { ok: true, message: "Issue reopened" };
  });
}

export async function setIssueEscalation(companyId: string, id: string, escalated: boolean): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    await updateScoped(ctx, "issues", id, { escalated_to_omni: escalated });
    revalidateCompany(ctx);
    return { ok: true, message: escalated ? "Escalated to Omni" : "Escalation withdrawn" };
  });
}

const decisionSchema = z.object({
  title: zRequired("Decision"),
  rationale: zOptional(),
  owner_id: zUuid,
  decided_on: zDate,
  issue_id: zOptionalUuid,
  meeting_id: zOptionalUuid,
  resolve_issue: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export async function saveDecision(companyId: string, id: string | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const { resolve_issue, ...data } = decisionSchema.parse(formObject(fd));
    const row = { ...data, decided_on: data.decided_on ?? new Date().toISOString().slice(0, 10) };
    let decisionId = id;
    if (id) await updateScoped(ctx, "decisions", id, row);
    else decisionId = await insertScoped(ctx, "decisions", { ...row, created_by: ctx.viewer.id });
    if (resolve_issue && data.issue_id) {
      await updateScoped(ctx, "issues", data.issue_id, { status: "resolved", resolution: data.title, resolved_in_meeting_id: data.meeting_id });
    }
    revalidateCompany(ctx);
    return { ok: true, message: id ? "Decision updated" : "Decision recorded", data: { id: decisionId! } };
  });
}
