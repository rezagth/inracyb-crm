/**
 * Prix de départ du Pack Courrier sécurisé (SPF, DKIM, DMARC), en centimes HT.
 * Étude de marché du 18/11/2026 : prestataires installés entre 390 et 650 € ; le prix public reste au bas de cette fourchette,
 * le prix pilote (3 premiers clients, contre un témoignage écrit) est une remise d'environ 25 %.
 * Aucune facture avant l'immatriculation (décision du 18/11) : ces montants servent aux devis et aux textes.
 */
export const PACK_COURRIER = { publicCents: 39000, pilotCents: 29000, pilotSlots: 3 } as const;

/** Remise accordée à un client recommandé par un expert-comptable, en pourcentage du prix. */
export const REFERRED_CLIENT_DISCOUNT_PCT = 10;

/** Commission d'un apporteur (prestataire IT, courtier pour une simple mise en relation), en pourcentage du montant HT encaissé. */
export const PARTNER_COMMISSION_PCT = 15;

export const euros = (cents: number): string => (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " € HT";

/** Places pilotes restantes d'après le nombre de clients pilotes déjà signés. */
export const pilotSlotsLeft = (signed: number): number => Math.max(0, PACK_COURRIER.pilotSlots - Math.max(0, signed));

/** Phrase d'offre du rapport envoyé au prospect (constats de messagerie seulement). Prix pilote tant qu'il reste des places. */
export function packOfferText(slotsLeft: number): string {
  const head = "Le Pack Courrier sécurisé (SPF, DKIM, DMARC) corrige les points de messagerie relevés ci-dessus, en quelques jours et sans interruption : ";
  return slotsLeft > 0
    ? head + `${euros(PACK_COURRIER.pilotCents)} pour les ${PACK_COURRIER.pilotSlots} premiers clients, au lieu de ${euros(PACK_COURRIER.publicCents)}.`
    : head + `${euros(PACK_COURRIER.publicCents)}.`;
}
