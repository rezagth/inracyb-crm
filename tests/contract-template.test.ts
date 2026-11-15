import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContract, TODO } from "../src/lib/contract-template";

const base = {
  clientName: "Cabinet Test", clientSignatoryName: "Marie Dupont", clientSignatoryRole: "Gérante", clientSiret: "123456789",
  clientAddress: "2 rue Client, Paris", priceHT: 690, durationDays: 5, startDate: "2026-12-01", scope: "Audit organisationnel",
  provider: { legalName: "Jean Test (EI)", representative: "Jean Test", siret: "12345678900012", address: "1 rue Test", email: "j@t.fr", insurer: "Assureur" },
  payDays: 30, payMethod: "Virement bancaire", latePenalty: "3 fois le taux d'intérêt légal", tvaFranchise: true,
};

test("un contrat complet n'a aucun champ manquant et reprend les conditions de paiement du CRM", () => {
  const doc = buildContract(base);
  assert.deepEqual(doc.missing, []);
  const text = JSON.stringify(doc);
  assert.ok(text.includes("30 jours") && text.includes("Virement bancaire") && text.includes("293 B"));
  // Seuls restent à la main : lieu et date de signature, sous-traitants ultérieurs et localisation des données (annexe).
  assert.equal(text.split(TODO).length - 1, 4);
});

test("contient l'article 28, la non-qualification ANSSI et signale les champs manquants", () => {
  const doc = buildContract({ ...base, provider: { ...base.provider, siret: null }, priceHT: null, clientSiret: null });
  const text = JSON.stringify(doc);
  assert.ok(text.includes("article 28 du RGPD") && text.includes("instruction documentée") && text.includes("pas une prestation qualifiée"));
  assert.ok(doc.missing.includes("SIRET du prestataire") && doc.missing.includes("Prix de la mission") && doc.missing.includes("SIRET du client"));
});
