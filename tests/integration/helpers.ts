import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";

config({ path: ".env.local" });

export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const PASSWORD = "OmniDemo!2026";

export type Client = SupabaseClient<Database>;

export const admin: Client = createClient<Database>(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

/** A client authenticated as a demo user — every query goes through RLS. */
export async function as(email: string): Promise<Client> {
  const c = createClient<Database>(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return c;
}

export async function companyId(slug: string) {
  const { data } = await admin.from("companies").select("id").eq("slug", slug).single();
  return data!.id;
}
