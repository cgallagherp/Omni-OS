// Integration credentials: AES-256-GCM encrypted with AGENTS_ENCRYPTION_KEY before they
// reach the database. Administrators can set them; nobody can read them back through
// the API (no select policy). Only the agent worker decrypts them, for the connection
// and company it is acting for.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { serviceClient } from "../principal";

function key(): Buffer {
  const k = process.env.AGENTS_ENCRYPTION_KEY;
  if (!k) throw new Error("AGENTS_ENCRYPTION_KEY is not set; integration credentials cannot be stored");
  return createHash("sha256").update(k).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, enc] = blob.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}

/** Worker only. Scoped to the company the agent is acting for. */
export async function connectionSecret(companyId: string, connectionId: string): Promise<string | null> {
  const { data } = await serviceClient().from("integration_secrets").select("ciphertext").eq("company_id", companyId).eq("connection_id", connectionId).maybeSingle();
  return data ? decryptSecret(data.ciphertext) : null;
}
