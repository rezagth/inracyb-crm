/**
 * Lecture des réponses sur un vrai Postgres (PGlite, en mémoire) : séquence arrêtée, tâche, brouillon, désinscription,
 * refus, messages ignorés, et traitement unique de chaque message.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { REPLIED_REASON } from "../src/lib/campaign";

const lite = new PGlite();
const db = drizzle(lite, { schema });
const M = Module as unknown as { _load: (...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return {};
  if (request === "next/cache") return { revalidatePath: () => undefined };
  if (request === "@/db") return { db, schema };
  if (request === "@/lib/auth") return { requireUser: async () => ({ id: "u1", email: "moi@test.fr", name: "Moi" }) };
  return orig.call(this, request, ...rest);
};

const T = new Date().toISOString().slice(0, 10);
let campaignId = "";
const ids: Record<string, string> = {};

async function company(key: string, email: string, opts: { send?: boolean; sequence?: boolean } = {}) {
  const c = (await db.insert(schema.companies).values({ name: `Société ${key}`, sector: "Numérique" }).returning({ id: schema.companies.id }))[0];
  ids[key] = c.id;
  await db.insert(schema.contacts).values({ companyId: c.id, firstName: key === "G" ? "standard" : "Marie", email, emailSource: "site", phone: "0123456789", isPrimary: true });
  if (opts.send !== false) await db.insert(schema.mailSends).values({ companyId: c.id, offer: "diagnostic", step: 0, subject: "x", sentOn: T });
  if (opts.sequence !== false) await db.insert(schema.mailCampaignItems).values({ campaignId, companyId: c.id, nextStep: 1, nextDue: T, hook: "dmarc-absent" });
}
const item = (key: string) => db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.companyId, ids[key])).then((r) => r[0]);
const tasksOf = (key: string) => db.select().from(schema.tasks).where(eq(schema.tasks.companyId, ids[key]));
const inbound = (id: string, from: string, snippet: string, extra = {}) => ({ id, from, subject: "Re: Un point sur les réglages mail", snippet, ...extra });

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.settings).values({ id: 1, ownerName: "Alex" } as never).onConflictDoNothing();
  campaignId = (await db.insert(schema.mailCampaigns).values({ name: "Test", offer: "diagnostic", segment: "editeurs" }).returning({ id: schema.mailCampaigns.id }))[0].id;
  await company("A", "marie@alpha.fr");
  await company("B", "marie@beta.fr");
  await company("C", "marie@gamma.fr");
  await company("D", "marie@delta.fr", { send: false });
  await company("E", "marie@epsilon.fr");
  await company("F", "marie@zeta.fr");
  await company("G", "contact@eta.fr");
});
after(async () => { await lite.close(); });

test("une réponse arrête la séquence, crée la tâche prioritaire et dépose un brouillon", async () => {
  const { processInbound } = await import("../src/server/replies");
  const r = await processInbound([inbound("g1", "Marie <marie@alpha.fr>", "Oui, envoyez-moi le détail.")], ["contact@infracyb.fr"]);
  assert.equal(r.replies, 1);
  const it = await item("A");
  assert.equal(it.status, "arrete");
  assert.equal(it.stopReason, REPLIED_REASON);
  const tasks = await tasksOf("A");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].priority, "haute");
  assert.match(tasks[0].title, /^Répondre à Société A/);
  const notes = await db.select().from(schema.events).where(and(eq(schema.events.companyId, ids.A), eq(schema.events.type, "note")));
  assert.equal(notes.length, 1);
  assert.match(notes[0].text, /Bonjour Marie,/);
});

test("le même message n'est traité qu'une fois", async () => {
  const { processInbound } = await import("../src/server/replies");
  const r = await processInbound([inbound("g1", "Marie <marie@alpha.fr>", "Oui, envoyez-moi le détail.")]);
  assert.equal(r.replies, 0);
  assert.equal((await tasksOf("A")).length, 1);
});

test("« Stop » désinscrit l'adresse et arrête la séquence, sans tâche", async () => {
  const { processInbound } = await import("../src/server/replies");
  const r = await processInbound([inbound("g2", "marie@beta.fr", "Stop")]);
  assert.equal(r.optouts, 1);
  assert.equal((await item("B")).status, "arrete");
  const opt = await db.select().from(schema.mailOptouts).where(eq(schema.mailOptouts.email, "marie@beta.fr"));
  assert.equal(opt.length, 1);
  assert.equal((await tasksOf("B")).length, 0);
});

test("un refus apparent arrête la séquence et crée une tâche de vérification à faible priorité, sans désinscrire", async () => {
  const { processInbound } = await import("../src/server/replies");
  const r = await processInbound([inbound("g3", "marie@gamma.fr", "Merci, pas intéressés.")]);
  assert.equal(r.refus, 1);
  assert.equal((await item("C")).status, "arrete");
  const t = await tasksOf("C");
  assert.equal(t.length, 1);
  assert.equal(t[0].priority, "basse");
  assert.equal((await db.select().from(schema.mailOptouts).where(eq(schema.mailOptouts.email, "marie@gamma.fr"))).length, 0);
});

test("ignorés : contact jamais écrit, message plus ancien que le premier envoi, réponse automatique, inconnu", async () => {
  const { processInbound } = await import("../src/server/replies");
  const r = await processInbound([
    inbound("g4", "marie@delta.fr", "Bonjour"),
    inbound("g5", "marie@epsilon.fr", "Bonjour", { receivedAt: Date.now() - 10 * 86_400_000 }),
    inbound("g6", "marie@zeta.fr", "Je suis absente", { autoSubmitted: "auto-replied" }),
    inbound("g7", "quelquun@inconnu.fr", "Bonjour"),
  ]);
  assert.equal(r.replies + r.refus + r.optouts, 0);
  assert.equal(r.ignored, 4);
  for (const k of ["D", "E", "F"]) assert.equal((await tasksOf(k)).length, 0, k);
  assert.equal((await item("E")).status, "en_cours");
  assert.equal((await item("F")).status, "en_cours");
});

test("adresse générique (« standard ») : brouillon sans prénom", async () => {
  const { processInbound } = await import("../src/server/replies");
  await processInbound([inbound("g8", "contact@eta.fr", "Bonjour, ça nous intéresse.")]);
  const notes = await db.select().from(schema.events).where(and(eq(schema.events.companyId, ids.G), eq(schema.events.type, "note")));
  assert.match(notes[0].text, /Bonjour,\n\nMerci pour votre retour/);
});

test("le bouton manuel et la lecture automatique partagent la même logique", async () => {
  const { registerReply } = await import("../src/server/replies");
  const r = await registerReply(ids.F, "reponse");
  assert.ok(r.ok);
  assert.equal((await item("F")).stopReason, REPLIED_REASON);
  assert.equal((await registerReply("inexistante", "reponse")).ok, false);
});
