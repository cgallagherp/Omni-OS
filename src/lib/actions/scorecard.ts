"use server";
import { z } from "zod";
import { PermissionError, requireCompanyPermission } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { scorecardEmailHtml } from "@/lib/domain/weekly-scorecard";
import { formatDate } from "@/lib/domain/format";
import { deliverEmail } from "@/lib/email";
import { revalidateCompany } from "./common";
import { ActionError, dbError, run, type ActionResult } from "./result";

/** Omni team members of the company: the authorised recipients of the Monday scorecard. */
async function omniRecipients(ctx: Awaited<ReturnType<typeof requireCompanyPermission>>) {
  const { data, error } = await ctx.supabase
    .from("company_memberships")
    .select("user_id, profiles(full_name, email)")
    .eq("company_id", ctx.company.companyId)
    .eq("role", "omni");
  dbError(error);
  return (data ?? []).flatMap((m) => {
    const p = m.profiles as unknown as { full_name: string; email: string } | null;
    return p ? [{ userId: m.user_id, name: p.full_name, email: p.email }] : [];
  });
}

/**
 * The CEO (or a company administrator acting for them) approves the scorecard
 * generated for this week; it is then sent to the selected Omni recipients by
 * email and shown to them in Omni OS. Rows are rebuilt on the server from live
 * data at approval time — the client never supplies scorecard content.
 */
export async function approveWeeklyScorecard(companyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    if (ctx.company.role !== "ceo" && ctx.company.role !== "company_admin")
      throw new PermissionError("The Monday scorecard is approved by the company's CEO.");
    const snap = await loadCompanySnapshot(ctx.supabase, companyId);
    if (!snap) throw new ActionError("Company not found");
    if (!snap.scorecard.length) throw new ActionError("Choose the KPIs for the weekly scorecard first.");

    const all = await omniRecipients(ctx);
    const chosen = new Set(fd.getAll("recipient").map(String));
    const recipients = all.filter((r) => chosen.has(r.userId));
    if (!recipients.length) throw new ActionError("Choose at least one Omni recipient.");

    const now = new Date().toISOString();
    const { data: sc, error } = await ctx.supabase
      .from("weekly_scorecards")
      .upsert(
        {
          company_id: companyId,
          week_start: snap.weekStart,
          rows: snap.scorecard as never,
          recipients: recipients.map((r) => ({ user_id: r.userId, name: r.name, email: r.email })) as never,
          approved_by: ctx.viewer.id,
          approved_at: now,
          sent_at: now,
        },
        { onConflict: "company_id,week_start" },
      )
      .select("id")
      .single();
    dbError(error);

    const subject = `${snap.company.name} — KPI scorecard, week of ${formatDate(snap.weekStart)}`;
    const html = scorecardEmailHtml({ company: snap.company.name, weekStart: snap.weekStart, rows: snap.scorecard, approvedBy: ctx.viewer.fullName, brandColor: ctx.company.branding.primary ?? undefined });
    const delivery = await deliverEmail({ to: recipients.map((r) => r.email), subject, html });
    const { error: e2 } = await ctx.supabase.from("email_outbox").insert({
      company_id: companyId,
      kind: "weekly_scorecard",
      subject,
      html,
      recipients: recipients.map((r) => r.email) as never,
      status: delivery.status,
      error: delivery.status === "failed" ? delivery.error : null,
      ref_id: sc!.id,
      created_by: ctx.viewer.id,
      sent_at: delivery.status === "sent" ? now : null,
    });
    dbError(e2);
    revalidateCompany(ctx);
    const where = `${recipients.length} Omni recipient${recipients.length === 1 ? "" : "s"}`;
    return {
      ok: true,
      message:
        delivery.status === "sent"
          ? `Approved and emailed to ${where}`
          : delivery.status === "failed"
            ? `Approved and shared in Omni OS with ${where}; email delivery failed`
            : `Approved and shared in Omni OS with ${where} (email delivery is not configured)`,
    };
  });
}

/** Chooses which KPIs appear in the Monday scorecard. */
export async function setScorecardMetrics(companyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const ids = z.array(z.string().uuid()).max(15, "Keep the scorecard short — 15 KPIs at most").parse(fd.getAll("metric").map(String));
    const { error: e1 } = await ctx.supabase.from("metrics").update({ in_weekly_scorecard: false }).eq("company_id", companyId).eq("in_weekly_scorecard", true);
    dbError(e1);
    if (ids.length) {
      const { error: e2 } = await ctx.supabase.from("metrics").update({ in_weekly_scorecard: true }).eq("company_id", companyId).in("id", ids);
      dbError(e2);
    }
    revalidateCompany(ctx);
    return { ok: true, message: `${ids.length} KPI${ids.length === 1 ? "" : "s"} in the weekly scorecard` };
  });
}
