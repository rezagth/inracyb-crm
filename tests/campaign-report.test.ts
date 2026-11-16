/** Bilan par service et segment : cohortes, taux, et refus de conclure sur un petit échantillon. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, compareRates, MIN_SAMPLE, rate, verdicts, wilson, type ProspectRecord } from "../src/lib/campaign-report";

const T = "2026-12-20";
const rec = (o: Partial<ProspectRecord>): ProspectRecord => ({ service: "diagnostic", segment: "editeurs", firstSend: "2026-11-16", mails: 4, delivered: true, bounced: false, complained: false, optedOut: false, replied: false, meetings: [], signed: [], ...o });
const many = (n: number, o: Partial<ProspectRecord>, replied = 0, meetings = 0) => Array.from({ length: n }, (_, i) => rec({ ...o, replied: i < replied, meetings: i < meetings ? ["2026-11-20"] : [] }));

test("tableau : une ligne par service et segment, compteurs par entreprise", () => {
  const rows = buildReport(
    [
      rec({ replied: true, meetings: ["2026-11-25"], signed: ["2026-12-10"] }),
      rec({ bounced: true, delivered: false, mails: 1 }),
      rec({ segment: "cabinets", optedOut: true }),
      rec({ service: "audit", segment: "cabinets", complained: true }),
      rec({ service: "audit", segment: "autres" }),
      rec({ firstSend: null, mails: 0 }), // rien n'est encore parti : pas comptée
    ],
    T,
    null,
  );
  assert.deepEqual(rows.map((r) => r.label), ["Audit · Cabinets comptables, juridiques, courtiers", "Audit · Autres secteurs", "Diagnostic · Cabinets comptables, juridiques, courtiers", "Diagnostic · Éditeurs, ESN, agences digitales"]);
  const ed = rows[3];
  assert.deepEqual([ed.contacted, ed.mails, ed.delivered, ed.bounced, ed.replied, ed.meetings, ed.signed], [2, 5, 1, 1, 1, 1, 1]);
  assert.deepEqual([rows[2].optedOut, rows[0].complained], [1, 1]);
});

test("cohortes J+14 et J+30 : seules les entreprises assez anciennes, seuls les rendez-vous et devis dans le délai", () => {
  const records = [
    rec({ firstSend: "2026-11-16", meetings: ["2026-11-28"], signed: ["2026-12-12"] }), // 34 jours : dans J+14 et J+30
    rec({ firstSend: "2026-12-01", meetings: ["2026-12-18"] }), // 19 jours : dans J+14 seulement, rendez-vous au 17e jour
    rec({ firstSend: "2026-12-15", replied: true }), // 5 jours : trop récente
    rec({ firstSend: "2026-11-16", meetings: ["2026-10-01"] }), // rendez-vous antérieur à la campagne : pas compté
  ];
  const at = (h: 14 | 30 | null) => buildReport(records, T, h)[0];
  assert.deepEqual([at(null).contacted, at(null).meetings, at(null).signed, at(null).replied], [4, 2, 1, 1]);
  assert.deepEqual([at(14).contacted, at(14).meetings, at(14).signed, at(14).replied], [3, 1, 0, 0]);
  assert.deepEqual([at(30).contacted, at(30).meetings, at(30).signed], [2, 1, 1]);
  assert.deepEqual(buildReport([rec({ firstSend: "2026-12-06" })], T, 14).length, 1); // 14 jours pile
  assert.deepEqual(buildReport([rec({ firstSend: "2026-12-07" })], T, 14), []);
});

test("accusés de remise absents : colonne inconnue, jamais zéro", () => {
  const row = buildReport([rec({ delivered: null }), rec({ delivered: null })], T, null)[0];
  assert.equal(row.delivered, null);
  assert.equal(rate(row.delivered, row.contacted), "—");
  assert.equal(rate(1, 3), "33,3 %");
  assert.equal(rate(0, 0), "—");
});

test("petit échantillon : aucune conclusion, même avec un écart spectaculaire", () => {
  const v = compareRates("Taux de réponse", { label: "A", k: 5, n: 10 }, { label: "B", k: 0, n: 29 });
  assert.equal(v.conclusive, false);
  assert.match(v.text, /échantillon trop petit pour conclure \(A : 10 entreprise\(s\) ; B : 29 entreprise\(s\), minimum 30 par ligne\)/);
  assert.equal(compareRates("x", { label: "A", k: 29, n: 30 }, { label: "B", k: 0, n: 29 }).conclusive, false);
  assert.equal(MIN_SAMPLE, 30);
});

test("échantillon suffisant : écart retenu seulement s'il dépasse la marge d'incertitude", () => {
  const close = compareRates("Taux de réponse", { label: "A", k: 4, n: 40 }, { label: "B", k: 6, n: 40 });
  assert.equal(close.conclusive, false);
  assert.match(close.text, /écart non concluant, il peut venir du hasard\. A 10 % \(4\/40\), B 15 % \(6\/40\)/);
  const clear = compareRates("Taux de réponse", { label: "A", k: 20, n: 60 }, { label: "B", k: 2, n: 60 });
  assert.equal(clear.conclusive, true);
  assert.match(clear.text, /A fait nettement mieux/);
  assert.match(compareRates("x", { label: "A", k: 2, n: 60 }, { label: "B", k: 20, n: 60 }).text, /B fait nettement mieux/);
  const w = wilson(5, 50);
  assert.ok(w.low > 0.04 && w.low < 0.05 && w.high > 0.21 && w.high < 0.22, JSON.stringify(w));
  assert.deepEqual(wilson(0, 0), { low: 0, high: 1 });
});

test("comparaisons proposées : segments du diagnostic entre eux, puis diagnostic contre audit", () => {
  const rows = buildReport([...many(40, { segment: "editeurs" }, 16, 8), ...many(40, { segment: "cabinets" }, 1, 0), ...many(12, { service: "audit", segment: "cabinets" }, 1, 0)], T, null);
  const v = verdicts(rows);
  assert.equal(v.length, 4);
  assert.deepEqual(v.map((x) => x.conclusive), [true, true, false, false]);
  assert.match(v[0].text, /^Taux de réponse : Éditeurs, ESN, agences digitales fait nettement mieux/);
  assert.match(v[2].text, /échantillon trop petit pour conclure \(Audit : 12 entreprise\(s\)/); // l'audit n'a que 12 entreprises
  assert.deepEqual(verdicts(buildReport(many(5, { segment: "editeurs" }), T, null)), []); // un seul groupe : rien à comparer
});
