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
  for (const e of ["delivered", "opened", "click", "request", "deferred", "", 42, null, undefined]) assert.equal(classifyBrevoEvent(e), null, String(e));
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
