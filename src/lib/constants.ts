export const STAGES = [
  { id: "qualif", label: "À qualifier", tone: "neu" },
  { id: "contacte", label: "Contacté", tone: "info" },
  { id: "rdv", label: "RDV planifié", tone: "info" },
  { id: "devis", label: "Devis envoyé", tone: "warn" },
  { id: "nego", label: "Négociation", tone: "warn" },
  { id: "gagne", label: "Gagné", tone: "ok" },
  { id: "perdu", label: "Perdu", tone: "ko" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as [StageId, ...StageId[]];
export const stageOf = (id: string) => STAGES.find((s) => s.id === id) ?? STAGES[0];
export const stageRank = (id: string) => STAGES.findIndex((s) => s.id === id);

export function statusOfStage(stage: string): { label: string; tone: Tone } {
  if (stage === "gagne") return { label: "Client", tone: "ok" };
  if (stage === "perdu") return { label: "Perdu", tone: "ko" };
  if (stage === "qualif") return { label: "Prospect", tone: "neu" };
  return { label: "En discussion", tone: "info" };
}

export const SECTORS = ["Juridique", "Notariat", "Santé", "Expertise comptable", "Immobilier", "Autres"] as const;
export const SOURCES = ["Site web", "LinkedIn", "Recommandation", "Salon", "Partenaire", "Autre"] as const;
export const OFFERS = [
  { id: "Audit", label: "Audit forfaitaire" },
  { id: "CISOaaS", label: "RSSI externalisé" },
  { id: "IA", label: "Automatisation IA" },
] as const;
export const PRIORITIES = [
  { id: "haute", label: "Haute", tone: "ko" },
  { id: "moyenne", label: "Moyenne", tone: "warn" },
  { id: "basse", label: "Basse", tone: "neu" },
] as const;
export const UNITS = ["forfait", "jour", "heure", "mois", "unité"] as const;
export const PAY_METHODS = ["Virement bancaire", "Prélèvement SEPA", "Carte bancaire", "Chèque", "Espèces", "Autre"] as const;

export type Tone = "ok" | "ko" | "warn" | "info" | "neu";

export const QUOTE_STATUS: Record<string, { label: string; tone: Tone }> = {
  brouillon: { label: "Brouillon", tone: "neu" },
  envoye: { label: "Envoyé", tone: "info" },
  accepte: { label: "Accepté", tone: "ok" },
  refuse: { label: "Refusé", tone: "ko" },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  brouillon: { label: "Brouillon", tone: "neu" },
  envoyee: { label: "Envoyée", tone: "info" },
  partielle: { label: "Partiellement payée", tone: "warn" },
  retard: { label: "En retard", tone: "ko" },
  payee: { label: "Payée", tone: "ok" },
  annulee: { label: "Annulée", tone: "neu" },
  emis: { label: "Avoir", tone: "neu" },
};
