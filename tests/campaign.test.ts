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

// ——— Deux services : plafonds, paliers, exclusion croisée, délai de repos ———
import { businessDaysSince, crossHistory, dailyState, entryExclusion, isBusinessDay, isFrenchHoliday, parseLimit, pickDueByService, rampLimit, serviceOf } from "../src/lib/campaign";

test("service d'un envoi : seul le diagnostic sort du service audit", () => {
  assert.deepEqual(["audit", "ciso", "ia", "diagnostic", "inconnu"].map(serviceOf), ["audit", "audit", "audit", "diagnostic", "audit"]);
});

test("plafond facultatif : valeur par défaut si absent ou invalide, borné à 300", () => {
  assert.equal(parseLimit(undefined, 10), 10);
  assert.equal(parseLimit("", 10), 10);
  assert.equal(parseLimit("abc", 10), 10);
  assert.equal(parseLimit("0", 10), 10);
  assert.equal(parseLimit("-5", 10), 10);
  assert.equal(parseLimit("25", 10), 25);
  assert.equal(parseLimit("9999", 10), 300);
});

test("jours fériés et jours ouvrés (France)", () => {
  for (const d of ["2026-01-01", "2026-04-06", "2026-05-01", "2026-05-08", "2026-05-14", "2026-05-25", "2026-07-14", "2026-08-15", "2026-11-01", "2026-11-11", "2026-12-25", "2027-03-29"]) assert.equal(isFrenchHoliday(d), true, d);
  for (const d of ["2026-04-05", "2026-11-10", "2026-11-12", "2026-12-24"]) assert.equal(isFrenchHoliday(d), false, d);
  assert.equal(isBusinessDay("2026-11-16"), true); // lundi
  assert.equal(isBusinessDay("2026-11-14"), false); // samedi
  assert.equal(isBusinessDay("2026-11-11"), false); // mercredi férié
  assert.equal(businessDaysSince("2026-11-09", "2026-11-13"), 3); // mardi, jeudi, vendredi : le 11 ne compte pas
  assert.equal(businessDaysSince("2026-11-13", "2026-11-16"), 1); // le week-end ne compte pas
  assert.equal(businessDaysSince("2026-11-16", "2026-11-16"), 0);
});

test("paliers du diagnostic : 4, 6, 8, 10, un palier tous les 2 jours ouvrés depuis le premier envoi réel", () => {
  const first = "2026-11-16"; // lundi
  const at = (d: string) => rampLimit(first, d, 10).limit;
  assert.equal(rampLimit(null, "2026-11-16", 10).limit, 4); // rien d'envoyé : premier palier
  assert.deepEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25", "2027-01-15"].map(at), [4, 4, 6, 6, 8, 8, 10, 10, 10]);
  assert.equal(at("2026-11-21"), 8); // le samedi ne fait pas avancer le palier
  assert.deepEqual(rampLimit(first, "2026-11-18", 10), { limit: 6, stage: 1, stages: [4, 6, 8, 10], target: 10 });
  // Une cible plus basse plafonne chaque palier ; une cible plus haute ne s'applique qu'après le dernier palier.
  assert.deepEqual(rampLimit(first, "2026-11-20", 5).stages, [4, 5, 5, 5]);
  assert.equal(rampLimit(first, "2026-11-20", 5).limit, 5);
  assert.equal(rampLimit(first, "2026-11-20", 30).limit, 8);
  assert.equal(rampLimit(first, "2026-11-24", 30).limit, 30);
});

test("état du jour : plafond par service et total, sans aucune variable d'environnement", () => {
  const s = dailyState({ today: "2026-11-18", sentByOffer: { audit: 5, ciso: 2, ia: 1, diagnostic: 3 }, firstDiagnosticSendOn: "2026-11-16", auditLimit: 10, diagnosticTarget: 10 });
  assert.deepEqual(s.audit, { limit: 10, sent: 8, remaining: 2 }); // audit + RSSI + IA : même périmètre qu'avant
  assert.deepEqual({ limit: s.diagnostic.limit, sent: s.diagnostic.sent, remaining: s.diagnostic.remaining }, { limit: 6, sent: 3, remaining: 3 });
  assert.deepEqual(s.total, { limit: 20, sent: 11, remaining: 9 });
  // Sans envoi diagnostic, le service audit se comporte exactement comme le plafond unique d'avant.
  const before = dailyState({ today: "2026-11-18", sentByOffer: { audit: 10 }, firstDiagnosticSendOn: null, auditLimit: 10, diagnosticTarget: 10 });
  assert.equal(before.audit.remaining, 0);
  assert.equal(before.diagnostic.remaining, 4);
  // Jamais de reste négatif, total borné.
  const over = dailyState({ today: "2026-11-18", sentByOffer: { audit: 400 }, firstDiagnosticSendOn: null, auditLimit: 300, diagnosticTarget: 300 });
  assert.equal(over.audit.remaining, 0);
  assert.equal(over.total.limit, 300);
  assert.equal(over.total.remaining, 0);
});

test("choix des mails du jour : chaque service dans son plafond, l'ensemble dans le total", () => {
  const mk = (id: string, service: "audit" | "diagnostic", nextDue: string) => ({ id, service, nextDue });
  const items = [mk("a1", "audit", "2026-11-10"), mk("a2", "audit", "2026-11-12"), mk("a3", "audit", "2026-11-13"), mk("d1", "diagnostic", "2026-11-09"), mk("d2", "diagnostic", "2026-11-11"), mk("d3", "diagnostic", "2026-11-30")];
  const state = (auditSent: number, diagSent: number, totalLimit?: number) => {
    const s = dailyState({ today: "2026-11-16", sentByOffer: { audit: auditSent, diagnostic: diagSent }, firstDiagnosticSendOn: null, auditLimit: 10, diagnosticTarget: 10 });
    return totalLimit === undefined ? s : { ...s, total: { limit: totalLimit, sent: s.total.sent, remaining: Math.max(0, totalLimit - s.total.sent) } };
  };
  const ids = (s: ReturnType<typeof state>) => pickDueByService(items, "2026-11-16", s).map((i) => i.id);
  assert.deepEqual(ids(state(0, 0)), ["d1", "a1", "d2", "a2", "a3"]); // d3 n'est pas dû
  assert.deepEqual(ids(state(8, 0)), ["d1", "a1", "d2", "a2"]); // audit : 2 restants
  assert.deepEqual(ids(state(10, 0)), ["d1", "d2"]); // audit plein : le diagnostic part quand même
  assert.deepEqual(ids(state(0, 3)), ["d1", "a1", "a2", "a3"]); // diagnostic : palier 4, 1 restant
  assert.deepEqual(ids(state(0, 4)), ["a1", "a2", "a3"]); // diagnostic plein : l'audit part quand même
  assert.deepEqual(ids(state(0, 0, 3)), ["d1", "a1", "d2"]); // total : les plus en retard d'abord
  assert.deepEqual(ids(state(2, 1, 3)), []); // total atteint
});

test("passage d'un service à l'autre : réponse, délai de repos, diagnostic reçu une seule fois", () => {
  const c = { id: "c1", name: "A", stage: "contacte", email: "a@x.fr" };
  const none = new Set<string>();
  const T = "2026-11-16";
  const ex = (target: "audit" | "diagnostic", sends: { offer: string; sentOn: string }[], replied: string[] = [], rest = 30) => entryExclusion(c, none, none, target, crossHistory(target, sends, replied), T, rest);
  // Séquence d'audit terminée depuis moins de 30 jours : repos. À 30 jours pile : éligible.
  assert.equal(ex("diagnostic", [{ offer: "audit", sentOn: "2026-10-01" }, { offer: "audit", sentOn: "2026-10-18" }]), "repos");
  assert.equal(ex("diagnostic", [{ offer: "audit", sentOn: "2026-10-17" }]), null);
  assert.equal(ex("diagnostic", [{ offer: "audit", sentOn: "2026-10-17" }], [], 45), "repos"); // délai configurable
  assert.equal(ex("diagnostic", [{ offer: "ciso", sentOn: "2026-11-10" }]), "repos"); // RSSI et IA comptent comme l'audit
  // Une réponse dans l'autre service ferme la porte, quel que soit le délai.
  assert.equal(ex("diagnostic", [{ offer: "audit", sentOn: "2026-01-05" }], ["audit"]), "a-repondu");
  // Le diagnostic ne se reçoit qu'une fois.
  assert.equal(ex("diagnostic", [{ offer: "diagnostic", sentOn: "2026-02-01" }]), "deja-diagnostique");
  // Et l'inverse : après un diagnostic, l'audit attend le repos.
  assert.equal(ex("audit", [{ offer: "diagnostic", sentOn: "2026-11-01" }]), "repos");
  assert.equal(ex("audit", [{ offer: "diagnostic", sentOn: "2026-09-01" }]), null);
  assert.equal(ex("audit", [{ offer: "diagnostic", sentOn: "2026-09-01" }], ["diagnostic"]), "a-repondu");
  // Les règles de toujours priment : désinscrite, perdue, cliente, déjà en campagne (tous services confondus).
  const h = crossHistory("diagnostic", [{ offer: "audit", sentOn: "2026-01-05" }], []);
  assert.equal(entryExclusion(c, new Set(["a@x.fr"]), none, "diagnostic", h, T), "desinscrit");
  assert.equal(entryExclusion({ ...c, stage: "perdu" }, none, none, "diagnostic", h, T), "perdu");
  assert.equal(entryExclusion({ ...c, stage: "gagne" }, none, none, "diagnostic", h, T), "avance");
  assert.equal(entryExclusion(c, none, new Set(["c1"]), "diagnostic", h, T), "deja-en-campagne");
  assert.equal(entryExclusion(c, none, new Set(["c1"]), "audit", undefined, T), "deja-en-campagne");
});

test("non-régression audit : sans historique diagnostic, l'éligibilité est exactement celle d'avant", () => {
  const optouts = new Set(["stop@x.fr"]);
  const inC = new Set(["c9"]);
  const T = "2026-11-16";
  const cases = [
    { id: "c1", name: "A", stage: "qualif", email: "a@x.fr" },
    { id: "c1", name: "A", stage: "contacte", email: "a@x.fr" },
    { id: "c1", name: "A", stage: "perdu", email: "a@x.fr" },
    { id: "c1", name: "A", stage: "rdv", email: "a@x.fr" },
    { id: "c1", name: "A", stage: "qualif", email: "" },
    { id: "c1", name: "A", stage: "qualif", email: "pas-un-mail" },
    { id: "c1", name: "A", stage: "qualif", email: "STOP@x.fr" },
    { id: "c9", name: "A", stage: "qualif", email: "a@x.fr" },
  ];
  // Historique purement audit : envois récents, même une réponse à une ancienne séquence d'audit.
  const sends = [{ offer: "audit", sentOn: "2026-11-15" }, { offer: "ia", sentOn: "2026-11-16" }];
  for (const c of cases) {
    assert.equal(entryExclusion(c, optouts, inC, "audit", undefined, T), exclusionOf(c, optouts, inC));
    assert.equal(entryExclusion(c, optouts, inC, "audit", crossHistory("audit", sends, ["audit"]), T), exclusionOf(c, optouts, inC));
  }
});
