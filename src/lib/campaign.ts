/**
 * Campagnes d'envoi en masse : règles pures (sans base ni réseau), donc testables.
 * Séquence : J0, J+3, J+7, J+14 (mêmes écarts que la prospection mail à la main).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { EMAIL_RE } from "./brevo";
import { stageRank } from "./constants";

export const SEQUENCE_DAYS = [0, 3, 7, 14] as const;
export const STEP_LABELS = ["J0", "J+3", "J+7", "J+14"] as const;

/** Ajoute des jours à une date AAAA-MM-JJ (à midi UTC pour éviter tout décalage d'heure d'été). */
export function addDaysIso(iso: string, n: number): string {
  return new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
}

/** Date du mail suivant : les écarts de la séquence sont comptés depuis le jour de l'envoi qui vient d'avoir lieu. */
export function nextDueAfterSend(sentOn: string, justSentStep: number): string | null {
  const next = SEQUENCE_DAYS[justSentStep + 1];
  if (next === undefined) return null;
  return addDaysIso(sentOn, next - SEQUENCE_DAYS[justSentStep]);
}

export type Candidate = { id: string; name: string; stage: string; email: string };

export type Exclusion = "perdu" | "avance" | "sans-email" | "email-invalide" | "desinscrit" | "deja-en-campagne";
export const EXCLUSION_LABEL: Record<Exclusion, string> = {
  perdu: "classée Perdu",
  avance: "déjà en rendez-vous, devis ou client",
  "sans-email": "pas d'e-mail",
  "email-invalide": "e-mail invalide",
  desinscrit: "désinscrite",
  "deja-en-campagne": "déjà dans une campagne en cours",
};

/** Pourquoi une entreprise ne doit pas recevoir de mail (null = éligible). */
export function exclusionOf(c: Candidate, optouts: Set<string>, inCampaign: Set<string>): Exclusion | null {
  if (c.stage === "perdu") return "perdu";
  if (stageRank(c.stage) > stageRank("contacte")) return "avance";
  const email = c.email.trim().toLowerCase();
  if (!email) return "sans-email";
  if (!EMAIL_RE.test(email)) return "email-invalide";
  if (optouts.has(email)) return "desinscrit";
  if (inCampaign.has(c.id)) return "deja-en-campagne";
  return null;
}

/** Les mails à envoyer aujourd'hui, dans la limite du plafond restant : les plus en retard d'abord. */
export function pickDue<T extends { nextDue: string }>(items: T[], today: string, remaining: number): T[] {
  return items
    .filter((i) => i.nextDue <= today)
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : 0))
    .slice(0, Math.max(0, remaining));
}

// ——— Lien de désinscription : jeton signé (HMAC), sans état côté serveur ———

function sign(secret: string, email: string): string {
  return createHmac("sha256", secret).update("optout:" + email).digest("base64url");
}

export function makeOptoutToken(secret: string, email: string): string {
  const e = email.trim().toLowerCase();
  return Buffer.from(e, "utf8").toString("base64url") + "." + sign(secret, e);
}

/** Renvoie l'adresse si le jeton est authentique, sinon null. */
export function readOptoutToken(secret: string, token: string): string | null {
  const [a, sig] = token.split(".");
  if (!a || !sig) return null;
  const email = Buffer.from(a, "base64url").toString("utf8");
  if (!EMAIL_RE.test(email) || email !== email.toLowerCase()) return null;
  const good = Buffer.from(sign(secret, email));
  const given = Buffer.from(sig);
  return good.length === given.length && timingSafeEqual(good, given) ? email : null;
}

/** Pied de mail : lien de désinscription (en plus du « répondez stop » déjà présent dans le texte). */
export function withUnsubscribeFooter(body: string, url: string): string {
  return body + "\n\nSe désinscrire en un clic : " + url;
}
