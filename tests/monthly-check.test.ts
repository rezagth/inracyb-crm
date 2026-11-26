import { test } from "node:test";
import assert from "node:assert/strict";
import type { Check } from "../src/lib/diagnostic";
import { bilanDue, compareChecks, composeBilan } from "../src/lib/monthly-check";

const ck = (id: string, status: Check["status"], variant = "", wording = `${id} ${status}`): Check => ({ id, label: id.toUpperCase(), status, certain: true, proof: "", wording, rank: 3, variant });

test("bilan dû : le mois qui suit la signature, une seule fois par mois, contrat actif seulement", () => {
  assert.equal(bilanDue({ status: "actif", start: "2026-11-26" }, "", "2026-11-30"), false);
  assert.equal(bilanDue({ status: "actif", start: "2026-11-26" }, "", "2026-12-01"), true);
  assert.equal(bilanDue({ status: "actif", start: "2026-11-26" }, "2026-12", "2026-12-02"), false);
  assert.equal(bilanDue({ status: "actif", start: "2026-11-26" }, "2026-12", "2027-01-04"), true);
  assert.equal(bilanDue({ status: "resilie", start: "2026-10-01" }, "", "2026-12-01"), false);
});

test("comparaison : réglé, apparu, changé de nature", () => {
  const prev = [ck("dmarc", "constat", "dmarc-none"), ck("tls", "constat", "tls-bientot"), ck("spf", "conforme")];
  const cur = [ck("dmarc", "conforme"), ck("tls", "constat", "tls-expire"), ck("spf", "constat", "spf-double")];
  const d = compareChecks(prev, cur);
  assert.deepEqual(d.fixed.map((c) => c.id), ["dmarc"]);
  assert.deepEqual(d.regressed.map((c) => c.id), ["tls", "spf"]);
  assert.equal(compareChecks(prev, prev).regressed.length, 0);
});

test("mail du bilan : mois en français, réglé et en place, alerte en tête", () => {
  const base = { company: "Croko", prenom: "Lorris", mailDomain: "croko.eu", webHost: "www.croko.eu", today: "2026-12-01", signature: "Noam" };
  const calm = composeBilan({ ...base, checks: [ck("dmarc", "conforme", "", "DMARC en reject.")], fixed: [ck("dmarc", "constat")], regressed: [] });
  assert.equal(calm.subject, "Bilan de décembre 2026 : croko.eu et www.croko.eu · rien à signaler");
  assert.match(calm.text, /^Bonjour Lorris,/);
  assert.match(calm.text, /Réglé depuis le dernier bilan :\n- DMARC/);
  assert.match(calm.text, /En place et vérifié :\n- DMARC en reject\./);
  const alert = composeBilan({ ...base, checks: [ck("tls", "constat", "tls-expire", "Certificat expiré.")], fixed: [], regressed: [ck("tls", "constat", "tls-expire", "Certificat expiré.")] });
  assert.match(alert.subject, /point à traiter$/);
  assert.match(alert.text, /À traiter en priorité[^\n]*\n- Certificat expiré\./);
  assert.doesNotMatch(alert.text, /Encore en cours/);
});
