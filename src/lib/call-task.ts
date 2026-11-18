/**
 * Tâche d'appel du service Diagnostic : créée automatiquement quand le mail J+3 est parti, à faire le lendemain (J+4).
 * Règle pure (sans base ni réseau). La phrase de constat reprend mot pour mot celle validée (HOOK_TEXT) : rien n'est reformulé ici.
 * Le canevas d'appel (les phrases autour du constat) est à relire par le propriétaire.
 */
import { addDaysIso } from "./campaign";
import { clean } from "./diagnostic";
import { HOOK_LABEL, HOOK_TEXT, isHookVariant } from "./diagnostic-mails";
import { fd } from "./format";

export type CallTaskInput = {
  company: string;
  /** prénom et nom du contact ; vide = adresse générique */
  contactName: string;
  phone: string;
  /** forme du constat d'accroche du premier mail (« dmarc-absent »…) */
  hook: string;
  /** domaine mesuré (celui de la messagerie pour un constat de courrier, celui du site pour le certificat) */
  domain: string;
  /** fin de validité du certificat, AAAA-MM-JJ, pour les constats de certificat */
  expiry?: string;
  /** nom de l'expéditeur, affiché dans l'appel */
  me: string;
  /** jour où le mail J+3 est parti, AAAA-MM-JJ */
  sentOn: string;
};
export type CallTask = { title: string; dueDate: string; priority: "haute"; /** phrases d'ouverture à garder sous les yeux pendant l'appel */ opening: string };

/** Un numéro est utilisable s'il contient au moins 9 chiffres. */
export const hasUsablePhone = (p: string): boolean => p.replace(/\D/g, "").length >= 9;

/** null quand l'appel n'a pas de sens : pas de téléphone, constat inconnu ou domaine vide. */
export function buildCallTask(i: CallTaskInput): CallTask | null {
  if (!hasUsablePhone(i.phone) || !isHookVariant(i.hook)) return null;
  const domain = clean(i.domain, 120);
  if (!domain) return null;
  const phone = clean(i.phone, 30);
  const company = clean(i.company, 120);
  const text = HOOK_TEXT[i.hook];
  // Constat de certificat sans date connue : on ne devine rien, on renvoie au diagnostic de la fiche.
  const finding = text.family === "B" && !i.expiry
    ? `${HOOK_LABEL[i.hook].toLowerCase()} sur ${domain} (voir le diagnostic de la fiche)`
    : text.finding.replace(/\{domaine\}/g, domain).replace(/\{date_expiration\}/g, fd(i.expiry)).replace(/`/g, "");
  const who = clean(i.contactName, 80);
  const opening = [
    `Bonjour${who ? " " + who : ""}, ${clean(i.me, 80) || "[mon prénom]"} d'InfraCyb.`,
    `Je vous ai écrit à propos de ${domain} : ${finding}.`,
    "Je ne vends rien au téléphone : je voulais savoir si vous avez bien reçu ma note, et si un client vous demande des garanties de sécurité.",
    "Si la personne refuse : la remercier et noter « refus » sur la fiche. Si elle veut la synthèse : la lui envoyer dans l'heure.",
  ].join("\n");
  return { title: `Appeler ${company} au ${phone} : ${HOOK_LABEL[i.hook]} sur ${domain}`, dueDate: addDaysIso(i.sentOn, 1), priority: "haute", opening };
}
