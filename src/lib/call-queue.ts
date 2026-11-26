/**
 * File d'appels du jour : ordre de passage et suite donnée à chaque résultat d'appel.
 * Règles pures (sans base ni réseau) : la page Appels et l'action serveur s'appuient dessus.
 */
import { addDaysIso, isBusinessDay } from "./campaign";

/** Essais sans réponse (pas de réponse, messagerie) avant d'abandonner l'appel. */
export const MAX_ATTEMPTS = 3;
/** Une consultation de la synthèse reste « chaude » pendant ce nombre de jours. */
export const HOT_DAYS = 7;

export type QueueEntry = {
  taskId: string;
  dueDate: string;
  /** dernière consultation de la synthèse par le prospect (AAAA-MM-JJ), ou "" */
  viewedOn: string;
  /** le prospect a répondu à un mail (séquence arrêtée « A répondu ») */
  replied: boolean;
  /** demande entrante du site (test de messagerie, autodiagnostic) des 7 derniers jours */
  inbound?: boolean;
  createdAt: number;
};

export type Heat = "entrant" | "consulte" | "repondu" | "retard" | "jour";

export function heatOf(e: QueueEntry, today: string): Heat {
  if (e.inbound) return "entrant";
  if (e.viewedOn && e.viewedOn >= addDaysIso(today, -HOT_DAYS)) return "consulte";
  if (e.replied) return "repondu";
  return e.dueDate < today ? "retard" : "jour";
}

const RANK: Record<Heat, number> = { entrant: 0, consulte: 1, repondu: 2, retard: 3, jour: 4 };
export const HEAT_LABEL: Record<Heat, string> = { entrant: "Demande entrante", consulte: "A consulté la synthèse", repondu: "A répondu", retard: "En retard", jour: "Aujourd'hui" };

/**
 * Appels à passer aujourd'hui (échéance aujourd'hui ou passée), les plus chauds d'abord :
 * synthèse consultée, réponse reçue, retard (le plus ancien d'abord), puis le reste du jour.
 */
export function rankQueue<T extends QueueEntry>(entries: T[], today: string): (T & { heat: Heat })[] {
  return entries
    .filter((e) => e.dueDate <= today)
    .map((e) => ({ ...e, heat: heatOf(e, today) }))
    .sort((a, b) => RANK[a.heat] - RANK[b.heat] || (a.heat === "consulte" ? b.viewedOn.localeCompare(a.viewedOn) : 0) || a.dueDate.localeCompare(b.dueDate) || a.createdAt - b.createdAt);
}

/** n-ième jour ouvré après `from` (hors week-ends et jours fériés). */
export function addBusinessDays(from: string, n: number): string {
  let d = from;
  for (let i = 0, guard = 0; i < n && guard < 60; guard++) {
    d = addDaysIso(d, 1);
    if (isBusinessDay(d)) i++;
  }
  return d;
}

export const OUTCOMES = ["pas_de_reponse", "messagerie", "rappeler", "interesse", "pas_interesse", "rdv"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABEL: Record<Outcome, string> = {
  pas_de_reponse: "Pas de réponse",
  messagerie: "Messagerie",
  rappeler: "Rappeler le…",
  interesse: "Intéressé",
  pas_interesse: "Pas intéressé",
  rdv: "RDV obtenu",
};

export type OutcomePlan = {
  /** résultat inscrit au journal des appels (mêmes valeurs que l'appel noté à la main) */
  callResult: "Pas de réponse" | "Messagerie" | "Joint" | "RDV obtenu";
  /** nouvelle échéance de la tâche, ou null : la tâche est terminée */
  nextDue: string | null;
  /** arrêter la séquence de mails en cours, avec cette raison */
  stopSequence: string | null;
  /** étape du pipeline visée (jamais en arrière, sauf « perdu ») */
  stage: "contacte" | "rdv" | "perdu" | null;
  /** tâche à créer ensuite */
  followUp: string | null;
  /** phrase ajoutée au journal de la fiche */
  note: string;
};

/**
 * Suite donnée à un résultat d'appel. `attempts` = essais sans réponse déjà notés pour cette tâche, celui-ci non compris.
 * `date` : jour du rappel (rappeler) ou du rendez-vous (rdv), AAAA-MM-JJ, déjà vérifié par l'appelant.
 */
export function planOutcome(o: Outcome, a: { today: string; attempts: number; date?: string; company: string }): OutcomePlan {
  switch (o) {
    case "pas_de_reponse":
    case "messagerie": {
      const n = a.attempts + 1;
      const last = n >= MAX_ATTEMPTS;
      const next = addBusinessDays(a.today, 2);
      return {
        callResult: o === "messagerie" ? "Messagerie" : "Pas de réponse",
        nextDue: last ? null : next,
        stopSequence: null,
        stage: null,
        followUp: null,
        note: last ? `${n} essais sans réponse : appel abandonné, la séquence de mails continue.` : `Essai ${n} sur ${MAX_ATTEMPTS} sans réponse : nouvel essai le ${fr(next)}.`,
      };
    }
    case "rappeler":
      return { callResult: "Joint", nextDue: a.date ?? addBusinessDays(a.today, 1), stopSequence: null, stage: "contacte", followUp: null, note: `Joint : à rappeler le ${fr(a.date ?? addBusinessDays(a.today, 1))}.` };
    case "interesse":
      return { callResult: "Joint", nextDue: null, stopSequence: "Intéressé au téléphone", stage: "contacte", followUp: `Envoyer la synthèse à ${a.company} (bouton « Lien du rapport » de la fiche)`, note: "Joint, intéressé : synthèse à envoyer aujourd'hui." };
    case "pas_interesse":
      return { callResult: "Joint", nextDue: null, stopSequence: "Refus au téléphone", stage: "perdu", followUp: null, note: "Joint, pas intéressé : plus de mail ni d'appel." };
    case "rdv":
      return { callResult: "RDV obtenu", nextDue: null, stopSequence: "RDV obtenu", stage: "rdv", followUp: null, note: `RDV obtenu pour le ${fr(a.date ?? a.today)}.` };
  }
}

const fr = (iso: string) => iso.split("-").reverse().join("/");

/** Numéro composable (lien tel:) : chiffres et « + » de tête seulement, ou "" s'il est inutilisable. */
export function telHref(phone: string): string {
  const p = phone.trim();
  const digits = p.replace(/\D/g, "");
  if (digits.length < 9) return "";
  return "tel:" + (p.startsWith("+") ? "+" : "") + digits;
}

/** Ligne de la file d'appels affichée (page Appels) et reprise dans le mail du matin. */
export type QueueRow = {
  taskId: string;
  companyId: string;
  company: string;
  contact: string;
  phone: string;
  tel: string;
  title: string;
  heat: Heat;
  dueDate: string;
  opening: string;
  attempts: number;
};

/**
 * Mail du matin (phase M) : les appels du jour, les plus chauds d'abord, avec le numéro et le constat.
 * null quand la file est vide : aucun mail. Texte brut, envoyé au propriétaire du CRM seulement.
 */
export function composeCallDigest(rows: QueueRow[], today: string, appUrl: string): { subject: string; text: string } | null {
  if (!rows.length) return null;
  const late = rows.filter((r) => r.heat === "retard").length;
  const hot = rows.filter((r) => r.heat === "entrant" || r.heat === "consulte" || r.heat === "repondu").length;
  const [y, m, d] = today.split("-");
  const subject = `${rows.length} appel${rows.length > 1 ? "s" : ""} à passer aujourd'hui${hot ? ` · ${hot} prospect${hot > 1 ? "s" : ""} chaud${hot > 1 ? "s" : ""}` : ""}${late ? ` · ${late} en retard` : ""}`;
  const lines = rows.slice(0, 25).map((r, i) => {
    const who = [r.company, r.contact].filter(Boolean).join(" — ");
    const finding = r.title.split(" : ").slice(1).join(" : ");
    return `${i + 1}. [${HEAT_LABEL[r.heat]}] ${who}\n   ${r.phone || "pas de numéro"}${finding ? ` · ${finding}` : ""}${r.attempts ? ` · ${r.attempts} essai(s) sans réponse` : ""}`;
  });
  const more = rows.length > 25 ? `\n… et ${rows.length - 25} autre(s).` : "";
  const url = appUrl ? `\n\nLa file, les phrases d'ouverture et le bouton « Devis Pack + Suivi » : ${appUrl}/appels` : "";
  return {
    subject,
    text: `Appels du ${d}/${m}/${y}\n\nUn appel le lendemain d'un mail double les chances de réponse. Note chaque résultat en un clic sur la page Appels.\n\n${lines.join("\n\n")}${more}${url}\n`,
  };
}
