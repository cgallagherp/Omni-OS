import "server-only";
import { revalidatePath } from "next/cache";
import type { CompanyContext } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { ActionError, dbError } from "./result";

type Tables = Database["public"]["Tables"];
export type TableName = keyof Tables;

export function revalidateCompany(ctx: CompanyContext) {
  revalidatePath(`/c/${ctx.company.slug}`, "layout");
  revalidatePath("/portfolio", "layout");
}

/** Update a single tenant row, scoped to the company. Errors if nothing matched. */
export async function updateScoped<T extends TableName>(ctx: CompanyContext, table: T, id: string, patch: Tables[T]["Update"]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (ctx.supabase.from(table) as any).update(patch).eq("company_id", ctx.company.companyId).eq("id", id).select("id").maybeSingle();
  const { data, error } = await q;
  dbError(error);
  if (!data) throw new ActionError("Record not found.");
}

export async function insertScoped<T extends TableName>(ctx: CompanyContext, table: T, row: Omit<Tables[T]["Insert"], "company_id">) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (ctx.supabase.from(table) as any).insert({ ...row, company_id: ctx.company.companyId }).select("id").single();
  dbError(error);
  return (data as { id: string }).id;
}

export async function deleteScoped(ctx: CompanyContext, table: TableName, id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (ctx.supabase.from(table) as any).delete().eq("company_id", ctx.company.companyId).eq("id", id).select("id");
  dbError(error);
  if (!data?.length) throw new ActionError("Record not found.");
}
