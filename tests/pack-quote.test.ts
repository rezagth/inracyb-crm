import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOfferQuote, buildPackQuote, offerPitch, oneOffPart, recommendedOffers, suiviFromLines, SUIVI_LABEL, SUIVI_PME_LABEL, withAllOffers } from "../src/lib/pack-quote";
import { mailProvider, type Check } from "../src/lib/diagnostic";

test("devis Pack + Suivi : prix pilote tant qu'il reste des places, puis prix public", () => {
  const p = buildPackQuote({ slotsLeft: 2, today: "2026-11-26", domain: "Exemple.fr" });
  assert.equal(p.lines[0].unitPrice, "290,00");
  assert.equal(p.lines[1].unitPrice, "39,00");
  assert.equal(p.lines[1].quantity, 6);
  assert.equal(p.lines[1].unit, "mois");
  assert.match(p.subject, /pour exemple\.fr$/);
  assert.match(p.note, /témoignage/);
  assert.equal(p.dueDate, "2026-12-26");
  const pub = buildPackQuote({ slotsLeft: 0, today: "2026-11-26", domain: "" });
  assert.equal(pub.lines[0].unitPrice, "390,00");
  assert.equal(pub.lines[1].unitPrice, "49,00");
  assert.doesNotMatch(pub.note, /témoignage/);
  assert.doesNotMatch(pub.subject, /pour/);
});

test("acceptation : le contrat mensuel vient de la ligne d'abonnement seulement", () => {
  assert.deepEqual(suiviFromLines([{ label: `${SUIVI_LABEL} — abonnement mensuel`, unit: "mois", unitPriceCents: 3900 }]), { offer: "Suivi Courrier & Domaine", monthlyCents: 3900 });
  assert.deepEqual(suiviFromLines([{ label: "Kit", unit: "forfait", unitPriceCents: 45000 }, { label: `${SUIVI_PME_LABEL} — abonnement`, unit: "mois", unitPriceCents: 14900 }]), { offer: "Suivi Sécurité PME", monthlyCents: 14900 });
  assert.equal(suiviFromLines([{ label: "RSSI externalisé", unit: "mois", unitPriceCents: 103300 }]), null);
  assert.equal(suiviFromLines([{ label: SUIVI_LABEL, unit: "forfait", unitPriceCents: 3900 }]), null);
});

test("facture tirée du devis : sans l'abonnement, remise au prorata", () => {
  const lines = [
    { label: "Pack", unit: "forfait", quantity: 1, unitPriceCents: 29000 },
    { label: `${SUIVI_LABEL} — abonnement`, unit: "mois", quantity: 6, unitPriceCents: 3900 },
  ];
  const r = oneOffPart(lines, 52400);
  assert.equal(r.lines.length, 1);
  assert.equal(r.baseHtCents, 29000);
  assert.equal(r.excluded, true);
  assert.equal(oneOffPart(lines, 47160).baseHtCents, 26100); // remise de 10 %
  assert.deepEqual(oneOffPart([lines[0]], 29000), { lines: [lines[0]], baseHtCents: 29000, excluded: false });
});

const chk = (id: string, status: Check["status"], proof: string, variant = ""): Check => ({ id, label: id, status, certain: true, proof, wording: "", rank: 3, variant });
const M365 = [chk("mx", "conforme", "0 exemple-fr.mail.protection.outlook.com."), chk("spf", "conforme", "v=spf1 include:spf.protection.outlook.com -all")];

test("messagerie déduite des mesures : Microsoft 365 (MX ou SPF derrière un filtre), Google, autre, rien", () => {
  assert.equal(mailProvider(M365), "microsoft365");
  assert.equal(mailProvider([chk("mx", "conforme", "10 vade-mx-fr01.hornetsecurity.com."), chk("spf", "conforme", "v=spf1 a:smtp-gw1.silae.fr include:spf.protection.outlook.com ~all")]), "microsoft365");
  assert.equal(mailProvider([chk("mx", "conforme", "1 aspmx.l.google.com.")]), "google");
  assert.equal(mailProvider([chk("mx", "conforme", "1 mail2.vega-net.net.")]), "autre");
  assert.equal(mailProvider([chk("mx", "erreur", "")]), "");
  assert.equal(mailProvider([]), "");
});

test("offre recommandée : faux RIB pour agences et cabinets, dossier pour éditeurs, Microsoft 365, Pack sur constat", () => {
  const dmarc = chk("dmarc", "constat", "v=DMARC1; p=none", "dmarc-none");
  assert.deepEqual(recommendedOffers({ segment: "immobilier", checks: [...M365, dmarc] }), ["kit", "m365"]);
  assert.deepEqual(recommendedOffers({ segment: "editeurs", checks: [...M365, dmarc] }), ["dossier", "m365", "pack"]);
  assert.deepEqual(recommendedOffers({ segment: "", checks: [dmarc] }), ["pack"]);
  assert.deepEqual(recommendedOffers({ segment: "", checks: [] }), []);
  assert.deepEqual(withAllOffers(["m365"]), ["m365", "pack", "kit", "dossier"]);
});

test("devis des nouvelles offres : forfait au prix pilote puis public, abonnement 149 € sur 12 mois", () => {
  const kit = buildOfferQuote("kit", { slotsLeft: 1, today: "2026-11-26", domain: "agence.fr" });
  assert.equal(kit.lines[0].unitPrice, "450,00");
  assert.deepEqual([kit.lines[1].quantity, kit.lines[1].unit, kit.lines[1].unitPrice], [12, "mois", "149,00"]);
  assert.ok(kit.lines[1].label.startsWith(SUIVI_PME_LABEL));
  assert.match(kit.note, /témoignage/);
  assert.match(kit.subject, /agence\.fr$/);
  assert.equal(buildOfferQuote("kit", { slotsLeft: 0, today: "2026-11-26", domain: "" }).lines[0].unitPrice, "590,00");
  assert.equal(buildOfferQuote("m365", { slotsLeft: 2, today: "2026-11-26", domain: "" }).lines[0].unitPrice, "390,00");
  const dossier = buildOfferQuote("dossier", { slotsLeft: 2, today: "2026-11-26", domain: "" });
  assert.equal(dossier.lines[0].unitPrice, "690,00");
  assert.doesNotMatch(dossier.note, /témoignage/); // pas de prix pilote sur le dossier
  assert.equal(buildOfferQuote("pack", { slotsLeft: 2, today: "2026-11-26", domain: "" }).lines[0].unitPrice, "290,00");
  // La facture tirée du devis ne reprend jamais l'abonnement à 149 €.
  const lines = kit.lines.map((l) => ({ label: l.label, unit: l.unit, quantity: l.quantity, unitPriceCents: Math.round(Number(l.unitPrice.replace(",", ".")) * 100) }));
  assert.equal(oneOffPart(lines, 45000 + 12 * 14900).baseHtCents, 45000);
});

test("phrases d'offre de la synthèse : prix pilote affiché seulement quand il existe", () => {
  assert.match(offerPitch("kit", 2), /450\s€ HT pour les 3 premiers clients, au lieu de 590\s€ HT\.$/);
  assert.match(offerPitch("m365", 0), /coûte 490\s€ HT\.$/);
  assert.match(offerPitch("dossier", 3), /: 690\s€ HT\.$/);
});
