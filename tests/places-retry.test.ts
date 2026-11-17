/** Google Places : un seul nouvel essai sur erreur passagère, aucun sur une clé refusée. Réseau simulé. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";

const M = Module as unknown as { _load: (...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return {};
  if (request === "@/db") return { db: {}, schema: {} };
  return orig.call(this, request, ...rest);
};
const realFetch = globalThis.fetch;
const key = process.env.GOOGLE_PLACES_API_KEY;
process.env.GOOGLE_PLACES_API_KEY = "cle-de-test";
let replies: (number | "reseau")[] = [];
let calls = 0;
globalThis.fetch = (async () => {
  calls++;
  const r = replies.shift() ?? 200;
  if (r === "reseau") throw new Error("réseau coupé");
  const body = r === 200 ? { places: [{ formattedAddress: "1 rue X, 75001 Paris", nationalPhoneNumber: "01 40 00 00 01", websiteUri: "https://alpha.fr" }] } : { error: { code: r, message: "The service is currently unavailable." } };
  return new Response(JSON.stringify(body), { status: r, headers: { "content-type": "application/json" } });
}) as typeof fetch;
after(() => {
  globalThis.fetch = realFetch;
  if (key === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = key;
});
const find = async () => (await import("../src/server/prospect-search")).findPlace("Alpha", "Paris", "75001", 1);

test("503 puis réponse : le nouvel essai aboutit", async () => {
  replies = [503, 200]; calls = 0;
  assert.deepEqual(await find(), { ok: true, phone: "01 40 00 00 01", website: "https://alpha.fr" });
  assert.equal(calls, 2);
});

test("503 deux fois : un seul nouvel essai, puis le message de Google", async () => {
  replies = [503, 503, 200]; calls = 0;
  const r = await find();
  assert.equal(calls, 2);
  assert.deepEqual(r, { ok: false, error: "Google Places est indisponible pour le moment (503), même après un nouvel essai (The service is currently unavailable.)." });
});

test("réseau coupé puis réponse : le nouvel essai aboutit ; clé refusée : aucun nouvel essai", async () => {
  replies = ["reseau", 200]; calls = 0;
  assert.equal((await find()).ok, true);
  assert.equal(calls, 2);
  replies = [403, 200]; calls = 0;
  const r = await find();
  assert.equal(calls, 1);
  assert.equal(r.ok, false);
});
