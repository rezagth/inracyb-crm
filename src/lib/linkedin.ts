/**
 * Publication sur LinkedIn (phase R) : règles pures, sans base ni réseau, donc testables.
 * Produit LinkedIn « Share on LinkedIn » (portée w_member_social) et « Sign In with LinkedIn using OpenID Connect »
 * (openid profile) pour connaître l'auteur. Documentation vérifiée le 26/11/2026 sur learn.microsoft.com :
 * - jeton d'accès valable 60 jours ; pas de jeton de renouvellement hors partenaires agréés (MDP) ;
 * - image : POST /v2/assets?action=registerUpload, envoi du fichier à l'uploadUrl, puis POST /v2/ugcPosts.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const LINKEDIN_SCOPES = "openid profile w_member_social";
export const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const LINKEDIN_API = "https://api.linkedin.com/v2";
/** Alerte « reconnecte LinkedIn » à partir de ce nombre de jours avant l'expiration. */
export const RECONNECT_WARN_DAYS = 10;
/** Durée de validité du code de sécurité de la connexion (aller-retour vers LinkedIn). */
export const STATE_TTL_MS = 10 * 60_000;
/** Limite de LinkedIn pour le texte d'un post. */
export const MAX_COMMENTARY = 3000;

/* ———————————— Chiffrement du jeton (AES-256-GCM, clé tirée d'AUTH_SECRET) ———————————— */

const keyOf = (secret: string): Buffer => createHash("sha256").update(`linkedin-token:${secret}`).digest();

/** « v1.<iv>.<tag>.<données> » en base64url. */
export function encryptToken(secret: string, token: string): string {
  if (secret.length < 16) throw new Error("AUTH_SECRET trop court pour chiffrer le jeton LinkedIn");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Jeton en clair, ou null si la valeur est vide, altérée ou chiffrée avec une autre clé. */
export function decryptToken(secret: string, enc: string): string | null {
  const parts = enc.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || secret.length < 16) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(parts[1], "base64url"));
    d.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([d.update(Buffer.from(parts[3], "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/* ———————————— Code de sécurité de la connexion (paramètre « state » d'OAuth) ———————————— */

const stateSig = (secret: string, nonce: string, at: number) => createHmac("sha256", secret).update(`linkedin-state:${nonce}.${at}`).digest("base64url");

/** « <aléa>.<horodatage>.<signature> » : gardé dans un cookie et envoyé à LinkedIn, comparé au retour. */
export function makeState(secret: string, nowMs: number): string {
  const nonce = randomBytes(16).toString("base64url");
  return `${nonce}.${nowMs}.${stateSig(secret, nonce, nowMs)}`;
}

/** Le « state » revenu de LinkedIn est-il celui du cookie, authentique et récent ? */
export function checkState(secret: string, returned: string | null, cookie: string | null | undefined, nowMs: number): boolean {
  if (!returned || !cookie || returned.length > 200) return false;
  const a = Buffer.from(returned);
  const b = Buffer.from(cookie);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const [nonce, atRaw, sig] = returned.split(".");
  if (!nonce || !/^\d{12,15}$/.test(atRaw ?? "") || !sig) return false;
  const at = Number(atRaw);
  const good = Buffer.from(stateSig(secret, nonce, at));
  const given = Buffer.from(sig);
  return good.length === given.length && timingSafeEqual(good, given) && nowMs - at >= 0 && nowMs - at <= STATE_TTL_MS;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state, scope: LINKEDIN_SCOPES });
  return `${LINKEDIN_AUTHORIZE_URL}?${q.toString()}`;
}

/* ———————————— Post ———————————— */

/** Corps de la requête UGC Posts : texte public, avec l'image déjà envoyée si elle existe. */
export function buildUgcPost(personUrn: string, text: string, imageAsset: string | null, imageTitle = "") {
  return {
    author: personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: text.trim().slice(0, MAX_COMMENTARY) },
        shareMediaCategory: imageAsset ? "IMAGE" : "NONE",
        ...(imageAsset ? { media: [{ status: "READY", media: imageAsset, title: { text: imageTitle.slice(0, 200) } }] } : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
}

/** Corps de la déclaration d'image (registerUpload). */
export const registerUploadBody = (personUrn: string) => ({
  registerUploadRequest: {
    recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
    owner: personUrn,
    serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
  },
});

/** Lien public d'un post à partir de l'identifiant renvoyé par LinkedIn (en-tête X-RestLi-Id). */
export function postUrl(id: string): string {
  return /^urn:li:(share|ugcPost|activity):[\w-]+$/.test(id) ? `https://www.linkedin.com/feed/update/${id}/` : "";
}

/** Identifiant de membre LinkedIn (« sub » d'OpenID Connect) → URN d'auteur. */
export const personUrnOf = (sub: string): string => (/^[\w-]{3,64}$/.test(sub) ? `urn:li:person:${sub}` : "");

/* ———————————— État de la connexion ———————————— */

export type LinkedinState = { kind: "absent" } | { kind: "expire" } | { kind: "ok"; daysLeft: number; warn: boolean };

/** Connecté ou non, et combien de jours avant de devoir reconnecter. */
export function linkedinState(a: { tokenEnc: string; expiresAt: Date | null } | undefined, nowMs: number): LinkedinState {
  if (!a?.tokenEnc || !a.expiresAt) return { kind: "absent" };
  const left = Math.floor((a.expiresAt.getTime() - nowMs) / 86_400_000);
  if (a.expiresAt.getTime() <= nowMs) return { kind: "expire" };
  return { kind: "ok", daysLeft: left, warn: left < RECONNECT_WARN_DAYS };
}
