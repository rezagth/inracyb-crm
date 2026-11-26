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

/** Séquence des prescripteurs : un premier message, une relance à J+7, puis un appel (tâche). */
export const PRESCRIBER_SEQUENCE_DAYS = [0, 7] as const;

/** Jours de la séquence d'un service : J0, J+3, J+7, J+14 pour l'audit et le diagnostic ; J0, J+7 pour les prescripteurs. */
export function sequenceDays(service: ServiceKey): readonly number[] {
  return service === "prescripteur" ? PRESCRIBER_SEQUENCE_DAYS : SEQUENCE_DAYS;
}

/** Libellé d'une étape (« J0 », « J+7 »…) selon la séquence du service. */
export function stepLabel(service: ServiceKey, step: number): string {
  const d = sequenceDays(service)[step];
  return d === undefined ? "—" : d === 0 ? "J0" : `J+${d}`;
}

/** Date du mail suivant : les écarts de la séquence sont comptés depuis le jour de l'envoi qui vient d'avoir lieu. */
export function nextDueAfterSend(sentOn: string, justSentStep: number, days: readonly number[] = SEQUENCE_DAYS): string | null {
  const next = days[justSentStep + 1];
  if (next === undefined) return null;
  return addDaysIso(sentOn, next - days[justSentStep]);
}

export type Candidate = {
  id: string;
  name: string;
  stage: string;
  email: string;
  /** origine de l'adresse (voir EmailSource) ; absente = non contrôlée */
  emailSource?: string;
  /** secteur du CRM ; absent = la règle « cabinets réservés aux prescripteurs » n'est pas appliquée */
  sector?: string;
};

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

/** Un déclenchement est un échec s'il n'a pas pu démarrer, ou si tout ce qui devait partir a échoué. */
export function runFailed(r: { ok: boolean; sent: number; errors: number }): boolean {
  return !r.ok || (r.errors > 0 && r.sent === 0);
}

// ——— Deux services dans le même moteur : Audit (historique) et Diagnostic ———

export type ServiceKey = "audit" | "diagnostic" | "prescripteur";
export const SERVICE_KEYS: ServiceKey[] = ["audit", "diagnostic", "prescripteur"];
export const SERVICE_LABEL: Record<ServiceKey, string> = { audit: "Audit", diagnostic: "Diagnostic", prescripteur: "Prescripteurs" };

/** Offres qu'une campagne peut porter : les trois offres de la prospection, le diagnostic gratuit, et la séquence prescripteurs. */
export type CampaignOffer = "audit" | "ciso" | "ia" | "diagnostic" | "prescripteur";
export const CAMPAIGN_OFFERS: CampaignOffer[] = ["audit", "ciso", "ia", "diagnostic", "prescripteur"];

/**
 * Service auquel un envoi est compté. Tout ce qui n'est pas le diagnostic (audit, RSSI, IA, envois à la main)
 * reste dans le service « audit » : c'est exactement le périmètre du plafond d'avant.
 */
export function serviceOf(offer: string): ServiceKey {
  return offer === "diagnostic" ? "diagnostic" : offer === "prescripteur" ? "prescripteur" : "audit";
}

export const DEFAULT_DAILY_LIMIT: Record<ServiceKey, number> = { audit: 10, diagnostic: 10, prescripteur: 10 };
export const MAX_DAILY_LIMIT = 300;
/** Montée en charge du diagnostic : plafond par palier, un palier tous les RAMP_EVERY jours ouvrés depuis le premier envoi réel. */
export const DIAGNOSTIC_RAMP = [4, 6, 8, 10, 15, 20, 25, 30] as const;
/** Paliers comptés depuis le premier envoi, puis paliers permis seulement avec un domaine d'envoi strict (DMARC appliqué, DKIM). */
const BASE_RAMP = [4, 6, 8] as const;
const EXTENDED_RAMP = [10, 15, 20, 25] as const;
/** Plafond du diagnostic tant que le domaine d'envoi n'est pas strict (même valeur que SENDER_UNVERIFIED_CAP). */
const SENDER_CAP = 10;
export const RAMP_EVERY = 2;
/** Repos entre la fin d'une séquence dans un service et l'entrée dans l'autre. */
export const REST_DAYS_DEFAULT = 30;

/** Lit un plafond facultatif (variable d'environnement) : entier strictement positif, borné ; sinon la valeur par défaut. */
export function parseLimit(raw: string | undefined | null, fallback: number, max = MAX_DAILY_LIMIT): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

/** Dimanche de Pâques (calendrier grégorien). */
function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Jour férié légal en France métropolitaine. */
export function isFrenchHoliday(iso: string): boolean {
  const y = Number(iso.slice(0, 4));
  const e = easter(y);
  const fixed = ["01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25"];
  return fixed.includes(iso.slice(5)) || [addDaysIso(e, 1), addDaysIso(e, 39), addDaysIso(e, 50)].includes(iso);
}

/** Jour ouvré : du lundi au vendredi, hors jours fériés. */
export function isBusinessDay(iso: string): boolean {
  const wd = new Date(iso + "T12:00:00Z").getUTCDay();
  return wd !== 0 && wd !== 6 && !isFrenchHoliday(iso);
}

/** Nombre de jours ouvrés écoulés après `from`, jusqu'à `to` inclus (0 si to <= from). */
export function businessDaysSince(from: string, to: string): number {
  let n = 0;
  for (let d = addDaysIso(from, 1), guard = 0; d <= to && guard < 400; d = addDaysIso(d, 1), guard++) if (isBusinessDay(d)) n++;
  return n;
}

export type Ramp = { /** plafond du jour */ limit: number; /** palier courant (0 = premier) */ stage: number; /** plafonds de chaque palier */ stages: number[]; /** plafond visé une fois la montée finie */ target: number };

/**
 * Plafond du diagnostic aujourd'hui. Avant le premier envoi réel et le jour de cet envoi : premier palier.
 * Les paliers ne dépassent jamais la cible ; une fois le dernier palier atteint, c'est la cible qui s'applique.
 */
export function rampLimit(firstSendOn: string | null, today: string, target: number, ext: { strict: boolean; anchor: string | null } = { strict: false, anchor: null }): Ramp {
  const base = BASE_RAMP.filter((x) => x < target);
  const extra = EXTENDED_RAMP.filter((x) => x < target);
  const stages = [...base, ...(ext.strict ? extra : []), ...(ext.strict || target <= SENDER_CAP ? [target] : [Math.min(target, SENDER_CAP)])];
  const elapsed = firstSendOn ? businessDaysSince(firstSendOn, today) : 0;
  const baseIdx = Math.floor(elapsed / RAMP_EVERY);
  // Paliers de base (4, 6, 8, 10) comptés depuis le premier envoi ; au-delà de 10, comptés depuis le jour où le domaine
  // d'envoi est devenu strict (ancre), pour ne jamais sauter directement au plafond visé.
  if (baseIdx < base.length) return { limit: stages[baseIdx], stage: baseIdx, stages, target };
  if (!ext.strict || target <= SENDER_CAP) return { limit: stages[base.length], stage: base.length, stages, target };
  const since = ext.anchor ? businessDaysSince(ext.anchor, today) : 0;
  const extIdx = Math.min(base.length + Math.floor(since / RAMP_EVERY), stages.length - 1);
  return { limit: stages[extIdx], stage: extIdx, stages, target };
}

/** Les paliers de base (4, 6, 8) sont passés : la montée au-delà peut commencer (si le domaine d'envoi est strict). */
export function baseRampDone(firstSendOn: string | null, today: string): boolean {
  return !!firstSendOn && Math.floor(businessDaysSince(firstSendOn, today) / RAMP_EVERY) >= BASE_RAMP.length;
}

export type ServiceState = { limit: number; sent: number; remaining: number };
export type DailyState = { audit: ServiceState; diagnostic: ServiceState & { ramp: Ramp; firstSendOn: string | null; /** plafond retenu à 10 faute de domaine d'envoi strict */ senderCapped: boolean }; prescripteur: ServiceState; total: ServiceState };

/** État du jour : plafond et envois de chaque service, plus un total global (somme des plafonds visés). */
export function dailyState(input: { today: string; sentByOffer: Record<string, number>; firstDiagnosticSendOn: string | null; auditLimit: number; diagnosticTarget: number; prescriberLimit?: number; senderStrict?: boolean; rampAnchor?: string | null }): DailyState {
  const sent: Record<ServiceKey, number> = { audit: 0, diagnostic: 0, prescripteur: 0 };
  for (const [offer, n] of Object.entries(input.sentByOffer)) sent[serviceOf(offer)] += n;
  const ramp = rampLimit(input.firstDiagnosticSendOn, input.today, input.diagnosticTarget, { strict: !!input.senderStrict, anchor: input.rampAnchor ?? null });
  const senderCapped = !input.senderStrict && input.diagnosticTarget > SENDER_CAP;
  const diagnosticCeiling = senderCapped ? SENDER_CAP : input.diagnosticTarget;
  const mk = (limit: number, s: number): ServiceState => ({ limit, sent: s, remaining: Math.max(0, limit - s) });
  const prescriberLimit = input.prescriberLimit ?? DEFAULT_DAILY_LIMIT.prescripteur;
  const totalLimit = Math.min(MAX_DAILY_LIMIT, input.auditLimit + diagnosticCeiling + prescriberLimit);
  return {
    audit: mk(input.auditLimit, sent.audit),
    diagnostic: { ...mk(ramp.limit, sent.diagnostic), ramp, firstSendOn: input.firstDiagnosticSendOn, senderCapped },
    prescripteur: mk(prescriberLimit, sent.prescripteur),
    total: mk(totalLimit, sent.audit + sent.diagnostic + sent.prescripteur),
  };
}

// ——— Passage d'un service à l'autre : une seule séquence à la fois, puis un délai de repos ———

export const REPLIED_REASON = "A répondu";

/** Ce qu'une entreprise a déjà vécu dans l'autre service. */
export type CrossHistory = {
  /** dernier mail reçu au titre d'un autre service */
  lastSend: string | null;
  /** a répondu à une séquence d'un autre service */
  replied: boolean;
  /** a déjà reçu ce service-ci */
  sameServiceSent: boolean;
  /** services dont l'entreprise a déjà reçu au moins un mail (absent : historique d'avant les prescripteurs, traité comme vide) */
  services?: ServiceKey[];
};

export type EntryExclusion = Exclusion | "a-repondu" | "repos" | "deja-diagnostique" | "origine" | "sans-constat" | "hors-segment" | "role-prescripteur" | "reserve-prescripteurs" | "hors-prescripteurs";
export const ENTRY_EXCLUSION_LABEL: Record<EntryExclusion, string> = {
  ...EXCLUSION_LABEL,
  "a-repondu": "a déjà répondu à une autre séquence",
  repos: "délai de repos après la séquence précédente",
  "deja-diagnostique": "a déjà reçu le diagnostic",
  origine: "origine de l'adresse inconnue ou non vérifiée",
  "sans-constat": "pas de constat d'accroche récent (diagnostic à faire ou à refaire)",
  "hors-segment": "secteur hors du segment choisi",
  "role-prescripteur": "déjà contactée comme prescripteur : pas de prospection client",
  "reserve-prescripteurs": "cabinet réservé à la campagne prescripteurs",
  "hors-prescripteurs": "secteur hors des prescripteurs visés",
};

/** Reconstitue l'historique d'une entreprise vu depuis le service visé, à partir des envois et des séquences arrêtées sur réponse. */
export function crossHistory(target: ServiceKey, sends: { offer: string; sentOn: string }[], repliedOffers: string[]): CrossHistory {
  const other = sends.filter((s) => serviceOf(s.offer) !== target).map((s) => s.sentOn).sort();
  return {
    lastSend: other.at(-1) ?? null,
    replied: repliedOffers.some((o) => serviceOf(o) !== target),
    sameServiceSent: sends.some((s) => serviceOf(s.offer) === target),
    services: [...new Set(sends.map((s) => serviceOf(s.offer)))],
  };
}

/**
 * Pourquoi une entreprise ne peut pas entrer dans une campagne du service visé (null = éligible).
 * Aux règles de toujours (exclusionOf) s'ajoutent : pas d'entrée après une réponse dans l'autre service,
 * pas d'entrée avant la fin du délai de repos, et le diagnostic ne se reçoit qu'une fois.
 * Sans historique dans l'autre service, le résultat est celui d'exclusionOf : la campagne d'audit ne change pas.
 */
export function entryExclusion(
  c: Candidate,
  optouts: Set<string>,
  inCampaign: Set<string>,
  target: ServiceKey,
  h: CrossHistory | undefined,
  today: string,
  restDays = REST_DAYS_DEFAULT,
  /** secteurs réservés aux prescripteurs (voir prescriberSectors) : jamais prospectés comme clients */
  reservedSectors: readonly string[] = [],
): EntryExclusion | null {
  const base = exclusionOf(c, optouts, inCampaign);
  if (base) return base;
  if (c.emailSource !== undefined && originBlock(c.emailSource, target)) return "origine";
  // Un cabinet est un prescripteur, pas un client : la prospection client (audit, diagnostic) ne le vise plus.
  if (target !== "prescripteur" && c.sector !== undefined && reservedSectors.includes(c.sector)) return "reserve-prescripteurs";
  if (target === "prescripteur" && c.sector !== undefined && !reservedSectors.includes(c.sector)) return "hors-prescripteurs";
  // Déjà contacté comme prescripteur : on ne lui tient jamais ensuite le discours client (message incohérent).
  if (target !== "prescripteur" && h?.services?.includes("prescripteur")) return "role-prescripteur";
  if (!h) return null;
  if (h.replied) return "a-repondu";
  if (h.lastSend && addDaysIso(h.lastSend, restDays) > today) return "repos";
  if (target === "diagnostic" && h.sameServiceSent) return "deja-diagnostique";
  return null;
}

// ——— Pause automatique d'un service : rebonds et plaintes ———

/**
 * Règle de pause, calculée sur les 30 derniers jours (ou depuis la dernière reprise) :
 * première plainte pour spam, ou taux de rebond au-dessus de 2 % avec au moins 30 envois et 2 rebonds
 * (un rebond isolé sur un petit volume ne suffit pas à conclure).
 */
export const PAUSE_RULE = { windowDays: 30, minSends: 30, minBounces: 2, maxBounceRate: 0.02 } as const;
export type ServiceHealth = { sent: number; bounces: number; complaints: number };

const pct = (x: number) => (Math.round(x * 1000) / 10).toLocaleString("fr-FR") + " %";

/** Motif de mise en pause, ou null si le service peut continuer. */
export function pauseReason(h: ServiceHealth): string | null {
  if (h.complaints > 0) return `${h.complaints} plainte(s) pour spam`;
  if (h.sent >= PAUSE_RULE.minSends && h.bounces >= PAUSE_RULE.minBounces && h.bounces / h.sent > PAUSE_RULE.maxBounceRate) return `Taux de rebond de ${pct(h.bounces / h.sent)} (${h.bounces} rebonds sur ${h.sent} envois, seuil ${pct(PAUSE_RULE.maxBounceRate)})`;
  return null;
}

/** Service d'un événement Brevo d'après les tags posés à l'envoi (« crm », « campagne », l'offre, l'étape). Null si aucun tag d'offre. */
export function serviceFromTags(tags: unknown): ServiceKey | null {
  let list: unknown = tags;
  if (typeof list === "string") {
    try { list = JSON.parse(list); } catch { list = [list]; }
  }
  if (!Array.isArray(list)) return null;
  const t = list.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
  if (t.includes("prescripteur")) return "prescripteur";
  if (t.includes("diagnostic")) return "diagnostic";
  return t.some((x) => x === "audit" || x === "ciso" || x === "ia") ? "audit" : null;
}

// ——— Origine des adresses : on n'écrit jamais à une adresse dont on ne sait pas d'où elle vient ———

/** saisie : tapée dans le CRM · site : publiée sur le site de l'entreprise · historique : présente avant le suivi de l'origine. */
export type EmailSource = "saisie" | "site" | "historique";
export const EMAIL_SOURCE_LABEL: Record<EmailSource, string> = { saisie: "saisie à la main", site: "publiée sur le site", historique: "historique (avant le suivi de l'origine)" };
export const emailSourceLabel = (s: string): string => EMAIL_SOURCE_LABEL[s as EmailSource] ?? "origine inconnue";

/**
 * Pourquoi cette adresse ne peut pas recevoir de mail de ce service (null = envoi permis).
 * Origine inconnue : jamais. Origine « historique » : tolérée pour le service audit (campagne en cours), refusée pour le diagnostic.
 */
export function originBlock(source: string, service: ServiceKey): string | null {
  if (source === "saisie" || source === "site") return null;
  if (source === "formulaire") return "Demande entrante (formulaire du site) : suivi personnel, jamais de séquence de prospection.";
  if (source === "historique") return service === "audit" ? null : "Origine de l'adresse non vérifiée (adresse historique) : ressaisis-la sur la fiche pour le diagnostic.";
  return "Origine de l'adresse inconnue : ressaisis-la sur la fiche.";
}

/** Motifs d'arrêt de la bascule Audit → Diagnostic (phase M). */
export const SWITCH_REASON = { diag: "Basculée vers le Diagnostic", reserved: "Cabinet réservé aux prescripteurs" } as const;

/**
 * Bascule Audit → Diagnostic (phase M) : parmi les séquences Audit en cours, celles à arrêter.
 * - cabinet d'un secteur réservé aux prescripteurs : arrêt (plus jamais prospecté comme client) ;
 * - entreprise que l'alimentation attend d'inscrire au Diagnostic (étape « a_inscrire ») : arrêt, l'alimentation l'inscrit ensuite.
 * Les autres séquences continuent.
 */
export function planAuditSwitch(items: { itemId: string; offer: string; sector: string; feedStage: string }[], reserved: readonly string[]): { itemId: string; reason: string }[] {
  return items.flatMap<{ itemId: string; reason: string }>((i) => {
    if (serviceOf(i.offer) !== "audit") return [];
    if (reserved.includes(i.sector)) return [{ itemId: i.itemId, reason: SWITCH_REASON.reserved }];
    if (i.feedStage === "a_inscrire") return [{ itemId: i.itemId, reason: SWITCH_REASON.diag }];
    return [];
  });
}
