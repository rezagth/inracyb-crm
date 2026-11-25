import { test } from "node:test";
import assert from "node:assert/strict";
import { BROKER_TYPE, PRESCRIBER_TYPE, commissionDue, commissionLabelFor, commissionTaskTitle, earnsCommission, isRegulatedPartner, partnerTypeFor, referralDiscountBp, type InvoiceForCommission } from "../src/lib/referrals";

const broker = { type: BROKER_TYPE, name: "InfoGérance Lyon", specialty: "Prestataire IT", sector: "Numérique" };
const inv = (o: Partial<InvoiceForCommission>): InvoiceForCommission => ({ id: "i1", number: "F-2026-010", kind: "facture", status: "payee", issueDate: "2026-11-02", totalHtCents: 39_000, payments: [{ date: "2026-11-20", amountCents: 39_000 }], ...o });

test("type de fiche Partenaire et mention de commission selon le prescripteur", () => {
  assert.equal(partnerTypeFor("reglemente"), PRESCRIBER_TYPE);
  assert.equal(partnerTypeFor("partenaire"), BROKER_TYPE);
  assert.match(commissionLabelFor("reglemente"), /^Aucune \(remise de 10 % au client\)$/);
  assert.equal(commissionLabelFor("partenaire"), "15 % HT de la 1re facture");
});

test("profession réglementée : par le secteur de la fiche, sinon par le nom ou la spécialité ; jamais de commission", () => {
  assert.equal(isRegulatedPartner({ type: BROKER_TYPE, name: "Cabinet Durand", specialty: "", sector: "Expertise comptable" }), true);
  // La fiche d'exemple « Expert-comptable apporteur d'affaires » : réglementée malgré son type.
  const seeded = { type: BROKER_TYPE, name: "Expert-comptable apporteur d'affaires (à contacter)", specialty: "Réseau de TPE et cabinets" };
  assert.equal(isRegulatedPartner(seeded), true);
  assert.equal(earnsCommission(seeded), false);
  assert.equal(commissionDue(seeded, [inv({})]), null);
  for (const name of ["Maître Martin, avocat", "Office notarial du Rhône"]) assert.equal(earnsCommission({ type: BROKER_TYPE, name, specialty: "" }), false, name);
  assert.equal(earnsCommission(broker), true);
  assert.equal(earnsCommission({ ...broker, type: "Partenaire (j'oriente)" }), false);
});

test("remise du client recommandé : 10 % pour un prescripteur réglementé, rien pour un apporteur", () => {
  assert.equal(referralDiscountBp({ type: PRESCRIBER_TYPE, name: "Cabinet X", specialty: "" }), 1000);
  assert.equal(referralDiscountBp({ type: BROKER_TYPE, name: "Cabinet Y", specialty: "", sector: "Notariat" }), 1000);
  assert.equal(referralDiscountBp(broker), 0);
  assert.equal(referralDiscountBp(null), 0);
});

test("commission : 15 % du HT de la première facture soldée, à verser 30 jours après le dernier encaissement", () => {
  const due = commissionDue(broker, [
    inv({ id: "i2", number: "F-2026-020", issueDate: "2026-12-01" }),
    inv({ payments: [{ date: "2026-11-10", amountCents: 20_000 }, { date: "2026-11-25", amountCents: 19_000 }] }),
  ]);
  assert.deepEqual(due, { invoiceId: "i1", number: "F-2026-010", baseHtCents: 39_000, amountCents: 5850, dueDate: "2026-12-25" });
});

test("commission : rien tant que la première facture n'est pas soldée ; avoirs, brouillons et annulées ignorés", () => {
  assert.equal(commissionDue(broker, [inv({ status: "envoyee" })]), null); // partiellement payée ou en attente
  assert.equal(commissionDue(broker, []), null);
  // La première facture a été annulée par un avoir : la suivante devient la première.
  const due = commissionDue(broker, [
    inv({ id: "a", number: "F-2026-001", issueDate: "2026-10-01", status: "annulee" }),
    inv({ id: "av", number: "AV-2026-001", kind: "avoir", issueDate: "2026-10-02", status: "emis", totalHtCents: -39_000 }),
    inv({ id: "b", number: "BROUILLON-x", issueDate: "2026-09-01", status: "brouillon" }),
    inv({ id: "c", number: "F-2026-005" }),
  ]);
  assert.equal(due?.invoiceId, "c");
  // Seule la première compte : la seconde, même soldée, ne déclenche rien si la première ne l'est pas.
  assert.equal(commissionDue(broker, [inv({ status: "envoyee" }), inv({ id: "z", number: "F-2026-099", issueDate: "2026-12-15" })]), null);
});

test("titre de la tâche de versement : stable (sert à ne jamais la créer deux fois)", () => {
  assert.equal(commissionTaskTitle("InfoGérance Lyon", "F-2026-010", "58,50 €"), "Verser la commission de 58,50 € à InfoGérance Lyon (facture F-2026-010)");
});
