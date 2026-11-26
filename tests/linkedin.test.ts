import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { authorizeUrl, buildUgcPost, checkState, decryptToken, encryptToken, linkedinState, makeState, personUrnOf, postUrl } from "../src/lib/linkedin";
import { composePublishedMail, reconnectNotice, visualJson } from "../src/lib/post-visual";

const SECRET = "un-secret-de-test-assez-long-0123456789";
process.env.AUTH_SECRET = SECRET;

test("jeton chiffré : relu avec la bonne clé seulement, jamais en clair", () => {
  const enc = encryptToken(SECRET, "AQX-jeton-secret");
  assert.doesNotMatch(enc, /jeton-secret/);
  assert.equal(decryptToken(SECRET, enc), "AQX-jeton-secret");
  assert.equal(decryptToken("une-autre-cle-tout-aussi-longue-000", enc), null);
  assert.equal(decryptToken(SECRET, enc.slice(0, -2) + "AA"), null);
  assert.equal(decryptToken(SECRET, ""), null);
  assert.notEqual(encryptToken(SECRET, "x"), encryptToken(SECRET, "x")); // aléa différent à chaque fois
});

test("code de sécurité de la connexion : identique au cookie, signé, valable 10 minutes", () => {
  const now = 1_795_000_000_000;
  const s = makeState(SECRET, now);
  assert.equal(checkState(SECRET, s, s, now + 60_000), true);
  assert.equal(checkState(SECRET, s, s, now + 11 * 60_000), false);
  assert.equal(checkState(SECRET, s, makeState(SECRET, now), now), false);
  assert.equal(checkState(SECRET, s, null, now), false);
  const [n, at] = s.split(".");
  const forged = `${n}.${at}.AAAA`;
  assert.equal(checkState(SECRET, forged, forged, now), false);
  const url = new URL(authorizeUrl("cid", "https://crm.test/api/linkedin/callback", s));
  assert.equal(url.searchParams.get("scope"), "openid profile w_member_social");
  assert.equal(url.searchParams.get("redirect_uri"), "https://crm.test/api/linkedin/callback");
});

test("post LinkedIn : texte public, image si présente, lien et auteur valides seulement", () => {
  const p = buildUgcPost("urn:li:person:abc", "  Bonjour  ", "urn:li:digitalmediaAsset:X", "57 %");
  const c = p.specificContent["com.linkedin.ugc.ShareContent"];
  assert.equal(c.shareCommentary.text, "Bonjour");
  assert.equal(c.shareMediaCategory, "IMAGE");
  assert.equal(p.visibility["com.linkedin.ugc.MemberNetworkVisibility"], "PUBLIC");
  assert.equal(buildUgcPost("urn:li:person:abc", "x".repeat(4000), null).specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text.length, 3000);
  assert.equal(postUrl("urn:li:share:7123"), "https://www.linkedin.com/feed/update/urn:li:share:7123/");
  assert.equal(postUrl("javascript:alert(1)"), "");
  assert.equal(personUrnOf("AbC-12_x"), "urn:li:person:AbC-12_x");
  assert.equal(personUrnOf("../evil"), "");
});

test("état de la connexion et alertes de reconnexion", () => {
  const now = Date.UTC(2026, 11, 1);
  assert.deepEqual(linkedinState(undefined, now), { kind: "absent" });
  assert.deepEqual(linkedinState({ tokenEnc: "v1.x", expiresAt: new Date(now - 1) }, now), { kind: "expire" });
  assert.deepEqual(linkedinState({ tokenEnc: "v1.x", expiresAt: new Date(now + 30 * 86_400_000) }, now), { kind: "ok", daysLeft: 30, warn: false });
  const soon = linkedinState({ tokenEnc: "v1.x", expiresAt: new Date(now + 5 * 86_400_000) }, now);
  assert.match(reconnectNotice(soon, "https://crm.test"), /expire dans 5 jour\(s\).*https:\/\/crm\.test\/marketing/);
  assert.match(reconnectNotice({ kind: "expire" }, ""), /a expiré/);
  assert.equal(reconnectNotice({ kind: "ok", daysLeft: 30, warn: false }, ""), "");
  assert.match(composePublishedMail({ id: "p", date: "2026-12-01", network: "LinkedIn", topic: "Sujet", status: "publie", body: "x", visual: "" }, "https://www.linkedin.com/feed/update/urn:li:share:1/").text, /Le post : https:\/\/www\.linkedin\.com/);
});

/* ——— Publication réelle, contre une base en mémoire et un LinkedIn simulé ——— */

const lite = new PGlite();
const db = drizzle(lite, { schema });
const M = Module as unknown as { _load: (...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return {};
  if (request === "@/db") return { db, schema };
  if (typeof request === "string" && request.endsWith("post-image")) return { postImagePng: async () => Buffer.from("PNG") };
  return orig.call(this, request, ...rest);
};
const realFetch = globalThis.fetch;
let calls: string[] = [];
let failPost = false;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  calls.push(`${init?.method ?? "GET"} ${u.replace(/\?.*/, "")}`);
  if (u.includes("registerUpload")) return new Response(JSON.stringify({ value: { asset: "urn:li:digitalmediaAsset:IMG", uploadMechanism: { "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": { uploadUrl: "https://api.linkedin.com/mediaUpload/IMG" } } } }), { status: 200 });
  if (u.includes("mediaUpload")) return new Response(null, { status: 201 });
  if (u.endsWith("/ugcPosts")) return failPost ? new Response("{}", { status: 500 }) : new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:999" } });
  throw new Error("appel réseau inattendu : " + u);
}) as typeof fetch;

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});
after(async () => {
  globalThis.fetch = realFetch;
  await lite.close();
});

test("publication : image envoyée puis post, « Publié » avec le lien, jamais deux fois ; refus = retour à « Programmé »", async () => {
  const li = await import("../src/server/linkedin");
  const insert = async (status: string) => (await db.insert(schema.posts).values({ date: "2026-12-01", topic: "T", status, body: "Texte", visual: visualJson("DMARC", "57 %", "") }).returning())[0];
  const p = await insert("programme");
  assert.deepEqual(await li.publishToLinkedin(p), { kind: "manuel", reason: "LinkedIn n'est pas connecté au CRM" });
  await db.insert(schema.linkedinAuth).values({ id: 1, tokenEnc: encryptToken(SECRET, "tok"), personUrn: "urn:li:person:me", name: "Moi", expiresAt: new Date(Date.now() + 30 * 86_400_000) });

  calls = [];
  const r = await li.publishToLinkedin(p);
  assert.deepEqual(r, { kind: "publie", url: "https://www.linkedin.com/feed/update/urn:li:share:999/" });
  assert.deepEqual(calls, ["POST https://api.linkedin.com/v2/assets", "PUT https://api.linkedin.com/mediaUpload/IMG", "POST https://api.linkedin.com/v2/ugcPosts"]);
  const after1 = (await db.select().from(schema.posts).where(eq(schema.posts.id, p.id)))[0];
  assert.equal(after1.status, "publie");
  assert.equal(after1.externalUrl, r.kind === "publie" ? r.url : "");

  calls = [];
  const again = await li.publishToLinkedin(p); // même post : le statut n'est plus « Programmé »
  assert.equal(again.kind, "manuel");
  assert.deepEqual(calls, []);

  failPost = true;
  const q = await insert("programme");
  const refused = await li.publishToLinkedin(q);
  assert.equal(refused.kind, "manuel");
  assert.equal((await db.select().from(schema.posts).where(eq(schema.posts.id, q.id)))[0].status, "programme");
  assert.match((await li.getLinkedinAuth())!.lastError, /publication refusée \(HTTP 500\)/);
  failPost = false;

  const draft = await insert("redige");
  calls = [];
  assert.equal((await li.publishToLinkedin(draft)).kind, "manuel"); // seul « Programmé » part
  assert.deepEqual(calls, []);
});
