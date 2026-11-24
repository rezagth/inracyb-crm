/**
 * Événements de délivrabilité envoyés par Brevo (webhook). Règles pures, testables sans réseau.
 * Un événement « dur » (adresse inexistante, plainte spam, blocage, adresse invalide, désinscription)
 * écarte l'adresse de toute campagne : on ne lui écrit plus jamais.
 */

export type EventKind = "rebond" | "rebond_temporaire" | "spam" | "bloque" | "invalide" | "desinscrit" | "delivre";

export type Classified = { kind: EventKind; /** raison affichée sur la campagne */ reason: string; /** true : l'adresse est écartée définitivement */ suppress: boolean };

/** Motifs affichés dans « État » d'une campagne (et comptés dans les statistiques). */
export const REASON = { rebond: "Rebond", spam: "Plainte spam", bloque: "Bloqué", invalide: "E-mail invalide", desinscrit: "Désinscrit" } as const;
export const BOUNCE_REASONS: string[] = [REASON.rebond, REASON.bloque, REASON.invalide];

const norm = (e: string) => e.toLowerCase().replace(/[^a-z]/g, "");

/** Traduit le nom d'événement de Brevo (hard_bounce, hardBounce…). Les événements sans intérêt (opened, click…) renvoient null. */
export function classifyBrevoEvent(event: unknown): Classified | null {
  if (typeof event !== "string") return null;
  switch (norm(event)) {
    case "delivered":
      // Simple accusé de remise, gardé pour le bilan des campagnes : aucun effet sur l'adresse.
      return { kind: "delivre", reason: "Délivré", suppress: false };
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

/** Service des mails de facturation (devis, factures, relances) : jamais compté dans les pauses ni le bilan de la prospection. */
export const BILLING_SERVICE = "facturation";

/** true si le mail porte l'étiquette « facturation » (tags Brevo : tableau, chaîne JSON ou chaîne simple). */
export function isBillingMail(tags: unknown): boolean {
  let list: unknown = tags;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [list];
    }
  }
  return Array.isArray(list) && list.some((t) => typeof t === "string" && t.toLowerCase() === BILLING_SERVICE);
}

/**
 * Problème sur un mail de facturation : une tâche pour corriger l'adresse ou appeler le client.
 * Jamais de désinscription automatique (c'est un client, pas un prospect). null : rien à faire.
 */
export function billingEventTask(kind: EventKind, email: string, subject: string): string | null {
  const about = subject ? ` (« ${subject.slice(0, 80)} »)` : "";
  switch (kind) {
    case "rebond":
    case "invalide":
    case "bloque":
      return `Adresse de facturation à corriger : ${email}, mail non remis${about}`;
    case "spam":
      return `Mail de facturation signalé comme indésirable par ${email}${about} : appeler le client`;
    case "desinscrit":
      return `${email} a cliqué « se désinscrire » sur un mail de facturation${about} : vérifier avec le client`;
    default:
      return null;
  }
}
