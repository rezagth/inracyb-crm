/**
 * Montant estimé d'une affaire, calculé pour remplir le pipeline dès l'import.
 * Ce sont des hypothèses de départ : modifie les tarifs ci-dessous pour qu'ils collent à tes prix, puis ajuste chaque fiche au besoin.
 *  - Audit : ton prix forfaitaire (Paramètres), sinon 1 500 € HT.
 *  - RSSI externalisé : abonnement mensuel selon la taille × 12 mois.
 *  - Automatisation IA : forfait de départ selon la taille.
 */
export type OfferId = "Audit" | "CISOaaS" | "IA";

export const DEFAULT_AUDIT_CENTS = 150_000;
/** € HT par mois, par tranche d'effectif Insee. */
export const CISO_MONTHLY_EUR: Record<string, number> = { "01": 300, "02": 400, "03": 400, "11": 600, "12": 900, "21": 1500 };
export const CISO_MONTHS = 12;
/** € HT, forfait, par tranche d'effectif Insee. */
export const IA_PROJECT_EUR: Record<string, number> = { "01": 1000, "02": 1500, "03": 1500, "11": 2500, "12": 4000, "21": 6000 };

/** Tranche inconnue ou hors grille : on retient la petite structure, jamais une valeur gonflée. */
function tier<T>(table: Record<string, T>, code: string): T {
  return table[code] ?? table["03"];
}

export function estimateAmountCents(offer: string, effectifCode: string, prixAuditCents: number): number {
  if (offer === "CISOaaS") return tier(CISO_MONTHLY_EUR, effectifCode) * CISO_MONTHS * 100;
  if (offer === "IA") return tier(IA_PROJECT_EUR, effectifCode) * 100;
  return prixAuditCents > 0 ? prixAuditCents : DEFAULT_AUDIT_CENTS;
}

/** Plus la structure est grande, plus l'affaire est intéressante. */
export function priorityFor(effectifCode: string): "haute" | "moyenne" {
  return ["11", "12", "21", "22", "31", "32"].includes(effectifCode) ? "haute" : "moyenne";
}
