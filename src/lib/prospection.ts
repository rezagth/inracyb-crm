/**
 * Moteur de prospection : scripts d'appel, séquences de mails et réponses aux objections,
 * personnalisés selon le prospect (secteur, interlocuteur) et ton profil (Paramètres).
 * Repris de la maquette validée. Les textes restent honnêtes : pas de références inventées.
 */
import { addDays, today } from "./format";

export type OfferKey = "audit" | "ciso" | "ia";
export type Prospect = { name: string; sector: string; contact: string; role: string; email: string; phone: string };
export type Profile = { me: string; company: string; iaBrand: string; phone: string; email: string; prixAuditCents: number; calUrl: string };
export type Step = { t: string; lines: string[]; tip?: string };
export type Mail = { k: string; d: number; label: string; subject: string; body: string; tip: string };
export type Objection = { id: string; o: string; q: string; a: string };

export const OFFER_KEYS: OfferKey[] = ["audit", "ciso", "ia"];
export const OFFER_FROM_COMPANY: Record<string, OfferKey> = { Audit: "audit", CISOaaS: "ciso", IA: "ia" };

export const SECT: Record<string, { who: string; data: string; risk: string; ia: string }> = {
      "Juridique": { who: "cabinets d'avocats", data: "des dossiers clients couverts par le secret professionnel", risk: "un piratage de messagerie ou une fraude au faux RIB sur des fonds clients", ia: "le tri des mails, le suivi des échéances et la préparation de trames de documents" },
      "Notariat": { who: "études notariales", data: "des actes, des pièces d'état civil et des fonds clients", risk: "une fraude au faux RIB au moment d'un virement", ia: "la collecte et la relance des pièces de dossiers" },
      "Santé": { who: "cabinets et structures de santé", data: "des données de santé de vos patients", risk: "un rançongiciel qui bloque l'agenda et les dossiers patients", ia: "la gestion des rendez-vous, les rappels patients et le tri du secrétariat" },
      "Expertise comptable": { who: "cabinets d'expertise comptable", data: "les données financières et fiscales de vos clients", risk: "un piratage de messagerie en pleine période fiscale", ia: "la collecte des pièces, les relances clients et la pré-saisie" },
      "Immobilier": { who: "agences immobilières", data: "les pièces d'identité et les dossiers de vos clients", risk: "un faux RIB envoyé au moment d'un acompte", ia: "la qualification des demandes, les relances et le montage des dossiers" },
      "Autres": { who: "PME", data: "les données de vos clients et de vos équipes", risk: "un piratage de messagerie ou un rançongiciel", ia: "les tâches administratives répétitives : relances, saisie, tri des mails" }
    };

export const OFFER_KIT: Record<OfferKey, { l: string; full: string; topic: string; hasNot: boolean; one: string; incl: string[] }> = {
      audit: { l: "Audit forfaitaire", full: "Audit cyber forfaitaire", topic: "sécurité informatique", hasNot: true,
        one: "Un état des lieux complet de la sécurité, à prix fixe, avec un plan d'action priorisé.",
        incl: ["Entretien de cadrage avec le dirigeant", "Revue des comptes, mots de passe et double authentification", "Vérification des sauvegardes et d'une restauration", "Messagerie, postes de travail, Wi-Fi et accès à distance", "Rapport clair et plan d'action priorisé, que le client garde"] },
      ciso: { l: "RSSI externalisé", full: "RSSI externalisé (CISOaaS)", topic: "sécurité informatique", hasNot: true,
        one: "Un responsable sécurité à temps partagé : règles, protections, formation des équipes et pilotage du plan d'action.",
        incl: ["Politique de sécurité et règles simples pour l'équipe", "Mise en place des protections de base (double authentification, sauvegardes, postes)", "Sensibilisation des équipes au phishing et à la fraude", "Interlocuteur des prestataires informatiques", "Réponses aux questionnaires sécurité (assureur, clients)", "Plan de réponse en cas d'incident"] },
      ia: { l: "Automatisation IA", full: "Automatisation par agents IA", topic: "tâches administratives", hasNot: false,
        one: "Des assistants et automatisations IA sur mesure pour supprimer les tâches répétitives.",
        incl: ["Choix d'une première tâche à fort gain de temps", "Automatisation branchée sur les outils existants", "Test sur de vrais dossiers avant de généraliser", "Sécurité et confidentialité des données dès la conception"] }
    };

export const NOT_DO = ["Pas de SOC ni de surveillance 24 h/24", "Pas d'astreinte 24 h/24", "Pas de tests d'intrusion (j'oriente vers un spécialiste)", "Pas de Kubernetes ni d'infrastructure as code"];

const eurInt = (cents: number) => Math.round(cents / 100).toLocaleString("fr-FR") + " €";

/** Les 2 prochains jours ouvrés (pour proposer des créneaux précis). */
export function nextBiz(n: number, from = today()): string[] {
  let d = from;
  const out: string[] = [];
  while (out.length < n) {
    d = addDays(d, 1);
    const wd = new Date(d + "T12:00:00Z").getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
}

export function frDay(d: string): string {
  const x = new Date(d + "T12:00:00Z");
  const j = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][x.getUTCDay()];
  const m = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"][x.getUTCMonth()];
  return j + " " + x.getUTCDate() + " " + m;
}

/** Formule d'appel adaptée : Maître pour avocats et notaires, Docteur pour « Dr ». */
export function salut(c: Prospect) {
  const raw = String(c.contact || "").trim();
  const isDr = /^Dr\.?\s/i.test(raw);
  const parts = raw.replace(/^Dr\.?\s+/i, "").split(/\s+/).filter(Boolean);
  const first = parts[0] || "",
    last = parts.slice(1).join(" ") || first;
  if (!raw || raw === "—") return { oral: "Madame, Monsieur", mail: "Madame, Monsieur", name: "le dirigeant" };
  if (isDr) return { oral: "Docteur " + last, mail: "Docteur " + last, name: "Dr " + first + " " + last };
  if (c.sector === "Juridique" || c.sector === "Notariat") return { oral: "Maître " + last, mail: "Maître " + last, name: first + " " + last };
  return { oral: first + " " + last, mail: first + " " + last, name: first + " " + last };
}

function ctx(c: Prospect, offer: OfferKey, p: Profile) {
  const S = SECT[c.sector] || SECT["Autres"];
  const me = p.me.trim() || "[Ton prénom Nom]";
  const brand = offer === "ia" ? p.iaBrand.trim() || "Elyrion Labs" : p.company.trim() || "InfraCyb";
  const biz = nextBiz(2);
  return {
    S,
    me,
    brand,
    co: c.name,
    sal: salut(c),
    phone: p.phone.trim() || "[ton numéro]",
    email: p.email.trim() || "[ton e-mail]",
    prix: p.prixAuditCents > 0 ? eurInt(p.prixAuditCents) + " HT" : "[PRIX] € HT",
    c1: frDay(biz[0]) + " à 10 h",
    c2: frDay(biz[1]) + " à 14 h 30",
    later: frDay(addDays(today(), 7)),
    sig: me + "\n" + (offer === "ia" ? "Automatisation IA — " + brand : "Consultant en cybersécurité — " + brand) + "\n" + (p.phone.trim() || "[ton numéro]") + " · " + (p.email.trim() || "[ton e-mail]"),
  };
}

export function scripts(c: Prospect, offer: OfferKey, p: Profile) {
    const x = ctx(c, offer, p), S = x.S;
    const open: Step = { t: "Ouverture", lines: ["Bonjour, je suis bien avec " + x.sal.oral + " ?", "Ici " + x.me + ", de " + x.brand + ". Je vous appelle sans rendez-vous : vous m'accordez 30 secondes pour vous dire pourquoi, et vous me dites si on continue ?"], tip: "Souris, parle lentement et attends la réponse. Un « allez-y » vaut permission." };
    const close = function (goal: string): Step { return { t: "Proposer le rendez-vous", lines: ["Je vous propose 20 minutes en visio pour " + goal + " : plutôt " + x.c1 + ", ou " + x.c2 + " ?"], tip: "Propose toujours deux créneaux précis. Ton seul objectif au téléphone : le rendez-vous, pas la vente." }; };
    const fallback: Step = { t: "S'il n'est pas prêt", lines: ["Pas de souci. Je vous envoie un mail court avec l'essentiel, et je vous rappelle " + x.later + " pour en parler 5 minutes. Ça vous va ?"], tip: "Choisis « À rappeler » ou « Envoyer un mail » à la fin : le CRM planifie la relance pour toi." };
    let steps: Step[], vm: string, mails: Mail[];
    if (offer === "audit") {
      steps = [open,
        { t: "Raison de l'appel", lines: ["Mon métier, c'est la sécurité informatique des " + S.who + " et des PME.", "Chez " + x.co + ", vous gérez " + S.data + ". Un des scénarios les plus redoutés pour une structure comme la vôtre, c'est " + S.risk + ".", "Je propose un audit à prix fixe qui montre clairement où vous en êtes et quoi corriger en priorité."] },
        { t: "Questions de découverte", lines: ["Aujourd'hui, qui s'occupe de votre informatique : un prestataire, quelqu'un en interne, ou un peu tout le monde ?", "Vos sauvegardes : avez-vous déjà testé une restauration ?", "La double authentification est-elle activée sur toutes vos messageries ?", "Votre assureur ou vos clients vous ont-ils déjà envoyé un questionnaire sécurité ?"], tip: "Note les réponses. Chaque « je ne sais pas » est un argument pour l'audit." },
        { t: "Présenter l'audit", lines: ["Concrètement : on fait le point ensemble, puis je vérifie les comptes et mots de passe, les sauvegardes, la messagerie, les postes et les accès à distance.", "Vous recevez un rapport clair avec un plan d'action priorisé. Prix fixe : " + x.prix + ", sans surprise.", "Le rapport vous appartient, que l'on travaille ensemble ensuite ou non."] },
        close("cadrer l'audit"), fallback];
      vm = "Bonjour " + x.sal.oral + ", " + x.me + " de " + x.brand + ", au " + x.phone + ". Je vous appelle au sujet de la sécurité informatique de " + x.co + " : je propose un audit à prix fixe pour les " + S.who + ". Je vous envoie un mail court et je retente ma chance " + x.later + ". Bonne journée.";
      mails = [
        { k: "J0", d: 0, label: "Premier contact", subject: "Une question sur la sécurité de " + x.co,
          body: "Bonjour " + x.sal.mail + ",\n\nJe m'appelle " + x.me + ", consultant en cybersécurité (" + x.brand + "). Je me consacre à la sécurité informatique des " + S.who + " et des PME.\n\nChez " + x.co + ", vous gérez " + S.data + ". Un des scénarios les plus redoutés pour une structure comme la vôtre, c'est " + S.risk + " — et il se joue souvent sur trois points : la double authentification, les sauvegardes et la gestion des accès.\n\nJe propose un audit cyber à prix fixe (" + x.prix + ") : je vérifie ces points et quelques autres, puis vous recevez un rapport clair avec un plan d'action priorisé. Le rapport vous appartient, que l'on travaille ensemble ensuite ou non.\n\nSeriez-vous disponible 20 minutes " + x.c1 + " ou " + x.c2 + " pour en parler ?\n\nBien cordialement,\n" + x.sig,
          tip: "Envoie-le le matin. Personnalise une phrase si tu as vu quelque chose sur son site." },
        { k: "J+3", d: 3, label: "Relance courte", subject: "Re: Une question sur la sécurité de " + x.co,
          body: "Bonjour " + x.sal.mail + ",\n\nJe me permets de remonter mon message avec une seule question, sans engagement : savez-vous si la double authentification est activée sur toutes les messageries de " + x.co + " ?\n\nSi la réponse est « je ne sais pas », l'audit est fait pour vous.\n\nBien à vous,\n" + x.me,
          tip: "Réponds dans le même fil que le premier mail : c'est plus naturel." },
        { k: "J+7", d: 7, label: "Mail utile", subject: "3 vérifications à faire cette semaine chez " + x.co,
          body: "Bonjour " + x.sal.mail + ",\n\nMême sans travailler ensemble, voici trois vérifications simples qui réduisent fortement les risques :\n\n1. Activer la double authentification sur toutes les messageries.\n2. Tester une restauration de sauvegarde, pas seulement vérifier qu'elle existe.\n3. Fixer une règle simple : tout changement de RIB se confirme par téléphone, à un numéro déjà connu.\n\nSi vous voulez qu'on vérifie ces points et le reste ensemble, l'audit est à prix fixe : " + x.prix + ".\n\nBien cordialement,\n" + x.sig,
          tip: "Ce mail donne de la valeur sans rien demander : c'est souvent lui qui obtient une réponse." },
        { k: "J+14", d: 14, label: "Dernier message", subject: "Je clos le sujet ?",
          body: "Bonjour " + x.sal.mail + ",\n\nSans retour de votre part, je suppose que ce n'est pas le bon moment. Je ne vous relancerai plus sur ce sujet.\n\nSi un jour vous souhaitez faire le point sur la sécurité de " + x.co + ", il suffit de répondre à ce mail.\n\nBonne continuation,\n" + x.me,
          tip: "Court et poli. S'il ne répond pas, passe-le en « Perdu » ou recontacte-le dans quelques mois." }
      ];
    } else if (offer === "ciso") {
      steps = [open,
        { t: "Raison de l'appel", lines: ["Les " + S.who + " gèrent " + S.data + ", mais ont rarement un responsable de la sécurité en interne.", "C'est mon métier : je joue ce rôle à temps partagé, en RSSI externalisé, pour une fraction du coût d'un poste à plein temps."] },
        { t: "Questions de découverte", lines: ["Si demain vos postes sont bloqués par un rançongiciel, qui pilote la suite chez " + x.co + " ?", "Qui répond aux questionnaires sécurité de vos clients ou de votre assureur ?", "Vos équipes ont-elles déjà été sensibilisées au phishing et aux faux virements ?", "Quand un collaborateur part, qui coupe ses accès, et en combien de temps ?"], tip: "Laisse des silences. S'il hésite sur « qui pilote », tu as trouvé le besoin." },
        { t: "Présenter le RSSI externalisé", lines: ["Concrètement, je deviens votre responsable sécurité : je fixe des règles simples, je mets en place les protections de base (double authentification, sauvegardes, postes), je forme vos équipes et je suis votre interlocuteur avec vos prestataires informatiques.", "Le tarif dépend de votre taille et du temps nécessaire : je vous fais un devis après un premier état des lieux."] },
        close("faire un premier état des lieux"), fallback];
      vm = "Bonjour " + x.sal.oral + ", " + x.me + " de " + x.brand + ", au " + x.phone + ". J'aide les " + S.who + " qui n'ont pas de responsable sécurité en interne : je joue ce rôle à temps partagé. Je vous envoie un mail court et je vous rappelle " + x.later + ". Bonne journée.";
      mails = [
        { k: "J0", d: 0, label: "Premier contact", subject: "Qui est le responsable sécurité de " + x.co + " ?",
          body: "Bonjour " + x.sal.mail + ",\n\nJe m'appelle " + x.me + ", consultant en cybersécurité (" + x.brand + ").\n\nDans beaucoup de " + S.who + ", personne n'a officiellement ce rôle : l'informatique tourne, mais personne ne pilote la sécurité — les règles, les accès, la formation des équipes, le plan en cas d'incident. Pourtant, vous gérez " + S.data + ".\n\nC'est exactement ce que je fais en tant que RSSI externalisé, à temps partagé : je fixe les règles, je mets en place les protections de base, je forme vos équipes et je suis votre interlocuteur avec vos prestataires. Tarif sur devis, selon votre taille.\n\nAuriez-vous 20 minutes " + x.c1 + " ou " + x.c2 + " pour un premier état des lieux ?\n\nBien cordialement,\n" + x.sig,
          tip: "La question en objet suffit souvent à faire ouvrir le mail." },
        { k: "J+3", d: 3, label: "Relance courte", subject: "Re: Qui est le responsable sécurité de " + x.co + " ?",
          body: "Bonjour " + x.sal.mail + ",\n\nUne question rapide : si demain un poste de " + x.co + " est bloqué par un rançongiciel, savez-vous qui appelle qui, et dans quel ordre ?\n\nSi la réponse n'est pas claire, c'est le premier sujet que je traiterais avec vous.\n\nBien à vous,\n" + x.me,
          tip: "Une seule question, facile à répondre." },
        { k: "J+7", d: 7, label: "Mail utile", subject: "Questionnaire sécurité de votre assureur ou d'un client ?",
          body: "Bonjour " + x.sal.mail + ",\n\nDe plus en plus d'assureurs et de clients demandent des preuves de sécurité : double authentification, sauvegardes, sensibilisation des équipes…\n\nSi vous recevez ce type de questionnaire, je peux préparer les réponses avec vous et corriger ce qui manque. C'est souvent le point de départ idéal pour un accompagnement en RSSI externalisé.\n\nBien cordialement,\n" + x.sig,
          tip: "Un sujet concret qui arrive à beaucoup de structures." },
        { k: "J+14", d: 14, label: "Dernier message", subject: "Je clos le sujet ?",
          body: "Bonjour " + x.sal.mail + ",\n\nSans retour de votre part, je suppose que ce n'est pas la priorité du moment. Je ne vous relancerai plus.\n\nLe jour où vous voudrez quelqu'un pour piloter la sécurité de " + x.co + ", il suffit de répondre à ce mail.\n\nBonne continuation,\n" + x.me,
          tip: "Laisse toujours la porte ouverte." }
      ];
    } else {
      steps = [open,
        { t: "Raison de l'appel", lines: ["Je conçois des assistants et automatisations IA sur mesure pour les " + S.who + " et les PME.", "Typiquement : " + S.ia + ". L'idée, c'est de vous rendre du temps sur l'administratif."] },
        { t: "Questions de découverte", lines: ["Quelle tâche vous agace le plus parce qu'elle revient tous les jours ?", "Combien de temps passez-vous chaque semaine sur les relances et le tri des mails ?", "Vous utilisez déjà des outils d'IA, même ChatGPT ?", "Vos documents et vos échanges sont dans quels outils aujourd'hui : logiciel métier, Google, Microsoft ?"], tip: "Fais-le parler de sa journée. La tâche à automatiser sort toute seule." },
        { t: "Présenter l'approche", lines: ["Je pars d'une seule tâche, je construis l'automatisation, et vous la testez sur vos vrais dossiers avant d'aller plus loin.", "Vos données restent maîtrisées : on choisit ensemble ce que l'IA voit et ne voit pas. Comme je viens de la cybersécurité, la sécurité fait partie du projet dès le départ."] },
        close("choisir la première tâche à automatiser"), fallback];
      vm = "Bonjour " + x.sal.oral + ", " + x.me + " de " + x.brand + ", au " + x.phone + ". Je crée des automatisations IA sur mesure pour les " + S.who + ", par exemple pour " + S.ia + ". Je vous envoie un mail court et je vous rappelle " + x.later + ". Bonne journée.";
      mails = [
        { k: "J0", d: 0, label: "Premier contact", subject: x.co + " : et si l'administratif se faisait tout seul ?",
          body: "Bonjour " + x.sal.mail + ",\n\nJe m'appelle " + x.me + " et je crée des assistants et automatisations IA sur mesure (" + x.brand + ").\n\nDans les " + S.who + ", les tâches qui reviennent le plus sont souvent " + S.ia + ". Je pars d'une seule tâche, je l'automatise, vous la testez sur vos vrais dossiers, et on décide ensuite d'aller plus loin ou non.\n\nComme je viens de la cybersécurité, vos données restent maîtrisées : on choisit ensemble ce que l'IA voit.\n\nQuelle tâche vous coûte le plus de temps chaque semaine ? Je vous propose 20 minutes " + x.c1 + " ou " + x.c2 + " pour en parler.\n\nBien cordialement,\n" + x.sig,
          tip: "Prospection IA séparée de la cyber : signe avec " + x.brand + "." },
        { k: "J+3", d: 3, label: "Relance courte", subject: "Re: " + x.co + " : et si l'administratif se faisait tout seul ?",
          body: "Bonjour " + x.sal.mail + ",\n\nUne question : si vous pouviez supprimer une seule tâche répétitive demain, laquelle serait-ce ?\n\nRépondez-moi en une ligne, je vous dis si c'est automatisable.\n\nBien à vous,\n" + x.me,
          tip: "Une réponse d'une ligne suffit à lancer la discussion." },
        { k: "J+7", d: 7, label: "Mail utile", subject: "3 idées d'automatisation pour " + x.co,
          body: "Bonjour " + x.sal.mail + ",\n\nVoici trois automatisations simples que je mets en place :\n\n1. Les mails entrants triés et résumés chaque matin, avec un brouillon de réponse.\n2. Les relances (pièces manquantes, factures, rendez-vous) envoyées au bon moment, sans y penser.\n3. Les documents reçus lus et classés, les informations clés reprises dans vos outils.\n\nSi l'une d'elles vous parle, on peut la tester sur vos vrais dossiers.\n\nBien cordialement,\n" + x.sig,
          tip: "Des exemples concrets aident le prospect à se projeter." },
        { k: "J+14", d: 14, label: "Dernier message", subject: "Je clos le sujet ?",
          body: "Bonjour " + x.sal.mail + ",\n\nSans retour, je suppose que ce n'est pas le bon moment. Je ne vous relancerai plus.\n\nLe jour où une tâche vous prend trop de temps, répondez simplement à ce mail.\n\nBonne continuation,\n" + x.me,
          tip: "Court et poli." }
      ];
    }
    const calUrl = p.calUrl.trim();
    mails = mails.map(function (m: Mail) { return Object.assign({}, m, { body: m.body + (calUrl && (m.k === "J0" || m.k === "J+7") ? "\n\nPS : vous pouvez aussi réserver directement un créneau ici : " + calUrl : "") + "\n\n—\nVous ne souhaitez plus recevoir mes messages ? Répondez simplement « stop »." }); });
    return { steps: steps, vm: vm, mails: mails, x: x };
}
export function objections(c: Prospect, offer: OfferKey, p: Profile) {
    const x = ctx(c, offer, p), S = x.S, O = OFFER_KIT[offer];
    const start = ({ audit: "un audit à prix fixe", ciso: "de commencer par un premier état des lieux, puis un devis clair", ia: "de commencer par une seule tâche, testée sur vos vrais dossiers" } as Record<OfferKey, string>)[offer];
    const all: Objection[] = [
      { id: "temps", o: "all", q: "Je n'ai pas le temps.", a: "Je comprends, je vous appelle sans prévenir. Je vous propose 20 minutes au moment qui vous arrange : " + x.c1 + " ou " + x.c2 + " ? Si ce n'est pas pour vous, vous me le direz à ce moment-là." },
      { id: "mail", o: "all", q: "Envoyez-moi un mail.", a: "Avec plaisir. Pour qu'il vous soit utile : quel est aujourd'hui votre principal souci côté " + O.topic + " ? … Je vous l'envoie aujourd'hui et je vous rappelle " + x.later + " pour en parler 5 minutes, ça vous va ?" },
      { id: "presta", o: "all", q: "On a déjà un informaticien / un prestataire.", a: offer === "ia" ? "Très bien, c'est même un atout : je travaille avec lui pour brancher les automatisations sur vos outils existants. Lui fait tourner l'informatique, moi je vous fais gagner du temps." : "Très bien, c'est un atout. Je ne le remplace pas : il fait tourner votre informatique, moi je vérifie qu'elle est protégée et je vous donne un avis indépendant. On travaille ensemble, pas l'un contre l'autre." },
      { id: "petit", o: "cyber", q: "On est trop petits pour être visés.", a: "C'est ce que pensent beaucoup de petites structures, et c'est justement pour ça qu'elles sont visées : les attaques sont largement automatisées, elles cherchent les portes ouvertes, pas la taille. Et chez " + x.co + ", vous gérez " + S.data + ", ça a de la valeur." },
      { id: "prix", o: "all", q: "Pas de budget / c'est trop cher.", a: offer === "audit" ? "L'audit est à prix fixe, " + x.prix + ", et il vous dit exactement où mettre (ou ne pas mettre) votre argent ensuite. C'est souvent ce qui évite de dépenser au mauvais endroit." : offer === "ciso" ? "Le tarif dépend de votre taille et du temps nécessaire : c'est une fraction d'un poste à plein temps. On peut aussi commencer par un audit à prix fixe pour voir où vous en êtes." : "On démarre par une seule tâche : le coût reste limité et vous voyez le gain avant d'aller plus loin." },
      { id: "6mois", o: "all", q: "Rappelez-moi dans 6 mois.", a: "D'accord, je le note. Une question pour que mon rappel soit utile : qu'est-ce qui aura changé d'ici là ? … En attendant, je vous envoie quelques conseils simples par mail, sans engagement." },
      { id: "refs", o: "all", q: "Vous avez des références ?", a: "Je démarre mon activité en indépendant, je ne vais pas vous inventer des références. C'est pour ça que je propose " + start + " : un livrable concret, un prix connu à l'avance, et vous jugez sur pièce." },
      { id: "numero", o: "all", q: "Qui vous a donné mon numéro ?", a: "Je l'ai trouvé sur votre site ou un annuaire professionnel : je contacte directement les " + S.who + " car c'est mon domaine. Si vous préférez que je ne vous rappelle pas, je le note tout de suite." },
      { id: "jamais", o: "audit", q: "On n'a jamais eu de problème.", a: "Tant mieux, et c'est le meilleur moment pour vérifier : une intrusion peut rester invisible longtemps. L'audit vous dira si c'est de la chance ou de la maîtrise." },
      { id: "rssi", o: "ciso", q: "Un RSSI, c'est pour les grands groupes.", a: "Un RSSI à plein temps, oui. Mais des règles claires, des accès bien gérés, des équipes formées et un plan en cas d'incident, toute structure qui gère " + S.data + " en a besoin. Je fais ce travail à temps partagé, au juste niveau pour vous." },
      { id: "247", o: "ciso", q: "Vous êtes joignable 24 h/24 en cas d'attaque ?", a: "Non, je ne fais pas d'astreinte 24 h/24 et je ne vais pas vous le promettre. Mon rôle est de réduire fortement le risque en amont et de préparer un plan de réponse clair : qui appeler, dans quel ordre, avec quels contacts (assureur, prestataire, autorités)." },
      { id: "pentest", o: "cyber", q: "Vous faites des tests d'intrusion ?", a: "Non, ce n'est pas mon métier. Si vous en avez besoin, je vous aide à cadrer la demande et à choisir un prestataire spécialisé, puis à corriger ce qu'il trouve." },
      { id: "fiable", o: "ia", q: "L'IA, ce n'est pas fiable.", a: "Vous avez raison de vous méfier. C'est pour ça que je commence par une tâche précise, testée sur vos vrais dossiers, avec une validation humaine là où c'est nécessaire. Si ce n'est pas fiable, on ne le met pas en place." },
      { id: "donnees", o: "ia", q: "Et mes données ? Le secret professionnel ?", a: "C'est la première question que je traite : je viens de la cybersécurité. On choisit ensemble les outils et ce que l'IA voit, on limite les accès, et rien n'est mis en place sans votre accord." },
      { id: "chatgpt", o: "ia", q: "On utilise déjà ChatGPT.", a: "Très bien, vous en connaissez déjà l'intérêt. La différence : une automatisation fait le travail toute seule, au bon moment, branchée sur vos outils, sans copier-coller." },
      { id: "repetitif", o: "ia", q: "On n'a pas de tâches répétitives.", a: "Ça m'intéresse : comment gérez-vous aujourd'hui les relances, le tri des mails et la collecte de documents ? C'est souvent là que le temps part sans qu'on s'en rende compte." }
    ];
    return all.filter(function (o) { return o.o === "all" || o.o === offer || (o.o === "cyber" && offer !== "ia"); });
}
