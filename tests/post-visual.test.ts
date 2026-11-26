import { test } from "node:test";
import assert from "node:assert/strict";
import { bigFontSize, composePostMail, parseVisual, postOfDay, visualJson, type PostRow } from "../src/lib/post-visual";

test("image du post : JSON borné, vide sans phrase principale, taille selon la longueur", () => {
  assert.equal(visualJson("DMARC", "", "légende"), "");
  const j = visualJson("  Baromètre ", "57 %", "x".repeat(300));
  assert.deepEqual(parseVisual(j), { kicker: "Baromètre", big: "57 %", sub: "x".repeat(140) });
  assert.equal(parseVisual(""), null);
  assert.equal(parseVisual("{pas du json"), null);
  assert.equal(parseVisual(JSON.stringify({ big: 42 })), null);
  assert.ok(bigFontSize("57 %") > bigFontSize("3 protections"));
  assert.ok(bigFontSize("3 protections") > bigFontSize("Une brique, pas un bouclier"));
});

const post = (o: Partial<PostRow>): PostRow => ({ id: "p", date: "2026-12-01", network: "LinkedIn", topic: "Je l'ai fait chez moi d'abord", status: "programme", body: "Ce matin, j'ai corrigé un réglage.", visual: visualJson("DMARC", "none → quarantine", ""), ...o });

test("post du jour : LinkedIn, prévu aujourd'hui, pas publié, avec un texte", () => {
  assert.equal(postOfDay([post({})], "2026-12-01")?.id, "p");
  assert.equal(postOfDay([post({ status: "publie" })], "2026-12-01"), null);
  assert.equal(postOfDay([post({ body: "  " })], "2026-12-01"), null);
  assert.equal(postOfDay([post({ network: "Instagram" })], "2026-12-01"), null);
  assert.equal(postOfDay([post({})], "2026-12-02"), null);
});

test("mail du post : objet, texte à copier, image jointe annoncée, lien vers le CRM", () => {
  const m = composePostMail(post({}), "https://crm.exemple.fr");
  assert.equal(m.subject, "À publier aujourd'hui sur LinkedIn : Je l'ai fait chez moi d'abord");
  assert.match(m.text, /avec son image en pièce jointe/);
  assert.match(m.text, /———— TEXTE DU POST ————\n\nCe matin, j'ai corrigé un réglage\.\n\n———/);
  assert.match(m.text, /https:\/\/crm\.exemple\.fr\/marketing/);
  const noImg = composePostMail(post({ visual: "" }), "");
  assert.doesNotMatch(noImg.text, /pièce jointe/);
  assert.match(noImg.text, /^2\. Publie avant 9 h/m);
});
