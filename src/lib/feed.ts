/**
 * Alimentation automatique des campagnes permanentes : règles pures (sans base ni réseau), donc testables.
 * Chaque jour ouvré : chercher, vérifier (adresse mail ET téléphone obligatoires avant d'entrer dans le CRM), diagnostiquer,
 * inscrire, dans la limite de ce que les plafonds d'envoi peuvent réellement traiter.
 */
import { SERVICE_LABEL, type ServiceKey } from "./campaign";
import { SEGMENT_LABEL, SEGMENT_SECTORS, type Segment } from "./diagnostic-mails";
import { SECTOR_SEARCH, type Sector } from "./prospect-search";

/** a_completer : importée avant la règle stricte, coordonnées à vérifier · a_diagnostiquer · a_inscrire : prête · inscrit · ecarte (reason dit pourquoi). */
export type FeedStage = "a_completer" | "a_diagnostiquer" | "a_inscrire" | "inscrit" | "ecarte";
export const FEED_STAGE_LABEL: Record<FeedStage, string> = { a_completer: "À compléter", a_diagnostiquer: "À diagnostiquer", a_inscrire: "Prête, en attente de place", inscrit: "Inscrite", ecarte: "Écartée" };

export const FEED_DEFAULTS = { importPerSegment: 30, placesDaily: 30, effectifs: ["02", "03", "11", "12"], maxTries: 3 } as const;
export const DEPARTEMENT_RE = /^(\d{2,3}|2[AB])$/;

/** Liste de départements saisie (« 75, 92 69 ») → codes valides, sans doublon. Vide = France entière. */
export function parseDepartements(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((d) => d.trim().toUpperCase()).filter((d) => DEPARTEMENT_RE.test(d)))].slice(0, 30);
}

/** Recherches à mener pour un segment : chaque secteur interrogeable du segment × chaque département (ou la France entière). */
export function searchPlan(segment: Segment, departements: string[]): { sector: Sector; departement: string }[] {
  const sectors = SEGMENT_SECTORS[segment].filter((s): s is Sector => s in SECTOR_SEARCH);
  const depts = departements.length ? departements : [""];
  return sectors.flatMap((sector) => depts.map((departement) => ({ sector, departement })));
}

/** Où la recherche d'un segment s'est arrêtée : numéro de recherche dans le plan, et page. */
export type Cursor = { combo: number; page: number };

/** Position suivante après lecture d'une page : page suivante, sinon recherche suivante ; après la dernière, on repart du début. */
export function nextCursor(c: Cursor, totalPages: number, planLength: number): Cursor & { wrapped: boolean } {
  if (c.page < totalPages) return { combo: c.combo, page: c.page + 1, wrapped: false };
  const combo = c.combo + 1;
  return combo >= planLength ? { combo: 0, page: 1, wrapped: true } : { combo, page: 1, wrapped: false };
}

export function readCursors(json: string): Partial<Record<Segment, Cursor>> {
  try {
    const v: unknown = JSON.parse(json);
    if (!v || typeof v !== "object") return {};
    const out: Partial<Record<Segment, Cursor>> = {};
    for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
      const x = c as { combo?: unknown; page?: unknown } | null;
      if ((k === "editeurs" || k === "cabinets") && x && Number.isInteger(x.combo) && Number.isInteger(x.page) && (x.combo as number) >= 0 && (x.page as number) >= 1) out[k] = { combo: x.combo as number, page: x.page as number };
    }
    return out;
  } catch {
    return {};
  }
}

/** Nombre de mails d'une séquence, et jours ouvrés sur lesquels elle s'étale (J0 à J+14). */
export const MAILS_PER_PROSPECT = 4;
export const SEQUENCE_BUSINESS_DAYS = 10;

/**
 * Combien d'entreprises on peut encore inscrire dans un service sans dépasser ce que son plafond peut envoyer :
 * les mails restant à envoyer aux entreprises déjà en séquence, plus les 4 mails de chaque nouvelle, doivent tenir
 * dans le plafond quotidien × la durée d'une séquence. Jamais plus de premiers mails en attente que le plafond d'un jour.
 */
export function enrolSlots(dailyLimit: number, remainingMails: number, waitingFirstMail: number): number {
  const byVolume = Math.floor((dailyLimit * SEQUENCE_BUSINESS_DAYS - remainingMails) / MAILS_PER_PROSPECT);
  return Math.max(0, Math.min(byVolume, dailyLimit - waitingFirstMail));
}

/** Nom de la campagne permanente d'un service et d'un segment. */
export const permanentName = (service: ServiceKey, segment: Segment): string => `Alimentation automatique · ${SERVICE_LABEL[service]} · ${SEGMENT_LABEL[segment]}`;

/** Motifs d'écart affichés sur la page Alimentation. */
export const REJECT = {
  noSite: "Aucun site web trouvé",
  unreadable: "Site web illisible",
  noEmail: "Aucune adresse publiée sur le site",
  noPhone: "Aucun téléphone trouvé",
  noEmailNoPhone: "Ni adresse publiée sur le site, ni téléphone",
  noHook: "Aucun constat certain utilisable (diagnostic)",
  noDomain: "Aucun domaine à diagnostiquer",
  noFirstName: "Pas de prénom de dirigeant pour le mail",
  gone: "Entreprise supprimée du CRM",
} as const;

/** Numéro de téléphone exploitable : 9 à 15 chiffres (avec ou sans indicatif), quel que soit le format d'écriture. */
export function isPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

/**
 * Règle d'entrée dans le CRM par l'alimentation : une adresse mail publiée ET un téléphone. Renvoie le motif d'écart,
 * ou "" quand les deux sont là. L'adresse vient toujours du site de l'entreprise, jamais devinée.
 */
export function missingCoordinates(email: string, phone: string): string {
  const mail = email.trim() !== "";
  const tel = isPhone(phone);
  if (mail && tel) return "";
  if (!mail && !tel) return REJECT.noEmailNoPhone;
  return mail ? REJECT.noPhone : REJECT.noEmail;
}
