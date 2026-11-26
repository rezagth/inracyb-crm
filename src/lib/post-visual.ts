/**
 * Posts LinkedIn du CRM (phase Q) : contenu de l'image, post du jour et mail de rappel. Règles pures, testées.
 */
export type PostVisual = { kicker: string; big: string; sub: string };

const clip = (s: unknown, max: number): string => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Contenu de l'image enregistré en JSON → champs bornés ; null si rien d'exploitable (pas d'image). */
export function parseVisual(json: string): PostVisual | null {
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    const out = { kicker: clip(v?.kicker, 60), big: clip(v?.big, 40), sub: clip(v?.sub, 140) };
    return out.big ? out : null;
  } catch {
    return null;
  }
}

/** Trois champs saisis → JSON enregistré ; "" quand la phrase principale est vide (pas d'image). */
export function visualJson(kicker: string, big: string, sub: string): string {
  const v = { kicker: clip(kicker, 60), big: clip(big, 40), sub: clip(sub, 140) };
  return v.big ? JSON.stringify(v) : "";
}

/** Taille de la phrase principale de l'image : un chiffre court s'affiche en très grand, une phrase plus petit. */
export const bigFontSize = (big: string): number => (big.length <= 6 ? 260 : big.length <= 12 ? 150 : big.length <= 20 ? 110 : 84);

export type PostRow = { id: string; date: string; network: string; topic: string; status: string; body: string; visual: string };

/** Post LinkedIn à publier ce jour-là : prévu aujourd'hui, pas encore publié, avec un texte. */
export function postOfDay<T extends PostRow>(posts: T[], today: string): T | null {
  return posts.find((p) => p.date === today && p.network === "LinkedIn" && p.status !== "publie" && p.body.trim() !== "") ?? null;
}

/** Mail du matin : le texte du post prêt à copier, l'image en pièce jointe, et les gestes qui font circuler le post. */
export function composePostMail(p: PostRow, appUrl: string): { subject: string; text: string } {
  const hasImage = !!parseVisual(p.visual);
  return {
    subject: `À publier aujourd'hui sur LinkedIn : ${p.topic}`,
    text: [
      "Bonjour,",
      `Voici le post LinkedIn du jour${hasImage ? ", avec son image en pièce jointe" : ""}.`,
      "1. Copie le texte ci-dessous et colle-le dans un nouveau post LinkedIn." + (hasImage ? "\n2. Ajoute l'image jointe à ce mail (enregistre-la sur ton téléphone, puis « Ajouter un média »)." : ""),
      `${hasImage ? "3" : "2"}. Publie avant 9 h, réponds à chaque commentaire dans la journée, puis envoie 5 à 10 invitations à des dirigeants de ta cible (agences immobilières, cabinets, ESN), sans message commercial.`,
      "———— TEXTE DU POST ————",
      p.body.trim(),
      "———————————————",
      appUrl ? `Une fois publié, marque-le « Publié » dans le CRM : ${appUrl}/marketing` : "Une fois publié, marque-le « Publié » dans la page Marketing du CRM.",
    ].join("\n\n") + "\n",
  };
}

/** Mail après une publication automatique réussie (phase R) : le lien, et ce qui compte dans la première heure. */
export function composePublishedMail(p: PostRow, url: string): { subject: string; text: string } {
  return {
    subject: `Publié sur LinkedIn ✅ ${p.topic}`,
    text: [
      "Bonjour,",
      "Le CRM vient de publier le post du jour sur ton profil LinkedIn, avec son image.",
      url ? `Le post : ${url}` : "",
      "La première heure compte le plus :",
      "1. Réponds à chaque commentaire, même d'un mot.\n2. Commente 2 ou 3 posts de personnes de ta cible (agences immobilières, cabinets, ESN).\n3. Envoie 5 à 10 invitations à des dirigeants de ta cible, sans message commercial.",
    ].filter(Boolean).join("\n\n") + "\n",
  };
}

/** Phrase d'alerte quand l'autorisation LinkedIn arrive à expiration ou n'est plus valable ; "" sinon. */
export function reconnectNotice(s: { kind: string; daysLeft?: number; warn?: boolean }, appUrl: string): string {
  const where = appUrl ? ` : ${appUrl}/marketing` : " (page Marketing du CRM)";
  if (s.kind === "expire") return `⚠️ L'autorisation LinkedIn a expiré : les posts ne partent plus tout seuls. Clique sur « Reconnecter LinkedIn »${where}`;
  if (s.kind === "ok" && s.warn) return `⚠️ L'autorisation LinkedIn expire dans ${s.daysLeft} jour(s). Clique sur « Reconnecter LinkedIn » avant${where}`;
  return "";
}
