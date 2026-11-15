/**
 * Événements de délivrabilité envoyés par Brevo (webhook). Règles pures, testables sans réseau.
 * Un événement « dur » (adresse inexistante, plainte spam, blocage, adresse invalide, désinscription)
 * écarte l'adresse de toute campagne : on ne lui écrit plus jamais.
 */

export type EventKind = "rebond" | "rebond_temporaire" | "spam" | "bloque" | "invalide" | "desinscrit";

export type Classified = { kind: EventKind; /** raison affichée sur la campagne */ reason: string; /** true : l'adresse est écartée définitivement */ suppress: boolean };

/** Motifs affichés dans « État » d'une campagne (et comptés dans les statistiques). */
export const REASON = { rebond: "Rebond", spam: "Plainte spam", bloque: "Bloqué", invalide: "E-mail invalide", desinscrit: "Désinscrit" } as const;
export const BOUNCE_REASONS: string[] = [REASON.rebond, REASON.bloque, REASON.invalide];

const norm = (e: string) => e.toLowerCase().replace(/[^a-z]/g, "");

/** Traduit le nom d'événement de Brevo (hard_bounce, hardBounce…). Les événements sans intérêt (delivered, opened…) renvoient null. */
export function classifyBrevoEvent(event: unknown): Classified | null {
  if (typeof event !== "string") return null;
  switch (norm(event)) {
    case "hardbounce":
      return { kind: "rebond", reason: REASON.rebond, suppress: true };
    case "softbounce":
      return { kind: "rebond_temporaire", reason: "Rebond temporaire", suppress: false };
    case "spam":
    case "complaint":
      return { kind: "spam", reason: REASON.spam, suppress: true };
    case "blocked":
      return { kind: "bloque", reason: REASON.bloque, suppress: true };
    case "invalidemail":
    case "invalid":
      return { kind: "invalide", reason: REASON.invalide, suppress: true };
    case "unsubscribed":
    case "unsubscribe":
      return { kind: "desinscrit", reason: REASON.desinscrit, suppress: true };
    default:
      return null;
  }
}
