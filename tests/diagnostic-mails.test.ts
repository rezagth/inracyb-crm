/** Textes de la campagne Diagnostic : identité avec le fichier validé, composition, champs obligatoires. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOOK_VARIANTS, type Check } from "../src/lib/diagnostic";
import { buildDiagnosticMail, EXTRA_TEXT, HOOK_TEXT, IMPACT, SECONDARY_TEXT, SEGMENTS, SEGMENT_SECTORS, SEQUENCE, segmentOfSector, type DiagnosticMailInput } from "../src/lib/diagnostic-mails";
import { greetsWithoutName } from "../src/lib/contact-extract";
import { sectorFromNaf, SECTOR_SEARCH } from "../src/lib/prospect-search";

const md = readFileSync("textes-campagne-diagnostic-v2.md", "utf8");

/** Lignes d'un tableau Markdown placé sous un titre (sans l'en-tête ni la ligne de séparation). */
function table(title: string): string[][] {
  const lines = md.slice(md.indexOf(title)).split("\n").slice(1);
  const start = lines.findIndex((l) => l.startsWith("|"));
  const rows: string[][] = [];
  for (const l of lines.slice(start)) {
    if (!l.startsWith("|")) break;
    rows.push(l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  }
  return rows.slice(2);
}
const KEY: Record<string, string[]> = { "DMARC absent": ["dmarc-absent"], "DMARC en `p=none`": ["dmarc-none"], "SPF absent": ["spf-absent"], "SPF en double": ["spf-double"], "SPF en `+all`": ["spf-plus-all"], "Certificat expiré": ["tls-expire"], "Certificat expirant": ["tls-bientot"], "Certificat expiré ou expirant": ["tls-expire", "tls-bientot"] };

test("les phrases du code sont celles du fichier validé, caractère pour caractère", () => {
  const t1 = table("## Tableau 1");
  assert.equal(t1.length, 7);
  for (const [label, family, subject, finding] of t1) assert.deepEqual({ family: HOOK_TEXT[KEY[label][0] as keyof typeof HOOK_TEXT].family, subject: HOOK_TEXT[KEY[label][0] as keyof typeof HOOK_TEXT].subject, finding: HOOK_TEXT[KEY[label][0] as keyof typeof HOOK_TEXT].finding }, { family, subject, finding }, label);
  const t3 = table("## Tableau 3");
  assert.equal(t3.length, 6);
  for (const [label, fix] of t3) for (const k of KEY[label]) assert.equal(HOOK_TEXT[k as keyof typeof HOOK_TEXT].fix, fix, label);
  assert.deepEqual(table("## Tableau 2").map(([f, a, b]) => [f, a, b]), (["A", "B"] as const).map((f) => [f, IMPACT[f].editeurs, IMPACT[f].cabinets]));
  assert.deepEqual(table("## Tableau 4"), [["HSTS absent", SECONDARY_TEXT["hsts-absent"]]]);
  assert.deepEqual(Object.keys(SECONDARY_TEXT), ["hsts-absent"]);
  assert.deepEqual(Object.keys(HOOK_TEXT).sort(), [...HOOK_VARIANTS].sort()); // chaque accroche a ses phrases, et rien d'autre
  assert.ok(!(HOOK_VARIANTS as readonly string[]).includes("hsts-absent"));

  // Texte commun de chaque segment : objet et corps de chaque étape.
  for (const [segment, title] of [["editeurs", "## Segment 1"], ["cabinets", "## Segment 2"]] as const) {
    let part = md.slice(md.indexOf(title));
    const next = part.indexOf("\n## ", 5);
    if (next > 0) part = part.slice(0, next);
    const steps = part.split("\n### ").slice(1).map((b) => {
      const rest = b.slice(b.indexOf("\n") + 1).split("\n---")[0].trim();
      const m = /^Objet : (.*)\n/.exec(rest)!;
      return { subject: m[1].trim(), body: rest.slice(m[0].length).trim() };
    });
    assert.deepEqual(SEQUENCE[segment], steps);
    assert.equal(steps.length, 4);
  }
});

const check = (variant: string, data?: Check["data"]): Check => ({ id: variant.split("-")[0], label: "", status: "constat", certain: true, proof: "", wording: "", rank: 1, variant, ...(data ? { data } : {}) });
const base: DiagnosticMailInput = { segment: "editeurs", step: 0, hook: "dmarc-absent", checks: [check("dmarc-absent")], mailDomain: "exemple.fr", webHost: "www.exemple.fr", prenom: "Claire", entreprise: "Exemple SAS", me: "Jean Test", signature: "Jean Test\nInfraCyb\n01 02 03 04 05 · jean@infracyb.fr", prixPilote: "290 € HT", prixPublic: "390 € HT" };
const ok = (i: Partial<DiagnosticMailInput>) => {
  const m = buildDiagnosticMail({ ...base, ...i });
  assert.ok(m.ok, JSON.stringify(m));
  return m as { subject: string; body: string };
};
const ko = (i: Partial<DiagnosticMailInput>) => {
  const m = buildDiagnosticMail({ ...base, ...i });
  assert.equal(m.ok, false, JSON.stringify(m));
  return (m as { error: string }).error;
};

test("chaque segment, chaque constat, chaque étape : mail complet, phrases intactes, rien d'interdit", () => {
  for (const segment of SEGMENTS)
    for (const hook of HOOK_VARIANTS) {
      const t = HOOK_TEXT[hook];
      const dom = t.family === "A" ? "exemple.fr" : "www.exemple.fr";
      const fillIn = (s: string) => s.split("{domaine}").join(dom).split("{date_expiration}").join("03/12/2026");
      const checks = [check(hook, { validTo: "2026-12-03" })];
      for (let step = 0; step < 4; step++) {
        const m = ok({ segment, hook, step, checks: step <= 1 ? checks : [] });
        const all = m.subject + "\n" + m.body;
        assert.doesNotMatch(all, /\{[a-z_0-9]+\}|\[mon prénom\]|phishing/i, `${segment} ${hook} ${step}`);
        assert.doesNotMatch(m.subject, /^(re|tr|fwd?)\s*:/i);
        assert.doesNotMatch(all, /https?:\/\/|désinscri/i); // aucun lien ni mention de désinscription dans le texte : le moteur les ajoute
        assert.doesNotMatch(m.body, /[ \t]$/m);
        assert.ok(m.body.startsWith("Bonjour Claire,\n\n"));
        assert.ok(m.body.endsWith(base.signature));
        if (step === 0) {
          assert.equal(m.subject, fillIn(t.subject));
          assert.ok(m.body.includes("j'ai relevé un point : " + fillIn(t.finding) + ".\n\n" + IMPACT[t.family][segment] + "\n\n"), `${segment} ${hook}`);
          assert.ok(m.body.includes("Je suis Jean Test, consultant en cybersécurité chez InfraCyb."));
        }
        if (step === 1) assert.ok(m.body.includes(`pour ${dom} : ${fillIn(t.fix)}.\n\n`), `${segment} ${hook}`);
      }
    }
});

test("HSTS : constat secondaire à J+3 seulement, jamais ailleurs", () => {
  const hsts = check("hsts-absent");
  const with3 = ok({ step: 1, checks: [check("dmarc-absent"), hsts] });
  assert.ok(with3.body.includes(HOOK_TEXT["dmarc-absent"].fix + ". " + SECONDARY_TEXT["hsts-absent"] + "\n\n"));
  assert.doesNotMatch(ok({ step: 1 }).body, /HSTS/);
  for (const step of [0, 2, 3]) assert.doesNotMatch(ok({ step, checks: [check("dmarc-absent"), hsts] }).body, /HSTS/);
  // Un HSTS non certain (mesure douteuse) n'est pas cité.
  assert.doesNotMatch(ok({ step: 1, checks: [check("dmarc-absent"), { ...hsts, certain: false }] }).body, /HSTS/);
  // HSTS n'est pas une accroche : aucun texte pour lui.
  assert.match(ko({ hook: "hsts-absent" as never }), /Modèle de mail introuvable/);
});

test("un champ obligatoire vide : le mail ne part pas", () => {
  assert.match(ko({ prenom: "" }), /Champ obligatoire vide : prenom/);
  assert.match(ko({ prenom: "Standard" }), /prenom/); // contact générique créé par la recherche automatique
  assert.match(ko({ mailDomain: "" }), /domaine/);
  assert.match(ko({ step: 2, entreprise: " " }), /entreprise/);
  assert.match(ko({ signature: "" }), /signature/);
  assert.match(ko({ me: "" }), /mon prénom/);
  assert.match(ko({ hook: "tls-expire", checks: [check("tls-expire")] }), /date_expiration/); // certificat sans date mesurée
  assert.match(ko({ hook: "tls-bientot", checks: [] }), /date_expiration/);
  assert.match(ko({ hook: "tls-expire", checks: [check("tls-expire", { validTo: "2026-11-01" })], webHost: "" }), /domaine/);
  // Profil incomplet : la signature contient encore un champ à remplir.
  assert.match(ko({ signature: "Jean\n[ton numéro] · [ton e-mail]" }), /Champ non rempli/);
  assert.match(ko({ segment: "inconnu" as never }), /Modèle de mail introuvable/);
  assert.match(ko({ step: 4 }), /Modèle de mail introuvable/);
});

test("adresse générique publiée, sans dirigeant : « Bonjour, » ; dans tous les autres cas le prénom reste obligatoire", () => {
  assert.deepEqual([greetsWithoutName("contact@a.fr", "site"), greetsWithoutName("contact@a.fr", "saisie"), greetsWithoutName("contact@a.fr", "historique"), greetsWithoutName("claire.durand@a.fr", "site"), greetsWithoutName("", "site")], [true, false, false, false, false]);
  for (const segment of SEGMENTS) for (let step = 0; step < 4; step++) for (const prenom of ["", "Standard"]) {
    const m = ok({ segment, step, prenom, sansPrenom: true });
    const withName = ok({ segment, step });
    assert.ok(m.body.startsWith("Bonjour,\n\n"), m.body.slice(0, 40));
    assert.equal(m.body, withName.body.replace("Bonjour Claire,", "Bonjour,")); // seule la salutation change
    assert.equal(m.subject, withName.subject);
  }
  assert.ok(ok({ sansPrenom: true }).body.startsWith("Bonjour Claire,")); // un prénom connu est toujours utilisé
  assert.match(ko({ prenom: "", sansPrenom: false }), /Champ obligatoire vide : prenom/);
  assert.match(ko({ prenom: "", sansPrenom: true, entreprise: "" , step: 2 }), /entreprise/); // les autres champs restent obligatoires
});

test("valeurs venues de la fiche : jamais interprétées comme des champs, jamais de saut de ligne injecté", () => {
  assert.match(ko({ entreprise: "{signature}", step: 2 }), /Champ non rempli/); // une accolade dans un nom ne déclenche rien, et le mail est retenu
  const m = ok({ prenom: "Claire\nBcc: x@y.fr", step: 0 });
  assert.ok(m.body.startsWith("Bonjour Claire Bcc: x@y.fr,\n\n"));
  // Le certificat concerne le site : le domaine cité est celui du site, pas celui de la messagerie.
  const b = ok({ hook: "tls-bientot", checks: [check("tls-bientot", { validTo: "2026-11-25" })] });
  assert.equal(b.subject, "Le certificat du site www.exemple.fr");
  assert.match(b.body, /le certificat du site www\.exemple\.fr expire le 25\/11\/2026/);
});

test("segments : secteurs admis et codes NAF", () => {
  assert.deepEqual(SEGMENT_SECTORS, { editeurs: ["Numérique"], cabinets: ["Expertise comptable", "Juridique", "Notariat", "Courtage"] });
  assert.deepEqual(["Numérique", "Juridique", "Notariat", "Expertise comptable", "Courtage", "Santé", "Immobilier", "Autres"].map(segmentOfSector), ["editeurs", "cabinets", "cabinets", "cabinets", "cabinets", null, null, null]);
  assert.deepEqual(["62.01Z", "62.02A", "58.29C", "66.22Z", "69.20Z", "69.10Z", "62.03Z"].map((n) => sectorFromNaf(n)), ["Numérique", "Numérique", "Numérique", "Courtage", "Expertise comptable", "Juridique", "Autres"]);
  assert.deepEqual(SECTOR_SEARCH["Numérique"]?.naf, ["62.01Z", "62.02A", "58.29C"]);
  assert.deepEqual(SECTOR_SEARCH.Courtage?.naf, ["66.22Z"]);
});

test("tableau 5 : phrases de synthèse, d'offre et de rendez-vous identiques au fichier validé", () => {
  assert.deepEqual(table("## Tableau 5").map((r) => r[2]), [EXTRA_TEXT.syntheseLien, EXTRA_TEXT.syntheseSansLien, EXTRA_TEXT.offrePilote, EXTRA_TEXT.offrePublic, EXTRA_TEXT.priseRdv]);
});

test("liens : synthèse à J+3, réservation à J+7, jamais à J0 ni J+14 ; offre Pack pour la messagerie seulement", () => {
  const links = { reportUrl: "https://crm.test/r/abc.123.sig", calUrl: "https://cal.com/jean/15min", pilotOpen: true };
  for (const segment of SEGMENTS) {
    for (const step of [0, 3]) assert.doesNotMatch(ok({ segment, step, ...links, checks: step === 0 ? base.checks : [] }).body, /https?:\/\//, `${segment} ${step}`);
    const j3 = ok({ segment, step: 1, ...links });
    assert.ok(j3.body.includes("Je vous ai préparé la synthèse d'une page : https://crm.test/r/abc.123.sig\n\n"));
    assert.doesNotMatch(j3.body, /cal\.com/);
    const j7 = ok({ segment, step: 2, ...links, checks: [] });
    assert.ok(j7.body.includes("Pour le point relevé sur exemple.fr, la correction est un forfait : le Pack Courrier sécurisé, à 290 € HT pour les trois premiers clients, au lieu de 390 € HT.\n\n"));
    assert.ok(j7.body.includes("Cela vous serait utile ? Vous pouvez aussi choisir un créneau directement : https://cal.com/jean/15min\n\n"));
    assert.doesNotMatch(j7.body, /crm\.test/);
    // Places pilotes épuisées : prix public seul.
    const pub = ok({ segment, step: 2, ...links, pilotOpen: false, checks: [] });
    assert.ok(pub.body.includes("le Pack Courrier sécurisé, à 390 € HT.\n\n") && !/290/.test(pub.body));
    // Constat de certificat : pas d'offre Pack, pas de paragraphe vide.
    const cert = ok({ segment, step: 2, hook: "tls-bientot", checks: [], ...links });
    assert.doesNotMatch(cert.body, /Pack|\n\n\n/);
    // Sans lien : les phrases d'origine, sans rien de vide.
    assert.ok(ok({ segment, step: 1 }).body.includes(EXTRA_TEXT.syntheseSansLien + "\n\n"));
    assert.match(ok({ segment, step: 2, checks: [] }).body, /Cela vous serait utile \?\n\n/);
  }
  // Un lien douteux (http, espace, accolade) n'entre jamais dans un mail.
  for (const reportUrl of ["http://crm.test/r/x", "https://crm.test/r/x y", "https://crm.test/{prenom}", "javascript:alert(1)"]) assert.ok(ok({ step: 1, reportUrl }).body.includes(EXTRA_TEXT.syntheseSansLien));
  // Offre de messagerie sans prix : le mail ne part pas.
  assert.match(ko({ step: 2, checks: [], prixPublic: "" }), /prix_public/);
});
