import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allowedNumbers, barometreFacts, barometreFrom, CYBER_FACTS, nextPostDates, numbersIn, OFFER_FACTS, pickRecyclable, themeOf, validateGeneratedPost, type GeneratedPost } from "../src/lib/post-generator";

const ck = (id: string, status: string, proof = "", variant = "") => ({ id, label: id, status, certain: true, proof, wording: "", rank: 1, variant });
const row = (checks: unknown[], on = "2026-11-20") => ({ findings: JSON.stringify(checks), checkedOn: on });
const rows = [
  ...Array.from({ length: 10 }, () => row([ck("mx", "conforme", "0 x.mail.protection.outlook.com."), ck("dmarc", "constat", "v=DMARC1; p=none", "dmarc-none"), ck("spf", "conforme", "v=spf1 ~all")])),
  ...Array.from({ length: 10 }, () => row([ck("mx", "conforme", "1 aspmx.l.google.com."), ck("dmarc", "conforme", "v=DMARC1; p=reject")], "2026-11-25")),
  row([ck("mx", "info", "Aucun MX")]),
];
const B = barometreFrom(rows);
const facts = [...barometreFacts(B), ...CYBER_FACTS, ...OFFER_FACTS];

test("baromètre en direct : domaines qui reçoivent des mails seulement, rien sous 20 entreprises", () => {
  assert.deepEqual({ n: B.sample, none: B.dmarcNone, ok: B.dmarcEnforce, m365: B.m365, google: B.google, soft: B.spfSoft, from: B.from, to: B.to }, { n: 20, none: 10, ok: 10, m365: 10, google: 10, soft: 10, from: "2026-11-20", to: "2026-11-25" });
  assert.match(barometreFacts(B)[0].text, /^50 % des 20 PME analysées/);
  assert.deepEqual(barometreFacts(barometreFrom(rows.slice(0, 5))), []);
});

test("nombres : séparateurs de milliers et décimales normalisés", () => {
  assert.deepEqual(numbersIn("420 000 demandes, +49,9 %, 5,4 millions et 3 vérifications en 2027"), ["420000", "49,9", "5,4", "3", "2027"]);
});

test("calendrier : jours ouvrés après le dernier post prévu, sans férié ni date déjà prise ; thème du jour", () => {
  assert.deepEqual(nextPostDates("2026-12-28", ["2026-12-29", "2026-12-31"], 4), ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"]);
  assert.equal(nextPostDates("2026-12-21", [], 5).includes("2026-12-25"), false);
  assert.equal(themeOf("2027-01-04").name, "Un chiffre");
  assert.equal(themeOf("2027-01-08").name, "Coulisses ou question");
});

const ctx = { dates: ["2027-01-04"], allowed: allowedNumbers(facts), names: ["Vega Informatique", "Croko"], recentTopics: ["Le faux RIB, expliqué simplement"] };
const good: GeneratedPost = {
  date: "2027-01-04",
  topic: "Ce que dit un DMARC en p=none",
  pillar: "Expertise",
  body: "50 % des PME de mon baromètre ont un DMARC qui ne bloque rien.\n\nConcrètement, un escroc peut envoyer un mail avec leur adresse exacte.\n\nLa bonne méthode : observer les rapports pendant quelques semaines, déclarer chaque service d'envoi, puis passer en quarantine.\n\n3 étapes, sans casser vos vrais mails.\n\nSource : baromètre InfraCyb, www.infracyb.fr/barometre-messagerie\n\nEt chez vous, où en est votre DMARC ?",
  visual: { kicker: "Baromètre", big: "50 %", sub: "des PME analysées n'ont pas de DMARC qui bloque" },
};

test("contrôle : un post conforme passe", () => {
  assert.deepEqual(validateGeneratedPost(good, ctx), []);
});

test("contrôle : chiffre inventé, client inventé, nom du CRM, lien externe, mention, sujet repris, date hors calendrier", () => {
  const bad = (o: Partial<GeneratedPost>) => validateGeneratedPost({ ...good, ...o }, ctx);
  assert.match(bad({ body: good.body.replace("50 %", "83 %") }).join(), /« 83 » absent/);
  assert.match(bad({ visual: { ...good.visual, big: "12 000 €" } }).join(), /« 12000 » absent/);
  assert.match(bad({ body: good.body + "\n\nUn de mes clients a perdu 15 jours." }).join(), /histoire de client/);
  assert.match(bad({ body: good.body + "\n\nComme chez Vega Informatique." }).join(), /nom d'entreprise du CRM/);
  assert.match(bad({ body: good.body + "\n\nVoir exemple-agence.fr" }).join(), /domaine non autorisé : exemple-agence\.fr/);
  assert.match(bad({ body: good.body + " @Jean" }).join(), /mention @/);
  assert.match(bad({ topic: "Le faux RIB, expliqué simplement" }).join(), /déjà traité/);
  assert.match(bad({ date: "2027-01-09" }).join(), /hors du calendrier/);
  assert.match(bad({ body: "Trop court." }).join(), /caractères/);
  assert.deepEqual(bad({ body: good.body + "\n\nSource : cybermalveillance.gouv.fr, 420 000 demandes en 2024 (+49,9 %)." }), []);
});

test("les posts de décembre écrits à la main passent le contrôle (les chiffres viennent de la base de faits)", () => {
  const real = [...barometreFacts({ sample: 74, dmarcEnforce: 32, dmarcNone: 30, dmarcAbsent: 12, spfSoft: 28, m365: 54, google: 7, from: "2026-11-17", to: "2026-11-26" }), ...CYBER_FACTS, ...OFFER_FACTS];
  const sql = readFileSync("drizzle-manuel-phase-s.sql", "utf8");
  const posts = [...sql.matchAll(/'(\d{4}-\d{2}-\d{2})', 'LinkedIn', \$post\$(.+?)\$post\$, '[^']+', 'programme', \$post\$([\s\S]+?)\$post\$, \$post\$(.+?)\$post\$/g)].map((m) => ({ date: m[1], topic: m[2], body: m[3], visual: JSON.parse(m[4]) }));
  assert.equal(posts.length, 16);
  const c = { dates: posts.map((p) => p.date), allowed: allowedNumbers(real), names: [], recentTopics: [] };
  for (const p of posts) assert.deepEqual(validateGeneratedPost(p, c), [], p.topic);
});

test("republication de secours : plus de 90 jours, sujet non repris depuis, le plus ancien d'abord", () => {
  const p = (id: string, date: string, topic: string, status = "publie") => ({ id, date, topic, network: "LinkedIn", status, body: "texte", visual: '{"big":"x"}' });
  const posts = [p("a", "2026-12-01", "A"), p("b", "2026-12-03", "B"), p("c", "2027-02-01", "A"), p("d", "2026-12-08", "C", "redige")];
  assert.equal(pickRecyclable(posts, "2027-03-10")?.id, "b"); // A a été repris le 01/02, C n'a jamais été publié
  assert.equal(pickRecyclable(posts, "2027-02-20"), null); // moins de 90 jours
});
