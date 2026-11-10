import "server-only";
import { BREVO_ENDPOINT, EMAIL_RE, buildBrevoPayload, explainBrevoError, type MailInput } from "@/lib/brevo";

/** Réglages lus dans l'environnement (jamais exposés au navigateur). */
export function brevoConfig() {
  const fromEmail = (process.env.MAIL_FROM_EMAIL || "contact@infracyb.fr").trim();
  const limit = Number.parseInt(process.env.MAIL_DAILY_LIMIT ?? "", 10);
  return {
    apiKey: (process.env.BREVO_API_KEY || "").trim(),
    fromEmail,
    fromName: (process.env.MAIL_FROM_NAME || "InfraCyb").trim(),
    replyTo: (process.env.MAIL_REPLY_TO || fromEmail).trim(),
    /** Plafond d'envois par jour depuis le CRM : prudent au démarrage d'un domaine neuf. */
    dailyLimit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 300) : 10,
  };
}

export function brevoReady(): boolean {
  const c = brevoConfig();
  return !!c.apiKey && EMAIL_RE.test(c.fromEmail);
}

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };

export async function sendBrevoMail(input: Omit<MailInput, "from" | "replyTo"> & { replyTo?: string }): Promise<SendResult> {
  const c = brevoConfig();
  if (!c.apiKey) return { ok: false, error: "Brevo n'est pas configuré : ajoute BREVO_API_KEY dans .env (et dans Vercel)." };
  if (!EMAIL_RE.test(input.to.email)) return { ok: false, error: "Adresse e-mail du destinataire invalide." };
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "api-key": c.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(buildBrevoPayload({ ...input, from: { email: c.fromEmail, name: c.fromName }, replyTo: input.replyTo ?? c.replyTo })),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: explainBrevoError(res.status, body) };
    const id = body && typeof body === "object" && "messageId" in body ? String((body as { messageId: unknown }).messageId) : "";
    return { ok: true, messageId: id };
  } catch {
    return { ok: false, error: "Brevo ne répond pas (réseau ou délai dépassé). Rien n'a été enregistré : réessaie." };
  }
}
