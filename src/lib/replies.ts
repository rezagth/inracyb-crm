/**
 * Réponses aux campagnes : règles pures (sans base ni réseau). Classe un message reçu, le rattache à une entreprise,
 * et compose le brouillon de réponse. Aucune phrase de constat n'est produite ici.
 */
import { EMAIL_RE } from "./brevo";

export type Inbound = {
  /** identifiant unique du message chez le fournisseur (sert à ne traiter un message qu'une fois) */
  id: string;
  from: string;
  subject: string;
  /** début du texte du message, sans la citation du mail d'origine si le fournisseur la retire */
  snippet: string;
  autoSubmitted?: string;
  precedence?: string;
  /** date de réception, en millisecondes depuis 1970 (sert à écarter un message plus ancien que le premier envoi) */
  receivedAt?: number;
};
/**
 * ignore : message automatique, rebond, ou expéditeur interne — rien à faire.
 * optout : demande de ne plus être contactée — adresse désinscrite.
 * refus : réponse négative apparente (« pas intéressé ») — séquence arrêtée, tâche de vérification à faible priorité (un refus peut cacher un besoin).
 * reponse : tout autre message d'un prospect contacté — séquence arrêtée, tâche prioritaire et brouillon.
 */
export type ReplyKind = "ignore" | "optout" | "refus" | "reponse";

/** Adresse en minuscules extraite d'un en-tête From (« Nom <adresse> » ou « adresse »). Chaîne vide si aucune. */
export function parseAddress(from: string): string {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(from) ?? /([^\s<>"',;]+@[^\s<>"',;]+)/.exec(from);
  const a = (m?.[1] ?? "").trim().toLowerCase();
  return EMAIL_RE.test(a) ? a : "";
}

const MACHINE_SENDER = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?|bounce[s]?|mailer)[@+._-]|@(.*\.)?(mailer-daemon|bounces?)\./i;
const AUTO_SUBJECT = /^\s*(re\s*:\s*)?(automatic reply|auto(matic)?[- ]?reply|autoreply|out of office|réponse automatique|absence|absent du bureau|undeliverable|delivery status notification|mail delivery (failed|subsystem)|returned mail|échec de (la )?remise|non remis|message non distribué|failure notice)/i;
const OPTOUT = /(\bstop\b|désinscri|desinscri|unsubscribe|ne (me )?(contactez|contacter|écrivez|écrire|envoyez|envoyer|sollicitez|solliciter) (plus|pas)|ne plus (me )?(contacter|écrire|envoyer|solliciter)|plus (aucun|de) (mail|message|e-?mail|démarchage|sollicitation)|(retir|suppr)(imer|imez|ime|ier|er|ez|e)?[- ](moi|mon (adresse|e-?mail|nom)|ma (adresse|fiche)))/i;
const REFUS = /(pas intéress|non merci|sans suite|pas de besoin|aucun besoin|pas concern|déjà (équipé|couvert|pris en charge|un prestataire)|nous avons déjà|ne souhaitons pas|ne souhaite pas|pas pour nous)/i;

/** Classe un message reçu. `own` : adresses d'envoi de l'utilisateur, pour ne pas traiter ses propres messages. */
export function classifyInbound(m: Inbound, own: string[]): { kind: ReplyKind; reason: string } {
  const addr = parseAddress(m.from);
  if (!addr) return { kind: "ignore", reason: "expéditeur illisible" };
  if (own.map((o) => o.trim().toLowerCase()).includes(addr)) return { kind: "ignore", reason: "message de l'utilisateur" };
  if (MACHINE_SENDER.test(addr)) return { kind: "ignore", reason: "expéditeur automatique" };
  const auto = (m.autoSubmitted ?? "").trim().toLowerCase();
  if (auto && auto !== "no") return { kind: "ignore", reason: "réponse automatique" };
  if (/^(bulk|junk|auto_reply|list)$/i.test((m.precedence ?? "").trim())) return { kind: "ignore", reason: "envoi en masse ou automatique" };
  if (AUTO_SUBJECT.test(m.subject)) return { kind: "ignore", reason: "message automatique (absence, rebond)" };
  const text = `${m.subject}\n${m.snippet}`.slice(0, 600);
  if (OPTOUT.test(text)) return { kind: "optout", reason: "demande de ne plus être contactée" };
  if (REFUS.test(text)) return { kind: "refus", reason: "réponse négative" };
  return { kind: "reponse", reason: "réponse" };
}

export type ContactRef = { companyId: string; email: string };
const domainOf = (e: string) => e.slice(e.lastIndexOf("@") + 1).toLowerCase();
/** Domaines de messagerie grand public : une réponse venant de là ne se rattache pas par le domaine. */
const WEBMAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "yahoo.com", "yahoo.fr", "icloud.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "laposte.net", "proton.me", "protonmail.com"]);

/**
 * Entreprise d'une adresse expéditrice : adresse exacte d'un contact ; à défaut, même domaine d'entreprise si une seule
 * entreprise l'utilise (un collègue qui répond à la place du dirigeant). Jamais par un domaine grand public.
 */
export function matchCompany(sender: string, contacts: ContactRef[]): string | null {
  const s = sender.trim().toLowerCase();
  if (!s) return null;
  const exact = [...new Set(contacts.filter((c) => c.email.trim().toLowerCase() === s).map((c) => c.companyId))];
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const d = domainOf(s);
  if (!d || WEBMAIL.has(d)) return null;
  const same = [...new Set(contacts.filter((c) => c.email.includes("@") && domainOf(c.email.trim()) === d).map((c) => c.companyId))];
  return same.length === 1 ? same[0] : null;
}

export type DraftInput = { prenom: string; domain: string; me: string; signature: string; calUrl: string };
/** Brouillon de réponse à un prospect qui répond. Texte brut, à relire avant l'envoi : la synthèse d'une page est à joindre. */
export function buildReplyDraft(i: DraftInput): string {
  const hello = i.prenom.trim() ? `Bonjour ${i.prenom.trim()},` : "Bonjour,";
  const about = i.domain.trim() ? ` sur ${i.domain.trim()}` : "";
  const slot = /^https:\/\//i.test(i.calUrl.trim()) ? ` Vous pouvez choisir un créneau ici : ${i.calUrl.trim()}` : " Dites-moi quand cela vous arrange.";
  return `${hello}\n\nMerci pour votre retour. Vous trouverez en pièce jointe la synthèse d'une page${about} : ce qui a été mesuré, à quelle date, et comment le corriger.\n\nSi vous le souhaitez, je vous propose un échange de 15 minutes pour voir ce qui compte le plus chez vous.${slot}\n\n${i.signature.trim() || i.me.trim()}`;
}
