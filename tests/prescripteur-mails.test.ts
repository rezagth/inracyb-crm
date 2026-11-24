/** Mails prescripteurs : aucune commission pour les professions réglementées, champs remplis, prix cohérents. */
import test from "node:test";
import assert from "node:assert/strict";
import { composePrescriberMail, FORBIDDEN_FOR_REGULATED, PRESCRIBER_SEQUENCE, prescriberKindOf } from "../src/lib/prescripteur-mails";
import { PACK_COURRIER, PARTNER_COMMISSION_PCT, euros, pilotSlotsLeft } from "../src/lib/pricing";

test("expert-comptable, juridique, notariat : jamais de commission dans les textes", () => {
  for (const tpl of PRESCRIBER_SEQUENCE.reglemente) {
    assert.doesNotMatch(tpl.subject + "\n" + tpl.body, FORBIDDEN_FOR_REGULATED);
  }
});

test("le type de prescripteur suit le secteur du CRM", () => {
  for (const s of ["Expertise comptable", "Juridique", "Notariat"]) assert.equal(prescriberKindOf(s), "reglemente");
  for (const s of ["Courtage", "Numérique", "Autre"]) assert.equal(prescriberKindOf(s), "partenaire");
});

test("le texte partenaire annonce le taux de pricing.ts et un accord écrit", () => {
  const m = composePrescriberMail({ kind: "partenaire", step: 0, firstName: "Sophie", company: "Cabinet Dupont", signature: "Reza" });
  assert.ok(m.ok);
  if (m.ok) {
    assert.match(m.text, new RegExp(`${PARTNER_COMMISSION_PCT} %`));
    assert.match(m.text, /accord écrit/);
    assert.match(m.text, /^Bonjour Sophie,/);
    assert.match(m.text, /Cabinet Dupont/);
  }
});

test("sans prénom : « Bonjour, » ; modèle inconnu : refus", () => {
  const m = composePrescriberMail({ kind: "reglemente", step: 1, company: "Cabinet X", signature: "Reza" });
  assert.ok(m.ok);
  if (m.ok) assert.match(m.text, /^Bonjour,/);
  assert.equal(composePrescriberMail({ kind: "reglemente", step: 5, company: "X", signature: "R" }).ok, false);
});

test("prix : le prix pilote est une remise d'environ 25 % et les places se décomptent", () => {
  assert.equal(euros(PACK_COURRIER.publicCents), "390 € HT");
  assert.equal(euros(PACK_COURRIER.pilotCents), "290 € HT");
  const remise = 1 - PACK_COURRIER.pilotCents / PACK_COURRIER.publicCents;
  assert.ok(remise > 0.2 && remise < 0.3);
  assert.equal(pilotSlotsLeft(0), 3);
  assert.equal(pilotSlotsLeft(2), 1);
  assert.equal(pilotSlotsLeft(9), 0);
});

test("appel après la relance : le lendemain, jamais de commission pour un cabinet réglementé, rien sans téléphone", async () => {
  const { prescriberCallTask } = await import("../src/lib/prescripteur-mails");
  const base = { company: "Cabinet Lex", contactName: "Anne Martin", phone: "04 72 00 00 00", me: "Reza", sentOn: "2026-11-30" };
  const r = prescriberCallTask({ ...base, kind: "reglemente" });
  assert.ok(r);
  assert.deepEqual([r!.title, r!.dueDate, r!.priority], ["Appeler Cabinet Lex au 04 72 00 00 00 : prescripteur, après la relance", "2026-12-01", "haute"]);
  assert.ok(r!.opening.startsWith("Bonjour Anne Martin, Reza d'InfraCyb."));
  assert.doesNotMatch(r!.opening, FORBIDDEN_FOR_REGULATED);
  const p = prescriberCallTask({ ...base, kind: "partenaire" });
  assert.match(p!.opening, new RegExp(`${PARTNER_COMMISSION_PCT} % du HT encaissé`));
  assert.equal(prescriberCallTask({ ...base, kind: "reglemente", phone: "01 23" }), null);
  assert.doesNotMatch(prescriberCallTask({ ...base, kind: "reglemente", company: "A\nB" })!.title, /\n/);
});
