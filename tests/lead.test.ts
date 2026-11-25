/**
 * Demandes entrantes du site public : signature, validation, fiche, diagnostic, appel en tête de file, mail de réponse.
 * Vrai Postgres en mémoire (PGlite) ; DNS et Brevo simulés, aucun appel réseau réel.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { Dns, Probe } from "../src/lib/diagnostic";
import { FREE_MAIL_DOMAINS, leadMail, parseLead, signLead, verifyLead } from "../src/lib/lead";
import { originBlock } from "../src/lib/campaign";
import { heatOf, rankQueue } from "../src/lib/call-queue";

process.env.APP_URL = "https://crm.test";
process.env.AUTH_SECRET = "un-secret-de-test-assez-long-1234567890";
process.env.BREVO_API_KEY = "cle-de-test";

const lite = new PGlite();
const db = drizzle(lite, { schema });
const M = Module as unknown as { _load: (...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return {};
  if (request === "next/cache") return { revalidatePath: () => undefined };
  if (request === "@/db") return { db, schema };
  return orig.call(this, request, ...rest);
};
const sent: { to: string; subject: string; text: string; tags: string[] }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  if (String(url).includes("brevo.com")) {
    const b = JSON.parse(String(init?.body));
    sent.push({ to: b.to[0].email, subject: b.subject, text: b.textContent, tags: b.tags ?? [] });
    return new Response(JSON.stringify({ messageId: "m" + sent.length }), { status: 201 });
  }
  throw new Error("appel réseau interdit dans ce test : " + String(url));
}) as typeof fetch;

const rec = (...values: string[]): Dns => ({ kind: "records", values });
const probe: Probe = {
  dns: async (name, type) => {
    if (type === "MX") return rec("10 mx." + name);
    if (type !== "TXT") return { kind: "absent" };
    if (name === "_dmarc.cabinet-durand.fr") return rec("v=DMARC1; p=none");
    if (name.startsWith("_dmarc.")) return rec("v=DMARC1; p=reject");
    return name.startsWith("_") || name.includes("._domainkey.") ? { kind: "absent" } : rec("v=spf1 mx -all");
  },
  tls: async () => ({ kind: "error", detail: "connexion HTTPS impossible" }),
  http: async () => ({ kind: "error", detail: "site introuvable" }),
};
const receive = async (input: unknown) => {
  const p = parseLead(input);
  if (!p.ok) throw new Error(p.error);
  return (await import("../src/server/lead")).receiveLead(p.lead, { probe });
};
const form = { kind: "test-messagerie", email: "Claire@Cabinet-Durand.fr", firstName: "Claire", company: "Cabinet Durand", phone: "01 40 00 00 12", consent: true };

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.settings).values({ id: 1, legalName: "Jean Test", tradeName: "InfraCyb", phone: "06 00 00 00 00", email: "jean@infracyb.fr", calUrl: "https://cal.com/infracyb" }).onConflictDoNothing();
});
after(async () => {
  globalThis.fetch = realFetch;
  await lite.close();
});

test("signature : acceptée telle quelle, refusée modifiée, trop ancienne ou avec un secret trop court", () => {
  const secret = "s".repeat(40);
  const now = Date.UTC(2026, 10, 25, 10);
  const ts = String(Math.floor(now / 1000));
  const body = JSON.stringify(form);
  const sig = signLead(secret, ts, body);
  assert.equal(verifyLead(secret, ts, body, sig, now), true);
  assert.equal(verifyLead(secret, ts, body + " ", sig, now), false);
  assert.equal(verifyLead(secret, ts, body, sig, now + 301_000), false);
  assert.equal(verifyLead("autre".repeat(10), ts, body, sig, now), false);
  assert.equal(verifyLead("court", ts, body, signLead("court", ts, body), now), false);
  assert.equal(verifyLead(secret, "abc", body, sig, now), false);
});

test("validation : accord obligatoire, adresse professionnelle seulement, téléphone facultatif mais valide", () => {
  assert.equal(parseLead({ ...form, consent: false }).ok, false);
  const gmail = parseLead({ ...form, email: "claire@gmail.com" });
  assert.ok(!gmail.ok && /adresse professionnelle/.test(gmail.error));
  assert.ok(FREE_MAIL_DOMAINS.has("orange.fr"));
  assert.equal(parseLead({ ...form, phone: "12" }).ok, false);
  assert.equal(parseLead({ ...form, phone: "" }).ok, true);
  assert.equal(parseLead({ ...form, kind: "autre" }).ok, false);
  assert.equal(parseLead({ ...form, firstName: " " }).ok, false);
  const ok = parseLead({ ...form, company: "Cabinet\nDurand <b>" });
  assert.ok(ok.ok && ok.lead.email === "claire@cabinet-durand.fr" && ok.lead.domain === "cabinet-durand.fr" && !ok.lead.company.includes("\n"));
});

test("mail de réponse : lien de synthèse obligatoire, réservation facultative, phrase de résultat", () => {
  const base = { prenom: "Claire", domaine: "a.fr", lienRapport: "https://crm.test/r/x", mainFinding: "", lienCal: "", signature: "Jean" };
  assert.equal(leadMail({ ...base, lienRapport: "" }), null);
  const m = leadMail(base)!;
  assert.equal(m.subject, "Votre test de messagerie pour a.fr");
  assert.match(m.text, /Aucun écart certain/);
  assert.doesNotMatch(m.text, /choisir le moment/);
  assert.match(leadMail({ ...base, lienCal: "https://cal.com/infracyb", mainFinding: "la politique DMARC est en observation." })!.text, /Le point principal : la politique DMARC est en observation\.\n\n.*Si vous préférez choisir le moment : https:\/\/cal\.com\/infracyb\n\nJean$/s);
});

test("origine « formulaire » : jamais de séquence de prospection ; demande entrante en tête de la file", () => {
  for (const s of ["audit", "diagnostic", "prescripteur"] as const) assert.match(originBlock("formulaire", s) ?? "", /Demande entrante/);
  const T = "2026-11-25";
  assert.equal(heatOf({ taskId: "a", dueDate: T, viewedOn: T, replied: true, createdAt: 0, inbound: true }, T), "entrant");
  const q = rankQueue([{ taskId: "vu", dueDate: T, viewedOn: T, replied: false, createdAt: 0 }, { taskId: "entrant", dueDate: T, viewedOn: "", replied: false, createdAt: 1, inbound: true }], T);
  assert.deepEqual(q.map((x) => x.taskId), ["entrant", "vu"]);
});

test("réception : fiche, contact « formulaire », diagnostic du domaine de l'adresse, appel du jour, mail avec la synthèse", async () => {
  const r = await receive(form);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.domain, "cabinet-durand.fr");
  assert.equal(r.mailed, true);
  assert.ok(r.findings[0].certain && /DMARC/i.test(r.findings[0].label + r.findings[0].wording));
  assert.ok(!JSON.stringify(r).includes("crm.test/r/"), "le lien de la synthèse ne part que par mail");
  const co = (await db.select().from(schema.companies).where(eq(schema.companies.name, "Cabinet Durand")))[0];
  assert.deepEqual([co.source, co.priority], ["Site web : test de messagerie", "haute"]);
  const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, co.id)))[0];
  assert.deepEqual([ct.email, ct.emailSource, ct.phone], ["claire@cabinet-durand.fr", "formulaire", "01 40 00 00 12"]);
  const d = (await db.select().from(schema.companyDiagnostics).where(eq(schema.companyDiagnostics.companyId, co.id)))[0];
  assert.deepEqual([d.status, d.mailDomain], ["fait", "cabinet-durand.fr"]);
  const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.companyId, co.id));
  assert.equal(tasks.length, 1);
  assert.deepEqual([tasks[0].kind, tasks[0].priority, tasks[0].title], ["appel", "haute", "Appeler Cabinet Durand au 01 40 00 00 12 : demande entrante (test de messagerie)"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "claire@cabinet-durand.fr");
  assert.equal(sent[0].subject, "Votre test de messagerie pour cabinet-durand.fr");
  assert.match(sent[0].text, /^Bonjour Claire,\n\nMerci d'avoir testé cabinet-durand\.fr sur infracyb\.fr\. Voici la synthèse d'une page, valable 60 jours : https:\/\/crm\.test\/r\/\S+\n\nLe point principal : la politique DMARC de cabinet-durand\.fr est en mode surveillance \(p=none\)/);
  assert.match(sent[0].text, /Si vous préférez choisir le moment : https:\/\/cal\.com\/infracyb/);
  assert.match(sent[0].text, /Se désinscrire en un clic : https:\/\/crm\.test\/api\/desabonnement\//);
  assert.deepEqual(sent[0].tags, ["crm", "entrant"]);
  // Aucune inscription en campagne.
  assert.equal((await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.companyId, co.id))).length, 0);

  // Même adresse une seconde fois : même fiche, pas de deuxième appel ouvert.
  const again = await receive({ ...form, kind: "autodiagnostic", summary: "Niveau : moyen. Priorités : sauvegardes, MFA." });
  assert.ok(again.ok);
  assert.equal((await db.select().from(schema.companies).where(eq(schema.companies.name, "Cabinet Durand"))).length, 1);
  const open = (await db.select().from(schema.tasks).where(eq(schema.tasks.companyId, co.id))).filter((x) => !x.done);
  assert.equal(open.length, 1);
  assert.match(open[0].title, /autodiagnostic/);
  const notes = await db.select().from(schema.events).where(eq(schema.events.companyId, co.id));
  assert.ok(notes.some((n) => /Priorités : sauvegardes, MFA/.test(n.text)));
});

test("adresse désinscrite : la fiche et l'appel sont créés, mais aucun mail ne part ; plafond du jour", async () => {
  await db.insert(schema.mailOptouts).values({ email: "paul@optout-sas.fr" });
  const before = sent.length;
  const r = await receive({ ...form, email: "paul@optout-sas.fr", firstName: "Paul", company: "Optout SAS" });
  assert.ok(r.ok && !r.mailed);
  assert.equal(sent.length, before);

  const { LEAD_DAILY_CAP, LEAD_EVENT } = await import("../src/lib/lead");
  const [co] = await db.insert(schema.companies).values({ name: "Remplissage" }).returning();
  await db.insert(schema.events).values(Array.from({ length: LEAD_DAILY_CAP }, () => ({ companyId: co.id, type: "note", text: `${LEAD_EVENT} (test)` })));
  const capped = await receive({ ...form, email: "x@plein-sas.fr", company: "Plein SAS" });
  assert.ok(!capped.ok && capped.status === 429);
});
