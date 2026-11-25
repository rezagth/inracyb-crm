/**
 * Lien public du rapport de diagnostic : jeton signé (HMAC), sans état côté serveur, avec une date d'expiration.
 * Le jeton porte l'identifiant du diagnostic et la date limite ; toute modification invalide la signature.
 * Règle pure (sans base ni réseau).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Durée de validité d'un lien de rapport, en jours. */
export const REPORT_LINK_DAYS = 60;

const DAY = 86_400_000;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function sign(secret: string, id: string, exp: number): string {
  return createHmac("sha256", secret).update(`report:${id}.${exp}`).digest("base64url");
}

/** Jeton « <id>.<expiration en jours depuis 1970>.<signature> ». */
export function makeReportToken(secret: string, diagnosticId: string, nowMs: number, days = REPORT_LINK_DAYS): string {
  if (!ID_RE.test(diagnosticId)) throw new Error("Identifiant de diagnostic invalide");
  const exp = Math.floor(nowMs / DAY) + days;
  return `${diagnosticId}.${exp}.${sign(secret, diagnosticId, exp)}`;
}

/** Identifiant du diagnostic si le jeton est authentique et non expiré, sinon null. */
export function readReportToken(secret: string, token: string, nowMs: number): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, expRaw, sig] = parts;
  if (!ID_RE.test(id) || !/^\d{1,7}$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  const good = Buffer.from(sign(secret, id, exp));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  return Math.floor(nowMs / DAY) <= exp ? id : null;
}

/**
 * Une ouverture du lien compte comme une consultation humaine ? Les antivirus de messagerie et les aperçus de liens
 * ouvrent les liens tout seuls, souvent dans les secondes qui suivent la réception : on les écarte par leur signature
 * et par le délai depuis l'envoi. Un indice, jamais une preuve.
 */
const ROBOT_UA = /bot|crawl|spider|slurp|preview|scan|python|curl|wget|java\/|go-http|headless|phantom|safelinks|proofpoint|mimecast|barracuda|symantec|trendmicro|fortinet|sophos|cisco|microsoft office|outlook|google-read-aloud|facebookexternalhit|linkedin|whatsapp|skype|slack|discord|telegram/i;
export const MIN_SECONDS_AFTER_SEND = 120;

export function isHumanView(userAgent: string, method: string, secondsSinceLastSend: number | null): boolean {
  if (method !== "GET") return false;
  const ua = userAgent.trim();
  if (!ua || ROBOT_UA.test(ua)) return false;
  if (!/mozilla\//i.test(ua)) return false;
  return secondsSinceLastSend === null || secondsSinceLastSend >= MIN_SECONDS_AFTER_SEND;
}

/** Texte de l'événement « rapport consulté » (sert aussi à le retrouver pour la file d'appels). */
export const REPORT_VIEWED = "Rapport de diagnostic consulté par le prospect";
