import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPackQuote, oneOffPart, suiviFromLines, SUIVI_LABEL } from "../src/lib/pack-quote";

test("devis Pack + Suivi : prix pilote tant qu'il reste des places, puis prix public", () => {
  const p = buildPackQuote({ slotsLeft: 2, today: "2026-11-26", domain: "Exemple.fr" });
  assert.equal(p.lines[0].unitPrice, "290,00");
  assert.equal(p.lines[1].unitPrice, "39,00");
  assert.equal(p.lines[1].quantity, 6);
  assert.equal(p.lines[1].unit, "mois");
  assert.match(p.subject, /pour exemple\.fr$/);
  assert.match(p.note, /témoignage/);
  assert.equal(p.dueDate, "2026-12-26");
  const pub = buildPackQuote({ slotsLeft: 0, today: "2026-11-26", domain: "" });
  assert.equal(pub.lines[0].unitPrice, "390,00");
  assert.equal(pub.lines[1].unitPrice, "49,00");
  assert.doesNotMatch(pub.note, /témoignage/);
  assert.doesNotMatch(pub.subject, /pour/);
});

test("acceptation : le contrat mensuel vient de la ligne d'abonnement seulement", () => {
  assert.equal(suiviFromLines([{ label: `${SUIVI_LABEL} — abonnement mensuel`, unit: "mois", unitPriceCents: 3900 }]), 3900);
  assert.equal(suiviFromLines([{ label: "RSSI externalisé", unit: "mois", unitPriceCents: 103300 }]), null);
  assert.equal(suiviFromLines([{ label: SUIVI_LABEL, unit: "forfait", unitPriceCents: 3900 }]), null);
});

test("facture tirée du devis : sans l'abonnement, remise au prorata", () => {
  const lines = [
    { label: "Pack", unit: "forfait", quantity: 1, unitPriceCents: 29000 },
    { label: `${SUIVI_LABEL} — abonnement`, unit: "mois", quantity: 6, unitPriceCents: 3900 },
  ];
  const r = oneOffPart(lines, 52400);
  assert.equal(r.lines.length, 1);
  assert.equal(r.baseHtCents, 29000);
  assert.equal(r.excluded, true);
  assert.equal(oneOffPart(lines, 47160).baseHtCents, 26100); // remise de 10 %
  assert.deepEqual(oneOffPart([lines[0]], 29000), { lines: [lines[0]], baseHtCents: 29000, excluded: false });
});
