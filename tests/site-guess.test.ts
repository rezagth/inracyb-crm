/** Site sans Google : adresses de site tirées du nom, preuve par le SIREN publié sur le site. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SITE_GUESSES, pageHasSiren, siteCandidates } from "../src/lib/site-guess";

test("adresses de site tirées du nom : marque d'abord, sans forme juridique, .fr puis .com, jamais plus de 6", () => {
  assert.deepEqual(siteCandidates("Captivea"), ["captivea.fr", "captivea.com"]);
  assert.deepEqual(siteCandidates("Tabhotel"), ["tabhotel.fr", "tabhotel.com"]);
  assert.deepEqual(siteCandidates("Hub-Grade"), ["hubgrade.fr", "hubgrade.com", "hub-grade.fr", "hub-grade.com"]);
  assert.deepEqual(siteCandidates("Sodecc Expertise Comptable (sodecc)").slice(0, 2), ["sodecc.fr", "sodecc.com"]); // nom d'usage entre parenthèses d'abord
  assert.deepEqual(siteCandidates("Ste D'Organisation Financiere Et Comptable (sofico)").slice(0, 2), ["sofico.fr", "sofico.com"]);
  assert.deepEqual(siteCandidates("Vega Informatique SARL"), ["vegainformatique.fr", "vegainformatique.com", "vega-informatique.fr", "vega-informatique.com", "vega.fr", "vega.com"]);
  assert.deepEqual(siteCandidates("A C E V E X"), ["acevex.fr", "acevex.com"]); // initiales espacées
  assert.deepEqual(siteCandidates("Société Générale d'Études Électriques").slice(0, 2), ["generaleetudeselectriques.fr", "generaleetudeselectriques.com"]); // accents et mots vides
  assert.ok(siteCandidates("Association De Gestion Et De Comptabilite Du Littoral Atlantique (agcla)").length <= MAX_SITE_GUESSES);
  assert.equal(siteCandidates("Association De Gestion Et De Comptabilite Du Littoral Atlantique (agcla)")[0], "agcla.fr");
  assert.deepEqual(siteCandidates("SA"), []); // rien d'exploitable
  assert.ok(siteCandidates("Un Nom Beaucoup Trop Long Pour Etre Une Adresse De Site Raisonnable").every((d) => d.split(".")[0].length <= 40));
});

test("preuve par le SIREN : écritures courantes acceptées, nombres voisins refusés", () => {
  const s = "823456789";
  assert.equal(pageHasSiren("<p>RCS Lyon 823 456 789</p>", s), true);
  assert.equal(pageHasSiren("<p>SIREN : 823456789</p>", s), true);
  assert.equal(pageHasSiren("<p>Siret 823.456.789.00012</p>", s), true);
  assert.equal(pageHasSiren("<p>SIRET 82345678900012</p>", s), true);
  assert.equal(pageHasSiren("<p>N° TVA FR 12 823456789</p>", s), true);
  assert.equal(pageHasSiren("<p>RCS&nbsp;823&nbsp;456&nbsp;789</p>", s), true);
  assert.equal(pageHasSiren("<p>Tél. 0823456789</p>", s), false); // précédé d'un chiffre
  assert.equal(pageHasSiren("<p>Réf. 8234567891</p>", s), false); // nombre plus long qui n'est pas un SIRET
  assert.equal(pageHasSiren("<p>SIREN 823 456 788</p>", s), false);
  assert.equal(pageHasSiren('<a href="/x?id=823456789">lien</a><script>var siren="823456789"</script>', s), false); // seulement le texte visible
  assert.equal(pageHasSiren("<p>823456789</p>", "pas-un-siren"), false);
});
