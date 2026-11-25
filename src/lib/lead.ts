/**
 * Demandes entrantes envoyées par le site public (www.infracyb.fr) : test de messagerie et autodiagnostic.
 * Règles pures (sans base ni réseau) : signature de la demande, validation, texte du mail de réponse.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { clean } from "./diagnostic";
import { EMAIL_RE } from "./brevo";

/** Écart maximal accepté entre l'horodatage signé par le site et l'heure du CRM. */
export const LEAD_MAX_SKEW_SECONDS = 300;
/** Demandes entrantes acceptées au plus par jour (protection contre le remplissage de la base). */
export const LEAD_DAILY_CAP = 50;
/** Début du texte de l'événement « demande entrante » (sert aussi à la file d'appels et au rapport du lundi). */
export const LEAD_EVENT = "Demande entrante depuis le site";
/** Origine de l'adresse d'un contact venu d'un formulaire : jamais de séquence de prospection froide. */
export const LEAD_EMAIL_SOURCE = "formulaire";

export const LEAD_KINDS = { "test-messagerie": "test de messagerie", autodiagnostic: "autodiagnostic" } as const;
export type LeadKind = keyof typeof LEAD_KINDS;

/** Messageries grand public : le test porte sur le domaine de l'entreprise, pas sur celui d'un fournisseur de messagerie. */
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com",
  "yahoo.com", "yahoo.fr", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "aol.fr", "orange.fr", "wanadoo.fr",
  "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "bbox.fr", "numericable.fr", "gmx.fr", "gmx.com", "gmx.de", "proton.me",
  "protonmail.com", "pm.me", "tutanota.com", "mail.com", "zoho.com", "yandex.com", "club-internet.fr", "aliceadsl.fr",
]);

/** Signature HMAC-SHA256 (hex) de « <horodatage>.<corps> » : même règle que le lien avec StratCyber. */
export function signLead(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** La demande vient-elle bien du site, et pas d'il y a plus de 5 minutes ? */
export function verifyLead(secret: string, timestamp: string, rawBody: string, signature: string, nowMs: number): boolean {
  if (secret.length < 32 || !/^\d{10}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > LEAD_MAX_SKEW_SECONDS) return false;
  const good = Buffer.from(signLead(secret, timestamp, rawBody), "hex");
  const given = Buffer.from(signature, "hex");
  return good.length === given.length && timingSafeEqual(good, given);
}

export type Lead = {
  kind: LeadKind;
  email: string;
  domain: string;
  firstName: string;
  company: string;
  phone: string;
  /** autodiagnostic : niveau et réponses résumées, à noter sur la fiche */
  summary: string;
};

/** Valide une demande ; renvoie un message lisible par le visiteur en cas de refus. */
export function parseLead(input: unknown): { ok: true; lead: Lead } | { ok: false; error: string } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const kind = typeof o.kind === "string" && o.kind in LEAD_KINDS ? (o.kind as LeadKind) : null;
  if (!kind) return { ok: false, error: "Demande inconnue." };
  if (o.consent !== true) return { ok: false, error: "Merci de cocher la case d'accord pour être recontacté." };
  const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 200) return { ok: false, error: "Adresse e-mail invalide." };
  const domain = email.split("@")[1];
  if (FREE_MAIL_DOMAINS.has(domain)) return { ok: false, error: "Utilisez votre adresse professionnelle : le test porte sur le domaine de votre entreprise." };
  const firstName = clean(o.firstName, 60);
  const company = clean(o.company, 120);
  if (!firstName) return { ok: false, error: "Indiquez votre prénom." };
  if (!company) return { ok: false, error: "Indiquez le nom de votre entreprise." };
  const rawPhone = clean(o.phone, 30);
  const digits = rawPhone.replace(/\D/g, "");
  if (rawPhone && (digits.length < 9 || digits.length > 15)) return { ok: false, error: "Numéro de téléphone invalide (ou laissez le champ vide)." };
  return { ok: true, lead: { kind, email, domain, firstName, company, phone: rawPhone, summary: clean(o.summary, 1500) } };
}

/** Phrase de résultat du mail : le constat principal, ou l'absence d'écart certain. */
export function resultSentence(mainFinding: string): string {
  return mainFinding ? `Le point principal : ${mainFinding.replace(/\.$/, "")}.` : "Aucun écart certain n'a été mesuré sur les points vérifiés : c'est une bonne nouvelle.";
}

/** Mail de réponse automatique (texte validé le 25/11/2026). Sans lien de synthèse : pas de mail. */
export function leadMail(a: { prenom: string; domaine: string; lienRapport: string; mainFinding: string; lienCal: string; signature: string }): { subject: string; text: string } | null {
  if (!/^https:\/\/\S+$/.test(a.lienRapport)) return null;
  const cal = /^https:\/\/\S+$/.test(a.lienCal) ? ` Si vous préférez choisir le moment : ${a.lienCal}` : "";
  return {
    subject: `Votre test de messagerie pour ${a.domaine}`,
    text: [
      `Bonjour ${a.prenom},`,
      `Merci d'avoir testé ${a.domaine} sur infracyb.fr. Voici la synthèse d'une page, valable 60 jours : ${a.lienRapport}`,
      resultSentence(a.mainFinding),
      `Je vous appelle dans la journée ouvrée pour en parler quinze minutes, sans engagement.${cal}`,
      a.signature,
    ].join("\n\n"),
  };
}
