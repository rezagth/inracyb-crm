import "server-only";
import { db, schema } from "@/db";
import { EMAIL_RE } from "@/lib/brevo";
import { isDraftNumber } from "@/lib/billing";
import { REMINDER_LABELS } from "@/lib/billing-mails";
import { documentPdfFilename, renderDocumentPdf } from "@/lib/document-pdf";
import { billingSender, brevoConfig, brevoReady, sendBrevoMail } from "./brevo";
import { getSettings, logEvent } from "./core";
import { loadDocument } from "./document-pdf";

export type DocMailRequest = {
  kind: "devis" | "facture";
  id: string;
  to: string;
  toName?: string;
  subject: string;
  text: string;
  /** 1 : rappel courtois, 2 : relance ferme. La mise en demeure ne part jamais par ce chemin (recommandé conseillé). */
  reminderLevel?: 1 | 2;
};

export type DocMailResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Envoi d'un devis, d'une facture, d'un avoir ou d'une relance, PDF joint, par Brevo.
 * Mail de facturation : hors plafond quotidien et hors pause de la prospection, sans consulter la liste
 * des désinscrits de la prospection (c'est un client). Étiqueté « facturation » pour que le webhook Brevo
 * ne le compte jamais contre la prospection.
 * L'appelant vérifie l'utilisateur (action) ou l'activation (automatisation).
 */
export async function sendDocumentMail(r: DocMailRequest): Promise<DocMailResult> {
  if (!brevoReady()) return { ok: false, error: "Brevo n'est pas configuré : ajoute BREVO_API_KEY dans .env (et dans Vercel)." };
  const to = r.to.trim().toLowerCase();
  if (!EMAIL_RE.test(to)) return { ok: false, error: "Adresse e-mail du destinataire invalide." };
  const doc = await loadDocument(r.kind, r.id);
  if (!doc) return { ok: false, error: "Document introuvable." };
  const { input } = doc;
  if (isDraftNumber(input.number) || doc.status === "brouillon") return { ok: false, error: "Émets d'abord le document : un brouillon ne s'envoie pas." };
  if (input.kind === "facture" && doc.status === "annulee") return { ok: false, error: "Cette facture est annulée par un avoir : envoie plutôt l'avoir." };
  if (r.reminderLevel) {
    if (input.kind !== "facture" || doc.status !== "envoyee" || doc.totals.rest <= 0) return { ok: false, error: "Rien à relancer : la facture est soldée, annulée ou n'est pas une facture." };
  }

  const pdf = await renderDocumentPdf(input);
  const s = await getSettings();
  const sent = await sendBrevoMail({
    from: billingSender(),
    to: { email: to, name: r.toName?.trim() || undefined },
    replyTo: EMAIL_RE.test(s.email) ? s.email : brevoConfig().replyTo,
    subject: r.subject.trim(),
    text: r.text,
    tags: ["facturation", input.kind],
    attachments: [{ name: documentPdfFilename(input.kind, input.number), contentBase64: Buffer.from(pdf).toString("base64") }],
  });
  if (!sent.ok) return { ok: false, error: sent.error };

  const what = input.kind === "devis" ? `Devis ${input.number}` : input.kind === "avoir" ? `Avoir ${input.number}` : `Facture ${input.number}`;
  const sentWord = input.kind === "facture" ? "envoyée" : "envoyé";
  await db.transaction(async (tx) => {
    if (r.reminderLevel) {
      await tx.insert(schema.reminders).values({ invoiceId: r.id, level: r.reminderLevel });
      await logEvent(tx, doc.companyId, "mail", `${REMINDER_LABELS[r.reminderLevel]} envoyé à ${to} — facture ${input.number}`);
    } else {
      await logEvent(tx, doc.companyId, "mail", `${what} ${sentWord} à ${to} (PDF joint)`);
    }
  });
  return { ok: true, message: r.reminderLevel ? `${REMINDER_LABELS[r.reminderLevel]} envoyé à ${to}` : `${what} ${sentWord} à ${to}` };
}
