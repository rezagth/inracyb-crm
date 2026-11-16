/**
 * Moteur de campagnes sur un vrai Postgres (PGlite, en mémoire), Brevo remplacé par une doublure réseau :
 * non-régression de la campagne d'audit, plafond par service, palier du diagnostic, exclusion croisée, envoi manuel.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { scripts } from "../src/lib/prospection";

process.env.BREVO_API_KEY = "cle-de-test";
process.env.APP_URL = "https://crm.test";
process.env.AUTH_SECRET = "un-secret-de-test-assez-long-1234567890";
process.env.MAIL_FROM_EMAIL = "contact@infracyb.fr";
delete process.env.MAIL_DAILY_LIMIT;
delete process.env.MAIL_DAILY_LIMIT_DIAGNOSTIC;
delete process.env.CAMPAIGN_REST_DAYS;

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

type Sent = { to: { email: string }[]; subject: string; textContent: string; headers?: Record<string, string>; tags?: string[] };
const outbox: Sent[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
  outbox.push(JSON.parse(init?.body ?? "{}") as Sent);
  return new Response(JSON.stringify({ messageId: "<m" + outbox.length + "@test>" }), { status: 201, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const T = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function company(name: string, email = name.toLowerCase().replace(/[^a-z0-9]/g, "") + "@exemple.fr") {
  const id = (await db.insert(schema.companies).values({ name, sector: "Juridique" }).returning({ id: schema.companies.id }))[0].id;
  await db.insert(schema.contacts).values({ companyId: id, firstName: "Anne", lastName: "Martin", email, isPrimary: true });
  return id;
}
const sendsOf = async (offer: string) => (await db.select().from(schema.mailSends).where(eq(schema.mailSends.offer, offer))).length;

let auditIds: string[] = [];
let diagIds: string[] = [];

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();
  for (let i = 1; i <= 12; i++) auditIds.push(await company("Cabinet Audit " + i));
  for (let i = 1; i <= 6; i++) diagIds.push(await company("Editeur Diag " + i));
});
after(async () => {
  globalThis.fetch = realFetch;
  await lite.close();
});

test("audit, non-régression : 10 mails le premier jour, mêmes textes, en-têtes de désinscription, 2 en attente", async () => {
  const { createCampaignAction } = await import("../src/server/actions/campaigns");
  const { getProfile } = await import("../src/server/queries");
  const r = await createCampaignAction("Avocats", "audit", auditIds);
  assert.ok(r.ok, JSON.stringify(r));
  assert.match((r as { message: string }).message, /Campagne créée \(12 entreprise\(s\)\)\. 10 mail\(s\) envoyé\(s\) · 2 en attente/);
  assert.equal(outbox.length, 10);
  assert.equal(await sendsOf("audit"), 10);

  const expected = scripts({ name: "Cabinet Audit 1", sector: "Juridique", contact: "Anne Martin", role: "", email: "cabinetaudit1@exemple.fr", phone: "" }, "audit", await getProfile()).mails[0];
  const m = outbox.find((o) => o.to[0].email === "cabinetaudit1@exemple.fr")!;
  assert.equal(m.subject, expected.subject);
  const link = m.headers?.["List-Unsubscribe"]?.slice(1, -1) ?? "";
  assert.match(link, /^https:\/\/crm\.test\/api\/desabonnement\/[\w-]+\.[\w-]+$/);
  assert.equal(m.textContent, expected.body + "\n\nSe désinscrire en un clic : " + link);
  for (const o of outbox) {
    assert.equal(o.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.match(o.headers?.["List-Unsubscribe"] ?? "", /^<https:\/\/crm\.test\/api\/desabonnement\//);
    assert.deepEqual(o.tags, ["crm", "campagne", "audit", "J0"]);
  }
  const items = await db.select().from(schema.mailCampaignItems);
  assert.equal(items.filter((i) => i.nextStep === 1).length, 10);
  assert.equal(items.filter((i) => i.nextStep === 0 && i.nextDue === T).length, 2);
  const c1 = (await db.select().from(schema.companies).where(eq(schema.companies.id, auditIds[0])))[0];
  assert.equal(c1.stage, "contacte");
  assert.equal(c1.lastContact, T);
});

test("audit, non-régression : plafond atteint, même message qu'avant, rien ne part", async () => {
  const { runCampaigns } = await import("../src/server/campaigns");
  const r = await runCampaigns();
  assert.deepEqual(r, { ok: true, sent: 0, stopped: 0, errors: 0, waiting: 2, message: "Plafond du jour atteint (10 mails). 2 mail(s) en attente : ils partiront demain, ou monte MAIL_DAILY_LIMIT." });
  assert.equal(outbox.length, 10);
});

test("envoi à la main : compté dans le service audit, refusé une fois le plafond audit atteint", async () => {
  const { sendSequenceMailAction } = await import("../src/server/actions/prospection");
  const id = await company("Cabinet Manuel");
  const r = await sendSequenceMailAction(id, "audit", 0, "Objet", "Bonjour");
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /Limite du jour atteinte \(10 mails\)/);
  assert.equal(outbox.length, 10);
});

test("une seule séquence par entreprise : refus à la création et en base, tous services confondus", async () => {
  const { createCampaignAction } = await import("../src/server/actions/campaigns");
  const again = await createCampaignAction("Doublon", "ciso", [auditIds[0], auditIds[11]]);
  assert.equal(again.ok, false);
  assert.match((again as { error: string }).error, /Aucune des entreprises choisies n'est éligible/);
  const camp = (await db.insert(schema.mailCampaigns).values({ name: "Diag direct", offer: "diagnostic" }).returning({ id: schema.mailCampaigns.id }))[0];
  await assert.rejects(db.insert(schema.mailCampaignItems).values({ campaignId: camp.id, companyId: auditIds[0], nextStep: 0, nextDue: T }));
  await db.delete(schema.mailCampaigns).where(eq(schema.mailCampaigns.id, camp.id));
});

test("diagnostic : la création de campagne est fermée tant que le service n'est pas ouvert", async () => {
  const { createCampaignAction } = await import("../src/server/actions/campaigns");
  const r = await createCampaignAction("Diag", "diagnostic", diagIds);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /Diagnostic n'est pas encore ouvert/);
  assert.equal((await db.select().from(schema.mailCampaigns)).filter((c) => c.offer === "diagnostic").length, 0);
});

test("diagnostic : sans modèle rien ne part ; avec modèle, 4 mails (premier palier) même si l'audit est à son plafond", async () => {
  const { runCampaigns, getDailyState } = await import("../src/server/campaigns");
  const camp = (await db.insert(schema.mailCampaigns).values({ name: "Editeurs", offer: "diagnostic" }).returning({ id: schema.mailCampaigns.id }))[0];
  await db.insert(schema.mailCampaignItems).values(diagIds.map((companyId) => ({ campaignId: camp.id, companyId, nextStep: 0, nextDue: T })));

  const none = await runCampaigns();
  assert.equal(none.sent, 0);
  assert.equal(none.errors, 4);
  assert.equal(outbox.length, 10);
  assert.equal(await sendsOf("diagnostic"), 0);
  assert.match((await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.campaignId, camp.id))).map((i) => i.lastError).join("|"), /Aucun modèle de mail/);

  const r = await runCampaigns({ mailFor: (offer, p) => (offer === "diagnostic" ? { subject: "Constat " + p.name, body: "Texte" } : null) });
  assert.equal(r.sent, 4);
  assert.equal(await sendsOf("diagnostic"), 4);
  assert.equal(await sendsOf("audit"), 10);
  const diag = outbox.slice(10);
  assert.equal(diag.length, 4);
  for (const o of diag) {
    assert.equal(o.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.match(o.headers?.["List-Unsubscribe"] ?? "", /^<https:\/\/crm\.test\/api\/desabonnement\//);
    assert.deepEqual(o.tags, ["crm", "campagne", "diagnostic", "J0"]);
    assert.match(o.textContent, /Se désinscrire en un clic : https:\/\/crm\.test\//);
  }

  const s = await getDailyState();
  assert.deepEqual([s.audit.sent, s.audit.limit, s.diagnostic.sent, s.diagnostic.limit, s.total.sent, s.total.limit], [10, 10, 4, 4, 14, 20]);
  assert.equal(s.diagnostic.firstSendOn, T);

  const full = await runCampaigns({ mailFor: () => ({ subject: "S", body: "B" }) });
  assert.equal(full.sent, 0);
  assert.equal(full.waiting, 4);
  assert.match(full.message, /^Plafond du jour atteint \(Audit 10\/10, Diagnostic 4\/4\)\. 4 mail\(s\) en attente : ils partiront demain\.$/);
  assert.equal(outbox.length, 14);
});

test("délai de repos : une entreprise contactée en audit aujourd'hui n'entre pas dans le diagnostic ; une réponse ferme la porte", async () => {
  const { crossHistories, restDays } = await import("../src/server/campaigns");
  const { entryExclusion } = await import("../src/lib/campaign");
  assert.equal(restDays(), 30);
  // On termine la séquence d'audit de la première entreprise (plus aucune séquence en cours).
  await db.update(schema.mailCampaignItems).set({ status: "termine", stopReason: "Séquence terminée" }).where(eq(schema.mailCampaignItems.companyId, auditIds[0]));
  await db.update(schema.mailCampaignItems).set({ status: "arrete", stopReason: "A répondu" }).where(eq(schema.mailCampaignItems.companyId, auditIds[1]));
  const h = await crossHistories("diagnostic");
  const cand = (id: string) => ({ id, name: "x", stage: "contacte", email: "x@exemple.fr" });
  const none = new Set<string>();
  assert.equal(entryExclusion(cand(auditIds[0]), none, none, "diagnostic", h.get(auditIds[0]), T, restDays()), "repos");
  assert.equal(entryExclusion(cand(auditIds[1]), none, none, "diagnostic", h.get(auditIds[1]), T, restDays()), "a-repondu");
  // 30 jours plus tard, la première redevient éligible ; celle qui a répondu, jamais.
  const later = new Date(Date.parse(T + "T12:00:00Z") + 30 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(entryExclusion(cand(auditIds[0]), none, none, "diagnostic", h.get(auditIds[0]), later, restDays()), null);
  assert.equal(entryExclusion(cand(auditIds[1]), none, none, "diagnostic", h.get(auditIds[1]), later, restDays()), "a-repondu");
  // Vu depuis l'audit, ces entreprises n'ont aucun historique dans l'autre service : rien ne change pour elles.
  const ha = await crossHistories("audit");
  assert.equal(entryExclusion(cand(auditIds[0]), none, none, "audit", ha.get(auditIds[0]), T, restDays()), null);
});
