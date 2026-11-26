/** Lien public du rapport de diagnostic : signature, expiration, robots, encadré d'action. */
import test from "node:test";
import assert from "node:assert/strict";
import { isHumanView, makeReportToken, readReportToken, REPORT_LINK_DAYS } from "../src/lib/report-link";
import { mailAuthFinding, renderReport } from "../src/lib/diagnostic-report";
import { packOfferText, suiviMonthlyCents, suiviOfferText } from "../src/lib/pricing";
import type { Check } from "../src/lib/diagnostic";

const S = "un-secret-de-test-assez-long-1234567890";
const NOW = Date.UTC(2026, 10, 25, 9);
const DAY = 86_400_000;

test("jeton : lu tant qu'il est valable, refusé une fois expiré, modifié ou signé avec une autre clé", () => {
  const t = makeReportToken(S, "Diag_123-abc", NOW);
  assert.equal(readReportToken(S, t, NOW), "Diag_123-abc");
  assert.equal(readReportToken(S, t, NOW + REPORT_LINK_DAYS * DAY), "Diag_123-abc");
  assert.equal(readReportToken(S, t, NOW + (REPORT_LINK_DAYS + 1) * DAY), null);
  const [id, exp, sig] = t.split(".");
  assert.equal(readReportToken(S, `${id}.${Number(exp) + 30}.${sig}`, NOW), null); // prolonger la date casse la signature
  assert.equal(readReportToken(S, `Autre_diag_99.${exp}.${sig}`, NOW), null);
  assert.equal(readReportToken("une-autre-cle-tout-aussi-longue-000", t, NOW), null);
  for (const bad of ["", "a.b", "a.b.c.d", `../x.${exp}.${sig}`, `${id}.-1.${sig}`]) assert.equal(readReportToken(S, bad, NOW), null, bad);
  assert.throws(() => makeReportToken(S, "../etc", NOW));
});

test("consultation : navigateur humain compté, robots, aperçus, HEAD et ouverture immédiate écartés", () => {
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
  assert.equal(isHumanView(chrome, "GET", 3600), true);
  assert.equal(isHumanView(chrome, "GET", null), true);
  assert.equal(isHumanView(chrome, "GET", 30), false);
  assert.equal(isHumanView(chrome, "HEAD", 3600), false);
  for (const ua of ["", "curl/8.4", "Mozilla/5.0 (compatible; Googlebot/2.1)", "Mozilla/5.0 (Windows NT 10.0) HeadlessChrome/120", "Mozilla/5.0 Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0)", "python-requests/2.31", "LinkedInBot/1.0 (compatible; Mozilla/5.0)"]) assert.equal(isHumanView(ua, "GET", 3600), false, ua);
});

const chk = (variant: string, certain = true): Check => ({ id: variant.split("-")[0], label: variant, status: "constat", certain, proof: "dig", wording: "w", rank: 1, variant });
const report = { company: "Exemple", mailDomain: "exemple.fr", webHost: "www.exemple.fr", checkedOn: "2026-11-25", rulesVersion: "1", author: "Jean", authorCompany: "InfraCyb", authorContact: "" };

test("encadré d'action : offre Pack pour la messagerie, lien https seulement, tout est échappé", () => {
  assert.equal(mailAuthFinding([chk("dmarc-none")]), true);
  assert.equal(mailAuthFinding([chk("tls-bientot")]), false);
  assert.equal(mailAuthFinding([chk("spf-absent", false)]), false);
  assert.match(packOfferText(2), /290\s€ HT pour les 3 premiers clients, au lieu de 390\s€ HT\.$/);
  assert.match(packOfferText(0), /: 390\s€ HT\.$/);
  const html = renderReport({ ...report, checks: [chk("dmarc-none")], cta: { offer: packOfferText(3), calUrl: "https://cal.com/jean", contact: "06 00 00 00 00 · <b>jean</b>" } });
  assert.match(html, /<section class="cta"><h2>Corriger ces points<\/h2>/);
  assert.match(html, /<a href="https:\/\/cal\.com\/jean" rel="noopener">/);
  assert.match(html, /&lt;b&gt;jean&lt;\/b&gt;/);
  assert.doesNotMatch(renderReport({ ...report, checks: [], cta: { offer: "", calUrl: "javascript:alert(1)", contact: "" } }), /class="cta"|javascript:/);
  assert.doesNotMatch(renderReport({ ...report, checks: [] }), /class="cta"/); // version interne : pas d'encadré
});

test("suivi mensuel : prix pilote tant qu'il reste des places, engagement annoncé", () => {
  assert.equal(suiviMonthlyCents(1), 3900);
  assert.equal(suiviMonthlyCents(0), 4900);
  assert.match(suiviOfferText(2), /39\s€ HT par mois, 6 mois minimum/);
  assert.match(suiviOfferText(0), /49\s€ HT par mois/);
});
