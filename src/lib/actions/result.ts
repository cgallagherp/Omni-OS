import "server-only";
import { z } from "zod";
import { PermissionError } from "@/lib/auth";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class ActionError extends Error {}

/** Maps Postgres / PostgREST errors into user-facing messages. */
export function dbError(error: { message: string; code?: string } | null): never | void {
  if (!error) return;
  if (error.code === "42501" || /row-level security/i.test(error.message)) throw new PermissionError();
  if (error.code === "23514" || error.code === "P0001") throw new ActionError(error.message.replace(/^.*?:\s*/, "") || error.message);
  if (error.code === "23503") throw new ActionError("That change references a record that doesn't exist or belongs to another company.");
  if (error.code === "23505") throw new ActionError("A record with those details already exists.");
  throw new ActionError(error.message);
}

export async function run<T>(fn: () => Promise<ActionResult<T> | void>): Promise<ActionResult<T>> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
    }
    if (e instanceof PermissionError || e instanceof ActionError) return { ok: false, error: e.message };
    // Next.js redirect / notFound must propagate
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

// FormData helpers -----------------------------------------------------------
export const zText = (max = 2000) => z.string().trim().max(max);
export const zRequired = (label: string, max = 300) => z.string().trim().min(1, `${label} is required`).max(max);
export const zOptional = (max = 5000) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));
export const zUuid = z.string().uuid("Invalid reference");
export const zOptionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());
export const zDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable());
export const zNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : Number(String(v).replace(/[,£$€%x\s]/g, ""))))
  .pipe(z.number({ message: "Must be a number" }).finite().nullable());
export const zPercent = z.coerce.number().int().min(0).max(100);

export function formObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
