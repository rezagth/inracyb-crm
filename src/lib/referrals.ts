/**
 * Suivi des prescripteurs (règles pures, testables sans base) : type de partenaire, remise du client recommandé,
 * commission de l'apporteur. Déontologie : un expert-comptable, un avocat ou un notaire ne touche jamais de commission
 * (décret n° 2012-432, art. 162 ; RIN art. 11.3) ; son client recommandé bénéficie d'une remise à la place.
 */
import { PARTNER_COMMISSION_PCT, REFERRED_CLIENT_DISCOUNT_PCT } from "./pricing";
import { prescriberKindOf, type PrescriberKind } from "./prescripteur-mails";

export const PRESCRIBER_TYPE = "Prescripteur (sans commission)";
export const BROKER_TYPE = "Apporteur d'affaires";
export const PARTNER_TYPES = ["Partenaire (j'oriente)", BROKER_TYPE, PRESCRIBER_TYPE, "Sous-traitant"] as const;

/** Type de la fiche Partenaire créée pour un prescripteur. */
export const partnerTypeFor = (kind: PrescriberKind): string => (kind === "reglemente" ? PRESCRIBER_TYPE : BROKER_TYPE);

/** Mention de la colonne « Commission » de la fiche Partenaire. */
export const commissionLabelFor = (kind: PrescriberKind): string =>
  kind === "reglemente" ? `Aucune (remise de ${REFERRED_CLIENT_DISCOUNT_PCT} % au client)` : `${PARTNER_COMMISSION_PCT} % HT de la 1re facture`;

const REGULATED_WORDS = /expert[\s-]?comptable|comptab|avocat|notaire|notarial|juridique|commissaire aux comptes/i;

export type PartnerLike = { type: string; name: string; specialty: string; /** secteur de la fiche du cabinet, si elle est reliée */ sector?: string | null };

/**
 * Profession réglementée : par le secteur de la fiche reliée, sinon par le nom ou la spécialité.
 * Dans le doute (« Expert-comptable apporteur d'affaires »), c'est réglementé : aucune commission.
 */
export function isRegulatedPartner(p: PartnerLike): boolean {
  if (p.sector && prescriberKindOf(p.sector) === "reglemente") return true;
  return REGULATED_WORDS.test(`${p.name} ${p.specialty}`);
}

/** Commission possible : apporteur d'affaires d'une profession non réglementée. */
export const earnsCommission = (p: PartnerLike): boolean => p.type === BROKER_TYPE && !isRegulatedPartner(p);

/** Remise proposée au client recommandé (points de base : 1 000 = 10 %) ; 0 sans remise prévue. */
export function referralDiscountBp(p: PartnerLike | null | undefined): number {
  if (!p) return 0;
  return p.type === PRESCRIBER_TYPE || isRegulatedPartner(p) ? REFERRED_CLIENT_DISCOUNT_PCT * 100 : 0;
}

export type InvoiceForCommission = {
  id: string;
  number: string;
  kind: string;
  status: string;
  issueDate: string;
  totalHtCents: number;
  payments: { date: string; amountCents: number }[];
};

export type CommissionDue = { invoiceId: string; number: string; baseHtCents: number; amountCents: number; dueDate: string };

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Commission due sur la PREMIÈRE facture émise du client recommandé, une fois soldée :
 * 15 % du HT, à verser 30 jours après le dernier encaissement. null tant qu'il n'y a rien à verser.
 * Les avoirs, brouillons et factures annulées ne comptent pas comme « première facture ».
 */
export function commissionDue(p: PartnerLike, invoices: InvoiceForCommission[]): CommissionDue | null {
  if (!earnsCommission(p)) return null;
  const first = invoices
    .filter((i) => i.kind === "facture" && i.status !== "brouillon" && i.status !== "annulee")
    .sort((a, b) => (a.issueDate === b.issueDate ? a.number.localeCompare(b.number) : a.issueDate < b.issueDate ? -1 : 1))[0];
  if (!first || first.status !== "payee" || first.totalHtCents <= 0) return null;
  const paidOn = first.payments.map((x) => x.date).sort().at(-1);
  if (!paidOn) return null;
  return {
    invoiceId: first.id,
    number: first.number,
    baseHtCents: first.totalHtCents,
    amountCents: Math.round((first.totalHtCents * PARTNER_COMMISSION_PCT) / 100),
    dueDate: addDays(paidOn, 30),
  };
}

/** Titre de la tâche de versement : sert aussi à ne jamais la créer deux fois. */
export const commissionTaskTitle = (partnerName: string, invoiceNumber: string, amountLabel: string): string =>
  `Verser la commission de ${amountLabel} à ${partnerName} (facture ${invoiceNumber})`.slice(0, 200);
