/**
 * Bilan mensuel du « Suivi Courrier & Domaine » (phase M). Règles pures (sans base ni réseau) :
 * quand un bilan est dû, ce qui a changé depuis la mesure précédente, et le texte envoyé au client.
 * Aucun score, aucune phrase inventée : chaque constat reprend la formulation prudente du diagnostic.
 */
import { mailable, type Check } from "./diagnostic";

/** Préfixe du journal de la fiche : sert à savoir si le bilan du mois est déjà parti. */
export const BILAN_EVENT = "Bilan mensuel du suivi envoyé";

const monthOf = (iso: string): string => iso.slice(0, 7);

/**
 * Bilan dû : contrat actif commencé avant le mois en cours (le premier bilan part le mois suivant la signature),
 * et pas encore de bilan ce mois-ci.
 */
export function bilanDue(c: { status: string; start: string }, lastBilanMonth: string, today: string): boolean {
  if (c.status !== "actif" || !/^\d{4}-\d{2}-\d{2}$/.test(c.start)) return false;
  const month = monthOf(today);
  return monthOf(c.start) < month && lastBilanMonth !== month;
}

/** Écarts certains réglés, apparus (ou changés de nature, par exemple certificat « bientôt » devenu « expiré ») ou ouverts. */
export function compareChecks(prev: Check[], cur: Check[]): { fixed: Check[]; regressed: Check[]; open: Check[] } {
  const before = new Map(prev.filter(mailable).map((c) => [c.id, c]));
  const now = cur.filter(mailable);
  const nowIds = new Set(now.map((c) => c.id));
  return {
    fixed: [...before.values()].filter((c) => !nowIds.has(c.id)),
    regressed: now.filter((c) => !before.has(c.id) || before.get(c.id)!.variant !== c.variant),
    open: now,
  };
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export type BilanInput = {
  company: string;
  prenom: string;
  mailDomain: string;
  webHost: string;
  today: string;
  checks: Check[];
  fixed: Check[];
  regressed: Check[];
  signature: string;
};

/** Mail du bilan mensuel : ce qui est en place, ce qui a changé, ce qui reste à faire. Texte brut. */
export function composeBilan(i: BilanInput): { subject: string; text: string } {
  const [y, m] = i.today.split("-");
  const month = `${MONTHS[Number(m) - 1]} ${y}`;
  const scope = [i.mailDomain, i.webHost && i.webHost !== i.mailDomain ? i.webHost : ""].filter(Boolean).join(" et ");
  const ok = i.checks.filter((c) => c.status === "conforme" && c.certain && ["spf", "dmarc", "tls", "dkim", "mx"].includes(c.id));
  const open = i.checks.filter(mailable);
  const bullet = (c: Check) => `- ${c.wording}`;
  const parts = [
    `Bonjour${i.prenom ? " " + i.prenom : ""},`,
    `Voici le bilan de ${month} du suivi de ${scope || i.company}, mesuré le ${i.today.split("-").reverse().join("/")} à partir des seules informations publiques.`,
    i.regressed.length ? `À traiter en priorité (nouveau depuis le dernier bilan) :\n${i.regressed.map(bullet).join("\n")}\nJe m'en occupe et je reviens vers vous rapidement.` : "",
    i.fixed.length ? `Réglé depuis le dernier bilan :\n${i.fixed.map((c) => `- ${c.label}`).join("\n")}` : "",
    ok.length ? `En place et vérifié :\n${ok.map(bullet).join("\n")}` : "",
    open.length && !i.regressed.length ? `Encore en cours :\n${open.map(bullet).join("\n")}` : "",
    !open.length ? "Aucun écart n'a été mesuré ce mois-ci sur les points suivis." : "",
    "Ce bilan peut être transmis tel quel à un client ou à votre assureur qui vous interroge sur la sécurité de vos échanges.",
    i.signature,
  ];
  const flag = i.regressed.length ? " · point à traiter" : !open.length ? " · rien à signaler" : "";
  return { subject: `Bilan de ${month} : ${scope || i.company}${flag}`, text: parts.filter(Boolean).join("\n\n") + "\n" };
}
