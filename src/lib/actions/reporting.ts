"use server";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { reportFigures } from "@/lib/data/reports";
import { REPORT_SECTIONS, fiscalQuarterStart, type ReportKind } from "@/lib/domain/reporting";
import { revalidateCompany } from "./common";
import { ActionError, dbError, run, type ActionResult } from "./result";

const kindSchema = z.enum(["flash", "monthly_board", "quarterly_board"]);
const periodSchema = z.string().regex(/^\d{4}-\d{2}-01$/, "Invalid period");

async function validPeriod(companyId: string, kind: ReportKind, period: string, fyStartMonth: number) {
  if (kind !== "quarterly_board") return;
  const d = new Date(`${period}T00:00:00Z`);
  if (fiscalQuarterStart(d, fyStartMonth).toISOString().slice(0, 10) !== period) throw new ActionError("A quarterly Board pack starts at the beginning of a fiscal quarter.");
  void companyId;
}

/** Saves one management text section of a draft report (creating the draft if needed). */
export async function saveReportSection(companyId: string, kind: ReportKind, period: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const k = kindSchema.parse(kind);
    const p = periodSchema.parse(period);
    const section = z.string().parse(fd.get("section"));
    if (!REPORT_SECTIONS[k].some((s) => s.key === section)) throw new ActionError("Unknown report section");
    const text = z.string().max(6000).parse(fd.get("text") ?? "");
    const { data: company } = await ctx.supabase.from("companies").select("fiscal_year_start_month").eq("id", companyId).single();
    await validPeriod(companyId, k, p, company!.fiscal_year_start_month);

    const { data: existing, error } = await ctx.supabase.from("board_reports").select("id, status, content").eq("company_id", companyId).eq("kind", k).eq("period_start", p).maybeSingle();
    dbError(error);
    if (existing?.status === "published") throw new ActionError("This report has been published and can no longer be edited.");
    const content = { ...((existing?.content as Record<string, string>) ?? {}), [section]: text };
    if (existing) {
      const { error: e2 } = await ctx.supabase.from("board_reports").update({ content }).eq("company_id", companyId).eq("id", existing.id);
      dbError(e2);
    } else {
      const { error: e2 } = await ctx.supabase.from("board_reports").insert({ company_id: companyId, kind: k, period_start: p, status: "draft", content });
      dbError(e2);
    }
    revalidateCompany(ctx);
    return { ok: true, message: "Saved" };
  });
}

/** Publishes a report: freezes the figures as a snapshot and records who published it and when. */
export async function publishReport(companyId: string, kind: ReportKind, period: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const k = kindSchema.parse(kind);
    const p = periodSchema.parse(period);
    const snap = await loadCompanySnapshot(ctx.supabase, companyId);
    if (!snap) throw new ActionError("Company not found");
    await validPeriod(companyId, k, p, snap.company.fiscal_year_start_month);
    const figures = reportFigures(snap, k, p);
    const { data: existing } = await ctx.supabase.from("board_reports").select("id, status").eq("company_id", companyId).eq("kind", k).eq("period_start", p).maybeSingle();
    if (existing?.status === "published") throw new ActionError("Already published.");
    const row = { status: "published", published_at: new Date().toISOString(), published_by: ctx.viewer.id, snapshot: figures as never };
    const { error } = existing
      ? await ctx.supabase.from("board_reports").update(row).eq("company_id", companyId).eq("id", existing.id)
      : await ctx.supabase.from("board_reports").insert({ company_id: companyId, kind: k, period_start: p, content: {}, ...row });
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Published" };
  });
}
