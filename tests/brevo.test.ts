import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_RE, buildBrevoPayload, explainBrevoError } from "../src/lib/brevo";

const base = { from: { email: "contact@infracyb.fr", name: "InfraCyb" }, to: { email: "marie@cabinet.fr", name: "Marie Durand" }, subject: "Bonjour", text: "Corps du mail" };

test("le mail part en texte brut, depuis l'expéditeur du domaine, avec l'adresse de réponse", () => {
  const p = buildBrevoPayload({ ...base, replyTo: "contact@infracyb.fr", tags: ["crm"] });
  assert.deepEqual(p.sender, { email: "contact@infracyb.fr", name: "InfraCyb" });
  assert.deepEqual(p.to, [{ email: "marie@cabinet.fr", name: "Marie Durand" }]);
  assert.deepEqual(p.replyTo, { email: "contact@infracyb.fr" });
  assert.equal(p.textContent, "Corps du mail");
  assert.ok(!("htmlContent" in p));
});

test("sans nom de destinataire ni réponse ni étiquette, ces champs sont omis", () => {
  const p = buildBrevoPayload({ ...base, to: { email: "marie@cabinet.fr" } });
  assert.deepEqual(p.to, [{ email: "marie@cabinet.fr" }]);
  assert.ok(!("replyTo" in p) && !("tags" in p));
});

test("validation d'adresse : refuse les listes, les espaces et les formats cassés", () => {
  assert.ok(EMAIL_RE.test("a.b@exemple.fr"));
  for (const bad of ["", "a@b", "a b@c.fr", "a@b.fr,c@d.fr", "<a@b.fr>", "@b.fr"]) assert.ok(!EMAIL_RE.test(bad), bad);
});

test("messages d'erreur utiles et sans fuite de clé", () => {
  assert.match(explainBrevoError(401, { message: "Key not found" }), /BREVO_API_KEY/);
  assert.match(explainBrevoError(400, { message: "Sender is invalid" }), /valide contact@infracyb\.fr/);
  assert.match(explainBrevoError(403, { message: "account not activated" }), /account not activated/);
  assert.match(explainBrevoError(429, null), /réessaie/);
  assert.ok(!explainBrevoError(500, null).includes("api-key"));
});
