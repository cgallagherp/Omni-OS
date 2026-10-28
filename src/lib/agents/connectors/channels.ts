// Internal communication channels. The Omni OS inbox is always available to people
// with a login. A company can additionally connect email (Resend) or Microsoft Outlook
// (Graph). Connections in 'sandbox' mode record what would have been sent without
// sending it; nothing is sent through a channel the company has not connected,
// authorised and allowed for the agent.
import type { Runtime } from "../runtime";
import { connectionSecret } from "./secrets";

export interface Delivery {
  channel: string;
  status: "delivered" | "sent" | "sandbox" | "failed";
  detail: string | null;
}

export async function activeConnections(rt: Runtime, providers: string[]) {
  const allowed = new Set(rt.config?.allowed_connections ?? []);
  const { data } = await rt.db.from("integration_connections").select("*").eq("company_id", rt.companyId).in("provider", providers).eq("status", "connected");
  return (data ?? []).filter((c) => allowed.has(c.id));
}

export async function deliverExternally(rt: Runtime, m: { to: { full_name: string; email: string | null }; subject: string; body: string; idempotencyKey: string }): Promise<Delivery> {
  const conns = await activeConnections(rt, ["email_resend", "microsoft_outlook"]);
  const conn = conns[0];
  if (!conn) return { channel: "omni_inbox", status: "delivered", detail: "Delivered to the Omni OS inbox" };
  if (!m.to.email) return { channel: "omni_inbox", status: "delivered", detail: `No email address for ${m.to.full_name}; Omni OS inbox only` };
  if (conn.mode === "sandbox") return { channel: conn.provider, status: "sandbox", detail: `Sandbox: would have sent to ${m.to.email} via ${conn.display_name}` };
  try {
    const secret = await connectionSecret(rt.companyId, conn.id);
    if (!secret) return { channel: "omni_inbox", status: "delivered", detail: `${conn.display_name} has no credentials; Omni OS inbox only` };
    if (conn.provider === "email_resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "idempotency-key": m.idempotencyKey },
        body: JSON.stringify({ from: (conn.config as { from?: string }).from, to: [m.to.email], subject: m.subject, text: m.body }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { channel: conn.provider, status: "failed", detail: `Email provider responded ${res.status}; delivered to the Omni OS inbox` };
      return { channel: conn.provider, status: "sent", detail: `Emailed ${m.to.email}` };
    }
    // Microsoft Graph: send as the connected mailbox (OAuth access token stored as the secret)
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { subject: m.subject, body: { contentType: "Text", content: m.body }, toRecipients: [{ emailAddress: { address: m.to.email } }] }, saveToSentItems: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { channel: conn.provider, status: "failed", detail: `Outlook responded ${res.status}; delivered to the Omni OS inbox` };
    return { channel: conn.provider, status: "sent", detail: `Sent from the connected Outlook mailbox to ${m.to.email}` };
  } catch (e) {
    return { channel: conn.provider, status: "failed", detail: `${e instanceof Error ? e.message : "Delivery failed"}; delivered to the Omni OS inbox` };
  }
}
