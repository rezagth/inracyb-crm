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
