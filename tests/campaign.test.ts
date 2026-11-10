import test from "node:test";
import assert from "node:assert/strict";
import { addDaysIso, exclusionOf, makeOptoutToken, nextDueAfterSend, pickDue, readOptoutToken, withUnsubscribeFooter } from "../src/lib/campaign";
import { buildBrevoPayload } from "../src/lib/brevo";

const SECRET = "un-secret-de-test-assez-long-1234567890";

test("la séquence est comptée depuis l'envoi réel", () => {
  assert.equal(nextDueAfterSend("2026-11-10", 0), "2026-11-13"); // J0 -> J+3
  assert.equal(nextDueAfterSend("2026-11-13", 1), "2026-11-17"); // J+3 -> J+7 (4 jours)
  assert.equal(nextDueAfterSend("2026-11-17", 2), "2026-11-24"); // J+7 -> J+14 (7 jours)
  assert.equal(nextDueAfterSend("2026-11-24", 3), null);
  assert.equal(addDaysIso("2026-12-30", 3), "2027-01-02");
});

test("exclusions : perdue, avancée, sans e-mail, invalide, désinscrite, déjà en campagne", () => {
  const optouts = new Set(["stop@x.fr"]);
  const inC = new Set(["c9"]);
  const base = { id: "c1", name: "A", stage: "qualif", email: "a@x.fr" };
  assert.equal(exclusionOf(base, optouts, inC), null);
  assert.equal(exclusionOf({ ...base, stage: "contacte" }, optouts, inC), null);
  assert.equal(exclusionOf({ ...base, stage: "perdu" }, optouts, inC), "perdu");
  assert.equal(exclusionOf({ ...base, stage: "rdv" }, optouts, inC), "avance");
  assert.equal(exclusionOf({ ...base, stage: "gagne" }, optouts, inC), "avance");
  assert.equal(exclusionOf({ ...base, email: " " }, optouts, inC), "sans-email");
  assert.equal(exclusionOf({ ...base, email: "pas-un-mail" }, optouts, inC), "email-invalide");
  assert.equal(exclusionOf({ ...base, email: "STOP@x.fr" }, optouts, inC), "desinscrit");
  assert.equal(exclusionOf({ ...base, id: "c9" }, optouts, inC), "deja-en-campagne");
});

test("pickDue : seulement les échéances passées, les plus en retard d'abord, dans la limite du plafond", () => {
  const items = [{ id: "a", nextDue: "2026-11-12" }, { id: "b", nextDue: "2026-11-09" }, { id: "c", nextDue: "2026-11-10" }, { id: "d", nextDue: "2026-11-10" }];
  assert.deepEqual(pickDue(items, "2026-11-10", 2).map((i) => i.id), ["b", "c"]);
  assert.deepEqual(pickDue(items, "2026-11-10", 10).map((i) => i.id), ["b", "c", "d"]);
  assert.deepEqual(pickDue(items, "2026-11-10", 0), []);
  assert.deepEqual(pickDue(items, "2026-11-10", -3), []);
});

test("jeton de désinscription : authentique, insensible à la casse, infalsifiable", () => {
  const t = makeOptoutToken(SECRET, "Contact@Exemple.FR");
  assert.equal(readOptoutToken(SECRET, t), "contact@exemple.fr");
  assert.equal(readOptoutToken("un-autre-secret-de-test-123456789", t), null);
  const [a, sig] = t.split(".");
  const forged = Buffer.from("autre@exemple.fr").toString("base64url") + "." + sig;
  assert.equal(readOptoutToken(SECRET, forged), null);
  assert.equal(readOptoutToken(SECRET, a), null);
  assert.equal(readOptoutToken(SECRET, ""), null);
  assert.equal(readOptoutToken(SECRET, "....."), null);
});

test("pied de mail et en-têtes Brevo", () => {
  assert.match(withUnsubscribeFooter("Bonjour", "https://crm.example/api/desabonnement/abc"), /Se désinscrire en un clic : https:\/\/crm\.example\/api\/desabonnement\/abc$/);
  const p = buildBrevoPayload({ from: { email: "a@b.fr", name: "A" }, to: { email: "c@d.fr" }, subject: "S", text: "T", headers: { "List-Unsubscribe": "<https://x>" } });
  assert.deepEqual((p as { headers?: unknown }).headers, { "List-Unsubscribe": "<https://x>" });
  const q = buildBrevoPayload({ from: { email: "a@b.fr", name: "A" }, to: { email: "c@d.fr" }, subject: "S", text: "T" });
  assert.equal("headers" in q, false);
});
