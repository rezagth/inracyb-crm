import test from "node:test";
import assert from "node:assert/strict";
import { classifyBrevoEvent, REASON } from "../src/lib/brevo-events";
import { runFailed } from "../src/lib/campaign";
import { explainBrevoError } from "../src/lib/brevo";

test("événements Brevo : les rebonds durs, spam, blocages et adresses invalides écartent l'adresse", () => {
  for (const e of ["hard_bounce", "hardBounce", "spam", "blocked", "invalid_email", "unsubscribed"]) assert.equal(classifyBrevoEvent(e)?.suppress, true, e);
  assert.equal(classifyBrevoEvent("hard_bounce")?.reason, REASON.rebond);
  assert.equal(classifyBrevoEvent("spam")?.reason, REASON.spam);
});

test("événements Brevo : un rebond temporaire est noté sans écarter l'adresse, le reste est ignoré", () => {
  assert.deepEqual(classifyBrevoEvent("soft_bounce")?.suppress, false);
  assert.deepEqual(classifyBrevoEvent("delivered"), { kind: "delivre", reason: "Délivré", suppress: false }); // gardé pour le bilan, sans effet sur l'adresse
  for (const e of ["opened", "click", "request", "deferred", "", 42, null, undefined]) assert.equal(classifyBrevoEvent(e), null, String(e));
});

test("déclenchement : échec s'il ne démarre pas ou si tout ce qui devait partir a échoué", () => {
  assert.equal(runFailed({ ok: false, sent: 0, errors: 0 }), true);
  assert.equal(runFailed({ ok: true, sent: 0, errors: 3 }), true);
  assert.equal(runFailed({ ok: true, sent: 4, errors: 1 }), false);
  assert.equal(runFailed({ ok: true, sent: 0, errors: 0 }), false);
});

test("erreur Brevo : l'adresse IP non reconnue est expliquée, la clé n'est jamais exposée", () => {
  assert.match(explainBrevoError(401, { message: "We have detected you are using an unrecognised IP address 1.2.3.4" }), /IPs autorisées/);
  assert.match(explainBrevoError(401, { message: "Key not found" }), /BREVO_API_KEY/);
  assert.ok(!explainBrevoError(401, { message: "Key not found" }).includes("api-key"));
});

test("mail de facturation : reconnu par son étiquette, quelle que soit la forme des tags Brevo", async () => {
  const { isBillingMail } = await import("../src/lib/brevo-events");
  assert.equal(isBillingMail(["facturation", "facture"]), true);
  assert.equal(isBillingMail('["Facturation","devis"]'), true);
  assert.equal(isBillingMail("facturation"), true);
  for (const t of [["crm", "prospection", "audit"], "diagnostic", null, undefined, 42, "[pas du json"]) assert.equal(isBillingMail(t), false, String(t));
});

test("mail de facturation : un rebond, une plainte ou une désinscription donnent une tâche, jamais une désinscription", async () => {
  const { billingEventTask } = await import("../src/lib/brevo-events");
  assert.ok(billingEventTask("rebond", "daf@client.fr", "Facture F-2026-001 — Audit")?.startsWith("Adresse de facturation à corriger : daf@client.fr"));
  assert.ok(billingEventTask("invalide", "x@y.fr", "")?.includes("x@y.fr"));
  assert.ok(billingEventTask("spam", "x@y.fr", "")?.includes("appeler le client"));
  assert.ok(billingEventTask("desinscrit", "x@y.fr", "")?.includes("vérifier avec le client"));
  assert.equal(billingEventTask("delivre", "x@y.fr", ""), null);
  assert.equal(billingEventTask("rebond_temporaire", "x@y.fr", ""), null);
});
