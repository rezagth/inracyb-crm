import { test } from "node:test";
import assert from "node:assert/strict";
import { creditNoteMail, invoiceMail, mailtoHref, quoteMail, reminderMail } from "../src/lib/billing-mails";

const sender = { legalName: "Camille Martin", tradeName: "InfraCyb", phone: "01 02 03 04 05", iban: "FR76 0000", payLink: "https://paiement.exemple.fr/x", latePenalty: "3 fois le taux d'intérêt légal" };
const norm = (x: string) => x.replace(/[  ]/g, " ");

test("envoi de facture : numéro, montant TTC, échéance, IBAN, lien de paiement, signature", () => {
  const m = invoiceMail({ number: "F-2026-001", subject: "Audit", totalTtcCents: 270_000, dueDate: "2026-12-02", firstName: "Léa", sender });
  assert.equal(m.subject, "Facture F-2026-001 — Audit");
  const t = norm(m.text);
  for (const must of ["Bonjour Léa,", "facture F-2026-001", "2 700,00 €", "02/12/2026", "IBAN : FR76 0000", "Paiement en ligne : https://paiement.exemple.fr/x", "Camille Martin\nInfraCyb\n01 02 03 04 05"]) assert.ok(t.includes(must), must);
});

test("sans prénom ni IBAN : pas de « Bonjour , », pas de ligne IBAN vide", () => {
  const m = invoiceMail({ number: "F-1", subject: "x", totalTtcCents: 100, dueDate: "2026-12-02", firstName: "", sender: { ...sender, iban: "", payLink: "" } });
  assert.ok(m.text.startsWith("Bonjour,\n"));
  assert.ok(!m.text.includes("IBAN"));
});

test("devis : montant HT et validité", () => {
  const m = quoteMail({ number: "D-2026-004", subject: "Audit", totalHtCents: 300_000, validUntil: "2026-12-31", firstName: "Léa", sender });
  assert.equal(m.subject, "Devis D-2026-004 — Audit");
  assert.ok(norm(m.text).includes("3 000,00 € HT, valable jusqu'au 31/12/2026"));
});

test("avoir : référence de la facture annulée, montant positif", () => {
  const m = creditNoteMail({ number: "AV-2026-001", creditFor: "F-2026-001", totalTtcCents: -270_000, firstName: "Léa", sender });
  assert.ok(m.subject.includes("annule la facture F-2026-001"));
  assert.ok(norm(m.text).includes("2 700,00 €") && !norm(m.text).includes("-2 700"));
});

test("relances : reste dû, jours de retard, pénalités et 40 € à partir de la relance ferme", () => {
  const base = { number: "F-2026-001", issueDate: "2026-10-01", dueDate: "2026-10-31", restCents: 220_000, lateDays: 16, firstName: "Léa", sender };
  const r1 = reminderMail(1, base);
  assert.equal(r1.subject, "Rappel — facture F-2026-001");
  assert.ok(norm(r1.text).includes("2 200,00 €") && !r1.text.includes("40 €"));
  const r2 = reminderMail(2, base);
  assert.equal(r2.subject, "Relance — facture F-2026-001 échue depuis 16 jours");
  assert.ok(r2.text.includes("3 fois le taux d'intérêt légal") && r2.text.includes("40 €"));
  const r3 = reminderMail(3, base);
  assert.ok(r3.subject.startsWith("Mise en demeure") && r3.text.includes("recommandée"));
  assert.ok(reminderMail(2, { ...base, lateDays: -3 }).subject.endsWith("depuis 0 jours"));
});

test("mailto : absent sans adresse, encodé sinon", () => {
  const m = { subject: "a & b", text: "x\ny" };
  assert.equal(mailtoHref(undefined, m), null);
  assert.equal(mailtoHref("a@b.fr", m), "mailto:a@b.fr?subject=a%20%26%20b&body=x%0Ay");
});
