import { test } from "node:test";
import assert from "node:assert/strict";
import { fiscalReminders, thresholdLevel, urssafPeriod, type FiscalInput } from "../src/lib/fiscal";

const base: FiscalInput = {
  today: "2026-11-08", periodicity: "mensuelle", cashYearCents: 0,
  ceilingCents: 10_000_00, tvaThresholdCents: 5_000_00, tvaFranchise: true,
};

test("mensuelle : le mois précédent, à déclarer avant la fin du mois en cours", () => {
  assert.deepEqual(urssafPeriod("2026-11-08", "mensuelle"), { label: "octobre 2026", from: "2026-10-01", to: "2026-10-31", deadline: "2026-11-30" });
});

test("mensuelle en janvier : le décembre de l'année précédente", () => {
  assert.deepEqual(urssafPeriod("2027-01-15", "mensuelle"), { label: "décembre 2026", from: "2026-12-01", to: "2026-12-31", deadline: "2027-01-31" });
});

test("mensuelle en février d'une année bissextile : fin de mois correcte", () => {
  assert.equal(urssafPeriod("2028-02-10", "mensuelle").deadline, "2028-02-29");
});

test("trimestrielle : échéances fin janvier, avril, juillet et octobre", () => {
  assert.deepEqual(urssafPeriod("2027-01-20", "trimestrielle"), { label: "T4 2026", from: "2026-10-01", to: "2026-12-31", deadline: "2027-01-31" });
  assert.deepEqual(urssafPeriod("2026-04-02", "trimestrielle"), { label: "T1 2026", from: "2026-01-01", to: "2026-03-31", deadline: "2026-04-30" });
  assert.deepEqual(urssafPeriod("2026-07-31", "trimestrielle"), { label: "T2 2026", from: "2026-04-01", to: "2026-06-30", deadline: "2026-07-31" });
  assert.deepEqual(urssafPeriod("2026-10-01", "trimestrielle"), { label: "T3 2026", from: "2026-07-01", to: "2026-09-30", deadline: "2026-10-31" });
});

test("trimestrielle en milieu de trimestre : prochaine échéance, pas une échéance passée", () => {
  // Février : le T4 a été déclaré fin janvier, la prochaine est le T1 avant le 30 avril.
  assert.deepEqual(urssafPeriod("2026-02-15", "trimestrielle"), { label: "T1 2026", from: "2026-01-01", to: "2026-03-31", deadline: "2026-04-30" });
  // Novembre : prochaine échéance fin janvier de l'année suivante, pour le T4.
  assert.deepEqual(urssafPeriod("2026-11-08", "trimestrielle"), { label: "T4 2026", from: "2026-10-01", to: "2026-12-31", deadline: "2027-01-31" });
});

test("paliers de seuil : 80, 90 et 100 %, 0 en dessous ou sans limite", () => {
  assert.equal(thresholdLevel(7_999, 10_000), 0);
  assert.equal(thresholdLevel(8_000, 10_000), 80);
  assert.equal(thresholdLevel(8_999, 10_000), 80);
  assert.equal(thresholdLevel(9_000, 10_000), 90);
  assert.equal(thresholdLevel(10_000, 10_000), 100);
  assert.equal(thresholdLevel(50_000, 10_000), 100);
  assert.equal(thresholdLevel(5_000, 0), 0);
});

test("pas de rappel URSSAF loin de l'échéance, rappel dans les 10 derniers jours", () => {
  assert.equal(fiscalReminders({ ...base, today: "2026-11-08" }).length, 0); // 22 jours avant le 30/11
  const near = fiscalReminders({ ...base, today: "2026-11-20" });
  assert.equal(near.length, 1);
  assert.match(near[0].title, /octobre 2026 \(avant le 30\/11\/2026\)/);
  assert.equal(near[0].dueDate, "2026-11-25"); // 5 jours avant l'échéance
  assert.equal(near[0].priority, "haute");
});

test("le rappel URSSAF ne passe jamais dans le passé", () => {
  const r = fiscalReminders({ ...base, today: "2026-11-28" });
  assert.equal(r[0].dueDate, "2026-11-28");
});

test("le titre du rappel URSSAF est stable d'un jour à l'autre (anti-doublon)", () => {
  const a = fiscalReminders({ ...base, today: "2026-11-21" })[0].title;
  const b = fiscalReminders({ ...base, today: "2026-11-29" })[0].title;
  assert.equal(a, b);
});

test("plafond de CA : un seul rappel, au plus haut palier atteint", () => {
  const at85 = fiscalReminders({ ...base, cashYearCents: 8_500_00, tvaFranchise: false });
  assert.equal(at85.length, 1);
  assert.match(at85[0].title, /80 % atteint en 2026/);
  const at95 = fiscalReminders({ ...base, cashYearCents: 9_500_00, tvaFranchise: false });
  assert.match(at95[0].title, /90 % atteint en 2026/);
  const over = fiscalReminders({ ...base, cashYearCents: 12_000_00, tvaFranchise: false });
  assert.match(over[0].title, /dépassé en 2026/);
});

test("seuil de TVA : uniquement si la franchise de TVA est active", () => {
  const withFranchise = fiscalReminders({ ...base, cashYearCents: 4_500_00, ceilingCents: 100_000_00 });
  assert.equal(withFranchise.length, 1);
  assert.match(withFranchise[0].title, /franchise de TVA : 90 %/);
  const without = fiscalReminders({ ...base, cashYearCents: 4_500_00, ceilingCents: 100_000_00, tvaFranchise: false });
  assert.equal(without.length, 0);
});

test("aucun seuil défini (0) : aucun rappel de seuil", () => {
  assert.equal(fiscalReminders({ ...base, cashYearCents: 99_999_00, ceilingCents: 0, tvaThresholdCents: 0 }).length, 0);
});

test("les rappels de plafond portent l'année en cours (un nouveau rappel chaque année)", () => {
  const y26 = fiscalReminders({ ...base, today: "2026-06-01", cashYearCents: 9_000_00, tvaFranchise: false })[0].title;
  const y27 = fiscalReminders({ ...base, today: "2027-06-01", cashYearCents: 9_000_00, tvaFranchise: false })[0].title;
  assert.notEqual(y26, y27);
});
