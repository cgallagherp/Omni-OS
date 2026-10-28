// The agent principal: one non-human identity per company. The worker signs short-lived
// JWTs for it, so every query an agent makes runs through Postgres Row Level Security
// exactly like a person's would. The service-role client is used only here and in the
// worker's queue management — never to read or change company data on an agent's behalf.
import { createHmac, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type Db = SupabaseClient<Database>;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for the agent worker`);
  return v;
}

/** Queue and provisioning only. */
export function serviceClient(): Db {
  return createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** HS256 JWT for the agent principal, valid for `ttlSeconds`. */
export function mintAgentJwt(userId: string, ttlSeconds = 600): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated", iat: now, exp: now + ttlSeconds, iss: "omni-os-agent-worker", is_agent: true }));
  const sig = createHmac("sha256", env("SUPABASE_JWT_SECRET")).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

/** A Supabase client acting as the company's agent principal (RLS applies). */
export function agentClient(userId: string): Db {
  const token = mintAgentJwt(userId);
  return createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Finds or provisions the agent principal for a company. Idempotent. */
export async function ensureAgentPrincipal(admin: Db, companyId: string, slug: string): Promise<string> {
  const { data: existing } = await admin.from("company_memberships").select("user_id").eq("company_id", companyId).eq("role", "agent").maybeSingle();
  if (existing) return existing.user_id;
  const email = `agents+${slug}@agents.omni-os.invalid`;
  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"), // never stored or shown; sign-in is also banned below
    email_confirm: true,
    user_metadata: { full_name: "Omni OS agents" },
  });
  if (created.error) {
    // created by a concurrent worker, or left from an earlier attempt
    const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!profile) throw new Error(`Could not provision the agent principal: ${created.error.message}`);
    userId = profile.id;
  } else userId = created.data.user.id;
  await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  const { error: pe } = await admin.from("profiles").update({ is_agent: true, full_name: "Omni OS agents", title: "Agent principal" }).eq("id", userId);
  if (pe) throw new Error(pe.message);
  const { error: me } = await admin.from("company_memberships").upsert({ company_id: companyId, user_id: userId, role: "agent" }, { onConflict: "company_id,user_id" });
  if (me) throw new Error(me.message);
  return userId;
}
