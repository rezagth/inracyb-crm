import type { Tone } from "./constants";

export type LineInput = { label: string; quantity: number; unit: string; unitPriceCents: number };

export type Totals = { sub: number; disc: number; ht: number; tva: number; ttc: number; paid: number; rest: number };

/** Calcule les totaux en centimes. Remise en points de base (1 000 = 10 %). */
export function computeTotals(lines: Pick<LineInput, "quantity" | "unitPriceCents">[], discountBp: number, tvaFranchise: boolean, paidCents = 0): Totals {
  const sub = lines.reduce((a, l) => a + Math.round(l.quantity * l.unitPriceCents), 0);
  const disc = Math.round((sub * (discountBp || 0)) / 10_000);
  const ht = sub - disc;
  const tva = tvaFranchise ? 0 : Math.round(ht * 0.2);
  const ttc = ht + tva;
  return { sub, disc, ht, tva, ttc, paid: paidCents, rest: Math.max(0, ttc - paidCents) };
}

/** Statut affiché d'une facture (dérivé : retard, partielle). */
export function invoiceDisplayStatus(inv: { kind: string; status: string; dueDate: string }, totals: Totals, todayIso: string): { key: string; label: string; tone: Tone } {
  if (inv.kind === "avoir") return { key: "avoir", label: "Avoir", tone: "neu" };
  if (inv.status === "envoyee") {
    const late = inv.dueDate < todayIso && totals.rest > 0;
    if (totals.paid > 0 && totals.rest > 0) return { key: late ? "retard" : "partielle", label: late ? "Partielle · en retard" : "Partiellement payée", tone: late ? "ko" : "warn" };
    if (late) return { key: "retard", label: "En retard", tone: "ko" };
    return { key: "envoyee", label: "Envoyée", tone: "info" };
  }
  const map: Record<string, { label: string; tone: Tone }> = {
    brouillon: { label: "Brouillon", tone: "neu" },
    payee: { label: "Payée", tone: "ok" },
    annulee: { label: "Annulée", tone: "neu" },
  };
  return { key: inv.status, ...(map[inv.status] ?? { label: inv.status, tone: "neu" }) };
}

/** Le brouillon porte un numéro provisoire ; le numéro définitif est attribué à l'émission (numérotation continue). */
export const isDraftNumber = (n: string) => n.startsWith("BROUILLON-");
