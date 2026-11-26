import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  buildUgcPost, decryptToken, encryptToken, LINKEDIN_API, LINKEDIN_TOKEN_URL, LINKEDIN_USERINFO_URL, linkedinState, personUrnOf, postUrl, registerUploadBody, type LinkedinState,
} from "@/lib/linkedin";
import { parseVisual } from "@/lib/post-visual";
import { appUrl } from "./campaigns";
import { postImagePng } from "./post-image";

const secret = () => (process.env.AUTH_SECRET || "").trim();
export const linkedinConfigured = (): boolean => !!(process.env.LINKEDIN_CLIENT_ID || "").trim() && !!(process.env.LINKEDIN_CLIENT_SECRET || "").trim() && secret().length >= 16;
/** Adresse de retour à déclarer telle quelle dans l'application LinkedIn (onglet Auth). */
export const linkedinRedirectUri = (): string => (appUrl() ? `${appUrl()}/api/linkedin/callback` : "");

export async function getLinkedinAuth() {
  return (await db.select().from(schema.linkedinAuth).where(eq(schema.linkedinAuth.id, 1)).limit(1))[0];
}

export async function linkedinStatus(nowMs = Date.now()): Promise<LinkedinState & { name: string; expiresAt: Date | null; lastError: string }> {
  const a = await getLinkedinAuth();
  return { ...linkedinState(a, nowMs), name: a?.name ?? "", expiresAt: a?.expiresAt ?? null, lastError: a?.lastError ?? "" };
}

async function setAuth(values: Partial<typeof schema.linkedinAuth.$inferInsert>) {
  await db.insert(schema.linkedinAuth).values({ id: 1, ...values, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.linkedinAuth.id, set: { ...values, updatedAt: new Date() } });
}

export async function disconnectLinkedin() {
  await setAuth({ tokenEnc: "", personUrn: "", name: "", expiresAt: null, lastError: "" });
}

/** Échange le code de retour contre un jeton, lit l'identité du membre et enregistre le tout, jeton chiffré. */
export async function connectLinkedin(code: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (!linkedinConfigured()) return { ok: false, error: "LINKEDIN_CLIENT_ID et LINKEDIN_CLIENT_SECRET manquent dans Vercel." };
  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: linkedinRedirectUri(), client_id: process.env.LINKEDIN_CLIENT_ID!.trim(), client_secret: process.env.LINKEDIN_CLIENT_SECRET!.trim() }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const tok = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
  if (!res.ok || !tok?.access_token) return { ok: false, error: `LinkedIn a refusé la connexion (${tok?.error_description ?? `HTTP ${res.status}`}).` };
  const me = await fetch(LINKEDIN_USERINFO_URL, { headers: { authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const info = (await me.json().catch(() => null)) as { sub?: string; name?: string } | null;
  const urn = personUrnOf(info?.sub ?? "");
  if (!me.ok || !urn) return { ok: false, error: "Identité LinkedIn illisible : vérifie que le produit « Sign In with LinkedIn using OpenID Connect » est ajouté à l'application." };
  const seconds = Math.max(60, Math.min(Number(tok.expires_in) || 60 * 86_400, 366 * 86_400));
  await setAuth({ tokenEnc: encryptToken(secret(), tok.access_token), personUrn: urn, name: (info?.name ?? "").slice(0, 120), expiresAt: new Date(Date.now() + seconds * 1000), lastError: "" });
  return { ok: true, name: info?.name ?? "" };
}

const api = (token: string, path: string, body: unknown) =>
  fetch(`${LINKEDIN_API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

type PostRecord = typeof schema.posts.$inferSelect;
export type PublishResult = { kind: "publie"; url: string } | { kind: "manuel"; reason: string };

/**
 * Publie un post « Programmé » sur LinkedIn, avec son image. Jamais deux fois : le post passe d'abord en « en cours »
 * (mise à jour conditionnelle), puis « Publié » avec son lien, ou revient en « Programmé » si LinkedIn refuse.
 */
export async function publishToLinkedin(p: PostRecord, nowMs = Date.now()): Promise<PublishResult> {
  const a = await getLinkedinAuth();
  const st = linkedinState(a, nowMs);
  if (st.kind === "absent") return { kind: "manuel", reason: "LinkedIn n'est pas connecté au CRM" };
  if (st.kind === "expire") return { kind: "manuel", reason: "l'autorisation LinkedIn a expiré : reconnecte LinkedIn" };
  const token = decryptToken(secret(), a!.tokenEnc);
  if (!token) return { kind: "manuel", reason: "autorisation LinkedIn illisible (AUTH_SECRET changé ?) : reconnecte LinkedIn" };
  const lock = await db.update(schema.posts).set({ status: "en_cours" }).where(and(eq(schema.posts.id, p.id), eq(schema.posts.status, "programme"))).returning({ id: schema.posts.id });
  if (!lock.length) return { kind: "manuel", reason: "post déjà en cours de publication ou plus au statut « Programmé »" };
  try {
    let asset: string | null = null;
    const v = parseVisual(p.visual);
    if (v) {
      const reg = await api(token, "/assets?action=registerUpload", registerUploadBody(a!.personUrn));
      const r = (await reg.json().catch(() => null)) as { value?: { asset?: string; uploadMechanism?: Record<string, { uploadUrl?: string }> } } | null;
      const uploadUrl = r?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
      if (!reg.ok || !r?.value?.asset || !uploadUrl || !/^https:\/\/[\w.-]*linkedin\.com\//.test(uploadUrl)) throw new Error(`déclaration de l'image refusée (HTTP ${reg.status})`);
      const png = await postImagePng(v);
      const up = await fetch(uploadUrl, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "image/png" }, body: new Uint8Array(png), signal: AbortSignal.timeout(30_000) });
      if (!up.ok) throw new Error(`envoi de l'image refusé (HTTP ${up.status})`);
      asset = r.value.asset;
    }
    const res = await api(token, "/ugcPosts", buildUgcPost(a!.personUrn, p.body, asset, v?.big ?? ""));
    if (res.status === 401) throw new Error("autorisation refusée par LinkedIn (expirée ou retirée) : reconnecte LinkedIn");
    if (!res.ok) throw new Error(`publication refusée (HTTP ${res.status})`);
    const url = postUrl(res.headers.get("x-restli-id") ?? "") || "https://www.linkedin.com/in/me/recent-activity/all/";
    await db.update(schema.posts).set({ status: "publie", externalUrl: url }).where(eq(schema.posts.id, p.id));
    await setAuth({ lastError: "" });
    return { kind: "publie", url };
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 200) : "erreur inconnue";
    await db.update(schema.posts).set({ status: "programme" }).where(eq(schema.posts.id, p.id));
    await setAuth({ lastError: `${new Date(nowMs).toISOString().slice(0, 10)} : ${reason}` });
    return { kind: "manuel", reason };
  }
}

export { appUrl };
