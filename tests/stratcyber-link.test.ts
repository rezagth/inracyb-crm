import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, paymentStatusOf, signPayload, stratcyberDossierUrl, stratcyberHome } from "../src/lib/stratcyber-link";

test("un retard de paiement prime sur tout, avec le nombre de jours de la plus ancienne échéance", () => {
  assert.deepEqual(paymentStatusOf(["actif"], ["2026-10-20", "2026-11-01"], "2026-11-08"), { status: "en_retard", overdueDays: 19 });
  assert.equal(paymentStatusOf(["resilie"], ["2026-11-01"], "2026-11-08").status, "en_retard");
});

test("à jour tant qu'un contrat est actif et rien n'est échu", () => {
  assert.deepEqual(paymentStatusOf(["actif", "resilie"], [], "2026-11-08"), { status: "a_jour", overdueDays: null });
});

test("résilié quand plus aucun contrat n'est actif", () => {
  assert.deepEqual(paymentStatusOf(["resilie"], [], "2026-11-08"), { status: "resilie", overdueDays: null });
});

test("signature identique à celle attendue côté StratCyber (HMAC-SHA256 de horodatage.corps)", () => {
  assert.equal(signPayload("s", "1700000000", "{}"), signPayload("s", "1700000000", "{}"));
  assert.notEqual(signPayload("s", "1700000000", "{}"), signPayload("s", "1700000001", "{}"));
  assert.equal(signPayload("s", "1", "x").length, 64);
});

test("daysBetween ne renvoie jamais de négatif", () => {
  assert.equal(daysBetween("2026-11-10", "2026-11-08"), 0);
});

test("lien vers le dossier StratCyber : page de passage par identifiant CRM, barre finale retirée", () => {
  assert.equal(stratcyberDossierUrl("https://cyber.example.fr/", "abc-123"), "https://cyber.example.fr/dashboard/organizations/crm/abc-123");
  assert.equal(stratcyberDossierUrl(" https://cyber.example.fr// ", "x"), "https://cyber.example.fr/dashboard/organizations/crm/x");
  assert.equal(stratcyberDossierUrl("https://cyber.example.fr", "a/b c"), "https://cyber.example.fr/dashboard/organizations/crm/a%2Fb%20c");
});

test("lien StratCyber absent si STRATCYBER_URL manque ou n'est pas une adresse http(s)", () => {
  assert.equal(stratcyberDossierUrl(undefined, "x"), null);
  assert.equal(stratcyberDossierUrl("", "x"), null);
  assert.equal(stratcyberDossierUrl("javascript:alert(1)", "x"), null);
  assert.equal(stratcyberHome(undefined), null);
  assert.equal(stratcyberHome("http://localhost:3001/"), "http://localhost:3001/dashboard/organizations");
});
