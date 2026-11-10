import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AUDIT_CENTS, estimateAmountCents, priorityFor } from "../src/lib/estimate";
import { matchByName, type Candidate } from "../src/lib/prospect-search";

const cand = (o: Partial<Candidate>): Candidate => ({
  siren: "123456789", name: "Cabinet Dupont", sector: "Juridique", naf: "69.10Z", address: "", postalCode: "33000", city: "Bordeaux",
  effectif: "10 à 19 salariés", effectifCode: "11", director: null, blocked: false, ...o,
});

test("audit : prix des paramètres, sinon prix par défaut", () => {
  assert.equal(estimateAmountCents("Audit", "11", 200_000), 200_000);
  assert.equal(estimateAmountCents("Audit", "11", 0), DEFAULT_AUDIT_CENTS);
});

test("RSSI externalisé : mensuel × 12 selon la taille, petite structure si inconnue", () => {
  assert.equal(estimateAmountCents("CISOaaS", "11", 0), 600 * 12 * 100);
  assert.equal(estimateAmountCents("CISOaaS", "", 0), 400 * 12 * 100);
});

test("IA : forfait selon la taille", () => {
  assert.equal(estimateAmountCents("IA", "12", 0), 4000 * 100);
  assert.equal(estimateAmountCents("IA", "99", 0), 1500 * 100);
});

test("priorité haute dès 10 salariés", () => {
  assert.equal(priorityFor("11"), "haute");
  assert.equal(priorityFor("03"), "moyenne");
  assert.equal(priorityFor(""), "moyenne");
});

test("matchByName : nom identique et lieu concordant uniquement", () => {
  const a = cand({}), b = cand({ siren: "987654321", postalCode: "75001", city: "Paris" });
  assert.equal(matchByName([a, b], "CABINET DUPONT", "75001", "")?.siren, "987654321");
  assert.equal(matchByName([a, b], "cabinet dupont", "", "Bordeaux")?.siren, "123456789");
  assert.equal(matchByName([a, b], "Cabinet Dupont", "69001", "Lyon"), null);
  assert.equal(matchByName([a, b], "Cabinet Dupont", "", ""), null);
  assert.equal(matchByName([a], "Cabinet Dupont", "", "")?.siren, "123456789");
  assert.equal(matchByName([a], "Cabinet Durand", "33000", ""), null);
});
