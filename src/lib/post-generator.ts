/**
 * Posts LinkedIn écrits automatiquement (phase T). Règles pures, testées : base de faits vérifiés, calendrier,
 * consignes d'écriture, contrôle anti-invention, republication de secours.
 * L'écriture elle-même est faite par une tâche programmée de l'app Claude, qui lit le contexte (`npm run posts:context`)
 * et dépose ses posts par `npm run posts:insert` : rien n'entre dans le CRM sans passer par validateGeneratedPost.
 */
import { addDaysIso, isBusinessDay } from "./campaign";
import { mailable, mailProvider, parseChecks } from "./diagnostic";
import { DOSSIER_PREUVES, KIT_FAUX_RIB, M365_SECURISE, PACK_COURRIER, SUIVI_COURRIER, SUIVI_PME } from "./pricing";

/** Nombre de posts « Programmé » à venir en dessous duquel une nouvelle série est écrite. */
export const QUEUE_MIN = 10;
/** Taille d'une série. */
export const BATCH_SIZE = 20;
/** Délai minimal avant de republier un ancien post (republication de secours). */
export const RECYCLE_AFTER_DAYS = 90;

/* ———————————— Base de faits ———————————— */

export type Fact = { text: string; numbers: string[]; source: string };

/** Rapport d'activité 2024 de Cybermalveillance.gouv.fr (publié le 27/03/2025), vérifié le 26/11/2026. */
export const CYBER_FACTS: Fact[] = [
  { text: "420 000 demandes d'assistance reçues en 2024, en hausse de 49,9 % en un an", numbers: ["420000", "49,9", "50"], source: "Cybermalveillance.gouv.fr, rapport 2024" },
  { text: "5,4 millions de visiteurs uniques sur la plateforme en 2024 (+47 %)", numbers: ["5,4", "47"], source: "Cybermalveillance.gouv.fr, rapport 2024" },
  { text: "L'hameçonnage est la première menace, tous publics confondus : 64 000 demandes d'assistance et 1,9 million de consultations d'articles", numbers: ["64000", "1,9"], source: "Cybermalveillance.gouv.fr, rapport 2024" },
  { text: "Le piratage de compte est la 2e menace pour les entreprises, en hausse de 55 % ; il vise surtout les identifiants de messagerie", numbers: ["55"], source: "Cybermalveillance.gouv.fr, rapport 2024" },
  { text: "Les rançongiciels sont la 3e menace pour les entreprises, en baisse et au plus bas depuis quatre ans", numbers: [], source: "Cybermalveillance.gouv.fr, rapport 2024" },
  { text: "Les fraudes au virement : 6 000 demandes d'assistance (+18 %), notamment par usurpation de l'identité d'un créancier après le piratage d'une messagerie", numbers: ["6000", "18"], source: "Cybermalveillance.gouv.fr, rapport 2024" },
];

const eurosNum = (cents: number) => String(Math.round(cents / 100));

/** Offres d'InfraCyb (prix publics en € HT), utilisables dans un post « offre » du vendredi. */
export const OFFER_FACTS: Fact[] = [
  { text: `Pack Courrier sécurisé (SPF, DKIM, DMARC) : ${eurosNum(PACK_COURRIER.publicCents)} € HT, puis suivi mensuel à ${eurosNum(SUIVI_COURRIER.publicCents)} € HT par mois`, numbers: [eurosNum(PACK_COURRIER.publicCents), eurosNum(SUIVI_COURRIER.publicCents)], source: "www.infracyb.fr/dmarc" },
  { text: `Kit anti-faux-RIB : ${eurosNum(KIT_FAUX_RIB.publicCents)} € HT`, numbers: [eurosNum(KIT_FAUX_RIB.publicCents)], source: "www.infracyb.fr/faux-rib" },
  { text: `Microsoft 365 sécurisé, jusqu'à ${M365_SECURISE.maxAccounts} comptes : ${eurosNum(M365_SECURISE.publicCents)} € HT`, numbers: [eurosNum(M365_SECURISE.publicCents), String(M365_SECURISE.maxAccounts)], source: "www.infracyb.fr/microsoft-365-pirate" },
  { text: `Dossier de preuves sécurité (questionnaires d'assurance et de clients) : ${eurosNum(DOSSIER_PREUVES.publicCents)} € HT`, numbers: [eurosNum(DOSSIER_PREUVES.publicCents)], source: "www.infracyb.fr/questionnaire-assurance-cyber" },
  { text: `Suivi Sécurité PME : ${eurosNum(SUIVI_PME.monthlyCents)} € HT par mois, ${SUIVI_PME.minMonths} mois d'engagement`, numbers: [eurosNum(SUIVI_PME.monthlyCents), String(SUIVI_PME.minMonths)], source: "CRM InfraCyb" },
  { text: "Synthèse d'une page gratuite sur le domaine d'une entreprise, sans aucun accès : il suffit d'envoyer son nom de domaine en message privé", numbers: [], source: "InfraCyb" },
];

export type Barometre = { sample: number; dmarcEnforce: number; dmarcNone: number; dmarcAbsent: number; spfSoft: number; m365: number; google: number; from: string; to: string };

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

/**
 * Baromètre en direct, à partir du dernier diagnostic de chaque entreprise (lignes de company_diagnostics, statut « fait »,
 * domaine de messagerie connu). Seuls les domaines qui reçoivent des mails comptent. Aucun nom ni domaine n'en sort.
 */
export function barometreFrom(rows: { findings: string; checkedOn: string }[]): Barometre {
  const b: Barometre = { sample: 0, dmarcEnforce: 0, dmarcNone: 0, dmarcAbsent: 0, spfSoft: 0, m365: 0, google: 0, from: "", to: "" };
  for (const r of rows) {
    const checks = parseChecks(r.findings);
    const mx = checks.find((c) => c.id === "mx");
    if (!mx || mx.status !== "conforme") continue;
    b.sample++;
    if (!b.from || r.checkedOn < b.from) b.from = r.checkedOn;
    if (r.checkedOn > b.to) b.to = r.checkedOn;
    const dm = checks.find((c) => c.id === "dmarc");
    if (dm?.status === "conforme") b.dmarcEnforce++;
    else if (dm?.variant === "dmarc-none" || /p=none/i.test(dm?.proof ?? "")) b.dmarcNone++;
    else if (dm?.variant === "dmarc-absent" || (dm && mailable(dm))) b.dmarcAbsent++;
    if (/~all|\?all/.test(checks.find((c) => c.id === "spf")?.proof ?? "")) b.spfSoft++;
    const prov = mailProvider(checks);
    if (prov === "microsoft365") b.m365++;
    if (prov === "google") b.google++;
  }
  return b;
}

/** Faits du baromètre, avec les nombres qu'un post a le droit de citer. */
export function barometreFacts(b: Barometre): Fact[] {
  if (b.sample < 20) return [];
  const notBlocking = b.dmarcNone + b.dmarcAbsent;
  const src = `Baromètre InfraCyb de la messagerie des PME (${b.sample} PME, mesures passives du ${b.from} au ${b.to}) — www.infracyb.fr/barometre-messagerie`;
  const f = (text: string, ...n: number[]): Fact => ({ text, numbers: n.map(String), source: src });
  return [
    f(`${pct(notBlocking, b.sample)} % des ${b.sample} PME analysées n'ont aucune protection DMARC qui bloque les faux mails (absente ou en « p=none »)`, pct(notBlocking, b.sample), b.sample),
    f(`${pct(b.dmarcAbsent, b.sample)} % ne publient aucune politique DMARC`, pct(b.dmarcAbsent, b.sample)),
    f(`${pct(b.dmarcNone, b.sample)} % ont un DMARC en mode observation « p=none » : les faux mails sont signalés, pas bloqués`, pct(b.dmarcNone, b.sample)),
    f(`${pct(b.dmarcEnforce, b.sample)} % bloquent ou isolent les faux mails (quarantine ou reject)`, pct(b.dmarcEnforce, b.sample)),
    f(`${pct(b.m365, b.sample)} % utilisent Microsoft 365 pour leur messagerie`, pct(b.m365, b.sample)),
    f(`${pct(b.spfSoft, b.sample)} % ont un SPF permissif (« ~all » ou « ?all »)`, pct(b.spfSoft, b.sample)),
  ];
}

/* ———————————— Calendrier et thèmes ———————————— */

export const THEMES: Record<number, { name: string; pillar: string; brief: string }> = {
  1: { name: "Un chiffre", pillar: "Expertise", brief: "Un chiffre de la base de faits (baromètre ou Cybermalveillance.gouv.fr), ce qu'il veut dire concrètement pour une PME, et la source citée." },
  2: { name: "Conseil pratique", pillar: "Conseil pratique", brief: "Un conseil concret et applicable cette semaine (faux RIB, Microsoft 365, DMARC, double authentification, accès…)." },
  3: { name: "Erreur courante", pillar: "Conseil pratique", brief: "Une erreur fréquente dans les PME, pourquoi elle est risquée, et comment l'éviter." },
  4: { name: "Check-list", pillar: "Conseil pratique", brief: "Une liste de 3 à 5 vérifications simples, numérotées, qu'un dirigeant peut faire lui-même." },
  5: { name: "Coulisses ou question", pillar: "Coulisses", brief: "Les coulisses du métier (méthode, ce que je regarde en premier) ou une question ouverte à la communauté. Une fois sur quatre environ : une proposition (synthèse gratuite ou une offre, avec son prix)." },
};

export const themeOf = (iso: string): (typeof THEMES)[number] => THEMES[new Date(iso + "T12:00:00Z").getUTCDay()] ?? THEMES[2];

/** Prochains jours ouvrés sans post, à partir du lendemain d'aujourd'hui (et après le dernier post déjà prévu). */
export function nextPostDates(today: string, existing: string[], count: number): string[] {
  const taken = new Set(existing);
  const last = existing.filter((d) => d > today).sort().at(-1) ?? today;
  const out: string[] = [];
  for (let d = addDaysIso(last, 1), guard = 0; out.length < count && guard < 400; d = addDaysIso(d, 1), guard++) {
    if (isBusinessDay(d) && !taken.has(d)) out.push(d);
  }
  return out;
}

/* ———————————— Consignes d'écriture ———————————— */

export const WRITING_RULES = [
  "Tu écris des posts LinkedIn pour Noam, consultant indépendant en cybersécurité (InfraCyb, www.infracyb.fr) qui aide les TPE et PME françaises : agences immobilières, cabinets (expertise comptable, avocats, notaires, courtiers), éditeurs de logiciels et ESN.",
  "Français, vouvoiement envers le lecteur, première personne pour Noam. Ton direct, concret, sans jargon ni effet de manche, sans emoji sauf les flèches « → ». Phrases courtes, une idée par ligne, lignes vides entre les paragraphes.",
  "Longueur : entre 400 et 1 300 caractères. Première ligne courte qui accroche (un chiffre, une question ou une situation concrète). Termine par une question au lecteur ou une proposition simple.",
  "Chaque nombre cité (pourcentage, montant, quantité supérieure à 31) doit venir EXACTEMENT de la base de faits fournie, avec sa source nommée dans le post. N'invente aucun chiffre, aucune statistique, aucune étude, aucune date de jugement ou de loi.",
  "N'invente aucun client, aucun témoignage, aucune histoire vécue (« un de mes clients… », « la semaine dernière, une agence… ») : uniquement des situations génériques (« beaucoup d'entreprises… », « le scénario classique… ») et l'expérience de Noam sur son propre domaine.",
  "Ne cite aucune entreprise réelle, aucun nom de domaine d'entreprise, aucune personne. Seuls liens autorisés : www.infracyb.fr (et ses pages), cybermalveillance.gouv.fr. Pas d'adresse e-mail, pas de mention @, au plus 3 hashtags (facultatifs).",
  "Ne traite pas un sujet déjà traité dans les sujets récents fournis : change d'angle, de public ou de thème. Varie les sujets : faux RIB, DMARC/SPF/DKIM, Microsoft 365, double authentification, mots de passe, comptes inactifs, sauvegardes, questionnaires d'assurance, sensibilisation des équipes, départs de salariés, prestataires, congés et périodes à risque.",
  "Respecte le thème du jour indiqué pour chaque date.",
  "Pour chaque post, donne aussi l'image : « kicker » (surtitre court, 25 caractères maximum, ex. « Erreur courante »), « big » (le chiffre ou la phrase forte, 18 caractères maximum, ex. « 57 % » ou « Testée ? »), « sub » (une légende de 120 caractères maximum). Les nombres de l'image suivent la même règle que le texte.",
].join("\n");

/* ———————————— Contrôle d'un post généré ———————————— */

export type GeneratedPost = { date: string; topic: string; pillar?: string; body: string; visual: { kicker: string; big: string; sub: string } };

/** Nombres d'un texte, normalisés (« 420 000 » → « 420000 », « 49,9 » reste « 49,9 »). */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  // Milliers séparés par une espace (jamais un retour à la ligne) : « 420 000 » ; sinon un nombre seul, décimale à virgule.
  for (const m of text.matchAll(/\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:,\d+)?(?!\d)|\d+(?:,\d+)?/g)) out.push(m[0].replace(/[ \u00a0\u202f]/g, ""));
  return out;
}

const ALLOWED_HOSTS = /^(www\.)?(infracyb\.fr|cybermalveillance\.gouv\.fr)$/i;
const INVENTED_STORY = /\b(un|une|l'un|l'une) de mes clients?\b|\bun client m'a\b|\bchez (un|une) (de mes )?clients?\b|\bmon client\b|\btémoignage de\b|\bla semaine dernière,? (un|une)\b|\bhier,? (un|une) (client|dirigeant|cabinet|agence)\b/i;

/**
 * Erreurs d'un post généré ; [] = programmable. `allowed` : nombres de la base de faits ; `names` : noms d'entreprises
 * du CRM (prospects et clients), qui ne doivent jamais apparaître dans un post.
 */
export function validateGeneratedPost(p: GeneratedPost, ctx: { dates: string[]; allowed: Set<string>; names: string[]; recentTopics: string[] }): string[] {
  const e: string[] = [];
  const body = (p.body ?? "").trim();
  const v = p.visual ?? { kicker: "", big: "", sub: "" };
  if (!ctx.dates.includes(p.date)) e.push(`date ${p.date} hors du calendrier prévu`);
  if (!p.topic?.trim() || p.topic.length > 120) e.push("sujet vide ou trop long");
  if (body.length < 300 || body.length > 2200) e.push(`texte de ${body.length} caractères (300 à 2 200 attendus)`);
  if (!v.big?.trim() || v.big.length > 40 || (v.kicker ?? "").length > 60 || (v.sub ?? "").length > 140) e.push("image incomplète ou trop longue");
  const all = `${p.topic}\n${body}\n${v.kicker}\n${v.big}\n${v.sub}`;
  for (const n of numbersIn(all)) {
    const small = /^\d+$/.test(n) && Number(n) <= 31;
    const year = /^20(2[4-9])$/.test(n);
    if (!small && !year && !ctx.allowed.has(n)) e.push(`nombre « ${n} » absent de la base de faits`);
  }
  for (const m of all.matchAll(/https?:\/\/[^\s)]+|\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:fr|com|io|net|org|eu|biz|info)\b/gi)) {
    const host = m[0].replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
    if (!ALLOWED_HOSTS.test(host)) e.push(`lien ou domaine non autorisé : ${host}`);
  }
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(all) || /(^|\s)@\w/.test(all)) e.push("adresse e-mail ou mention @");
  if (INVENTED_STORY.test(all)) e.push("histoire de client présentée comme vécue");
  if ((all.match(/#\w/g) ?? []).length > 3) e.push("plus de 3 hashtags");
  const low = all.toLowerCase();
  for (const n of ctx.names) if (n.length >= 5 && low.includes(n.toLowerCase())) e.push(`nom d'entreprise du CRM cité : ${n}`);
  if (ctx.recentTopics.some((t) => t.trim().toLowerCase() === p.topic.trim().toLowerCase())) e.push("sujet déjà traité récemment");
  return [...new Set(e)];
}

/** Durées et repères courants, sans valeur statistique (« 48 heures », « 100 % des comptes »). */
const COMMON_NUMBERS = ["48", "60", "72", "90", "100", "365"];

/** Nombres autorisés à partir des faits (la base et le baromètre en direct). */
export const allowedNumbers = (facts: Fact[]): Set<string> => new Set([...COMMON_NUMBERS, ...facts.flatMap((f) => [...f.numbers, ...numbersIn(f.text)])]);

/* ———————————— Republication de secours ———————————— */

export type PostLite = { id: string; date: string; topic: string; network: string; status: string; body: string; visual: string };

/**
 * Ancien post à republier quand il n'y a plus rien de programmé : publié depuis au moins RECYCLE_AFTER_DAYS jours, avec
 * texte et image, et dont le sujet n'a pas été repris entre-temps. Le plus ancien d'abord. null si aucun.
 */
export function pickRecyclable<T extends PostLite>(posts: T[], today: string): T | null {
  const limit = addDaysIso(today, -RECYCLE_AFTER_DAYS);
  const lastByTopic = new Map<string, string>();
  for (const p of posts) if (p.date > (lastByTopic.get(p.topic) ?? "")) lastByTopic.set(p.topic, p.date);
  const candidates = posts
    .filter((p) => p.network === "LinkedIn" && p.status === "publie" && p.body.trim() && p.visual && p.date <= limit && (lastByTopic.get(p.topic) ?? "") <= limit)
    .sort((a, b) => a.date.localeCompare(b.date));
  return candidates[0] ?? null;
}
