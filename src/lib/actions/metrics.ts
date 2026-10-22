"use server";
import Papa from "papaparse";
import { z } from "zod";
import { requireCompanyPermission } from "@/lib/auth";
import { periodStart } from "@/lib/domain/metrics";
import { insertScoped, revalidateCompany, updateScoped } from "./common";
import { ActionError, dbError, formObject, run, zNumber, zOptional, zRequired, zUuid, type ActionResult } from "./result";

const metricSchema = z
  .object({
    name: zRequired("Name", 120),
    description: zOptional(1000),
    category: z.enum(["financial", "commercial", "operational", "customer", "people"]),
    unit: z.enum(["currency", "percent", "number", "days", "ratio", "score"]),
    decimals: z.coerce.number().int().min(0).max(4).default(0),
    frequency: z.enum(["weekly", "monthly"]),
    direction: z.enum(["higher_is_better", "lower_is_better", "range"]),
    target_value: zNumber,
    target_min: zNumber,
    target_max: zNumber,
    tolerance_pct: z.coerce.number().min(0).max(100).default(10),
    aggregation: z.enum(["flow", "stock"]).default("stock"),
    owner_id: zUuid,
    comparable_key: z
      .string()
      .optional()
      .transform((v) => (v ? v.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") : null)),
    is_key: z
      .string()
      .optional()
      .transform((v) => v === "on" || v === "true"),
  })
  .superRefine((d, ctx) => {
    if (d.direction === "range") {
      if (d.target_min === null) ctx.addIssue({ code: "custom", path: ["target_min"], message: "Minimum is required for a range" });
      if (d.target_max === null) ctx.addIssue({ code: "custom", path: ["target_max"], message: "Maximum is required for a range" });
      if (d.target_min !== null && d.target_max !== null && d.target_min > d.target_max)
        ctx.addIssue({ code: "custom", path: ["target_max"], message: "Maximum must be at least the minimum" });
    } else if (d.target_value === null) {
      ctx.addIssue({ code: "custom", path: ["target_value"], message: "Target is required" });
    }
  });

export async function saveMetric(companyId: string, id: string | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = metricSchema.parse(formObject(fd));
    let metricId = id;
    if (id) await updateScoped(ctx, "metrics", id, data);
    else metricId = await insertScoped(ctx, "metrics", { ...data, sort_order: 999 });
    revalidateCompany(ctx);
    return { ok: true, message: id ? "KPI updated" : "KPI created", data: { id: metricId! } };
  });
}

export async function archiveMetric(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    await updateScoped(ctx, "metrics", id, { archived: true });
    revalidateCompany(ctx);
    return { ok: true, message: "KPI archived" };
  });
}

const valueSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Choose a reporting period"),
  value: zNumber,
  target: zNumber,
  note: zOptional(500),
});

/** Records (or corrects) the actual for one reporting period. History is kept in the audit log. */
export async function recordMetricValue(companyId: string, metricId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = valueSchema.parse(formObject(fd));
    const { data: metric, error } = await ctx.supabase.from("metrics").select("id, frequency, name").eq("company_id", companyId).eq("id", metricId).maybeSingle();
    dbError(error);
    if (!metric) throw new ActionError("KPI not found.");
    const start = periodStart(data.period.length === 7 ? `${data.period}-01` : data.period, metric.frequency);
    const row: Record<string, unknown> = {
      company_id: companyId,
      metric_id: metricId,
      period_start: start,
      value: data.value,
      note: data.note,
      source: "manual",
      entered_by: ctx.viewer.id,
    };
    if (fd.has("target")) row.target = data.target;
    const { error: e2 } = await ctx.supabase.from("metric_values").upsert(row as never, { onConflict: "metric_id,period_start" });
    dbError(e2);
    revalidateCompany(ctx);
    return { ok: true, message: `${metric.name} updated` };
  });
}

export async function setMetricLinks(companyId: string, metricId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const targets = fd.getAll("link").map(String).filter(Boolean);
    const rows = targets.map((t) => {
      const [type, id] = t.split(":");
      z.string().uuid().parse(id);
      return {
        company_id: companyId,
        metric_id: metricId,
        winning_move_id: type === "winning_move" ? id : null,
        annual_goal_id: type === "annual_goal" ? id : null,
        quarterly_priority_id: type === "quarterly_priority" ? id : null,
      };
    });
    const { error } = await ctx.supabase.from("metric_links").delete().eq("company_id", companyId).eq("metric_id", metricId);
    dbError(error);
    if (rows.length) {
      const { error: e2 } = await ctx.supabase.from("metric_links").insert(rows);
      dbError(e2);
    }
    revalidateCompany(ctx);
    return { ok: true, message: "Links updated" };
  });
}

export interface ImportRow {
  line: number;
  metric: string;
  period: string;
  value: number | null;
  target: number | null;
  status: "ok" | "error";
  message?: string;
  metricId?: string;
}

export interface ImportReport {
  rows: ImportRow[];
  valid: number;
  invalid: number;
  committed: boolean;
}

/**
 * CSV import for KPI actuals. Columns: metric (name or id), period (YYYY-MM or YYYY-MM-DD),
 * value, optional target, optional note. Validates first; commits only when `commit` is true.
 */
export async function importMetricCsv(companyId: string, csv: string, commit: boolean): Promise<ActionResult<ImportReport>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    if (csv.length > 1_000_000) throw new ActionError("File is too large (1MB maximum).");
    const parsed = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    if (!parsed.meta.fields?.includes("metric") || !parsed.meta.fields.includes("period") || !parsed.meta.fields.includes("value")) {
      throw new ActionError("The CSV needs metric, period and value columns.");
    }
    const { data: metrics, error } = await ctx.supabase.from("metrics").select("id, name, frequency").eq("company_id", companyId).eq("archived", false);
    dbError(error);
    const byName = new Map((metrics ?? []).map((m) => [m.name.trim().toLowerCase(), m]));
    const byId = new Map((metrics ?? []).map((m) => [m.id, m]));
    const toNum = (s: string | undefined) => {
      if (s === undefined || s.trim() === "") return null;
      const n = Number(s.replace(/[,£$€%x\s]/g, ""));
      return Number.isFinite(n) ? n : NaN;
    };

    const rows: ImportRow[] = parsed.data.map((r, i) => {
      const line = i + 2;
      const key = (r.metric ?? "").trim();
      const metric = byId.get(key) ?? byName.get(key.toLowerCase());
      const value = toNum(r.value);
      const target = toNum(r.target);
      const period = (r.period ?? "").trim();
      const base = { line, metric: key, period, value: Number.isNaN(value) ? null : value, target: Number.isNaN(target) ? null : target };
      if (!metric) return { ...base, status: "error", message: "Unknown KPI" };
      if (!/^\d{4}-\d{2}(-\d{2})?$/.test(period)) return { ...base, status: "error", message: "Period must be YYYY-MM or YYYY-MM-DD" };
      if (value === null || Number.isNaN(value)) return { ...base, status: "error", message: "Value must be a number" };
      if (Number.isNaN(target)) return { ...base, status: "error", message: "Target must be a number" };
      return { ...base, status: "ok", metricId: metric.id, period: periodStart(period.length === 7 ? `${period}-01` : period, metric.frequency) };
    });

    const valid = rows.filter((r) => r.status === "ok");
    if (commit && valid.length) {
      const hasTarget = parsed.meta.fields.includes("target");
      // Last row wins for duplicate metric/period pairs within the file
      const dedup = new Map(valid.map((r) => [`${r.metricId}|${r.period}`, r]));
      const all = [...dedup.values()];
      const row = (r: ImportRow) => ({ company_id: companyId, metric_id: r.metricId!, period_start: r.period, value: r.value, source: "csv", entered_by: ctx.viewer.id });
      // Upsert rows with and without targets separately so a missing target never overwrites a phased budget.
      const withTarget = all.filter((r) => hasTarget && r.target !== null).map((r) => ({ ...row(r), target: r.target }));
      const withoutTarget = all.filter((r) => !(hasTarget && r.target !== null)).map(row);
      for (const batch of [withTarget, withoutTarget]) {
        if (!batch.length) continue;
        const { error: e2 } = await ctx.supabase.from("metric_values").upsert(batch as never, { onConflict: "metric_id,period_start" });
        dbError(e2);
      }
      revalidateCompany(ctx);
    }
    return {
      ok: true,
      message: commit ? `Imported ${valid.length} observations` : undefined,
      data: { rows, valid: valid.length, invalid: rows.length - valid.length, committed: commit && valid.length > 0 },
    };
  });
}
