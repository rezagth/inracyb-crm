/**
 * Devis « Pack Courrier + Suivi mensuel » prérempli (phase M) : créé en brouillon en un clic après un appel positif,
 * à relire puis émettre. Règle pure (sans base) : prix de pricing.ts, prix pilote tant qu'il reste des places.
 */
import { addDaysIso } from "./campaign";
import { PACK_COURRIER, SUIVI_COURRIER, suiviMonthlyCents } from "./pricing";

/** Désignation de la ligne d'abonnement : sert aussi à reconnaître, à l'acceptation, le contrat mensuel à créer. */
export const SUIVI_LABEL = "Suivi Courrier & Domaine";
export const SUIVI_OFFER = "Suivi Courrier & Domaine";

const centsToInput = (c: number): string => (c / 100).toFixed(2).replace(".", ",");

export type PackQuote = {
  subject: string;
  issueDate: string;
  dueDate: string;
  discountPct: string;
  note: string;
  lines: { label: string; quantity: number; unit: "forfait" | "mois"; unitPrice: string }[];
};

export function buildPackQuote(a: { slotsLeft: number; today: string; domain: string }): PackQuote {
  const pilot = a.slotsLeft > 0;
  const dom = a.domain.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 120);
  const on = dom ? ` pour ${dom}` : "";
  return {
    subject: `Pack Courrier sécurisé et suivi mensuel${on}`,
    issueDate: a.today,
    dueDate: addDaysIso(a.today, 30),
    discountPct: "0",
    note: [
      `Le Pack corrige l'authentification du courrier${on} (SPF, DKIM, DMARC en surveillance). Le client garde la main sur son DNS : aucun mot de passe de registrar n'est demandé.`,
      `Le suivi commence à la livraison du Pack : lecture des rapports DMARC et durcissement progressif jusqu'au blocage des usurpations, contrôle mensuel de SPF, DMARC et du certificat, bilan mensuel d'une page. Engagement de ${SUIVI_COURRIER.minMonths} mois, puis résiliable chaque mois avec un mois de préavis.`,
      pilot ? "Tarif pilote (trois premiers clients), accordé en échange d'un court témoignage écrit à la fin du Pack." : "",
    ].filter(Boolean).join("\n\n"),
    lines: [
      { label: "Pack Courrier sécurisé — SPF, DKIM, DMARC", quantity: 1, unit: "forfait", unitPrice: centsToInput(pilot ? PACK_COURRIER.pilotCents : PACK_COURRIER.publicCents) },
      { label: `${SUIVI_LABEL} — abonnement mensuel (${SUIVI_COURRIER.minMonths} mois d'engagement)`, quantity: SUIVI_COURRIER.minMonths, unit: "mois", unitPrice: centsToInput(suiviMonthlyCents(a.slotsLeft)) },
    ],
  };
}

/** Ligne d'abonnement d'un devis accepté → montant mensuel du contrat à créer, ou null. */
export function suiviFromLines(lines: { label: string; unit: string; unitPriceCents: number }[]): number | null {
  const l = lines.find((x) => x.unit === "mois" && x.label.startsWith(SUIVI_LABEL) && x.unitPriceCents > 0);
  return l ? l.unitPriceCents : null;
}

const isSuivi = (l: { label: string; unit: string }): boolean => l.unit === "mois" && l.label.startsWith(SUIVI_LABEL);

/**
 * Part ponctuelle d'un devis : l'abonnement est facturé chaque mois par son contrat, jamais par la facture tirée du devis
 * (sinon il serait payé deux fois). Renvoie les lignes à facturer et le montant HT ponctuel (remise du devis appliquée au prorata).
 */
export function oneOffPart<L extends { label: string; unit: string; quantity: number; unitPriceCents: number }>(lines: L[], totalHtCents: number): { lines: L[]; baseHtCents: number; excluded: boolean } {
  const raw = (ls: L[]) => ls.reduce((a, l) => a + Math.round(l.quantity * l.unitPriceCents), 0);
  const kept = lines.filter((l) => !isSuivi(l));
  if (kept.length === lines.length) return { lines, baseHtCents: totalHtCents, excluded: false };
  const all = raw(lines);
  return { lines: kept, baseHtCents: all > 0 ? Math.round((totalHtCents * raw(kept)) / all) : 0, excluded: true };
}
