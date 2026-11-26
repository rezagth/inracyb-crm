/**
 * Devis « Pack Courrier + Suivi mensuel » prérempli (phase M) : créé en brouillon en un clic après un appel positif,
 * à relire puis émettre. Règle pure (sans base) : prix de pricing.ts, prix pilote tant qu'il reste des places.
 */
import { addDaysIso } from "./campaign";
import { DOSSIER_PREUVES, euros, KIT_FAUX_RIB, M365_SECURISE, offerCents, PACK_COURRIER, SUIVI_COURRIER, SUIVI_PME, suiviMonthlyCents } from "./pricing";
import { mailable, mailProvider, parseChecks, type Check } from "./diagnostic";
import { segmentOfSector } from "./diagnostic-mails";

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

/** Abonnements reconnus sur un devis : désignation de la ligne → offre du contrat créé à l'acceptation. */
export const SUIVI_PME_LABEL = "Suivi Sécurité PME";
export const SUIVI_PME_OFFER = "Suivi Sécurité PME";
const SUBSCRIPTIONS: { label: string; offer: string }[] = [
  { label: SUIVI_LABEL, offer: SUIVI_OFFER },
  { label: SUIVI_PME_LABEL, offer: SUIVI_PME_OFFER },
];
/** Contrats suivis par le bilan mensuel automatique. */
export const MONITORED_OFFERS = SUBSCRIPTIONS.map((x) => x.offer);

const subscriptionOf = (l: { label: string; unit: string }) => (l.unit === "mois" ? SUBSCRIPTIONS.find((x) => l.label.startsWith(x.label)) : undefined);

/** Ligne d'abonnement d'un devis accepté → offre et montant mensuel du contrat à créer, ou null. */
export function suiviFromLines(lines: { label: string; unit: string; unitPriceCents: number }[]): { offer: string; monthlyCents: number } | null {
  for (const l of lines) {
    const sub = subscriptionOf(l);
    if (sub && l.unitPriceCents > 0) return { offer: sub.offer, monthlyCents: l.unitPriceCents };
  }
  return null;
}

const isSuivi = (l: { label: string; unit: string }): boolean => !!subscriptionOf(l);

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

/* ===================== Offres de la phase O : recommandation et devis ===================== */

export type OfferKey = "pack" | "kit" | "m365" | "dossier";
export const OFFER_KEYS: OfferKey[] = ["pack", "kit", "m365", "dossier"];
export const OFFER_LABEL: Record<OfferKey, string> = { pack: "Pack Courrier + Suivi", kit: "Kit anti-faux-RIB", m365: "Microsoft 365 sécurisé", dossier: "Dossier de preuves" };
/** Pourquoi l'offre est recommandée, affiché dans la file d'appels et sur la fiche. */
export const OFFER_WHY: Record<OfferKey, string> = {
  pack: "constat SPF ou DMARC",
  kit: "agence ou cabinet : fraude au faux RIB",
  m365: "messagerie Microsoft 365 : piratage de compte",
  dossier: "questionnaires de sécurité des clients et de l'assureur",
};

/**
 * Offres à proposer, la plus pertinente d'abord : segment (faux RIB pour les agences et cabinets, questionnaires pour les
 * éditeurs), constat de messagerie, messagerie Microsoft 365. Règle pure, à partir des mesures déjà faites.
 */
export function recommendedOffers(a: { segment: string; checks: Check[] }): OfferKey[] {
  const mailAuth = a.checks.some((c) => mailable(c) && /^(spf|dmarc)-/.test(c.variant ?? ""));
  const m365 = mailProvider(a.checks) === "microsoft365";
  const out: OfferKey[] = [];
  if (a.segment === "immobilier" || a.segment === "cabinets") out.push("kit");
  if (a.segment === "editeurs") out.push("dossier");
  if (m365) out.push("m365");
  if (mailAuth && !out.includes("kit")) out.push("pack");
  return out;
}

/** Toutes les offres, les recommandées d'abord (menu de devis). */
export const withAllOffers = (rec: OfferKey[]): OfferKey[] => [...rec, ...OFFER_KEYS.filter((k) => !rec.includes(k))];

const suiviPmeLine = () => ({ label: `${SUIVI_PME_LABEL} — abonnement mensuel (${SUIVI_PME.minMonths} mois d'engagement)`, quantity: SUIVI_PME.minMonths, unit: "mois" as const, unitPrice: centsToInput(SUIVI_PME.monthlyCents) });
const SUIVI_PME_NOTE = `L'abonnement Suivi Sécurité PME commence à la livraison : suivi du courrier jusqu'au blocage des usurpations avec un bilan mensuel, contrôle trimestriel de Microsoft 365, mise à jour annuelle du dossier de preuves, une heure d'assistance par mois. Engagement de ${SUIVI_PME.minMonths} mois, puis résiliable chaque mois avec un mois de préavis. La ligne d'abonnement peut être retirée du devis si le client ne prend que le forfait.`;
const PILOT_NOTE = "Tarif pilote (trois premiers clients), accordé en échange d'un court témoignage écrit à la fin de la prestation.";

/** Devis prérempli d'une offre : forfait (prix pilote s'il reste des places) et abonnement associé. */
export function buildOfferQuote(key: OfferKey, a: { slotsLeft: number; today: string; domain: string }): PackQuote {
  if (key === "pack") return buildPackQuote(a);
  const pilot = a.slotsLeft > 0;
  const dom = a.domain.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 120);
  const on = dom ? ` pour ${dom}` : "";
  const base = { issueDate: a.today, dueDate: addDaysIso(a.today, 30), discountPct: "0" };
  const offer = { kit: KIT_FAUX_RIB, m365: M365_SECURISE, dossier: DOSSIER_PREUVES }[key];
  const pilotApplies = pilot && offer.pilotCents < offer.publicCents;
  const scope: Record<Exclude<OfferKey, "pack">, { subject: string; label: string; note: string }> = {
    kit: {
      subject: `Kit anti-faux-RIB${on}`,
      label: "Kit anti-faux-RIB — Pack Courrier, double authentification, procédure RIB, sensibilisation",
      note: `Le kit protège contre la fraude au faux RIB${on} : authentification du courrier (SPF, DKIM, DMARC), double authentification sur les messageries, procédure écrite de vérification de tout changement de coordonnées bancaires (par téléphone, à un numéro déjà connu), une heure de sensibilisation de l'équipe. Le client garde la main sur son DNS et ses comptes.`,
    },
    m365: {
      subject: `Microsoft 365 sécurisé${on}`,
      label: `Microsoft 365 sécurisé — jusqu'à ${M365_SECURISE.maxAccounts} comptes`,
      note: `Mise en sécurité du compte Microsoft 365${on}, jusqu'à ${M365_SECURISE.maxAccounts} comptes : double authentification pour tous, revue des règles de transfert, des comptes inactifs et des partages externes, alertes de connexion, rapport avant / après. Accès administrateur temporaire, retiré à la fin de la prestation. Au-delà de ${M365_SECURISE.maxAccounts} comptes : sur devis.`,
    },
    dossier: {
      subject: `Dossier de preuves sécurité${on}`,
      label: "Dossier de preuves sécurité — questionnaires assureur et clients",
      note: "Réponses prêtes et justifiées aux questionnaires de sécurité des assureurs et des clients (double authentification, sauvegardes, protection des postes, accès, incidents), avec les preuves correspondantes, mises en forme pour être envoyées telles quelles.",
    },
  };
  const sc = scope[key];
  return {
    ...base,
    subject: sc.subject,
    note: [sc.note, SUIVI_PME_NOTE, pilotApplies ? PILOT_NOTE : ""].filter(Boolean).join("\n\n"),
    lines: [{ label: sc.label, quantity: 1, unit: "forfait", unitPrice: centsToInput(offerCents(offer, a.slotsLeft)) }, suiviPmeLine()],
  };
}

/** Recommandation à partir du secteur de la fiche et des constats JSON du dernier diagnostic. */
export const offersForCompany = (sector: string, findingsJson: string): OfferKey[] => recommendedOffers({ segment: segmentOfSector(sector) ?? "", checks: parseChecks(findingsJson) });
/** Même chose, complétée par les autres offres (menu de devis). */
export const offerMenuForCompany = (sector: string, findingsJson: string): OfferKey[] => withAllOffers(offersForCompany(sector, findingsJson));

/**
 * Phrase d'offre de la synthèse publique, pour les offres autres que le Pack (qui a sa propre phrase, packOfferText).
 * Prix pilote tant qu'il reste des places. Texte fixe : aucune phrase n'est générée.
 */
export function offerPitch(key: Exclude<OfferKey, "pack">, slotsLeft: number): string {
  const price = (o: { publicCents: number; pilotCents: number }) =>
    slotsLeft > 0 && o.pilotCents < o.publicCents ? `${euros(o.pilotCents)} pour les 3 premiers clients, au lieu de ${euros(o.publicCents)}` : euros(o.publicCents);
  if (key === "kit") return `Contre la fraude au faux RIB, le Kit anti-faux-RIB réunit ces corrections, la double authentification sur vos messageries, une procédure écrite de vérification des changements de coordonnées bancaires et une heure de sensibilisation de votre équipe : ${price(KIT_FAUX_RIB)}.`;
  if (key === "m365") return `Votre messagerie fonctionne sous Microsoft 365, cible n°2 des attaques contre les entreprises (piratage de compte) : la mise en sécurité Microsoft 365, jusqu'à ${M365_SECURISE.maxAccounts} comptes, coûte ${price(M365_SECURISE)}.`;
  return `Si un client ou votre assureur vous envoie un questionnaire de sécurité, le Dossier de preuves vous donne des réponses prêtes et justifiées : ${price(DOSSIER_PREUVES)}.`;
}
