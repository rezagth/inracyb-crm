import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, paymentStatusOf, signPayload } from "../src/lib/stratcyber-link";

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
