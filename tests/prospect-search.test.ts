import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAnnuaireParams, buildPlacesBody, explainAnnuaireError, normalizeCompany, normalizeSearch, pickDirector, pickPlace, sectorFromNaf, titleCase, OFFER_SIZES } from "../src/lib/prospect-search";

// Forme réelle d'une réponse de l'API recherche-entreprises.api.gouv.fr (champs utiles uniquement).
const fidal = {
  siren: "331022772",
  nom_complet: "FIDAL NOTAIRES",
  activite_principale: "69.10Z",
  tranche_effectif_salarie: "21",
  opposition_diffusion_commerciale: false,
  siege: { adresse: "3 PLACE DE LA MADELEINE 75008 PARIS", code_postal: "75008", libelle_commune: "PARIS", activite_principale: "69.10Z" },
  matching_etablissements: [{ adresse: "10 RUE DE LA PAIX 33000 BORDEAUX", code_postal: "33000", libelle_commune: "BORDEAUX" }],
  dirigeants: [
    { siren: "123456789", denomination: "AUDIT SA", qualite: "Commissaire aux comptes titulaire", type_dirigeant: "personne morale" },
    { nom: "DUPONT-MARTIN", prenoms: "Marie, Claire", qualite: "Gérant", type_dirigeant: "personne physique" },
  ],
};

test("paramètres : codes NAF du secteur, tailles, entreprises actives, page", () => {
  const p = buildAnnuaireParams({ offer: "audit", sector: "Expertise comptable", departement: "", effectifs: OFFER_SIZES.audit, query: "", page: 2 });
  assert.equal(p.get("activite_principale"), "69.20Z");
  assert.equal(p.get("tranche_effectif_salarie"), "02,03,11,12");
  assert.equal(p.get("etat_administratif"), "A");
  assert.equal(p.get("page"), "2");
  assert.equal(p.get("per_page"), "25");
  assert.ok(!p.has("departement") && !p.has("q"));
});

test("le notariat ajoute le mot-clé « notaire » au même code NAF que le juridique ; le département est transmis", () => {
  const p = buildAnnuaireParams({ offer: "ciso", sector: "Notariat", departement: "33", effectifs: [], query: "étude", page: 0 });
  assert.equal(p.get("activite_principale"), "69.10Z");
  assert.equal(p.get("q"), "notaire étude");
  assert.equal(p.get("departement"), "33");
  assert.equal(p.get("page"), "1");
  assert.ok(!p.has("tranche_effectif_salarie"));
});

test("normalisation : casse, secteur, taille, dirigeant personne physique uniquement", () => {
  const c = normalizeCompany(fidal)!;
  assert.equal(c.name, "Fidal Notaires");
  assert.equal(c.sector, "Notariat");
  assert.equal(c.effectif, "50 à 99 salariés");
  assert.deepEqual(c.director, { firstName: "Marie", lastName: "Dupont-Martin", role: "Gérant" });
  assert.equal(c.blocked, false);
  assert.equal(c.city, "Paris");
  assert.equal(c.address, "3 Place De La Madeleine 75008"); // la ville est retirée : elle est saisie à part dans le CRM
});

test("avec un département, l'établissement local remplace le siège", () => {
  const c = normalizeCompany(fidal, "33")!;
  assert.equal(c.city, "Bordeaux");
  assert.equal(c.postalCode, "33000");
});

test("opposition à la prospection : marquée bloquée", () => {
  assert.equal(normalizeCompany({ ...fidal, opposition_diffusion_commerciale: true })!.blocked, true);
});

test("données invalides ignorées sans planter", () => {
  assert.equal(normalizeCompany({ siren: "abc", nom_complet: "X" }), null);
  assert.equal(normalizeCompany(null), null);
  assert.deepEqual(normalizeSearch(null), { total: 0, totalPages: 0, page: 1, items: [] });
  const page = normalizeSearch({ total_results: 586, total_pages: 293, page: 1, results: [fidal, { siren: "x" }] });
  assert.equal(page.items.length, 1);
  assert.equal(page.total, 586);
  assert.equal(pickDirector([{ type_dirigeant: "personne morale", denomination: "X" }]), null);
});

test("casse des noms et secteurs", () => {
  assert.equal(titleCase("CABINET DUPONT SARL", true), "Cabinet Dupont SARL");
  assert.equal(titleCase("Cabinet Martin"), "Cabinet Martin");
  assert.equal(titleCase("L'AURORE"), "L'Aurore");
  assert.equal(sectorFromNaf("86.23Z"), "Santé");
  assert.equal(sectorFromNaf("68.32A"), "Immobilier");
  assert.equal(sectorFromNaf("47.11Z"), "Autres");
});

test("Google Places : on n'accepte que l'adresse qui contient le code postal du prospect", () => {
  const body = buildPlacesBody("Fidal Notaires", "Paris");
  assert.equal(body.textQuery, "Fidal Notaires Paris");
  const json = { places: [
    { formattedAddress: "5 rue X, 69000 Lyon", nationalPhoneNumber: "04 00 00 00 00", websiteUri: "https://homonyme.fr" },
    { formattedAddress: "3 Pl. de la Madeleine, 75008 Paris", nationalPhoneNumber: "01 23 45 67 89", websiteUri: "https://fidal.com" },
  ] };
  assert.deepEqual(pickPlace(json, "75008"), { phone: "01 23 45 67 89", website: "https://fidal.com" });
  assert.equal(pickPlace(json, "13001"), null);
  assert.equal(pickPlace(json, "abc"), null);
});

test("erreurs de l'Annuaire : messages lisibles", () => {
  assert.match(explainAnnuaireError(429, null), /limite le débit/);
  assert.match(explainAnnuaireError(400, { message: "departement invalide" }), /departement invalide/);
  assert.match(explainAnnuaireError(503, null), /indisponible/);
});
