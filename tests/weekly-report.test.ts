/** Rapport hebdomadaire : contenu, alertes, actions et refus de conclure sur un petit échantillon. */
import test from "node:test";
import assert from "node:assert/strict";
import { composeWeeklyReport } from "../src/lib/weekly-report";
import type { ProspectRecord } from "../src/lib/campaign-report";

const T = "2026-11-23";
const rec = (o: Partial<ProspectRecord>): ProspectRecord => ({ service: "diagnostic", segment: "cabinets", firstSend: "2026-11-20", mails: 1, delivered: true, bounced: false, complained: false, optedOut: false, replied: false, meetings: [], signed: [], ...o });

test("sans aucun envoi : le rapport le dit et pointe Brevo et l'alimentation", () => {
  const r = composeWeeklyReport([], T);
  assert.match(r.text, /Aucun envoi pour l'instant/);
  assert.ok(r.actions.some((a) => /Brevo/.test(a)));
  assert.equal(r.alerts.length, 0);
  assert.match(r.subject, /^InfraCyb · bilan de la semaine du 16\/11\/2026$/);
});

test("compte les nouvelles entreprises de la semaine, pas les anciennes", () => {
  const r = composeWeeklyReport([rec({}), rec({}), rec({ firstSend: "2026-11-02" })], T);
  assert.match(r.text, /Cette semaine : 2 nouvelle\(s\) entreprise\(s\) contactée\(s\)/);
  assert.match(r.text, /Total : 3 contactée\(s\)/);
});

test("une plainte pour spam déclenche une alerte et l'objet le signale", () => {
  const r = composeWeeklyReport([rec({ complained: true })], T);
  assert.equal(r.alerts.length, 1);
  assert.match(r.alerts[0], /plainte/);
  assert.match(r.subject, /à regarder$/);
});

test("rebonds au-dessus de 2 % avec au moins 20 entreprises : alerte ; en dessous de 20 : pas d'alerte", () => {
  const many = (n: number, bounced: number) => Array.from({ length: n }, (_, i) => rec({ bounced: i < bounced }));
  assert.ok(composeWeeklyReport(many(30, 3), T).alerts.some((a) => /Rebonds/.test(a)));
  assert.equal(composeWeeklyReport(many(10, 5), T).alerts.length, 0);
});

test("des réponses sans rendez-vous : action de rappel ; places pilotes décomptées", () => {
  const r = composeWeeklyReport([rec({ replied: true })], T, 1);
  assert.ok(r.actions.some((a) => /réponse\(s\) sans rendez-vous/.test(a)));
  assert.ok(r.actions.some((a) => /Il reste 2 place\(s\) pilote sur 3/.test(a)));
});

test("petit échantillon : aucune conclusion de comparaison", () => {
  const r = composeWeeklyReport([rec({}), rec({ segment: "editeurs" })], T);
  assert.match(r.text, /pas assez de données pour conclure|échantillon trop petit/);
  assert.doesNotMatch(r.text, /fait nettement mieux/);
});
