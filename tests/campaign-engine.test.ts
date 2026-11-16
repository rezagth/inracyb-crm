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
import type { Probe } from "../src/lib/diagnostic";

process.env.BREVO_API_KEY = "cle-de-test";
process.env.APP_URL = "https://crm.test";
process.env.AUTH_SECRET = "un-secret-de-test-assez-long-1234567890";
process.env.MAIL_FROM_EMAIL = "contact@infracyb.fr";
process.env.BREVO_WEBHOOK_SECRET = "secret-webhook-de-test-123456";
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

async function company(name: string, source = "historique", email = name.toLowerCase().replace(/[^a-z0-9]/g, "") + "@exemple.fr") {
  const id = (await db.insert(schema.companies).values({ name, sector: "Juridique" }).returning({ id: schema.companies.id }))[0].id;
  await db.insert(schema.contacts).values({ companyId: id, firstName: "Anne", lastName: "Martin", email, emailSource: source, isPrimary: true });
  return id;
}
const sendsOf = async (offer: string) => (await db.select().from(schema.mailSends).where(eq(schema.mailSends.offer, offer))).length;

let auditIds: string[] = [];
let diagIds: string[] = [];

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();
  for (let i = 1; i <= 12; i++) auditIds.push(await company("Cabinet Audit " + i));
  for (let i = 1; i <= 6; i++) diagIds.push(await company("Editeur Diag " + i, "site"));
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

  // Barrière de qualité : sans diagnostic, rien ne part, même avec un modèle.
  const noDiag = await runCampaigns({ mailFor: () => ({ subject: "S", body: "B" }) });
  assert.equal(noDiag.sent, 0);
  assert.match((await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.campaignId, camp.id))).map((i) => i.lastError).join("|"), /Pas de constat certain et récent/);
  // Diagnostic périmé pour la première, récent pour les autres.
  const { RULES_VERSION } = await import("../src/lib/diagnostic");
  await db.insert(schema.companyDiagnostics).values(diagIds.map((companyId, i) => ({ companyId, status: "fait", mailDomain: "exemple.fr", certainCount: 1, mainFinding: "spf", rulesVersion: RULES_VERSION, checkedOn: i === 0 ? "2026-01-01" : T })));

  const none = await runCampaigns();
  assert.equal(none.sent, 0);
  assert.ok(none.errors >= 4);
  assert.equal(outbox.length, 10);
  assert.equal(await sendsOf("diagnostic"), 0);
  assert.match((await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.campaignId, camp.id))).map((i) => i.lastError).join("|"), /Aucun modèle de mail/);

  const r = await runCampaigns({ mailFor: (offer, p) => (offer === "diagnostic" ? { subject: "Constat " + p.name, body: "Texte" } : null) });
  assert.equal(r.sent, 4);
  assert.equal(await sendsOf("diagnostic"), 4);
  assert.equal(await sendsOf("audit"), 10);
  const diag = outbox.slice(10);
  assert.equal(diag.length, 4);
  assert.ok(diag.every((o) => o.to[0].email !== "editeurdiag1@exemple.fr")); // diagnostic périmé : pas de mail
  await db.update(schema.companyDiagnostics).set({ checkedOn: T }).where(eq(schema.companyDiagnostics.companyId, diagIds[0]));
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

// ——— Phase B : origine des adresses, réponse reçue, désinscription en un clic, pause automatique ———

test("origine des adresses : inconnue = aucun envoi ; historique = audit seulement", async () => {
  const { runCampaigns } = await import("../src/server/campaigns");
  const { createCampaignAction } = await import("../src/server/actions/campaigns");
  const { sendSequenceMailAction } = await import("../src/server/actions/prospection");
  // À la création : une adresse sans origine est exclue.
  const unknown = await company("Cabinet Sans Origine", "");
  const r = await createCampaignAction("Sans origine", "audit", [unknown]);
  assert.equal(r.ok, false);
  // À l'envoi manuel aussi.
  const m = await sendSequenceMailAction(unknown, "audit", 0, "Objet", "Bonjour");
  assert.match((m as { error: string }).error, /Origine de l'adresse inconnue/);
  // Dans le moteur : une adresse historique placée dans une campagne diagnostic ne reçoit rien.
  const histo = await company("Editeur Historique", "historique");
  const camp = (await db.select().from(schema.mailCampaigns).where(eq(schema.mailCampaigns.offer, "diagnostic")))[0];
  // On repart d'un jour neuf pour le diagnostic : les envois du jour sont antidatés.
  await db.update(schema.mailSends).set({ sentOn: "2026-01-05" });
  await db.update(schema.mailCampaignItems).set({ nextDue: "2099-01-01" }).where(eq(schema.mailCampaignItems.status, "en_cours"));
  await db.insert(schema.mailCampaignItems).values({ campaignId: camp.id, companyId: histo, nextStep: 0, nextDue: T });
  const before = outbox.length;
  const run = await runCampaigns({ mailFor: () => ({ subject: "S", body: "B" }) });
  assert.equal(run.sent, 0);
  assert.equal(run.errors, 1);
  assert.equal(outbox.length, before);
  const item = (await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.companyId, histo)))[0];
  assert.match(item.lastError, /adresse historique/);
  await db.update(schema.mailCampaignItems).set({ status: "arrete", stopReason: "Test" }).where(eq(schema.mailCampaignItems.companyId, histo));
});

test("réponse reçue : la séquence s'arrête, une tâche prioritaire est créée une seule fois, plus aucune relance", async () => {
  const { stopItemAction, replyReceivedAction } = await import("../src/server/actions/campaigns");
  const { runCampaigns } = await import("../src/server/campaigns");
  const id = auditIds[2];
  const item = (await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.companyId, id)))[0];
  assert.equal(item.status, "en_cours");
  await db.update(schema.mailCampaignItems).set({ nextDue: T }).where(eq(schema.mailCampaignItems.id, item.id));
  const r = await stopItemAction(item.id, "reponse");
  assert.ok(r.ok);
  const after = (await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.id, item.id)))[0];
  assert.deepEqual([after.status, after.stopReason], ["arrete", "A répondu"]);
  const tasks = () => db.select().from(schema.tasks).where(eq(schema.tasks.companyId, id));
  assert.equal((await tasks()).length, 1);
  assert.deepEqual([(await tasks())[0].priority, (await tasks())[0].dueDate, (await tasks())[0].title], ["haute", T, "Répondre à Cabinet Audit 3 (réponse à une campagne)"]);
  // Depuis la fiche : même effet sur une autre entreprise ; refus quand il n'y a plus de séquence.
  const again = await replyReceivedAction(id);
  assert.equal(again.ok, false);
  assert.equal((await tasks()).length, 1);
  const other = await replyReceivedAction(auditIds[3]);
  assert.ok(other.ok);
  assert.equal((await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.companyId, auditIds[3])))[0].stopReason, "A répondu");
  const before = outbox.length;
  await runCampaigns();
  assert.equal(outbox.filter((o) => o.to[0].email === "cabinetaudit3@exemple.fr").length, 1); // seulement le J0 d'origine
  assert.equal(outbox.length, before);
});

test("désinscription en un clic : le lien de l'en-tête fonctionne en POST, l'affichage seul ne désinscrit pas", async () => {
  const route = await import("../src/app/api/desabonnement/[token]/route");
  const mail = outbox.find((o) => o.to[0].email === "cabinetaudit5@exemple.fr")!;
  const token = mail.headers!["List-Unsubscribe"].slice(1, -1).split("/").pop()!;
  const ctx = { params: Promise.resolve({ token }) };
  const optouts = async () => (await db.select().from(schema.mailOptouts)).map((o) => o.email);
  const get = await route.GET(new Request("https://crm.test/x") as never, ctx);
  assert.equal(get.status, 200);
  assert.deepEqual(await optouts(), []);
  const post = await route.POST(new Request("https://crm.test/x", { method: "POST", body: "List-Unsubscribe=One-Click" }) as never, ctx);
  assert.equal(post.status, 200);
  assert.deepEqual(await optouts(), ["cabinetaudit5@exemple.fr"]);
  const item = (await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.companyId, auditIds[4])))[0];
  assert.deepEqual([item.status, item.stopReason], ["arrete", "Désinscrit"]);
  const bad = await route.POST(new Request("https://crm.test/x", { method: "POST" }) as never, { params: Promise.resolve({ token: "faux.jeton" }) });
  assert.equal(bad.status, 400);
});

test("pause automatique : une plainte met le service en pause, sans toucher à l'autre ; reprise manuelle", async () => {
  const hook = await import("../src/app/api/webhooks/brevo/route");
  const { runCampaigns, checkServicePauses } = await import("../src/server/campaigns");
  const { resumeServiceAction } = await import("../src/server/actions/campaigns");
  const { sendSequenceMailAction } = await import("../src/server/actions/prospection");
  const post = (events: unknown) => hook.POST(Object.assign(new Request("https://crm.test/api/webhooks/brevo?key=secret-webhook-de-test-123456", { method: "POST", body: JSON.stringify(events) }), { nextUrl: new URL("https://crm.test/api/webhooks/brevo?key=secret-webhook-de-test-123456") }) as never);

  // Un rebond isolé sur le diagnostic : noté, rattaché au bon service par ses tags, pas de pause.
  assert.equal((await post([{ event: "hard_bounce", email: "editeurdiag1@exemple.fr", tags: ["crm", "campagne", "diagnostic", "J0"] }])).status, 200);
  let st = await checkServicePauses();
  assert.deepEqual([st.diagnostic.paused, st.diagnostic.health.bounces, st.audit.health.bounces], [false, 1, 0]);

  // Une plainte sur l'audit, sans tag : rattachée par le dernier envoi à cette adresse.
  assert.equal((await post({ event: "spam", email: "cabinetaudit6@exemple.fr" })).status, 200);
  st = await checkServicePauses();
  assert.equal(st.audit.paused, true);
  assert.match(st.audit.reason, /1 plainte\(s\) pour spam/);
  assert.equal(st.diagnostic.paused, false);
  const alert = (await db.select().from(schema.tasks)).filter((t) => t.title.startsWith("Service Audit en pause"));
  assert.equal(alert.length, 1);
  assert.equal(alert[0].priority, "haute");

  // L'audit n'envoie plus rien (campagne ni envoi manuel) ; le diagnostic continue.
  await db.update(schema.mailCampaignItems).set({ nextDue: T }).where(eq(schema.mailCampaignItems.status, "en_cours"));
  const before = outbox.length;
  const run = await runCampaigns({ mailFor: (offer) => (offer === "diagnostic" ? { subject: "S", body: "B" } : null) });
  assert.match(run.message, /Service Audit en pause/);
  const sentNow = outbox.slice(before);
  assert.ok(sentNow.length > 0);
  assert.ok(sentNow.every((o) => o.tags?.includes("diagnostic")));
  const manual = await sendSequenceMailAction(auditIds[7], "ciso", 0, "Objet", "Bonjour");
  assert.match((manual as { error: string }).error, /Envois en pause/);

  // Pas de seconde tâche d'alerte tant que la pause dure.
  await checkServicePauses();
  assert.equal((await db.select().from(schema.tasks)).filter((t) => t.title.startsWith("Service Audit en pause")).length, 1);

  // Reprise : le compteur repart de zéro, l'ancienne plainte ne remet pas le service en pause.
  assert.ok((await resumeServiceAction("audit")).ok);
  st = await checkServicePauses();
  assert.deepEqual([st.audit.paused, st.audit.health.complaints], [false, 0]);
  const resumed = await runCampaigns();
  assert.ok(resumed.sent > 0);

  // Webhook : clé fausse refusée.
  const bad = await hook.POST(Object.assign(new Request("https://crm.test/x", { method: "POST", body: "[]" }), { nextUrl: new URL("https://crm.test/x?key=mauvaise") }) as never);
  assert.equal(bad.status, 401);
});

// ——— Phase C : file d'attente des diagnostics ———

test("file de diagnostics : lots, budget de temps, reprise, entreprise sans domaine", async () => {
  const { queueDiagnostics, runDiagnostics, latestDiagnostics } = await import("../src/server/diagnostic");
  const { usableDiagnostic } = await import("../src/lib/diagnostic");
  await db.delete(schema.companyDiagnostics);
  const ids = [await company("Agence Web 1", "site"), await company("Agence Web 2", "site"), await company("Agence Web 3", "site"), await company("Agence Web 4", "site")];
  const webmail = await company("Artisan Webmail", "saisie", "artisan@gmail.com");
  assert.equal(await queueDiagnostics([...ids, webmail, "inconnue"]), 5);
  assert.equal(await queueDiagnostics(ids), 0); // déjà en attente

  let calls = 0;
  const probe: Probe = {
    dns: async (name, type) => { calls++; return type === "MX" ? { kind: "records", values: ["10 mx." + name] } : { kind: "absent" }; },
    tls: async () => ({ kind: "error", detail: "connexion HTTPS impossible" }),
    http: async () => ({ kind: "error", detail: "site introuvable (adresse inconnue)" }),
  };
  // Budget trop court pour un second lot : un seul lot de 2, le reste attend.
  const first = await runDiagnostics({ probe, budgetMs: 1, batch: 2 });
  assert.deepEqual([first.done, first.waiting], [2, 3]);
  assert.match(first.message, /3 en attente \(repris au prochain déclenchement\)/);
  // Passage suivant : tout le reste, dont l'entreprise sans domaine exploitable.
  const second = await runDiagnostics({ probe, budgetMs: 40_000, batch: 2 });
  assert.deepEqual([second.done, second.skipped, second.failed, second.waiting], [2, 1, 0, 0]);
  assert.ok(calls > 0);
  const latest = await latestDiagnostics();
  const d = latest.get(ids[0])!;
  assert.deepEqual([d.status, d.mailDomain, d.mainFinding, d.certainCount, d.checkedOn], ["fait", "agenceweb1@exemple.fr".split("@")[1], "spf", 2, T]);
  assert.equal(usableDiagnostic(d, T), true);
  assert.equal(latest.has(webmail), false);
  assert.equal((await db.select().from(schema.companyDiagnostics).where(eq(schema.companyDiagnostics.companyId, webmail)))[0].status, "sans_domaine");
  // Une sonde qui plante ne bloque pas la file.
  await queueDiagnostics([ids[1]]);
  const crash = await runDiagnostics({ probe: { ...probe, dns: async () => { throw new Error("boom"); } }, budgetMs: 1 });
  assert.deepEqual([crash.done, crash.waiting], [1, 0]);
  assert.equal((await latestDiagnostics()).get(ids[1])!.certainCount, 0);
});
