/**
 * Alimentation automatique sur un vrai Postgres (PGlite, en mémoire). Annuaire, Google Places, sites web et DNS sont simulés :
 * aucun appel réseau (toute tentative fait échouer le test).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { isGenericEmail, pickPublishedEmail } from "../src/lib/contact-extract";
import type { Dns, Probe } from "../src/lib/diagnostic";
import { enrolSlots, isPhone, missingCoordinates, nextCursor, parseDepartements, permanentName, readCursors, REJECT, searchPlan } from "../src/lib/feed";
import type { SearchInput } from "../src/lib/prospect-search";
import type { FeedDeps } from "../src/server/feed";
import type { Found } from "../src/server/prospect-search";

delete process.env.MAIL_DAILY_LIMIT;
delete process.env.MAIL_DAILY_LIMIT_DIAGNOSTIC;
delete process.env.GOOGLE_PLACES_API_KEY;

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
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => { throw new Error("appel réseau interdit dans ce test"); }) as typeof fetch;

const T = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// ——— Monde simulé ———
let n = 0;
const found = (name: string, sector: Found["sector"], o: Partial<Found> = {}): Found => ({ siren: String(100000000 + ++n), name, sector, naf: "62.01Z", address: "1 rue de Test 75001", postalCode: "75001", city: "Paris", effectif: "10 à 19 salariés", effectifCode: "11", director: { firstName: "Claire", lastName: "Durand", role: "Présidente" }, blocked: false, inCrm: false, ...o });
const world = {
  pages: {} as Record<string, Found[]>, // « secteur|département|page »
  searches: [] as SearchInput[],
  searchError: "",
  places: {} as Record<string, { website: string; phone: string }>,
  placeCalls: 0,
  placeError: "",
  sites: {} as Record<string, { emails: string[]; phones: string[]; pages: number; error?: string; siren?: string }>,
  crawls: [] as string[], // sites lus, dans l'ordre
  noDmarc: new Set<string>(),
};
const rec = (...values: string[]): Dns => ({ kind: "records", values });
const probe: Probe = {
  dns: async (name, type) => {
    if (type === "MX") return rec("10 mx." + name);
    if (type !== "TXT") return { kind: "absent" };
    if (name.startsWith("_dmarc.")) return world.noDmarc.has(name.slice(7)) ? { kind: "absent" } : rec("v=DMARC1; p=reject");
    return name.startsWith("_") || name.includes("._domainkey.") ? { kind: "absent" } : rec("v=spf1 mx -all");
  },
  tls: async () => ({ kind: "error", detail: "connexion HTTPS impossible" }),
  http: async () => ({ kind: "error", detail: "site introuvable (adresse inconnue)" }),
};
const deps: FeedDeps = {
  search: async (input) => {
    world.searches.push(input);
    if (world.searchError) return { ok: false, error: world.searchError };
    const items = world.pages[`${input.sector}|${input.departement}|${input.page}`] ?? [];
    return { ok: true, page: { total: items.length, totalPages: 1, page: input.page, items } };
  },
  place: async (name) => {
    world.placeCalls++;
    if (world.placeError) return { ok: false, error: world.placeError };
    return { ok: true, website: world.places[name]?.website ?? "", phone: world.places[name]?.phone ?? "" };
  },
  crawl: async (site, _budget, siren) => {
    const host = new URL(site).hostname;
    world.crawls.push(host);
    const w = world.sites[host];
    if (!w) return { emails: [], phones: [], pages: 0, error: "site introuvable (adresse inconnue)", ...(siren ? { sirenFound: false } : {}) };
    return { ...w, ...(siren ? { sirenFound: w.siren === siren } : {}) };
  },
  probe,
};
const run = async (over: Partial<FeedDeps> = {}) => (await import("../src/server/feed")).runFeed({ deps: { ...deps, ...over } });
// Par défaut, le site publie un numéro : seuls les cas « sans téléphone » le retirent explicitement.
const site = (name: string, host: string, emails: string[], phones: string[] = ["01 40 00 00 99"]) => {
  world.places[name] = { website: `https://${host}`, phone: "" };
  world.sites[host] = { emails, phones, pages: 2 };
};
const feedOf = async (name: string) => {
  const c = (await db.select().from(schema.companies).where(eq(schema.companies.name, name)))[0];
  if (!c) return undefined;
  const f = (await db.select().from(schema.feedItems).where(eq(schema.feedItems.companyId, c.id)))[0];
  const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, c.id)))[0];
  const item = (await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.companyId, c.id)))[0];
  return { c, f, ct, item };
};
const settings = async (patch: Partial<typeof schema.feedSettings.$inferInsert>) => {
  await (await import("../src/server/feed")).getFeedSettings();
  await db.update(schema.feedSettings).set(patch).where(eq(schema.feedSettings.id, 1));
};
const clearSearch = () => { world.pages = {}; world.searches = []; };
const skippedOf = async (name: string) => (await db.select().from(schema.feedSkipped).where(eq(schema.feedSkipped.name, name)))[0];
const inCrm = async (name: string) => (await db.select().from(schema.companies).where(eq(schema.companies.name, name))).length > 0;

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.settings).values({ id: 1, legalName: "Jean Test", phone: "01 02 03 04 05", email: "jean@infracyb.fr" }).onConflictDoNothing();
});
after(async () => {
  globalThis.fetch = realFetch;
  await lite.close();
});

// ——— Règles pures ———

test("adresse retenue : seulement parmi celles publiées, générique d'abord, sur le domaine du site d'abord, jamais devinée", () => {
  assert.equal(pickPublishedEmail(["claire.durand@alpha.fr", "contact@alpha.fr"], "www.alpha.fr"), "contact@alpha.fr");
  assert.equal(pickPublishedEmail(["contact@agence-web.com", "claire.durand@alpha.fr", "accueil@alpha.fr"], "alpha.fr"), "accueil@alpha.fr");
  assert.equal(pickPublishedEmail(["claire.durand@alpha.fr"], "alpha.fr"), "claire.durand@alpha.fr"); // publiée, donc admise, faute de générique
  assert.equal(pickPublishedEmail([], "alpha.fr"), ""); // rien de publié : rien, aucune adresse reconstituée
  assert.deepEqual(["contact@a.fr", "Accueil@a.fr", "claire.durand@a.fr", "c.durand@a.fr"].map(isGenericEmail), [true, true, false, false]);
});

test("entrée dans le CRM : adresse publiée ET téléphone obligatoires", () => {
  assert.equal(missingCoordinates("contact@a.fr", "01 40 00 00 01"), "");
  assert.equal(missingCoordinates("contact@a.fr", "+33 1 40 00 00 01"), "");
  assert.equal(missingCoordinates("", "01 40 00 00 01"), REJECT.noEmail);
  assert.equal(missingCoordinates("contact@a.fr", ""), REJECT.noPhone);
  assert.equal(missingCoordinates("contact@a.fr", "01 40"), REJECT.noPhone); // numéro tronqué : pas un téléphone
  assert.equal(missingCoordinates(" ", " "), REJECT.noEmailNoPhone);
  assert.deepEqual(["0140000001", "01.40.00.00.01", "+33140000001", "1234", "", "abc"].map(isPhone), [true, true, true, false, false, false]);
});

test("départements, plan de recherche et reprise", () => {
  assert.deepEqual(parseDepartements("75, 92;69  2a 75 abc 1234"), ["75", "92", "69", "2A"]);
  assert.deepEqual(parseDepartements(""), []);
  assert.deepEqual(searchPlan("editeurs", []), [{ sector: "Numérique", departement: "" }]);
  assert.deepEqual(searchPlan("cabinets", ["75", "69"]).map((p) => p.sector + " " + p.departement), ["Expertise comptable 75", "Expertise comptable 69", "Juridique 75", "Juridique 69", "Notariat 75", "Notariat 69", "Courtage 75", "Courtage 69"]);
  assert.deepEqual(nextCursor({ combo: 0, page: 1 }, 3, 2), { combo: 0, page: 2, wrapped: false });
  assert.deepEqual(nextCursor({ combo: 0, page: 3 }, 3, 2), { combo: 1, page: 1, wrapped: false });
  assert.deepEqual(nextCursor({ combo: 1, page: 3 }, 3, 2), { combo: 0, page: 1, wrapped: true });
  assert.deepEqual(readCursors('{"editeurs":{"combo":1,"page":4},"cabinets":{"combo":-1,"page":0},"autre":{"combo":0,"page":1}}'), { editeurs: { combo: 1, page: 4 } });
  assert.deepEqual(readCursors("pas du json"), {});
});

test("capacité d'inscription : jamais plus que ce que le plafond des prochains jours peut envoyer", () => {
  assert.equal(enrolSlots(10, 0, 0), 10); // rien en cours : un jour de premiers mails
  assert.equal(enrolSlots(10, 80, 0), 5); // 100 mails possibles sur la durée d'une séquence, 80 déjà dus
  assert.equal(enrolSlots(10, 100, 0), 0);
  assert.equal(enrolSlots(10, 130, 0), 0);
  assert.equal(enrolSlots(10, 20, 7), 3); // 7 premiers mails attendent déjà : pas plus de 10 en attente
  assert.equal(enrolSlots(4, 0, 0), 4); // premier palier du diagnostic
  assert.equal(enrolSlots(4, 16, 4), 0);
  assert.equal(enrolSlots(0, 0, 0), 0);
});

// ——— Traitement complet ———

test("interrupteur sur arrêt (état initial) : rien n'est cherché, importé ni inscrit", async () => {
  world.pages["Numérique||1"] = [found("Alpha Logiciels", "Numérique")];
  const r = await run();
  assert.deepEqual([r.ran, r.imported, r.message], [false, 0, "Alimentation arrêtée (interrupteur général)."]);
  assert.equal(world.searches.length, 0);
  assert.equal((await db.select().from(schema.companies)).length, 0);
  assert.equal((await db.select().from(schema.feedRuns)).length, 0);
  n = 0;
});

test("un passage : seules les entreprises avec adresse publiée ET téléphone entrent dans le CRM, puis diagnostic et inscription", async () => {
  const { setFeedEnabledAction } = await import("../src/server/actions/feed");
  assert.ok((await setFeedEnabledAction(true)).ok);
  await db.insert(schema.companies).values([{ name: "Déjà Cliente SAS", siren: "999999999" }, { name: "Homonyme Conseil" }]);
  const alpha = found("Alpha Logiciels", "Numérique");
  world.pages["Numérique||1"] = [
    alpha,
    { ...alpha }, // la même entreprise deux fois dans la page
    found("Beta Conseil", "Numérique", { blocked: true }), // opposée à la prospection
    found("Déjà Cliente SAS", "Numérique", { siren: "999999999" }), // même SIREN qu'une fiche du CRM
    found("Homonyme Conseil", "Numérique"), // même nom qu'une fiche saisie sans SIREN
    found("Delta ESN", "Numérique"), // aucun site trouvé
    found("Epsilon Soft", "Numérique"), // site sans adresse publiée, téléphone trouvé
    found("Sans Tel", "Numérique"), // adresse publiée, aucun téléphone nulle part
    found("Phi Dev", "Numérique"), // site illisible
    found("Gamma Apps", "Numérique"), // complète, mais tout est en ordre côté courrier : aucun constat
    found("Hors Segment SARL", "Immobilier"), // secteur qui n'appartient pas au segment
  ];
  world.pages["Expertise comptable||1"] = [found("Iota Compta", "Expertise comptable", { director: null }), found("Omicron Compta", "Expertise comptable", { director: null })];
  site("Alpha Logiciels", "www.alpha.fr", ["claire.durand@alpha.fr", "contact@alpha.fr"], ["01 40 00 00 01"]);
  world.places["Delta ESN"] = { website: "", phone: "01 40 00 00 05" };
  site("Epsilon Soft", "epsilon.fr", [], ["01 40 00 00 02"]);
  site("Sans Tel", "sanstel.fr", ["contact@sanstel.fr"], []);
  world.places["Phi Dev"] = { website: "https://phi.fr", phone: "01 40 00 00 06" };
  site("Gamma Apps", "gamma.fr", ["contact@gamma.fr"]);
  site("Iota Compta", "iota.fr", ["cabinet@iota.fr"], []);
  world.places["Iota Compta"].phone = "05 55 00 00 01"; // téléphone de Google, le site n'en publie pas
  site("Omicron Compta", "omicron.fr", ["jean.martin@omicron.fr"]);
  world.noDmarc = new Set(["alpha.fr", "iota.fr", "omicron.fr"]);
  world.placeCalls = 0;

  const r = await run();
  assert.deepEqual([r.ok, r.ran, r.found, r.imported, r.completed, r.diagnosed, r.enrolled, r.rejected], [true, true, 13, 4, 4, 4, 2, 6], r.message);
  assert.match(r.message, /3 déjà dans le CRM · 1 opposée\(s\) à la prospection/);
  assert.equal((await db.select().from(schema.companies)).length, 6); // 2 existantes + 4 complètes
  assert.equal(world.placeCalls, 8); // une requête par candidat nouveau, aucune pour les doublons
  // Recherche : codes du segment, tailles ciblées, France entière.
  assert.deepEqual(world.searches.map((x) => x.sector), ["Numérique", "Expertise comptable", "Juridique", "Notariat", "Courtage"]);
  assert.deepEqual(world.searches[0].effectifs, ["02", "03", "11", "12"]);

  // Incomplètes : jamais dans le CRM, notées hors CRM avec le motif.
  for (const [name, reason] of [["Delta ESN", REJECT.noSite], ["Epsilon Soft", REJECT.noEmail], ["Sans Tel", REJECT.noPhone], ["Phi Dev", "Site web illisible (site introuvable (adresse inconnue))"]]) {
    assert.equal(await inCrm(name), false, name);
    const k = await skippedOf(name);
    assert.deepEqual([k?.reason, k?.skippedOn], [reason, T], name);
  }
  assert.equal(await inCrm("Beta Conseil"), false);
  assert.equal(await inCrm("Hors Segment SARL"), false);
  assert.equal(await skippedOf("Hors Segment SARL"), undefined);

  // Alpha : créée avec son contact complet (adresse générique publiée sur le site, téléphone), constat DMARC, inscrite.
  const a = (await feedOf("Alpha Logiciels"))!;
  assert.deepEqual([a.c.source, a.c.siren, a.c.stage, a.c.sector], ["Recherche automatique", alpha.siren, "qualif", "Numérique"]);
  assert.match(a.c.notes, /Site web : https:\/\/www\.alpha\.fr/);
  assert.doesNotMatch(a.c.notes, /E-mail du dirigeant à trouver/);
  assert.deepEqual([a.ct.firstName, a.ct.lastName, a.ct.role, a.ct.email, a.ct.emailSource, a.ct.phone], ["Claire", "Durand", "Présidente", "contact@alpha.fr", "site", "01 40 00 00 01"]);
  assert.deepEqual([a.f.stage, a.f.service, a.f.segment, a.f.importedOn], ["inscrit", "diagnostic", "editeurs", T]);
  const camp = (await db.select().from(schema.mailCampaigns))[0];
  assert.deepEqual([camp.name, camp.offer, camp.segment, camp.auto, camp.status], [permanentName("diagnostic", "editeurs"), "diagnostic", "editeurs", true, "active"]);
  assert.deepEqual([a.item.campaignId, a.item.status, a.item.nextStep, a.item.nextDue], [camp.id, "en_cours", 0, T]);
  assert.equal((await db.select().from(schema.mailSends)).length, 0); // l'alimentation inscrit, elle n'envoie rien elle-même
  const created = await db.select().from(schema.events).where(eq(schema.events.companyId, a.c.id));
  assert.ok(created.some((e) => /site alpha\.fr, e-mail publié sur le site contact@alpha\.fr, téléphone 01 40 00 00 01/.test(e.text)));

  // Complète mais sans constat : dans le CRM, écartée du diagnostic.
  assert.deepEqual([(await feedOf("Gamma Apps"))!.f.stage, (await feedOf("Gamma Apps"))!.f.reason], ["ecarte", "Aucun constat certain utilisable (diagnostic)"]);
  // Pas de dirigeant, adresse générique publiée, téléphone venu de Google : inscrite, le mail commencera par « Bonjour, ».
  const i = (await feedOf("Iota Compta"))!;
  assert.deepEqual([i.f.stage, i.f.service, i.f.segment, i.ct.firstName, i.ct.email, i.ct.emailSource, i.ct.phone], ["inscrit", "diagnostic", "cabinets", "Standard", "cabinet@iota.fr", "site", "05 55 00 00 01"]);
  assert.deepEqual([i.item.status, i.item.nextStep], ["en_cours", 0]);
  // Pas de dirigeant et seulement une adresse nominative : écartée, le mail du diagnostic exige alors un prénom.
  const k = (await feedOf("Omicron Compta"))!;
  assert.deepEqual([k.f.stage, k.f.reason, k.ct.firstName, k.ct.email, k.item], ["ecarte", "Pas de prénom de dirigeant pour le mail", "Standard", "jean.martin@omicron.fr", undefined]);

  const runs = await db.select().from(schema.feedRuns);
  assert.equal(runs.length, 1);
  assert.deepEqual([runs[0].ok, runs[0].imported, runs[0].enrolled, runs[0].rejected], [true, 4, 2, 6]);
  const ov = await (await import("../src/server/feed")).feedOverview();
  assert.deepEqual([ov.today.imported, ov.today.rejected, ov.stock.rejected, ov.placesUsedToday], [4, 6, 6, 8]);
});

test("passages suivants : rien n'est vérifié ni intégré deux fois, la campagne permanente est réutilisée", async () => {
  const calls = world.placeCalls;
  const r2 = await run();
  assert.deepEqual([r2.imported, r2.enrolled, r2.rejected], [0, 0, 0]);
  assert.equal(world.placeCalls, calls); // candidats écartés ou déjà dans le CRM : aucune nouvelle requête Google
  assert.equal((await db.select().from(schema.companies)).length, 6);
  assert.equal((await db.select().from(schema.mailCampaigns)).length, 2);
  // Erreur de l'Annuaire (débit limité) : le passage continue, l'erreur est dans le journal.
  world.searchError = "L'Annuaire des Entreprises limite le débit : attends quelques secondes et réessaie.";
  const r4 = await run();
  assert.equal(r4.ok, true);
  assert.match(r4.message, /Recherche interrompue : L'Annuaire des Entreprises limite le débit/);
  world.searchError = "";
});

test("site sans Google : retenu seulement si le SIREN y est publié ; sans Google Places, les autres sont écartés", async () => {
  await db.delete(schema.feedItems); // le compteur du jour repart de zéro pour ce test
  clearSearch();
  await settings({ importPerSegment: 30, cursors: "{}" });
  const prouve = found("Prouvee Soft", "Numérique");
  world.pages["Numérique||1"] = [prouve, found("Sans Preuve", "Numérique")];
  world.sites["prouveesoft.fr"] = { emails: ["contact@prouveesoft.fr"], phones: ["01 40 00 00 11"], pages: 3, siren: prouve.siren };
  world.sites["sanspreuve.fr"] = { emails: ["contact@sanspreuve.fr"], phones: ["01 40 00 00 12"], pages: 2, siren: "999999998" }; // site d'un homonyme : autre SIREN
  world.placeCalls = 0;
  world.crawls = [];
  const r = await run({ place: null });
  assert.equal(r.imported, 1);
  assert.match(r.message, /1 site\(s\) trouvé\(s\) sans Google, prouvé\(s\) par le SIREN/);
  assert.match(r.message, /Google Places non configuré : seuls les sites prouvés par le SIREN sont retenus/);
  const p = (await feedOf("Prouvee Soft"))!;
  assert.deepEqual([p.ct.email, p.ct.emailSource, p.ct.phone], ["contact@prouveesoft.fr", "site", "01 40 00 00 11"]);
  assert.match(p.c.notes, /Site web : https:\/\/prouveesoft\.fr/);
  // Le site de l'homonyme a bien une adresse et un téléphone, mais pas le bon SIREN : refusé, rien n'entre dans le CRM.
  assert.equal(await inCrm("Sans Preuve"), false);
  assert.equal((await skippedOf("Sans Preuve"))?.reason, "Aucun site web trouvé (SIREN absent des sites essayés, Google Places non configuré)");
  assert.ok(world.crawls.includes("sanspreuve.fr") && world.crawls.includes("prouveesoft.fr"));

  // Avec Google disponible : un site prouvé par le SIREN ne coûte aucune requête Google.
  clearSearch();
  await settings({ cursors: "{}" });
  const deux = found("Prouvee Deux", "Numérique");
  world.pages["Numérique||1"] = [deux];
  world.sites["prouveedeux.com"] = { emails: ["contact@prouveedeux.com"], phones: ["01 40 00 00 13"], pages: 2, siren: deux.siren };
  world.placeCalls = 0;
  const r2 = await run();
  assert.equal(r2.imported, 1);
  assert.equal(world.placeCalls, 0);
});

test("site trop lent : un second essai plus patient avant de l'écarter", async () => {
  clearSearch();
  await settings({ cursors: "{}" });
  world.pages["Numérique||1"] = [found("Lent Soft", "Numérique")];
  world.places["Lent Soft"] = { website: "https://lent.fr", phone: "01 40 00 00 14" };
  let tries = 0;
  const slow: FeedDeps["crawl"] = async (site, budget, siren) => {
    if (new URL(site).hostname !== "lent.fr") return deps.crawl(site, budget, siren);
    tries++;
    return tries === 1 ? { emails: [], phones: [], pages: 0, error: "le site met trop de temps à répondre" } : { emails: ["contact@lent.fr"], phones: [], pages: 2 };
  };
  const r = await run({ crawl: slow });
  assert.equal(tries, 2);
  assert.equal(r.imported, 1);
  assert.equal(await inCrm("Lent Soft"), true);
});

test("plafond d'intégration par segment et par jour", async () => {
  await db.delete(schema.feedItems); // le compteur du jour repart de zéro pour ce test
  clearSearch();
  await settings({ importPerSegment: 2, cursors: "{}" });
  world.pages["Numérique||1"] = [found("Import 1", "Numérique"), found("Import 2", "Numérique"), found("Import 3", "Numérique"), found("Import 4", "Numérique")];
  for (const k of [1, 2, 3, 4]) site(`Import ${k}`, `import${k}.fr`, [`contact@import${k}.fr`]);
  const r = await run();
  assert.equal(r.imported, 2);
  assert.ok(await feedOf("Import 2"));
  assert.equal(await inCrm("Import 3"), false);
  assert.equal(await skippedOf("Import 3"), undefined); // pas vérifiée : ni dans le CRM, ni écartée
  // Le même jour : plus aucune intégration pour ce segment, et la page non terminée sera relue.
  const again = await run();
  assert.equal(again.imported, 0);
  await settings({ importPerSegment: 30 });
  const more = await run();
  assert.equal(more.imported, 2);
  assert.ok(await feedOf("Import 4"));
});

test("quota Google Places du jour, puis erreur de Google : les candidats attendent, rien n'est écarté à tort", async () => {
  clearSearch();
  await settings({ placesDaily: 1, placesUsed: 0, placesDay: T, cursors: "{}" });
  world.pages["Numérique||1"] = [found("Quota 1", "Numérique"), found("Quota 2", "Numérique")];
  site("Quota 1", "quota1.fr", ["contact@quota1.fr"]);
  site("Quota 2", "quota2.fr", ["contact@quota2.fr"]);
  world.placeCalls = 0;
  const r = await run();
  assert.equal(world.placeCalls, 1);
  assert.equal(r.imported, 1);
  assert.match(r.message, /Quota Google Places du jour atteint \(1\)/);
  assert.deepEqual([await inCrm("Quota 1"), await inCrm("Quota 2"), await skippedOf("Quota 2")], [true, false, undefined]);
  assert.equal((await db.select().from(schema.feedSettings))[0].placesUsed, 1);
  // Quota relevé, mais Google refuse (quota du compte) : le candidat attend toujours, hors du CRM et non écarté.
  await settings({ placesDaily: 30 });
  world.placeError = "Quota Google Places atteint : réessaie plus tard.";
  const r2 = await run();
  assert.match(r2.message, /Google Places : Quota Google Places atteint/);
  assert.deepEqual([await inCrm("Quota 2"), await skippedOf("Quota 2")], [false, undefined]);
  world.placeError = "";
  await run();
  assert.equal(await inCrm("Quota 2"), true);
});

test("inscriptions limitées par le plafond des prochains jours ; service en pause ; désinscription", async () => {
  clearSearch();
  await settings({ cursors: "{}" });
  const names = Array.from({ length: 6 }, (_, k) => `Cap ${k + 1}`);
  world.pages["Numérique||1"] = names.map((name) => found(name, "Numérique"));
  for (const [k, name] of names.entries()) { site(name, `cap${k + 1}.fr`, [`contact@cap${k + 1}.fr`]); world.noDmarc.add(`cap${k + 1}.fr`); }
  await db.insert(schema.mailOptouts).values({ email: "contact@cap6.fr", source: "lien" });

  const enrolledBefore = (await db.select().from(schema.mailCampaignItems)).length;
  const r = await run();
  // Diagnostic au premier palier : 4 premiers mails par jour. Alpha, Iota et Quota attendent déjà leur premier mail.
  const stages = await Promise.all(names.map(async (x) => (await feedOf(x))!.f));
  const now = (await db.select().from(schema.mailCampaignItems)).filter((x) => x.status === "en_cours");
  assert.equal(now.filter((x) => x.nextStep === 0).length, 4);
  assert.equal(r.enrolled, 4 - enrolledBefore);
  assert.ok(stages.filter((f) => f.stage === "a_inscrire").every((f) => f.reason === "En attente : le plafond Diagnostic des prochains jours est déjà rempli"));
  assert.ok(stages.some((f) => f.stage === "a_inscrire"));
  assert.deepEqual([stages[5].stage, stages[5].reason], ["ecarte", "Non inscrite : désinscrite"]); // adresse désinscrite : jamais inscrite

  // Les premiers mails partent (simulé) : des places se libèrent, mais le service est mis en pause.
  await db.update(schema.mailCampaignItems).set({ nextStep: 1 });
  await db.insert(schema.mailServiceState).values({ service: "diagnostic", paused: true, reason: "1 plainte(s) pour spam" });
  const paused = await run();
  assert.equal(paused.enrolled, 0);
  assert.ok((await Promise.all(names.map(async (x) => (await feedOf(x))!.f))).some((f) => f.reason === "En attente : service Diagnostic en pause"));
  // Reprise du service : les entreprises en attente entrent, toujours dans la même campagne permanente.
  await db.update(schema.mailServiceState).set({ paused: false, reason: "" });
  const resumed = await run();
  assert.ok(resumed.enrolled >= 1);
  assert.deepEqual((await db.select().from(schema.mailCampaigns)).map((c) => c.segment).sort(), ["cabinets", "editeurs"]); // une par segment, jamais de doublon
  assert.equal(new Set((await db.select().from(schema.mailCampaignItems)).map((x) => x.companyId)).size, (await db.select().from(schema.mailCampaignItems)).length); // une seule séquence par entreprise
});

test("service Audit alimenté seulement s'il est activé : sans constat, l'entreprise va dans la campagne permanente d'audit", async () => {
  clearSearch();
  await settings({ cursors: "{}" });
  world.pages["Courtage||1"] = [found("Kappa Courtage", "Courtage")];
  site("Kappa Courtage", "kappa.fr", ["contact@kappa.fr"]);
  const off = await run();
  assert.equal(off.enrolled, 0);
  assert.deepEqual([(await feedOf("Kappa Courtage"))!.f.stage, (await feedOf("Kappa Courtage"))!.f.reason], ["ecarte", "Aucun constat certain utilisable (diagnostic)"]);
  assert.equal((await db.select().from(schema.mailCampaigns)).filter((c) => c.offer === "audit").length, 0);

  const { saveFeedSettingsAction } = await import("../src/server/actions/feed");
  assert.equal((await saveFeedSettingsAction({ feedDiagnostic: true, feedAudit: true, departements: "75, 999x", effectifs: ["11"], importPerSegment: 30, placesDaily: 30 })).ok, false); // département invalide
  assert.ok((await saveFeedSettingsAction({ feedDiagnostic: true, feedAudit: true, departements: "75, 92", effectifs: ["11", "12"], importPerSegment: 30, placesDaily: 30 })).ok);
  clearSearch();
  world.pages["Courtage|75|1"] = [found("Lambda Courtage", "Courtage")];
  site("Lambda Courtage", "lambda.fr", ["contact@lambda.fr"]);
  const on = await run();
  assert.equal(on.enrolled, 1);
  const l = (await feedOf("Lambda Courtage"))!;
  assert.deepEqual([l.f.stage, l.f.service], ["inscrit", "audit"]);
  const audit = (await db.select().from(schema.mailCampaigns)).filter((c) => c.offer === "audit");
  assert.deepEqual(audit.map((c) => [c.name, c.segment, c.auto]), [[permanentName("audit", "cabinets"), "cabinets", true]]);
  assert.ok(world.searches.every((x) => ["75", "92"].includes(x.departement) && x.effectifs.join() === "11,12")); // départements et tailles configurés
});

test("entreprises importées avant la règle : complètes, elles continuent ; incomplètes et intactes, retirées du CRM", async () => {
  clearSearch();
  await settings({ cursors: "{}" });
  const legacy = async (name: string, siren: string) => {
    const id = (await db.insert(schema.companies).values({ name, siren, sector: "Expertise comptable", source: "Recherche automatique", stage: "qualif", city: "Lyon", address: "1 rue X 69001", notes: "E-mail du dirigeant à trouver avant tout envoi." }).returning({ id: schema.companies.id }))[0].id;
    await db.insert(schema.contacts).values({ companyId: id, firstName: "Paul", lastName: "Martin", role: "Gérant", isPrimary: true });
    await db.insert(schema.events).values({ companyId: id, type: "create", text: "Entreprise importée par l'alimentation automatique" });
    await db.insert(schema.feedItems).values({ companyId: id, segment: "cabinets", importedOn: T, movedOn: T });
    return id;
  };
  await legacy("Ancienne Complete", "300000001");
  await legacy("Ancienne Sans Tel", "300000002");
  const touched = await legacy("Ancienne Suivie", "300000003");
  await db.insert(schema.tasks).values({ title: "Rappeler", companyId: touched, dueDate: T });
  site("Ancienne Complete", "ancienne-complete.fr", ["contact@ancienne-complete.fr"], ["04 72 00 00 01"]);
  site("Ancienne Sans Tel", "ancienne-sanstel.fr", ["contact@ancienne-sanstel.fr"], []);
  site("Ancienne Suivie", "ancienne-suivie.fr", [], []);

  const r = await run();
  assert.match(r.message, /1 entreprise\(s\) incomplète\(s\) retirée\(s\) du CRM/);
  const ok = (await feedOf("Ancienne Complete"))!;
  assert.deepEqual([ok.ct.email, ok.ct.emailSource, ok.ct.phone], ["contact@ancienne-complete.fr", "site", "04 72 00 00 01"]);
  assert.notEqual(ok.f.stage, "a_completer");
  // Incomplète et sans aucune trace : retirée du CRM (contacts, journal et suivi avec elle), notée hors CRM.
  assert.equal(await inCrm("Ancienne Sans Tel"), false);
  assert.equal((await skippedOf("Ancienne Sans Tel"))?.reason, REJECT.noPhone);
  // Incomplète mais suivie (une tâche) : gardée, marquée écartée.
  const kept = (await feedOf("Ancienne Suivie"))!;
  assert.deepEqual([kept.f.stage, kept.f.reason], ["ecarte", REJECT.noEmailNoPhone]);
  assert.equal(await skippedOf("Ancienne Suivie"), undefined);
});

test("arrêt par l'interrupteur : plus rien ne bouge, les séquences déjà commencées restent en place", async () => {
  const { setFeedEnabledAction } = await import("../src/server/actions/feed");
  assert.ok((await setFeedEnabledAction(false)).ok);
  clearSearch();
  world.pages["Numérique|75|1"] = [found("Après Arrêt", "Numérique")];
  const items = (await db.select().from(schema.mailCampaignItems)).length;
  const runsBefore = (await db.select().from(schema.feedRuns)).length;
  const r = await run();
  assert.deepEqual([r.ran, r.imported, r.enrolled], [false, 0, 0]);
  assert.equal(world.searches.length, 0);
  assert.equal(await feedOf("Après Arrêt"), undefined);
  assert.equal((await db.select().from(schema.mailCampaignItems)).length, items);
  assert.equal((await db.select().from(schema.feedRuns)).length, runsBefore);
});
