/** Réponses aux campagnes : classement des messages, rattachement à l'entreprise, brouillon. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildReplyDraft, classifyInbound, matchCompany, parseAddress, type Inbound } from "../src/lib/replies";

const own = ["contact@infracyb.fr"];
const msg = (o: Partial<Inbound>): Inbound => ({ id: "m1", from: "Marie Dupont <marie@dupont.fr>", subject: "Re: Un point sur les réglages mail de dupont.fr", snippet: "Bonjour, oui envoyez-moi le détail.", ...o });

test("adresse extraite de l'en-tête From", () => {
  assert.equal(parseAddress('"Dupont, Marie" <Marie@Dupont.FR>'), "marie@dupont.fr");
  assert.equal(parseAddress("marie@dupont.fr"), "marie@dupont.fr");
  assert.equal(parseAddress("sans adresse"), "");
});

test("une vraie réponse est classée « reponse »", () => {
  assert.equal(classifyInbound(msg({}), own).kind, "reponse");
  assert.equal(classifyInbound(msg({ snippet: "Nous avons un questionnaire de sécurité en cours, en effet. Pouvez-vous m'appeler ? RGPD aussi." }), own).kind, "reponse");
});

test("messages automatiques, rebonds et messages internes sont ignorés", () => {
  for (const m of [
    msg({ autoSubmitted: "auto-replied" }),
    msg({ precedence: "bulk" }),
    msg({ from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" }),
    msg({ from: "noreply@dupont.fr" }),
    msg({ subject: "Réponse automatique : absente jusqu'au 30" }),
    msg({ subject: "Automatic reply: Out of office" }),
    msg({ subject: "Undeliverable: Un point sur les réglages mail" }),
    msg({ from: "InfraCyb <contact@infracyb.fr>" }),
    msg({ from: "pas une adresse" }),
  ]) assert.equal(classifyInbound(m, own).kind, "ignore", JSON.stringify(m));
  assert.equal(classifyInbound(msg({ autoSubmitted: "no" }), own).kind, "reponse");
});

test("demande de ne plus être contactée : désinscription", () => {
  for (const snippet of ["Stop", "Merci de me désinscrire de votre liste.", "Ne me contactez plus svp", "Veuillez supprimer mon adresse de vos fichiers", "unsubscribe me", "Retirez-moi de votre liste", "Supprimez mon adresse"])
    assert.equal(classifyInbound(msg({ snippet }), own).kind, "optout", snippet);
});

test("refus apparent : classé « refus », jamais désinscrit", () => {
  for (const snippet of ["Merci, nous ne sommes pas intéressés.", "Non merci.", "Nous avons déjà un prestataire informatique."]) assert.equal(classifyInbound(msg({ snippet }), own).kind, "refus", snippet);
});

test("une mention de l'RGPD ou de la CNIL n'est pas une désinscription", () => {
  assert.equal(classifyInbound(msg({ snippet: "Nous travaillons justement sur notre conformité RGPD, intéressés par un échange." }), own).kind, "reponse");
});

test("rattachement : adresse exacte, sinon domaine d'entreprise unique, jamais un webmail ni un domaine partagé", () => {
  const contacts = [
    { companyId: "A", email: "marie@dupont.fr" },
    { companyId: "B", email: "paul@martin.fr" },
    { companyId: "C", email: "x@commun.fr" },
    { companyId: "D", email: "y@commun.fr" },
    { companyId: "E", email: "jean@gmail.com" },
  ];
  assert.equal(matchCompany("marie@dupont.fr", contacts), "A");
  assert.equal(matchCompany("assistante@dupont.fr", contacts), "A");
  assert.equal(matchCompany("z@commun.fr", contacts), null);
  assert.equal(matchCompany("autre@gmail.com", contacts), null);
  assert.equal(matchCompany("jean@gmail.com", contacts), "E");
  assert.equal(matchCompany("inconnu@ailleurs.fr", contacts), null);
  assert.equal(matchCompany("", contacts), null);
});

test("brouillon de réponse : prénom, domaine, créneau seulement si le lien est en https", () => {
  const d = buildReplyDraft({ prenom: "Marie", domain: "dupont.fr", me: "Alex", signature: "Alex\nInfraCyb", calUrl: "https://cal.com/alex" });
  assert.ok(d.startsWith("Bonjour Marie,"));
  assert.ok(d.includes("sur dupont.fr") && d.includes("https://cal.com/alex") && d.endsWith("Alex\nInfraCyb"));
  const g = buildReplyDraft({ prenom: "", domain: "", me: "Alex", signature: "", calUrl: "javascript:alert(1)" });
  assert.ok(g.startsWith("Bonjour,") && !g.includes("javascript") && g.includes("Dites-moi quand cela vous arrange.") && g.endsWith("Alex"));
});
