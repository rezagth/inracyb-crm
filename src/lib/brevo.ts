/**
 * Envoi de mails via l'API transactionnelle de Brevo (offre gratuite : 300 mails par jour).
 * Partie sans effet de bord : construction de la requête et lecture des erreurs (testable sans réseau).
 */

export const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
export const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

export type MailInput = {
  from: { email: string; name: string };
  to: { email: string; name?: string };
  subject: string;
  text: string;
  replyTo?: string;
  tags?: string[];
  /** En-têtes personnalisés, par exemple List-Unsubscribe pour la désinscription en un clic. */
  headers?: Record<string, string>;
  /** Pièces jointes : nom du fichier et contenu en base64 (ex. le PDF d'une facture). */
  attachments?: { name: string; contentBase64: string }[];
};

/** Corps JSON attendu par Brevo : texte brut uniquement (meilleure délivrabilité pour de la prospection 1 à 1). */
export function buildBrevoPayload(i: MailInput) {
  return {
    sender: { email: i.from.email, name: i.from.name },
    to: [i.to.name ? { email: i.to.email, name: i.to.name } : { email: i.to.email }],
    ...(i.replyTo ? { replyTo: { email: i.replyTo } } : {}),
    subject: i.subject,
    textContent: i.text,
    ...(i.tags?.length ? { tags: i.tags } : {}),
    ...(i.headers && Object.keys(i.headers).length ? { headers: i.headers } : {}),
    ...(i.attachments?.length ? { attachment: i.attachments.map((a) => ({ name: a.name, content: a.contentBase64 })) } : {}),
  };
}

/** Message d'erreur lisible, sans jamais exposer la clé API. */
export function explainBrevoError(status: number, body: unknown): string {
  const msg = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : "";
  const detail = msg ? ` (Brevo : ${msg.slice(0, 200)})` : "";
  if (/unrecogni[sz]ed ip|authori[sz]ed.?ip|ip address/i.test(msg)) return `Brevo bloque l'adresse IP du CRM : désactive le blocage des IP inconnues dans Brevo (Sécurité, IPs autorisées).${detail}`;
  if (status === 401) return `Brevo refuse la clé API : vérifie BREVO_API_KEY (dans Vercel aussi) et qu'elle n'a pas été supprimée.${detail}`;
  if (status === 400 && /sender/i.test(msg)) return "Brevo refuse l'expéditeur : valide l'adresse d'envoi (MAIL_FROM_EMAIL, ou MAIL_BILLING_FROM_EMAIL pour les factures) dans Brevo (Expéditeurs) et authentifie le domaine.";
  if (status === 402 || status === 403) return `Brevo a refusé l'envoi${msg ? " : " + msg : ""}. Vérifie le compte (téléphone à valider, quota, activation).`;
  if (status === 429) return "Brevo limite le débit : réessaie dans une minute.";
  return `Envoi refusé par Brevo (${status})${msg ? " : " + msg : ""}.`;
}
