import "server-only";

export interface OutgoingEmail {
  to: string[];
  subject: string;
  html: string;
}

export type DeliveryResult = { status: "sent" } | { status: "failed"; error: string } | { status: "not_configured" };

/**
 * Sends an email through the configured provider. Omni OS ships with Resend
 * support (RESEND_API_KEY + EMAIL_FROM). Without a provider the message is
 * still recorded in the outbox and delivered in-app; nothing is pretended.
 */
export async function deliverEmail(email: OutgoingEmail): Promise<DeliveryResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || email.to.length === 0) return { status: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { status: "failed", error: `Provider responded ${res.status}` };
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "Delivery failed" };
  }
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
