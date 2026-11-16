/** Moteur de diagnostic : DNS, certificat et HTTP simulés (aucun réseau). */
import test from "node:test";
import assert from "node:assert/strict";
import { clean, diagnose, hookOf, dmarcNames, evalDkim, evalDmarc, evalHeaders, evalLookalikes, evalSecurityTxt, evalSpf, evalTls, lookalikes, mailable, mergeDns, parseChecks, parseDoh, RULES_VERSION, targetsOf, usableDiagnostic, type Diagnostic, type Dns, type HttpInfo, type Probe, type TlsInfo } from "../src/lib/diagnostic";
import { renderReport } from "../src/lib/diagnostic-report";

const ON = "2026-11-16";
const rec = (...values: string[]): Dns => ({ kind: "records", values });
const ABSENT: Dns = { kind: "absent" };
const ERR: Dns = { kind: "error", detail: "code DNS 2" };
const MX = rec("10 mx.exemple.fr.");
const page = (headers: Record<string, string> = {}, over: Partial<Extract<HttpInfo, { kind: "ok" }>> = {}): HttpInfo => ({ kind: "ok", status: 200, url: "https://exemple.fr/", headers, contentType: "text/html", body: "<html></html>", ...over });
const cert = (validTo: string, authorized = true): TlsInfo => ({ kind: "ok", validTo, authorized, authError: authorized ? "" : "ERR_TLS_CERT_ALTNAME_INVALID" });

/** Sonde simulée : table de réponses DNS, le reste configurable. Tout nom inconnu est « absent ». */
function probe(dns: Record<string, Dns>, opts: { tls?: TlsInfo | (() => Promise<TlsInfo>); home?: HttpInfo; sec?: HttpInfo; slow?: boolean } = {}): Probe {
  return {
    dns: async (name, type) => {
      if (opts.slow) await new Promise((r) => setTimeout(r, 200));
      return dns[`${type} ${name}`] ?? ABSENT;
    },
    tls: async () => (typeof opts.tls === "function" ? opts.tls() : (opts.tls ?? cert("2027-06-01T00:00:00.000Z"))),
    http: async (url) => (url.endsWith("security.txt") ? (opts.sec ?? { kind: "ok", status: 404, url, headers: {}, contentType: "text/html", body: "" }) : (opts.home ?? page())),
  };
}
const byId = (d: Diagnostic, id: string) => d.checks.find((c) => c.id === id)!;

test("domaines à examiner : messagerie professionnelle et site, jamais une messagerie grand public", () => {
  assert.deepEqual(targetsOf("Contact@Cabinet-Durand.fr", ""), { mailDomain: "cabinet-durand.fr", webHost: "cabinet-durand.fr" });
  assert.deepEqual(targetsOf("jean@gmail.com", "https://www.cabinet-durand.fr/contact"), { mailDomain: "cabinet-durand.fr", webHost: "www.cabinet-durand.fr" });
  assert.deepEqual(targetsOf("jean@orange.fr", ""), { mailDomain: "", webHost: "" });
  assert.deepEqual(targetsOf("", "pas une adresse"), { mailDomain: "", webHost: "" });
  assert.deepEqual(targetsOf("a@b", "http://127.0.0.1/"), { mailDomain: "", webHost: "" });
  assert.deepEqual(targetsOf("x@exemple.fr", "https://autre-site.com"), { mailDomain: "exemple.fr", webHost: "autre-site.com" });
});

test("réponses DNS sur HTTPS : présent, absent (NXDOMAIN ou sans réponse du bon type), erreur", () => {
  assert.deepEqual(parseDoh({ Status: 0, Answer: [{ name: "exemple.fr.", type: 16, data: "\"v=spf1 include:_spf.google.com\" \" ~all\"" }] }, "TXT"), rec("v=spf1 include:_spf.google.com ~all"));
  assert.deepEqual(parseDoh({ Status: 3 }, "TXT"), ABSENT);
  assert.deepEqual(parseDoh({ Status: 0 }, "TXT"), ABSENT);
  assert.deepEqual(parseDoh({ Status: 0, Answer: [{ type: 5, data: "alias.exemple.net." }] }, "TXT"), ABSENT); // un CNAME n'est pas un TXT
  assert.equal(parseDoh({ Status: 2 }, "TXT").kind, "error"); // SERVFAIL
  for (const bad of [null, "texte", 42, [], { Answer: [] }, { Status: "0" }]) assert.equal(parseDoh(bad, "TXT").kind, "error");
  // Réponse piégée : données non textuelles, enregistrement démesuré, trop de réponses.
  const big = parseDoh({ Status: 0, Answer: [{ type: 16, data: 42 }, { type: 16, data: "\"" + "a".repeat(10_000) + "\"" }, ...Array.from({ length: 200 }, () => ({ type: 16, data: "\"x\"" }))] }, "TXT");
  assert.equal(big.kind, "records");
  assert.ok((big as { values: string[] }).values.length <= 50);
  assert.ok((big as { values: string[] }).values.every((v) => v.length <= 2000));
});

test("deux résolveurs : une absence ou un contenu n'est retenu que s'ils sont d'accord", () => {
  assert.deepEqual(mergeDns(ABSENT, ABSENT), ABSENT);
  assert.deepEqual(mergeDns(rec("b", "A"), rec("a", "B")), rec("b", "A"));
  assert.equal(mergeDns(ABSENT, rec("v=spf1 -all")).kind, "error");
  assert.equal(mergeDns(rec("v=spf1 -all"), rec("v=spf1 ~all")).kind, "error");
  assert.equal(mergeDns(ERR, ABSENT).kind, "error");
  assert.equal(mergeDns(ABSENT, ERR).kind, "error");
});

test("SPF : présent, absent, en double, +all, neutre, erreur", () => {
  assert.equal(evalSpf("exemple.fr", rec("v=spf1 include:spf.protection.outlook.com -all", "google-site-verification=abc"), MX, ON).status, "conforme");
  assert.equal(evalSpf("exemple.fr", rec("V=SPF1 mx ~all"), MX, ON).status, "conforme");
  assert.equal(evalSpf("exemple.fr", rec("v=spf1 redirect=_spf.exemple.net"), MX, ON).status, "conforme");
  const none = evalSpf("exemple.fr", rec("google-site-verification=abc", "v=spf10 faux"), MX, ON);
  assert.deepEqual([none.status, none.certain], ["constat", true]);
  assert.match(none.wording, /^Le 16\/11\/2026, le domaine exemple\.fr ne publiait pas d'enregistrement SPF/);
  assert.deepEqual([evalSpf("exemple.fr", ABSENT, MX, ON).status, evalSpf("exemple.fr", ABSENT, MX, ON).certain], ["constat", true]);
  assert.match(evalSpf("exemple.fr", rec("v=spf1 -all", "v=spf1 mx -all"), MX, ON).wording, /2 enregistrements SPF/);
  assert.equal(mailable(evalSpf("exemple.fr", rec("v=spf1 +all"), MX, ON)), true);
  assert.equal(mailable(evalSpf("exemple.fr", rec("v=spf1 mx all"), MX, ON)), true);
  assert.equal(mailable(evalSpf("exemple.fr", rec("v=spf1 mx ?all"), MX, ON)), false);
  assert.equal(mailable(evalSpf("exemple.fr", rec("v=spf1 mx"), MX, ON)), false);
  // Mesure impossible : aucune conclusion, jamais un constat.
  const err = evalSpf("exemple.fr", ERR, MX, ON);
  assert.deepEqual([err.status, err.certain], ["erreur", false]);
  // Domaine sans messagerie déclarée, ou MX non mesuré : on n'affirme rien dans un mail.
  assert.equal(mailable(evalSpf("exemple.fr", ABSENT, ABSENT, ON)), false);
  assert.equal(mailable(evalSpf("exemple.fr", ABSENT, ERR, ON)), false);
  assert.equal(mailable(evalSpf("exemple.fr", ABSENT, rec("0 ."), ON)), false); // MX nul : le domaine déclare ne pas recevoir d'e-mails
});

test("DMARC : absent seulement si absent du domaine et de ses parents ; p=none ; héritage ; erreur", () => {
  assert.deepEqual(dmarcNames("exemple.fr"), ["_dmarc.exemple.fr"]);
  assert.deepEqual(dmarcNames("mail.exemple.co.uk"), ["_dmarc.mail.exemple.co.uk", "_dmarc.exemple.co.uk", "_dmarc.co.uk"]);
  const look = (...r: Dns[]) => dmarcNames("mail.exemple.fr").map((name, i) => ({ name, res: r[i] ?? ABSENT }));
  const absent = evalDmarc("exemple.fr", [{ name: "_dmarc.exemple.fr", res: ABSENT }], MX, ON);
  assert.deepEqual([absent.status, absent.certain], ["constat", true]);
  assert.match(absent.wording, /ne publiait pas de politique DMARC/);
  // Un TXT sans rapport (joker DNS) ne compte pas comme une politique.
  assert.equal(mailable(evalDmarc("exemple.fr", [{ name: "_dmarc.exemple.fr", res: rec("v=spf1 -all", "n'importe quoi") }], MX, ON)), true);
  assert.equal(evalDmarc("exemple.fr", [{ name: "_dmarc.exemple.fr", res: rec("v=DMARC1; p=reject; rua=mailto:d@exemple.fr") }], MX, ON).status, "conforme");
  assert.equal(evalDmarc("exemple.fr", [{ name: "_dmarc.exemple.fr", res: rec("v=DMARC1;p=quarantine") }], MX, ON).status, "conforme");
  const none = evalDmarc("exemple.fr", [{ name: "_dmarc.exemple.fr", res: rec("v=DMARC1; p=none; rua=mailto:d@exemple.fr") }], MX, ON);
  assert.deepEqual([none.status, none.certain], ["constat", true]);
  assert.match(none.wording, /mode observation/);
  // Sous-domaine : la politique du domaine principal s'applique (sp= en priorité).
  assert.equal(evalDmarc("mail.exemple.fr", look(ABSENT, rec("v=DMARC1; p=reject")), MX, ON).status, "conforme");
  assert.equal(mailable(evalDmarc("mail.exemple.fr", look(ABSENT, rec("v=DMARC1; p=reject; sp=none")), MX, ON)), true);
  assert.equal(mailable(evalDmarc("mail.exemple.fr", look(ABSENT, ABSENT), MX, ON)), true);
  // Une seule mesure impossible sur la chaîne : aucune conclusion.
  assert.equal(evalDmarc("mail.exemple.fr", look(ABSENT, ERR), MX, ON).status, "erreur");
  assert.equal(evalDmarc("exemple.fr", [{ name: "_dmarc.exemple.fr", res: ERR }], MX, ON).status, "erreur");
  // Politique illisible ou en double : à vérifier, pas un constat.
  assert.equal(mailable(evalDmarc("exemple.fr", [{ name: "_dmarc.exemple.fr", res: rec("v=DMARC1; p=bidule") }], MX, ON)), false);
  assert.equal(mailable(evalDmarc("exemple.fr", [{ name: "_dmarc.exemple.fr", res: rec("v=DMARC1; p=none", "v=DMARC1; p=reject") }], MX, ON)), false);
  assert.equal(mailable(evalDmarc("exemple.fr", [{ name: "_dmarc.exemple.fr", res: ABSENT }], ABSENT, ON)), false);
});

test("DKIM : détecté ou « non détecté », jamais « absent », jamais un constat", () => {
  const found = evalDkim("exemple.fr", [{ selector: "default", res: ABSENT }, { selector: "google", res: rec("v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC") }]);
  assert.equal(found.status, "conforme");
  for (const results of [[{ selector: "default", res: ABSENT }], [{ selector: "default", res: ERR }], [{ selector: "default", res: rec("texte sans rapport") }], [{ selector: "default", res: rec("v=DKIM1; p=") }], []]) {
    const c = evalDkim("exemple.fr", results);
    assert.deepEqual([c.status, c.certain, mailable(c)], ["non_detecte", false, false]);
    assert.doesNotMatch(c.wording, /absent(e)?\b(?! *:)/i);
    assert.match(c.wording, /ne prouve pas son absence/);
  }
});

test("certificat : expiré, bientôt expiré, valide, non validé, erreur", () => {
  const expired = evalTls("exemple.fr", cert("2026-11-10T08:00:00.000Z", false), ON);
  assert.deepEqual([expired.status, expired.certain, expired.rank], ["constat", true, 1]);
  assert.match(expired.wording, /expiré depuis le 10\/11\/2026/);
  const soon = evalTls("exemple.fr", cert("2026-11-25T08:00:00.000Z"), ON);
  assert.deepEqual([soon.status, soon.certain], ["constat", true]);
  assert.match(soon.wording, /dans 9 jour\(s\)/);
  assert.equal(evalTls("exemple.fr", cert("2026-11-30T08:00:00.000Z"), ON).status, "constat"); // 14 jours pile
  assert.equal(evalTls("exemple.fr", cert("2026-12-01T08:00:00.000Z"), ON).status, "conforme");
  assert.equal(mailable(evalTls("exemple.fr", cert("2027-05-01T08:00:00.000Z", false), ON)), false); // refusé pour une autre raison : pas interprété
  assert.equal(evalTls("exemple.fr", { kind: "error", detail: "délai dépassé" }, ON).status, "erreur");
  assert.equal(evalTls("exemple.fr", cert("date illisible"), ON).status, "erreur");
});

test("en-têtes et security.txt : seule une page servie normalement est interprétée", () => {
  const all = evalHeaders("exemple.fr", page({ "strict-transport-security": "max-age=63072000", "content-security-policy": "default-src 'self'; frame-ancestors 'none'", "x-content-type-options": "nosniff" }), ON);
  assert.deepEqual(all.map((c) => c.status), ["conforme", "conforme", "conforme", "conforme"]);
  const none = evalHeaders("exemple.fr", page(), ON);
  assert.deepEqual(none.map((c) => [c.id, c.status, c.certain]), [["hsts", "constat", true], ["csp", "info", true], ["nosniff", "info", true], ["frame", "info", true]]);
  // Page de blocage d'un pare-feu, redirection restée en http, erreur réseau : aucune conclusion.
  for (const h of [page({}, { status: 403 }), page({}, { status: 503 }), page({}, { url: "http://exemple.fr/" }), { kind: "error", detail: "le site met trop de temps à répondre" } as HttpInfo]) assert.ok(evalHeaders("exemple.fr", h, ON).every((c) => c.status === "erreur" && !mailable(c)));

  const sec = (over: Partial<Extract<HttpInfo, { kind: "ok" }>>) => evalSecurityTxt("exemple.fr", page({}, { contentType: "text/plain; charset=utf-8", ...over }));
  assert.equal(sec({ body: "Contact: mailto:securite@exemple.fr\nExpires: 2027-01-01T00:00:00Z" }).status, "conforme");
  assert.equal(sec({ status: 404, body: "" }).status, "info");
  // Fausse page 200 (site qui renvoie sa page d'accueil pour toute adresse) : « non détecté », pas « absent ».
  assert.equal(sec({ contentType: "text/html", body: "<html>Contact: nous écrire</html>" }).status, "non_detecte");
  assert.equal(sec({ body: "page vide" }).status, "non_detecte");
  assert.equal(sec({ status: 500 }).status, "non_detecte");
  assert.ok([sec({ status: 404 }), sec({ status: 500 }), sec({ body: "Contact: x" })].every((c) => !mailable(c)));
});

test("domaines proches : formulation « à vérifier », jamais un constat", () => {
  assert.deepEqual(lookalikes("cabinet-durand.fr"), ["cabinet-durand.com", "cabinet-durand.net", "cabinet-durand.eu", "cabinet-durand.org", "cabinetdurand.fr"]);
  assert.deepEqual(lookalikes("mail.exemple.co.uk"), []);
  const c = evalLookalikes("exemple.fr", [{ name: "exemple.com", res: rec("ns1.registrar.net.") }, { name: "exemple.net", res: ABSENT }, { name: "exemple.eu", res: ERR }]);
  assert.deepEqual([c.status, c.certain, mailable(c)], ["info", false, false]);
  assert.match(c.wording, /^Domaine proche enregistré, à vérifier : exemple\.com\./);
  assert.equal(evalLookalikes("exemple.fr", [{ name: "exemple.com", res: ABSENT }]).status, "non_detecte");
});

test("diagnostic complet : domaine bien configuré, aucun constat, rien à envoyer", async () => {
  const d = await diagnose({ mailDomain: "exemple.fr", webHost: "exemple.fr" }, probe({ "MX exemple.fr": MX, "TXT exemple.fr": rec("v=spf1 mx -all"), "TXT _dmarc.exemple.fr": rec("v=DMARC1; p=reject"), "TXT _mta-sts.exemple.fr": rec("v=STSv1; id=1"), "TXT google._domainkey.exemple.fr": rec("v=DKIM1; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC") }, { home: page({ "strict-transport-security": "max-age=1", "content-security-policy": "default-src 'self'", "x-content-type-options": "nosniff", "x-frame-options": "DENY" }), sec: page({}, { contentType: "text/plain", body: "Contact: mailto:s@exemple.fr" }) }), ON);
  assert.deepEqual([d.main, d.certainCount, d.rulesVersion, d.checkedOn], ["", 0, RULES_VERSION, ON]);
  assert.equal(d.checks.length, 12);
  assert.ok(d.checks.every((c) => c.status === "conforme" || c.status === "non_detecte"));
});

test("diagnostic complet : constat principal = le plus parlant des constats certains", async () => {
  const dns = { "MX exemple.fr": MX, "TXT exemple.fr": rec("google-site-verification=x"), "NS exemple.com": rec("ns1.x.net.") };
  const d = await diagnose({ mailDomain: "exemple.fr", webHost: "www.exemple.fr" }, probe(dns), ON);
  assert.equal(d.main, "spf"); // SPF absent passe avant DMARC absent et HSTS
  assert.deepEqual(d.checks.filter(mailable).map((c) => c.id), ["spf", "dmarc", "hsts"]);
  assert.equal(d.certainCount, 3);
  assert.equal(byId(d, "dkim").status, "non_detecte");
  assert.equal(byId(d, "proches").status, "info");
  const expired = await diagnose({ mailDomain: "exemple.fr", webHost: "www.exemple.fr" }, probe(dns, { tls: cert("2026-11-01T00:00:00.000Z", false) }), ON);
  assert.equal(expired.main, "tls");
  // Sans domaine de messagerie ni site : rien n'est mesuré.
  const empty = await diagnose({ mailDomain: "", webHost: "" }, probe({}), ON);
  assert.deepEqual([empty.checks.length, empty.main], [0, ""]);
  const bad = await diagnose({ mailDomain: "pas un domaine", webHost: "127.0.0.1" }, probe({}), ON);
  assert.equal(bad.checks.length, 0);
});

test("tout en erreur ou en délai dépassé : aucun constat, le diagnostic se termine quand même", async () => {
  const failing: Probe = { dns: async () => ERR, tls: async () => ({ kind: "error", detail: "connexion HTTPS impossible" }), http: async () => ({ kind: "error", detail: "site introuvable (adresse inconnue)" }) };
  const d = await diagnose({ mailDomain: "exemple.fr", webHost: "exemple.fr" }, failing, ON);
  assert.deepEqual([d.main, d.certainCount], ["", 0]);
  assert.ok(d.checks.filter((c) => c.id !== "dkim" && c.id !== "proches").every((c) => c.status === "erreur"));

  const hanging: Probe = { dns: () => new Promise(() => {}), tls: () => new Promise(() => {}), http: () => new Promise(() => {}) };
  const started = Date.now();
  const t = await diagnose({ mailDomain: "exemple.fr", webHost: "exemple.fr" }, hanging, ON, 60);
  assert.ok(Date.now() - started < 2000);
  assert.equal(t.certainCount, 0);
  assert.match(byId(t, "spf").proof, /délai dépassé/);

  const throwing: Probe = { dns: async () => { throw new Error("boom"); }, tls: async () => { throw new Error("boom"); }, http: async () => { throw new Error("boom"); } };
  const x = await diagnose({ mailDomain: "exemple.fr", webHost: "exemple.fr" }, throwing, ON);
  assert.equal(x.certainCount, 0);
});

test("réponses piégées : contenu hostile nettoyé et échappé dans le rapport", async () => {
  const evil = "v=spf1 +all <script>alert(1)</script>" + String.fromCharCode(0, 7, 27) + "[31m " + String.fromCharCode(0x202e) + "x".repeat(5000);
  assert.ok(clean(evil).length <= 201);
  assert.doesNotMatch(clean(evil, 5000), new RegExp("[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(0x202e) + "]"));
  const d = await diagnose({ mailDomain: "exemple.fr", webHost: "exemple.fr" }, probe({ "MX exemple.fr": MX, "TXT exemple.fr": rec(evil) }, { home: page({ "content-security-policy": "x\"><img src=x onerror=alert(1)>" }) }), ON);
  assert.ok(d.checks.every((c) => c.proof.length <= 401));
  const html = renderReport({ company: "Durand & <b>Fils</b>", mailDomain: d.mailDomain, webHost: d.webHost, checkedOn: d.checkedOn, rulesVersion: d.rulesVersion, checks: d.checks, author: "Moi", authorCompany: "InfraCyb", authorContact: "moi@infracyb.fr" });
  assert.doesNotMatch(html, /<script|<img|<b>Fils/);
  assert.match(html, /Durand &amp; &lt;b&gt;Fils&lt;\/b&gt;/);
  assert.match(html, /Constats mesurés \(\d+\)/);
  assert.match(html, /« non détecté » ne signifie pas « absent »/);
  assert.doesNotMatch(html, /score|note sur|sur 100|sur 20/i);
  // Constats stockés illisibles ou falsifiés : ignorés.
  assert.deepEqual(parseChecks("pas du json"), []);
  assert.deepEqual(parseChecks("{\"a\":1}"), []);
  assert.equal(parseChecks(JSON.stringify([...d.checks, { id: 1 }, null, "x"])).length, d.checks.length);
});

test("barrière de qualité : un diagnostic n'ouvre la séquence que s'il a un constat certain, récent, aux règles en vigueur", () => {
  const ok = { status: "fait", mainFinding: "spf", rulesVersion: RULES_VERSION, checkedOn: "2026-11-10" };
  assert.equal(usableDiagnostic(ok, ON), true);
  assert.equal(usableDiagnostic({ ...ok, checkedOn: "2026-11-02" }, ON), true); // 14 jours pile
  assert.equal(usableDiagnostic({ ...ok, checkedOn: "2026-11-01" }, ON), false); // périmé
  assert.equal(usableDiagnostic({ ...ok, checkedOn: "2026-11-17" }, ON), false); // date dans le futur
  assert.equal(usableDiagnostic({ ...ok, mainFinding: "" }, ON), false); // aucun constat d'accroche (rien, ou HSTS seul)
  assert.equal(usableDiagnostic({ ...ok, status: "a_faire" }, ON), false);
  assert.equal(usableDiagnostic({ ...ok, rulesVersion: "ancienne" }, ON), false);
  assert.equal(usableDiagnostic({ ...ok, checkedOn: "" }, ON), false);
  assert.equal(usableDiagnostic(undefined, ON), false);
});

test("accroche : HSTS seul n'ouvre pas la campagne ; formes de constat sans phrase validée écartées", async () => {
  // Domaine bien réglé côté courrier, seul HSTS manque : un constat certain, mais aucune accroche.
  const d = await diagnose({ mailDomain: "exemple.fr", webHost: "exemple.fr" }, probe({ "MX exemple.fr": MX, "TXT exemple.fr": rec("v=spf1 mx -all"), "TXT _dmarc.exemple.fr": rec("v=DMARC1; p=reject") }), ON);
  assert.deepEqual([d.certainCount, d.main, hookOf(d.checks)], [1, "", undefined]);
  assert.equal(byId(d, "hsts").variant, "hsts-absent");
  assert.equal(usableDiagnostic({ status: "fait", mainFinding: d.main, rulesVersion: d.rulesVersion, checkedOn: d.checkedOn }, ON), false);
  // Avec un constat de courrier en plus, c'est lui l'accroche, jamais HSTS.
  const e = await diagnose({ mailDomain: "exemple.fr", webHost: "exemple.fr" }, probe({ "MX exemple.fr": MX, "TXT exemple.fr": rec("v=spf1 mx -all") }), ON);
  assert.deepEqual([e.main, hookOf(e.checks)?.variant], ["dmarc", "dmarc-absent"]);
  // Formes exactes couvertes par une phrase validée.
  assert.equal(evalSpf("exemple.fr", ABSENT, MX, ON).variant, "spf-absent");
  assert.equal(evalSpf("exemple.fr", rec("v=spf1 -all", "v=spf1 mx -all"), MX, ON).variant, "spf-double");
  assert.equal(evalSpf("exemple.fr", rec("v=spf1 mx +all"), MX, ON).variant, "spf-plus-all");
  assert.equal(evalDmarc("exemple.fr", [{ name: "_dmarc.exemple.fr", res: rec("v=DMARC1; p=none") }], MX, ON).variant, "dmarc-none");
  assert.equal(evalTls("exemple.fr", cert("2026-11-10T08:00:00.000Z", false), ON).variant, "tls-expire");
  assert.deepEqual(evalTls("exemple.fr", cert("2026-11-25T08:00:00.000Z"), ON).data, { validTo: "2026-11-25" });
  // Constats vrais mais que les phrases validées décriraient mal : pas d'accroche.
  const three = evalSpf("exemple.fr", rec("v=spf1 -all", "v=spf1 mx -all", "v=spf1 a -all"), MX, ON); // la phrase dit « deux »
  const bare = evalSpf("exemple.fr", rec("v=spf1 mx all"), MX, ON); // la phrase dit « se termine par +all »
  const sp = evalDmarc("mail.exemple.fr", dmarcNames("mail.exemple.fr").map((name, i) => ({ name, res: i === 1 ? rec("v=DMARC1; p=reject; sp=none") : ABSENT })), MX, ON); // la phrase dit « p=none »
  for (const c of [three, bare, sp]) assert.deepEqual([mailable(c), c.variant, hookOf([c])], [true, "", undefined]);
});
