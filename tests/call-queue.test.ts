/** File d'appels du jour : ordre de passage et suite donnée à chaque résultat. */
import test from "node:test";
import assert from "node:assert/strict";
import { addBusinessDays, MAX_ATTEMPTS, planOutcome, rankQueue, telHref, type QueueEntry } from "../src/lib/call-queue";

const T = "2026-11-25"; // mercredi
const e = (taskId: string, p: Partial<QueueEntry> = {}): QueueEntry => ({ taskId, dueDate: T, viewedOn: "", replied: false, createdAt: 0, ...p });

test("ordre : synthèse consultée, puis réponse, puis retard (le plus ancien d'abord), puis le jour ; rien de futur", () => {
  const q = rankQueue(
    [
      e("jour"),
      e("futur", { dueDate: "2026-11-26" }),
      e("retard-recent", { dueDate: "2026-11-24" }),
      e("retard-ancien", { dueDate: "2026-11-20" }),
      e("repondu", { replied: true }),
      e("vu-ancien", { viewedOn: "2026-11-10" }), // consultation trop ancienne : plus « chaude »
      e("vu-hier", { viewedOn: "2026-11-24" }),
      e("vu-ce-matin", { viewedOn: T, dueDate: "2026-11-19" }),
    ],
    T,
  );
  assert.deepEqual(q.map((x) => x.taskId), ["vu-ce-matin", "vu-hier", "repondu", "retard-ancien", "retard-recent", "jour", "vu-ancien"]);
  assert.deepEqual(q.map((x) => x.heat), ["consulte", "consulte", "repondu", "retard", "retard", "jour", "jour"]);
});

test("jours ouvrés : week-ends et jours fériés sautés", () => {
  assert.equal(addBusinessDays(T, 2), "2026-11-27");
  assert.equal(addBusinessDays("2026-11-27", 2), "2026-12-01"); // vendredi → mardi
  assert.equal(addBusinessDays("2026-12-24", 1), "2026-12-28"); // Noël sauté
});

test("sans réponse : nouvel essai 2 jours ouvrés plus tard, abandon au 3e essai sans arrêter les mails", () => {
  const a = planOutcome("pas_de_reponse", { today: T, attempts: 0, company: "X" });
  assert.deepEqual([a.callResult, a.nextDue, a.stopSequence, a.stage], ["Pas de réponse", "2026-11-27", null, null]);
  assert.match(a.note, /Essai 1 sur 3/);
  const m = planOutcome("messagerie", { today: T, attempts: 1, company: "X" });
  assert.deepEqual([m.callResult, m.nextDue], ["Messagerie", "2026-11-27"]);
  const last = planOutcome("messagerie", { today: T, attempts: MAX_ATTEMPTS - 1, company: "X" });
  assert.deepEqual([last.nextDue, last.stopSequence], [null, null]);
  assert.match(last.note, /3 essais sans réponse/);
});

test("joint : rappel à la date choisie, intérêt, refus, rendez-vous", () => {
  const r = planOutcome("rappeler", { today: T, attempts: 2, date: "2026-12-02", company: "X" });
  assert.deepEqual([r.callResult, r.nextDue, r.stopSequence, r.stage], ["Joint", "2026-12-02", null, "contacte"]);
  const i = planOutcome("interesse", { today: T, attempts: 0, company: "Cabinet X" });
  assert.deepEqual([i.nextDue, i.stopSequence, i.stage], [null, "Intéressé au téléphone", "contacte"]);
  assert.match(i.followUp ?? "", /^Envoyer la synthèse à Cabinet X/);
  const n = planOutcome("pas_interesse", { today: T, attempts: 0, company: "X" });
  assert.deepEqual([n.nextDue, n.stopSequence, n.stage, n.followUp], [null, "Refus au téléphone", "perdu", null]);
  const d = planOutcome("rdv", { today: T, attempts: 0, date: "2026-12-01", company: "X" });
  assert.deepEqual([d.callResult, d.nextDue, d.stopSequence, d.stage], ["RDV obtenu", null, "RDV obtenu", "rdv"]);
  assert.match(d.note, /01\/12\/2026/);
});

test("lien tel: : chiffres seulement, + conservé, numéro trop court refusé", () => {
  assert.equal(telHref("06 98 03 22 38"), "tel:0698032238");
  assert.equal(telHref("+33 1 30 24 90 90"), "tel:+33130249090");
  assert.equal(telHref("0 809 40 01 73"), "tel:0809400173");
  assert.equal(telHref("12 34"), "");
  assert.equal(telHref("javascript:alert(1)"), "");
});

import { composeCallDigest, type QueueRow } from "../src/lib/call-queue";

test("mail du matin : rien si la file est vide, sinon chauds d'abord avec numéro et constat", () => {
  assert.equal(composeCallDigest([], "2026-11-26", "https://crm.exemple.fr"), null);
  const row = (o: Partial<QueueRow>): QueueRow => ({ taskId: "t", companyId: "c", company: "Croko", contact: "Lorris C.", phone: "06 15 50 33 19", tel: "tel:+33615503319", title: "Appeler Croko au 06 15 50 33 19 : DMARC en p=none sur croko.eu", heat: "retard", dueDate: "2026-11-24", opening: "", attempts: 0, ...o });
  const d = composeCallDigest([row({ heat: "consulte", company: "Vega" }), row({}), row({ attempts: 2 })], "2026-11-26", "https://crm.exemple.fr")!;
  assert.equal(d.subject, "3 appels à passer aujourd'hui · 1 prospect chaud · 2 en retard");
  assert.match(d.text, /^Appels du 26\/11\/2026/);
  assert.match(d.text, /1\. \[A consulté la synthèse\] Vega — Lorris C\.\n   06 15 50 33 19 · DMARC en p=none sur croko\.eu/);
  assert.match(d.text, /2 essai\(s\) sans réponse/);
  assert.match(d.text, /https:\/\/crm\.exemple\.fr\/appels/);
});
