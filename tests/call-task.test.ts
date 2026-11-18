/** Tâche d'appel J+4 : constat repris à l'identique, jour, cas où aucune tâche n'est créée. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildCallTask, hasUsablePhone, type CallTaskInput } from "../src/lib/call-task";
import { HOOK_TEXT } from "../src/lib/diagnostic-mails";

const base: CallTaskInput = { company: "Cabinet Dupont", contactName: "Marie Dupont", phone: "01 23 45 67 89", hook: "dmarc-absent", domain: "dupont.fr", me: "Alex", sentOn: "2026-11-20" };

test("l'appel est prévu le lendemain du mail J+3, priorité haute, avec le constat validé", () => {
  const t = buildCallTask(base)!;
  assert.equal(t.dueDate, "2026-11-21");
  assert.equal(t.priority, "haute");
  assert.match(t.title, /^Appeler Cabinet Dupont au 01 23 45 67 89 : DMARC absent sur dupont\.fr$/);
  const finding = HOOK_TEXT["dmarc-absent"].finding.replace("{domaine}", "dupont.fr");
  assert.ok(t.opening.includes(finding), "la phrase de constat est reprise mot pour mot");
  assert.ok(t.opening.startsWith("Bonjour Marie Dupont, Alex d'InfraCyb."));
  assert.ok(!t.opening.includes("{") && !t.opening.includes("["));
});

test("changement de mois : le jour suivant est calculé correctement", () => {
  assert.equal(buildCallTask({ ...base, sentOn: "2026-11-30" })!.dueDate, "2026-12-01");
});

test("sans téléphone utilisable, constat inconnu ou domaine vide : aucune tâche", () => {
  assert.equal(buildCallTask({ ...base, phone: "" }), null);
  assert.equal(buildCallTask({ ...base, phone: "01 23" }), null);
  assert.equal(buildCallTask({ ...base, hook: "hsts-absent" }), null);
  assert.equal(buildCallTask({ ...base, domain: "" }), null);
  assert.ok(hasUsablePhone("+33 1 23 45 67 89"));
});

test("adresse générique : l'appel commence par « Bonjour » sans nom", () => {
  assert.ok(buildCallTask({ ...base, contactName: "" })!.opening.startsWith("Bonjour, Alex d'InfraCyb."));
});

test("certificat : avec la date, phrase validée ; sans date, on ne devine rien", () => {
  const withDate = buildCallTask({ ...base, hook: "tls-expire", domain: "www.dupont.fr", expiry: "2026-11-10" })!;
  assert.ok(withDate.opening.includes("a expiré le 10/11/2026"));
  const noDate = buildCallTask({ ...base, hook: "tls-expire", domain: "www.dupont.fr" })!;
  assert.ok(noDate.opening.includes("voir le diagnostic de la fiche"));
  assert.ok(!noDate.opening.includes("{") && !noDate.opening.includes("undefined"));
});

test("les valeurs venues de l'extérieur sont nettoyées (retours à la ligne, longueur)", () => {
  const t = buildCallTask({ ...base, company: "Evil\nSARL " + "x".repeat(500) })!;
  assert.ok(!t.title.includes("\n"));
  assert.ok(t.title.length < 400);
});
