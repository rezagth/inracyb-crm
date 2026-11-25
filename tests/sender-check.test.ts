/** Domaine d'envoi : santé SPF, DKIM, DMARC, et montée en charge du diagnostic qui en dépend. */
import test from "node:test";
import assert from "node:assert/strict";
import type { Dns } from "../src/lib/diagnostic";
import { parentDomain, senderDomain, senderHealth } from "../src/lib/sender-check";
import { baseRampDone, dailyState, rampLimit } from "../src/lib/campaign";
import { composeWeeklyReport } from "../src/lib/weekly-report";

const rec = (...values: string[]): Dns => ({ kind: "records", values });
const absent: Dns = { kind: "absent" };
const err: Dns = { kind: "error", detail: "résolveur injoignable" };
const DKIM = rec("k=rsa;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA056eY9Ko5g7L2xG");
const base = { domain: "infracyb.fr", spf: rec("v=spf1 include:_spf-eu.ionos.com ~all"), parentDmarc: null, dkim: [DKIM, absent, absent] };

test("adresse et domaine parent", () => {
  assert.equal(senderDomain("Contact@InfraCyb.fr"), "infracyb.fr");
  assert.equal(senderDomain("pas une adresse"), "");
  assert.equal(parentDomain("go.infracyb.fr"), "infracyb.fr");
  assert.equal(parentDomain("infracyb.fr"), null);
});

test("strict seulement avec DMARC appliqué à 100 % et DKIM valide", () => {
  const none = senderHealth({ ...base, dmarc: rec("v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com") });
  assert.equal(none.strict, false);
  assert.equal(none.dmarc.policy, "none");
  assert.match(none.issues.join(" "), /p=none/);
  assert.equal(senderHealth({ ...base, dmarc: rec("v=DMARC1; p=quarantine; pct=25") }).strict, false);
  assert.equal(senderHealth({ ...base, dmarc: rec("v=DMARC1; p=quarantine") }).strict, true);
  assert.equal(senderHealth({ ...base, dmarc: rec("v=DMARC1; p=reject; pct=100") }).strict, true);
  const noDkim = senderHealth({ ...base, dkim: [absent, absent, absent], dmarc: rec("v=DMARC1; p=reject") });
  assert.deepEqual([noDkim.strict, noDkim.dkim], [false, "absent"]);
  assert.equal(senderHealth({ ...base, dmarc: absent }).dmarc.policy, "absent");
  // Lecture impossible : jamais strict.
  const unknown = senderHealth({ ...base, dmarc: err, dkim: [err, err, err] });
  assert.deepEqual([unknown.strict, unknown.dkim, unknown.dmarc.policy], [false, "inconnu", "inconnu"]);
});

test("sous-domaine d'envoi : DMARC hérité du parent (sp prioritaire sur p)", () => {
  const sub = { ...base, domain: "go.infracyb.fr", dmarc: absent };
  const h = senderHealth({ ...sub, parentDmarc: rec("v=DMARC1; p=none; sp=reject") });
  assert.deepEqual([h.strict, h.dmarc.policy, h.dmarc.inherited], [true, "reject", true]);
  assert.equal(senderHealth({ ...sub, parentDmarc: rec("v=DMARC1; p=quarantine") }).strict, true);
  assert.equal(senderHealth({ ...sub, parentDmarc: rec("v=DMARC1; p=none") }).strict, false);
  // Le DMARC propre du sous-domaine prime.
  assert.equal(senderHealth({ ...sub, dmarc: rec("v=DMARC1; p=none"), parentDmarc: rec("v=DMARC1; p=reject") }).strict, false);
});

test("montée en charge : 4 → 6 → 8 → 10 comme avant ; au-delà seulement avec un domaine strict, comptée depuis l'ancre", () => {
  const first = "2026-11-02"; // lundi
  assert.deepEqual([0, 2, 4, 6, 20].map((d) => rampLimit(first, addBiz(first, d), 10).limit), [4, 6, 8, 10, 10]);
  // Cible 30 sans domaine strict : bloquée à 10.
  assert.equal(rampLimit(first, addBiz(first, 40), 30).limit, 10);
  // Domaine strict depuis le 2026-12-01 : 10 ce jour-là, puis +5 tous les 2 jours ouvrés, jusqu'à 30.
  const anchor = "2026-12-01";
  assert.deepEqual([0, 1, 2, 4, 6, 8, 30].map((d) => rampLimit(first, addBiz(anchor, d), 30, { strict: true, anchor }).limit), [10, 10, 15, 20, 25, 30, 30]);
  assert.deepEqual(rampLimit(first, anchor, 30, { strict: true, anchor }).stages, [4, 6, 8, 10, 15, 20, 25, 30]);
  // Les paliers de base passent avant tout, même avec un domaine strict.
  assert.equal(rampLimit("2026-11-30", "2026-11-30", 30, { strict: true, anchor: "2026-11-30" }).limit, 4);
  assert.equal(baseRampDone(first, addBiz(first, 5)), false);
  assert.equal(baseRampDone(first, addBiz(first, 6)), true);
  assert.equal(baseRampDone(null, first), false);
  // Plafond total et indicateur de plafond retenu.
  const st = dailyState({ today: "2026-12-01", sentByOffer: {}, firstDiagnosticSendOn: first, auditLimit: 10, diagnosticTarget: 30, prescriberLimit: 10 });
  assert.deepEqual([st.diagnostic.limit, st.diagnostic.senderCapped, st.total.limit], [10, true, 30]);
  const ok = dailyState({ today: "2026-12-09", sentByOffer: {}, firstDiagnosticSendOn: first, auditLimit: 10, diagnosticTarget: 30, prescriberLimit: 10, senderStrict: true, rampAnchor: "2026-12-01" });
  assert.deepEqual([ok.diagnostic.limit, ok.diagnostic.senderCapped, ok.total.limit], [25, false, 50]);
});

test("rapport hebdomadaire : alerte tant que le domaine d'envoi n'est pas strict", () => {
  const r = composeWeeklyReport([], "2026-11-30", 0, { domain: "infracyb.fr", strict: false, issues: ["DMARC de infracyb.fr en « p=none »."] });
  assert.ok(r.alerts.some((a) => /Domaine d'envoi infracyb\.fr pas prêt/.test(a)));
  assert.ok(!composeWeeklyReport([], "2026-11-30", 0, { domain: "infracyb.fr", strict: true, issues: [] }).alerts.some((a) => /Domaine d'envoi/.test(a)));
});

/** n jours ouvrés après `from` (week-ends sautés ; aucun jour férié dans les dates utilisées). */
function addBiz(from: string, n: number): string {
  const d = new Date(from + "T12:00:00Z");
  for (let i = 0; i < n; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() % 6 !== 0) i++;
  }
  return d.toISOString().slice(0, 10);
}
