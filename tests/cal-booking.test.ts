import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { bookingDomain, cleanPhone, parisSlot, parseCalBooking, verifyCalSignature } from "../src/lib/cal-booking";

const SECRET = "secret-de-test-cal-0123456789";
const body = (trigger: string, o: Record<string, unknown> = {}) => ({
  triggerEvent: trigger,
  createdAt: "2026-12-01T09:00:00Z",
  payload: {
    uid: "uidA1",
    type: "diagnostic",
    eventTitle: "Diagnostic messagerie offert",
    startTime: "2026-12-10T09:30:00Z",
    endTime: "2026-12-10T09:45:00Z",
    attendees: [{ email: "Marie.Durand@Agence-Exemple.fr", name: "Marie Durand", timeZone: "Europe/Paris" }],
    responses: { entreprise: { label: "Entreprise", value: "Agence Exemple" }, site: { label: "Site", value: "https://www.agence-exemple.fr/" }, sujet: { label: "Sujet", value: "Faux RIB" }, notes: { label: "notes", value: "Un client a reçu un faux mail." } },
    metadata: { videoCallUrl: "https://app.cal.com/video/abc" },
    ...o,
  },
});

test("signature : HMAC-SHA256 hexadécimal du corps brut, rien d'autre", () => {
  const raw = JSON.stringify(body("BOOKING_CREATED"));
  const sig = createHmac("sha256", SECRET).update(raw).digest("hex");
  assert.equal(verifyCalSignature(SECRET, raw, sig), true);
  assert.equal(verifyCalSignature(SECRET, raw, sig.toUpperCase()), true);
  assert.equal(verifyCalSignature(SECRET, raw + " ", sig), false);
  assert.equal(verifyCalSignature(SECRET, raw, "no-secret-provided"), false);
  assert.equal(verifyCalSignature("court", raw, sig), false);
  assert.equal(verifyCalSignature(SECRET, raw, null), false);
});

test("lecture : heure de Paris (hiver et été), domaine du site déclaré, messagerie grand public écartée", () => {
  assert.deepEqual(parisSlot("2026-12-10T09:30:00Z"), { date: "2026-12-10", time: "10:30" });
  assert.deepEqual(parisSlot("2027-07-01T22:30:00Z"), { date: "2027-07-02", time: "00:30" });
  assert.equal(bookingDomain("marie@gmail.com", ""), "");
  assert.equal(bookingDomain("marie@gmail.com", "https://www.agence.fr/contact"), "agence.fr");
  assert.equal(bookingDomain("marie@cabinet.fr", ""), "cabinet.fr");
  // Domaines d'exemple : jamais utilisés pour reconnaître une entreprise (test du 26/11 rattaché à tort à une fiche).
  assert.equal(bookingDomain("jean@gmail.com", "exemple.fr"), "");
  assert.equal(bookingDomain("jean@exemple.fr", "https://www.monentreprise.fr"), "");
  assert.equal(bookingDomain("jean@gmail.com", "example.com"), "");
  const b = parseCalBooking(body("BOOKING_CREATED"))!;
  assert.deepEqual([b.trigger, b.email, b.company, b.domain, b.topic, b.date, b.start, b.end, b.location], ["BOOKING_CREATED", "marie.durand@agence-exemple.fr", "Agence Exemple", "agence-exemple.fr", "Faux RIB", "2026-12-10", "10:30", "10:45", "https://app.cal.com/video/abc"]);
  assert.equal(parseCalBooking({ triggerEvent: "MEETING_ENDED", payload: {} }), null);
  assert.equal(b.phone, "");
  assert.equal(parseCalBooking(body("BOOKING_CREATED", { responses: { attendeePhoneNumber: { value: "+33 6 12 34 56 78" } } }))!.phone, "+33 6 12 34 56 78");
  assert.equal(cleanPhone("12"), "");
  assert.equal(cleanPhone("06 12 34 56 78<script>"), "06 12 34 56 78");
  assert.equal(parseCalBooking(body("BOOKING_CREATED", { attendees: [{ email: "pas-une-adresse" }] })), null);
});

/* ——— Traitement complet contre une base en mémoire ——— */

const lite = new PGlite();
const db = drizzle(lite, { schema });
const M = Module as unknown as { _load: (...a: unknown[]) => unknown };
const orig = M._load;
let diagQueued: string[] = [];
M._load = function (request: unknown, ...rest: unknown[]) {
  const fromServer = String((rest[0] as { filename?: string } | undefined)?.filename ?? "").includes("/src/server/");
  if (request === "server-only") return {};
  if (request === "@/db") return { db, schema };
  if (fromServer && request === "./diagnostic") return { queueDiagnostics: async (ids: string[]) => { diagQueued.push(...ids); return ids.length; }, runDiagnostics: async () => ({}) };
  if (fromServer && request === "./weekly-report") return { recipient: async () => "" };
  if (fromServer && request === "./campaigns") return { appUrl: () => "" };
  return orig.call(this, request, ...rest);
};
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await lite.close(); });

test("création : fiche existante retrouvée par le domaine, RDV, relances arrêtées, appel fermé, étape, tâche, diagnostic ; jamais en double", async () => {
  const { handleCalBooking } = await import("../src/server/cal-booking");
  const co = (await db.insert(schema.companies).values({ name: "Agence Exemple SARL", stage: "contacte", sector: "Immobilier", notes: "Site web : https://agence-exemple.fr" }).returning())[0];
  await db.insert(schema.contacts).values({ companyId: co.id, firstName: "Standard", email: "contact@agence-exemple.fr", emailSource: "site", isPrimary: true });
  const camp = (await db.insert(schema.mailCampaigns).values({ name: "C", offer: "diagnostic" }).returning())[0];
  await db.insert(schema.mailCampaignItems).values({ campaignId: camp.id, companyId: co.id, nextStep: 2, nextDue: "2026-12-05" });
  await db.insert(schema.tasks).values({ title: "Appeler Agence Exemple", companyId: co.id, dueDate: "2026-12-01", kind: "appel" });

  const r = await handleCalBooking(parseCalBooking(body("BOOKING_CREATED"))!);
  assert.equal(r.ok, true);
  const m = await db.select().from(schema.meetings).where(eq(schema.meetings.companyId, co.id));
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].date, m[0].start, m[0].end, m[0].mode, m[0].location], ["2026-12-10", "10:30", "10:45", "Visio", "https://app.cal.com/video/abc"]);
  assert.match(m[0].note, /Réservation Cal uidA1/);
  assert.equal((await db.select().from(schema.mailCampaignItems))[0].stopReason, "A pris rendez-vous");
  const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.companyId, co.id));
  assert.equal(tasks.find((x) => x.kind === "appel")!.done, true);
  const prep = tasks.find((x) => x.title.startsWith("Préparer le rendez-vous"))!;
  assert.equal(prep.dueDate, "2026-12-09");
  assert.equal((await db.select().from(schema.companies).where(eq(schema.companies.id, co.id)))[0].stage, "rdv");
  assert.equal((await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, co.id))).length, 2); // Marie ajoutée
  assert.deepEqual(diagQueued, [co.id]);

  await handleCalBooking(parseCalBooking(body("BOOKING_CREATED"))!); // Cal renvoie la même réservation
  assert.equal((await db.select().from(schema.meetings)).length, 1);
});

test("report puis annulation ; inconnu créé avec une messagerie grand public", async () => {
  const { handleCalBooking } = await import("../src/server/cal-booking");
  await handleCalBooking(parseCalBooking(body("BOOKING_RESCHEDULED", { uid: "uidB2", rescheduleUid: "uidA1", startTime: "2026-12-11T14:00:00Z", endTime: "2026-12-11T14:15:00Z" }))!);
  let m = await db.select().from(schema.meetings);
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].date, m[0].start], ["2026-12-11", "15:00"]);
  assert.match(m[0].note, /Réservation Cal uidB2/);
  assert.equal((await db.select().from(schema.tasks)).find((x) => x.title.startsWith("Préparer le rendez-vous"))!.dueDate, "2026-12-10");

  await handleCalBooking(parseCalBooking(body("BOOKING_CANCELLED", { uid: "uidB2" }))!);
  m = await db.select().from(schema.meetings);
  assert.equal(m.length, 0);
  assert.ok((await db.select().from(schema.tasks)).some((x) => /^Relancer .*annulé/.test(x.title)));

  diagQueued = [];
  await handleCalBooking(parseCalBooking(body("BOOKING_CREATED", { uid: "uidC3", attendees: [{ email: "jean@gmail.com", name: "Jean Martin" }], responses: { entreprise: { value: "Cabinet Martin" } } }))!);
  const c = (await db.select().from(schema.companies).where(eq(schema.companies.name, "Cabinet Martin")))[0];
  assert.equal(c.source, "Réservation en ligne");
  assert.equal(c.stage, "rdv");
  assert.deepEqual(diagQueued, []); // pas de domaine d'entreprise : pas de diagnostic
});

test("fiche retrouvée par le site exact des notes, jamais par une sous-chaîne", async () => {
  const { handleCalBooking } = await import("../src/server/cal-booking");
  const decoy = (await db.insert(schema.companies).values({ name: "Leurre", notes: "Site web : https://mon-cabinet-dupont.fr" }).returning())[0];
  const real = (await db.insert(schema.companies).values({ name: "Cabinet Dupont", notes: "Site web : https://www.cabinet-dupont.fr/" }).returning())[0];
  await handleCalBooking(parseCalBooking(body("BOOKING_CREATED", { uid: "uidD4", attendees: [{ email: "paul@gmail.com", name: "Paul" }], responses: { entreprise: { value: "Dupont" }, site: { value: "cabinet-dupont.fr" } } }))!);
  const m = (await db.select().from(schema.meetings)).find((x) => x.note.includes("uidD4"))!;
  assert.equal(m.companyId, real.id);
  assert.notEqual(m.companyId, decoy.id);
});
