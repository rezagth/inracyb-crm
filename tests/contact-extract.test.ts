import { test } from "node:test";
import assert from "node:assert/strict";
import { contactLinks, extractEmails, extractPhones, normalizePhone, pickBestEmail, siteFromNotes, isJunkEmail } from "../src/lib/contact-extract";

const page = `
<html><body>
<a href="/nous-contacter">Contact</a> <a href="/mentions-legales.html">Mentions légales</a> <a href="https://autre-site.fr/contact">Autre</a> <a href="/docs/plaquette.pdf">Contact PDF</a>
<img src="logo@2x.png">
<a href="mailto:marie.dupont@cabinet-dupont.fr?subject=Bonjour">Écrire</a>
<p>Accueil : contact&#64;cabinet-dupont.fr — ou jean.martin [at] cabinet-dupont.fr</p>
<p>Tél. <a href="tel:+33142000000">+33 1 42 00 00 00</a> · Fax 01.42.00.00.01 · Service client 0 800 12 34 56</p>
<script>var x = "error@sentry.io";</script>
<footer>noreply@cabinet-dupont.fr · dpo@cabinet-dupont.fr · xyz@wixpress.com</footer>
</body></html>`;

test("e-mails : mailto, entités HTML et « [at] » ; sans images, sans adresses techniques", () => {
  const e = extractEmails(page);
  assert.deepEqual(e.sort(), ["contact@cabinet-dupont.fr", "jean.martin@cabinet-dupont.fr", "marie.dupont@cabinet-dupont.fr"]);
});

test("adresses à exclure", () => {
  for (const bad of ["logo@2x.png", "a@sentry.io", "noreply@x.fr", "dpo@x.fr", "x@example.com", "user@wixpress.com"]) assert.ok(isJunkEmail(bad), bad);
  assert.ok(!isJunkEmail("contact@cabinet.fr"));
});

test("téléphones français : formatés, dédoublonnés, sans numéros surtaxés (08)", () => {
  assert.deepEqual(extractPhones(page), ["01 42 00 00 00", "01 42 00 00 01"]);
  assert.equal(normalizePhone("+33 (0)6 12 34 56 78"), "06 12 34 56 78");
  assert.equal(normalizePhone("0033 1 23 45 67 89"), "01 23 45 67 89");
  assert.equal(normalizePhone("12 34"), null);
  assert.equal(normalizePhone("0800 12 34 56"), null);
});

test("liens utiles : contact d'abord, même site uniquement, pas de PDF", () => {
  assert.deepEqual(contactLinks(page, "https://www.cabinet-dupont.fr/"), ["https://www.cabinet-dupont.fr/nous-contacter", "https://www.cabinet-dupont.fr/mentions-legales.html"]);
});

test("meilleure adresse : nominative du dirigeant, puis nominative, puis générique", () => {
  const all = ["contact@cabinet-dupont.fr", "jean.martin@cabinet-dupont.fr", "marie.dupont@cabinet-dupont.fr", "dupont@gmail.com"];
  assert.equal(pickBestEmail(all, "cabinet-dupont.fr", "Dupont").best, "marie.dupont@cabinet-dupont.fr");
  assert.equal(pickBestEmail(["contact@cabinet-dupont.fr", "jean.martin@cabinet-dupont.fr"], "cabinet-dupont.fr", "").best, "jean.martin@cabinet-dupont.fr");
  assert.equal(pickBestEmail(["contact@cabinet-dupont.fr", "autre@gmail.com"], "cabinet-dupont.fr", "").best, "contact@cabinet-dupont.fr");
  assert.deepEqual(pickBestEmail([], "x.fr"), { best: "", others: [] });
});

test("site saisi dans les notes", () => {
  assert.equal(siteFromNotes("Trouvée par recherche.\nSite web : https://www.cabinet.fr/accueil, merci"), "https://www.cabinet.fr/accueil");
  assert.equal(siteFromNotes("site web: cabinet.fr"), "https://cabinet.fr");
  assert.equal(siteFromNotes("pas de site"), "");
  assert.equal(siteFromNotes("Site web : localhost"), "");
});
