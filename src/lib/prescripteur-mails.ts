/**
 * Mails aux prescripteurs : cabinets d'expertise comptable, d'avocats, notaires, courtiers, prestataires IT.
 * Règle de déontologie : un expert-comptable, un avocat ou un notaire ne peut ni toucher ni verser de commission pour une
 * simple recommandation (décret n° 2012-432, art. 162 ; RIN art. 11.3). Leurs textes ne parlent donc jamais de commission.
 * Textes rédigés le 18/11/2026, validés le 24/11/2026 pour l'envoi (lot P1).
 */
import { PARTNER_COMMISSION_PCT, REFERRED_CLIENT_DISCOUNT_PCT } from "./pricing";

export type PrescriberKind = "reglemente" | "partenaire";

/** Secteurs du CRM dont les professionnels ne peuvent pas être rémunérés pour une recommandation. */
const REGULATED_SECTORS = ["Expertise comptable", "Juridique", "Notariat"];

export const prescriberKindOf = (sector: string): PrescriberKind => (REGULATED_SECTORS.includes(sector) ? "reglemente" : "partenaire");

/** Mots interdits dans les textes des professions réglementées. */
export const FORBIDDEN_FOR_REGULATED = /commission|rétrocession|rétribu|rémunér|apporteur|honoraires? partagés?/i;

type Tpl = { subject: string; body: string };

export const PRESCRIBER_SEQUENCE: Record<PrescriberKind, Tpl[]> = {
  reglemente: [
    {
      subject: "Un diagnostic gratuit de la messagerie de vos clients",
      body: `Bonjour {prenom},

Je suis RSSI externalisé (InfraCyb). Je propose à quelques cabinets de faire gratuitement le diagnostic public de la messagerie des entreprises qu'ils accompagnent : SPF, DMARC, certificat. Rien à installer chez le client, et pas de temps demandé au cabinet.

Pour chaque client concerné, vous recevez une page claire : ce qui est visible depuis l'extérieur et ce qu'il faut corriger. Vous décidez de la transmettre ou non. Je ne contacte aucun de vos clients de mon côté.

Un client que vous m'adressez bénéficie de ${REFERRED_CLIENT_DISCOUNT_PCT} % de remise sur mes prestations. Je ne demande aucune contrepartie financière au cabinet : cela reste une recommandation libre.

Voulez-vous que je commence par le domaine de {cabinet}, à titre d'exemple ?

{signature}`,
    },
    {
      subject: "Re : Un diagnostic gratuit de la messagerie de vos clients",
      body: `Bonjour {prenom},

Je me permets de revenir sur mon message. Pour que ce soit concret, je peux vous envoyer le diagnostic de {cabinet} cette semaine : une page, sans engagement, que vous gardez ou non.

Si le sujet ne vous concerne pas, dites-le-moi simplement et je ne vous relance pas.

{signature}`,
    },
  ],
  partenaire: [
    {
      subject: "Partenariat : sécurité de la messagerie de vos clients",
      body: `Bonjour {prenom},

Je suis RSSI externalisé (InfraCyb). Vos clients se posent peut-être des questions sur la sécurité de leur messagerie (usurpation d'adresse, SPF, DKIM, DMARC), un sujet que vous ne traitez pas forcément vous-même.

Je propose un partenariat simple : je réalise gratuitement le diagnostic public des clients que vous m'indiquez. S'ils choisissent ensuite le Pack Courrier sécurisé ou une mission, vous recevez ${PARTNER_COMMISSION_PCT} % du montant HT encaissé sur la première facture, payé 30 jours après l'encaissement. Un accord écrit fixe ces conditions avant toute recommandation.

Voulez-vous que je commence par le domaine de {cabinet} ?

{signature}`,
    },
    {
      subject: "Re : Partenariat : sécurité de la messagerie de vos clients",
      body: `Bonjour {prenom},

Je reviens sur mon message : je peux vous envoyer cette semaine le diagnostic de {cabinet}, une page sans engagement, pour que vous jugiez sur pièces.

Si ce n'est pas le bon moment, dites-le-moi et je ne vous relance pas.

{signature}`,
    },
  ],
};

export type PrescriberMailInput = { kind: PrescriberKind; step: number; firstName?: string; company: string; signature: string };

/** Compose un mail de la séquence (0 = premier message, 1 = relance). Sans prénom, la formule d'appel devient « Bonjour, ». */
export function composePrescriberMail(i: PrescriberMailInput): { ok: true; subject: string; text: string } | { ok: false; error: string } {
  const tpl = PRESCRIBER_SEQUENCE[i.kind]?.[i.step];
  if (!tpl) return { ok: false, error: "Modèle de mail introuvable pour ce type de prescripteur." };
  const first = (i.firstName ?? "").trim();
  const fill = (s: string) => s.replace("Bonjour {prenom},", first ? `Bonjour ${first},` : "Bonjour,").replaceAll("{cabinet}", i.company.trim() || "votre structure").replace("{signature}", i.signature.trim());
  const text = fill(tpl.body);
  if (/\{[a-z]+\}/.test(text)) return { ok: false, error: "Un champ du modèle n'a pas été rempli." };
  return { ok: true, subject: tpl.subject, text };
}

/** Secteurs « partenaires » (commission avec accord écrit) : activés seulement avec PRESCRIPTEUR_PARTENAIRES=1, après l'immatriculation. */
const PARTNER_SECTORS = ["Courtage"];

/**
 * Secteurs visés par la campagne prescripteurs, et donc réservés : la prospection client (audit, diagnostic) ne les vise plus.
 * Sans les partenaires, les courtiers restent des clients potentiels.
 */
export function prescriberSectors(partnersEnabled: boolean): string[] {
  return [...REGULATED_SECTORS, ...(partnersEnabled ? PARTNER_SECTORS : [])];
}

/** Un numéro est utilisable s'il contient au moins 9 chiffres. */
const usablePhone = (p: string): boolean => p.replace(/\D/g, "").length >= 9;
const one = (s: string, max: number) => s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export type PrescriberCall = { title: string; dueDate: string; priority: "haute"; opening: string };

/**
 * Tâche d'appel après la relance (J+7) : le lendemain. Le canevas ne parle jamais de commission à une profession
 * réglementée. null sans numéro utilisable.
 */
export function prescriberCallTask(i: { kind: PrescriberKind; company: string; contactName: string; phone: string; me: string; sentOn: string }): PrescriberCall | null {
  if (!usablePhone(i.phone)) return null;
  const company = one(i.company, 120);
  const phone = one(i.phone, 30);
  const who = one(i.contactName, 80);
  const due = new Date(Date.parse(i.sentOn + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  const offer =
    i.kind === "reglemente"
      ? `Je propose aux cabinets un diagnostic gratuit de la messagerie de leurs clients, sans rien leur demander en retour ; un client recommandé a ${REFERRED_CLIENT_DISCOUNT_PCT} % de remise.`
      : `Je propose un partenariat : diagnostic gratuit pour vos clients, et ${PARTNER_COMMISSION_PCT} % du HT encaissé sur la première facture, avec un accord écrit.`;
  const opening = [
    `Bonjour${who ? " " + who : ""}, ${one(i.me, 80) || "[mon prénom]"} d'InfraCyb.`,
    `Je vous ai écrit à propos de la sécurité de la messagerie de vos clients. ${offer}`,
    `Pour commencer, je peux vous envoyer cette semaine le diagnostic de ${company} : une page, sans engagement.`,
    "Si la personne refuse : la remercier et noter « refus » sur la fiche. Si elle accepte : lancer le diagnostic de son domaine et le lui envoyer dans la journée.",
  ].join("\n");
  return { title: `Appeler ${company} au ${phone} : prescripteur, après la relance`, dueDate: due, priority: "haute", opening };
}
