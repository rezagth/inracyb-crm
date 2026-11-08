import { createHmac } from "node:crypto";

export type PaymentStatus = "a_jour" | "en_retard" | "resilie";

/** Signature HMAC-SHA256 (hex) de « <horodatage>.<corps> » : même règle que côté StratCyber. */
export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

const DAY = 86_400_000;
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY));
}

/**
 * Statut de paiement d'un client à partir de ses contrats et de ses factures émises non soldées.
 * Un contrat résilié ou terminé sans retard de paiement donne « resilie » ; un retard prime toujours,
 * pour que l'impayé reste visible même après la fin du contrat.
 */
export function paymentStatusOf(
  contractStatuses: string[],
  overdueDueDates: string[],
  todayIso: string,
): { status: PaymentStatus; overdueDays: number | null } {
  if (overdueDueDates.length > 0) {
    const oldest = [...overdueDueDates].sort()[0];
    return { status: "en_retard", overdueDays: daysBetween(oldest, todayIso) };
  }
  if (contractStatuses.length > 0 && !contractStatuses.includes("actif")) return { status: "resilie", overdueDays: null };
  return { status: "a_jour", overdueDays: null };
}
