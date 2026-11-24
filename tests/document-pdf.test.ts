import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { computeTotals } from "../src/lib/billing";
import { documentModel, documentPdfFilename, pdfSafe, renderDocumentPdf, type DocInput, type DocSettings } from "../src/lib/document-pdf";

const settings: DocSettings = {
  tradeName: "InfraCyb",
  legalName: "Camille Martin",
  legalForm: "Entrepreneur individuel (micro-entreprise)",
  address: "1 rue de la Paix\n75002 Paris",
  siret: "123 456 789 00012",
  email: "contact@exemple.fr",
  phone: "01 02 03 04 05",
  website: "exemple.fr",
  tvaFranchise: true,
  payMethod: "Virement bancaire",
  iban: "FR76 0000 0000 0000 0000 0000 000",
  payLink: "",
  latePenalty: "3 fois le taux d'intérêt légal",
  payDays: 30,
};

const lines = [
  { label: "Audit de sécurité", quantity: 1, unit: "forfait", unitPriceCents: 150_000 },
  { label: "Accompagnement RSSI", quantity: 2.5, unit: "jour", unitPriceCents: 60_000 },
];

function input(over: Partial<DocInput> = {}): DocInput {
  const s = over.settings ?? settings;
  return {
    kind: "facture",
    number: "F-2026-001",
    issueDate: "2026-11-02",
    dueDate: "2026-12-02",
    subject: "Audit de sécurité",
    note: "",
    discountBp: 0,
    lines,
    totals: computeTotals(lines, 0, s.tvaFranchise),
    company: { name: "Acme SAS", address: "10 avenue des Tests", city: "69000 Lyon", siren: "987654321", contacts: [{ firstName: "Léa", lastName: "Durand", role: "DAF" }] },
    settings: s,
    ...over,
  };
}

const all = (m: ReturnType<typeof documentModel>) => [...m.issuer, ...m.meta, ...m.client, ...m.mentions, ...m.totals.map((t) => `${t.label} ${t.value}`)].join("\n");

test("facture en franchise de TVA : 293 B, échéance, IBAN, pénalités, 40 €, pas d'escompte, SIRET", () => {
  const txt = all(documentModel(input()));
  for (const must of ["TVA non applicable, art. 293 B du CGI.", "au plus tard le 02/12/2026", "IBAN : FR76", "Pas d'escompte pour paiement anticipé.", "3 fois le taux d'intérêt légal", "40 €", "L441-10", "SIRET 123 456 789 00012", "N° F-2026-001", "Échéance : 02/12/2026", "Net à payer", "SIREN 987654321", "À l'attention de Léa Durand, DAF"]) {
    assert.ok(txt.includes(must), `mention absente : ${must}`);
  }
});

test("facture avec TVA : TVA 20 % et Total TTC, sans la mention 293 B", () => {
  const s = { ...settings, tvaFranchise: false };
  const m = documentModel(input({ settings: s, totals: computeTotals(lines, 0, false) }));
  const txt = all(m);
  assert.ok(!txt.includes("293 B"));
  assert.ok(m.totals.some((t) => t.label === "TVA 20 %"));
  assert.ok(m.totals.some((t) => t.label === "Total TTC" && t.strong));
});

test("paiement partiel : déjà réglé et reste dû ; lien de paiement repris", () => {
  const s = { ...settings, payLink: "https://paiement.exemple.fr/x" };
  const m = documentModel(input({ settings: s, totals: computeTotals(lines, 0, true, 50_000) }));
  assert.ok(m.totals.some((t) => t.label === "Déjà réglé"));
  assert.ok(m.totals.some((t) => t.label === "Reste dû" && t.strong));
  assert.ok(m.mentions.some((x) => x.includes("Paiement en ligne : https://paiement.exemple.fr/x")));
});

test("avoir : référence de la facture annulée, aucune condition de paiement", () => {
  const m = documentModel(input({ kind: "avoir", number: "AV-2026-001", creditFor: "F-2026-001" }));
  assert.ok(m.meta.includes("Annule la facture F-2026-001"));
  assert.ok(m.totals.some((t) => t.label === "Total de l'avoir"));
  assert.ok(!m.mentions.some((x) => x.includes("pénalités") || x.includes("Paiement à réception")));
});

test("devis : validité, conditions de paiement, bon pour accord (signé ou non)", () => {
  const m = documentModel(input({ kind: "devis", number: "D-2026-004" }));
  assert.ok(m.meta.includes("Valable jusqu'au 02/12/2026"));
  assert.ok(m.mentions.some((x) => x.includes("Conditions de paiement : 30 jours")));
  assert.equal(m.signature?.left[0], "Bon pour accord");
  const signed = documentModel(input({ kind: "devis", number: "D-2026-004", signedBy: "Léa Durand" }));
  assert.ok(signed.signature?.left[1].startsWith("Accepté par Léa Durand"));
});

test("remise : sous-total et remise affichés", () => {
  const m = documentModel(input({ discountBp: 1000, totals: computeTotals(lines, 1000, true) }));
  assert.ok(m.totals.some((t) => t.label === "Remise 10 %"));
});

test("les caractères hors des polices standard sont remplacés, jamais une erreur", async () => {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  assert.equal(pdfSafe("1 500,00 € − « é » 😀", f), "1 500,00 € - « é » ?");
});

test("PDF valide, plusieurs pages si les lignes débordent", async () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ label: `Prestation ${i + 1} avec un libellé assez long pour passer sur deux lignes dans la colonne désignation 😀`, quantity: 1, unit: "jour", unitPriceCents: 10_000 }));
  const bytes = await renderDocumentPdf(input({ lines: many, totals: computeTotals(many, 0, true), note: "Merci pour votre confiance.\nÀ bientôt." }));
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  const back = await PDFDocument.load(bytes);
  assert.ok(back.getPageCount() > 1);
  assert.equal(back.getTitle(), "Facture F-2026-001");
});

test("nom de fichier sûr", () => {
  assert.equal(documentPdfFilename("facture", "F-2026-001"), "Facture-F-2026-001.pdf");
  assert.equal(documentPdfFilename("devis", 'D/2026"1'), "Devis-D_2026_1.pdf");
});
