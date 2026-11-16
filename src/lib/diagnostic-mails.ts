/**
 * Textes de la campagne Diagnostic : repris à l'identique de textes-campagne-diagnostic-v2.md (racine du dépôt).
 * Ces phrases sont validées par le propriétaire : ne rien reformuler ici. Pour changer un texte, modifier le fichier
 * Markdown ET ce fichier ; un test (tests/diagnostic-mails.test.ts) vérifie qu'ils sont identiques, caractère pour caractère.
 */
import { clean, hookOf, mailable, type Check, type HookVariant } from "./diagnostic";
import { fd } from "./format";

export type Segment = "editeurs" | "cabinets";
export const SEGMENTS: Segment[] = ["editeurs", "cabinets"];
export const SEGMENT_LABEL: Record<Segment, string> = { editeurs: "Éditeurs, ESN, agences digitales", cabinets: "Cabinets comptables, juridiques, courtiers" };
export const isSegment = (s: string): s is Segment => (SEGMENTS as string[]).includes(s);
/** Secteurs du CRM admis dans chaque segment : le texte d'impact n'a de sens que pour eux. Une entreprise d'un autre secteur n'entre pas. */
export const SEGMENT_SECTORS: Record<Segment, string[]> = { editeurs: ["Numérique"], cabinets: ["Expertise comptable", "Juridique", "Notariat", "Courtage"] };
export const segmentOfSector = (sector: string): Segment | null => SEGMENTS.find((s) => SEGMENT_SECTORS[s].includes(sector)) ?? null;

type Family = "A" | "B";

/** Tableaux 1 et 3 : objet du J0, phrase de constat et piste corrective, par forme de constat. Famille A = courrier, B = certificat. */
export const HOOK_TEXT: Record<HookVariant, { family: Family; subject: string; finding: string; fix: string }> = {
  "tls-expire": { family: "B", subject: "Le certificat du site {domaine}", finding: "le certificat du site {domaine} a expiré le {date_expiration} : les visiteurs voient un avertissement de sécurité", fix: "le renouvellement est en général automatisable, par exemple chez l'hébergeur, pour que cela ne se reproduise pas" },
  "spf-absent": { family: "A", subject: "Un point sur les réglages mail de {domaine}", finding: "aucun enregistrement SPF n'est publié pour {domaine} : les messageries ne peuvent pas vérifier quels serveurs ont le droit d'envoyer en votre nom", fix: "il s'agit de publier un enregistrement SPF qui liste les services autorisés à envoyer en votre nom (messagerie, outil d'envoi, etc.)" },
  "spf-double": { family: "A", subject: "Un point sur les réglages mail de {domaine}", finding: "deux enregistrements SPF sont publiés pour {domaine}, alors qu'un seul est admis : vos messages légitimes risquent d'être mal authentifiés", fix: "il faut fusionner les deux enregistrements en un seul, qui liste l'ensemble des services autorisés" },
  "spf-plus-all": { family: "A", subject: "Un point sur les réglages mail de {domaine}", finding: "l'enregistrement SPF de {domaine} se termine par `+all`, ce qui autorise n'importe quel serveur à envoyer en votre nom", fix: "il faut remplacer `+all` par une politique restrictive, après avoir listé les services légitimes" },
  "dmarc-absent": { family: "A", subject: "Un point sur les réglages mail de {domaine}", finding: "aucune politique DMARC n'est publiée pour {domaine} : un tiers peut envoyer un message qui semble venir de votre domaine, sans que les messageries aient la consigne de le refuser", fix: "la première étape consiste à publier une politique DMARC en mode surveillance, par un simple enregistrement DNS, pour recevoir des rapports sur qui envoie en votre nom ; on la durcit ensuite par étapes une fois les envois légitimes identifiés" },
  "dmarc-none": { family: "A", subject: "Un point sur les réglages mail de {domaine}", finding: "la politique DMARC de {domaine} est en mode surveillance (`p=none`) : elle signale les usurpations mais ne les bloque pas", fix: "cette politique sert à observer ; une fois les rapports analysés et les envois légitimes tous conformes, on peut la durcir par étapes" },
  "tls-bientot": { family: "B", subject: "Le certificat du site {domaine}", finding: "le certificat du site {domaine} expire le {date_expiration} : sans renouvellement, les visiteurs verront un avertissement de sécurité", fix: "le renouvellement est en général automatisable, par exemple chez l'hébergeur, pour que cela ne se reproduise pas" },
};

/** Tableau 2 : phrase d'impact, par famille de constat et par segment. */
export const IMPACT: Record<Family, Record<Segment, string>> = {
  A: { editeurs: "Ces éléments reviennent souvent dans les questionnaires de sécurité que les grands clients envoient avant de signer.", cabinets: "Pour un cabinet qui échange chaque jour avec ses clients sur des documents sensibles, c'est un point que les fraudes au faux RIB exploitent régulièrement." },
  B: { editeurs: "Un client ou un prospect qui voit cet avertissement peut s'inquiéter avant même de vous avoir contacté.", cabinets: "Vos clients qui visitent votre site voient cet avertissement, ce qui peut les inquiéter." },
};

/** Tableau 4 : constat secondaire, ajouté à J+3 seulement s'il s'applique. Jamais une accroche. */
export const SECONDARY_TEXT: Record<string, string> = {
  "hsts-absent": "J'ai aussi noté que le site n'envoie pas l'en-tête HSTS, un réglage simple à ajouter côté serveur.",
};

/** Texte commun par segment : J0, J+3, J+7, J+14. */
export const SEQUENCE: Record<Segment, { subject: string; body: string }[]> = {
  editeurs: [
    { subject: "{objet_j0}", body: "Bonjour {prenom},\n\nJe suis [mon prénom], RSSI externalisé chez InfraCyb. En regardant les réglages publics de {domaine}, j'ai relevé un point : {constat_principal}.\n\n{impact}\n\nPuis-je vous envoyer le détail, sur une page ?\n\n{signature}" },
    { subject: "Précision sur {domaine}", body: "Bonjour {prenom},\n\nUne précision utile sur le point relevé pour {domaine} : {piste_corrective}. {constat_secondaire}\n\nJe vous envoie volontiers la page de synthèse si cela peut vous servir.\n\n{signature}" },
    { subject: "Questionnaires de sécurité chez {entreprise}", body: "Bonjour {prenom},\n\nQuand un client ou un prospect demande des garanties sur la sécurité de vos échanges, ce type de point est souvent l'un des premiers regardés. Un dossier de preuves (ce qui est en place, ce qui a été corrigé, ce qui reste à faire) permet de répondre vite, sans tout refaire à chaque demande.\n\nSi un questionnaire de sécurité est en cours chez vous, je peux vous dire en quinze minutes ce que je regarderais en priorité. Cela vous serait utile ?\n\n{signature}" },
    { subject: "Dernier message de ma part", body: "Bonjour {prenom},\n\nJe ne vous écris plus après celui-ci. Si le sujet devient utile chez {entreprise} (questionnaire client, renouvellement d'assurance), la synthèse d'une page sur {domaine} reste disponible : il suffit de me répondre.\n\nBonne continuation,\n\n{signature}" },
  ],
  cabinets: [
    { subject: "{objet_j0}", body: "Bonjour {prenom},\n\nJe suis [mon prénom], RSSI externalisé chez InfraCyb. En regardant les réglages publics de {domaine}, j'ai relevé un point : {constat_principal}.\n\n{impact}\n\nPuis-je vous envoyer le détail, sur une page ?\n\n{signature}" },
    { subject: "Précision sur {domaine}", body: "Bonjour {prenom},\n\nUne précision utile sur le point relevé pour {domaine} : {piste_corrective}. {constat_secondaire}\n\nJe vous envoie volontiers la page de synthèse si cela peut vous servir.\n\n{signature}" },
    { subject: "Vos clients et les messages à votre nom", body: "Bonjour {prenom},\n\nVos clients vous transmettent des documents et parfois des coordonnées bancaires par mail. S'ils reçoivent un faux message à votre nom, c'est vers vous qu'ils se retourneront. Un dossier de preuves (ce qui est en place, ce qui a été corrigé, ce qui reste à faire) permet de montrer que le sujet est maîtrisé, à vos clients comme à votre assureur.\n\nJe peux vous dire en quinze minutes ce que je regarderais en priorité chez {entreprise}. Cela vous serait utile ?\n\n{signature}" },
    { subject: "Dernier message de ma part", body: "Bonjour {prenom},\n\nJe ne vous écris plus après celui-ci. Si le sujet devient utile pour {entreprise}, la synthèse d'une page sur {domaine} reste disponible : il suffit de me répondre.\n\nBonne continuation,\n\n{signature}" },
  ],
};

/** Libellé court d'une forme de constat (affichage dans le CRM, jamais dans un mail). */
export const HOOK_LABEL: Record<HookVariant, string> = { "tls-expire": "Certificat expiré", "spf-absent": "SPF absent", "spf-double": "SPF en double", "spf-plus-all": "SPF en +all", "dmarc-absent": "DMARC absent", "dmarc-none": "DMARC en p=none", "tls-bientot": "Certificat expirant" };
export const isHookVariant = (v: string): v is HookVariant => v in HOOK_TEXT;

export type DiagnosticMailInput = {
  segment: Segment;
  /** 0 = J0, 1 = J+3, 2 = J+7, 3 = J+14 */
  step: number;
  /** forme du constat d'accroche, fixée au premier mail */
  hook: HookVariant;
  /** constats mesurés au moment de l'envoi (J0 et J+3) ; vide pour J+7 et J+14, qui ne citent pas de mesure */
  checks: Check[];
  mailDomain: string;
  webHost: string;
  prenom: string;
  /** adresse générique publiée sur le site, sans dirigeant connu : le mail commence par « Bonjour, » */
  sansPrenom?: boolean;
  entreprise: string;
  /** nom de l'expéditeur, à la place de « [mon prénom] » */
  me: string;
  signature: string;
};
export type DiagnosticMail = { ok: true; subject: string; body: string } | { ok: false; error: string };

const FIELD = /\{([a-z_0-9]+)\}/g;
const ME = "[mon prénom]";

/**
 * Compose un mail de la séquence Diagnostic : le texte commun du segment, dont les champs sont remplis par les phrases
 * des tableaux et par la fiche du prospect. Aucune phrase n'est produite ici. Un champ obligatoire vide, ou un champ
 * resté non rempli : pas de mail.
 */
export function buildDiagnosticMail(i: DiagnosticMailInput): DiagnosticMail {
  const tpl = SEQUENCE[i.segment]?.[i.step];
  const text = HOOK_TEXT[i.hook];
  if (!tpl || !text) return { ok: false, error: "Modèle de mail introuvable pour ce segment ou ce constat." };
  const check = i.checks.find((c) => c.variant === i.hook);
  const secondary = i.step === 1 ? i.checks.find((c) => mailable(c) && c.variant in SECONDARY_TEXT) : undefined;
  // Champs composés : des phrases entières des tableaux, qui contiennent elles-mêmes des champs simples.
  const composed: Record<string, string> = { objet_j0: text.subject, constat_principal: text.finding, impact: IMPACT[text.family][i.segment], piste_corrective: text.fix, constat_secondaire: secondary ? SECONDARY_TEXT[secondary.variant] : "" };
  const simple: Record<string, string> = {
    prenom: /^standard$/i.test(i.prenom.trim()) ? "" : clean(i.prenom, 60),
    entreprise: clean(i.entreprise, 120),
    domaine: clean(text.family === "A" ? i.mailDomain : i.webHost, 120),
    date_expiration: check?.data?.validTo ? fd(check.data.validTo) : "",
    signature: i.signature.trim(),
  };
  const missing = new Set<string>();
  // Seule exception au prénom obligatoire : une adresse générique publiée, sans dirigeant connu.
  const greet = (s: string) => (i.sansPrenom && !simple.prenom ? s.replace(/^Bonjour \{prenom\},/, "Bonjour,") : s);
  const fill = (s: string) => {
    const expanded = greet(s).replace(FIELD, (m, k: string) => (k in composed ? composed[k] : m));
    return expanded
      .replace(FIELD, (m, k: string) => {
        if (!(k in simple)) return m;
        if (!simple[k]) missing.add(k);
        return simple[k];
      })
      .split(ME)
      .join(clean(i.me, 80));
  };
  const subject = fill(tpl.subject).trim();
  // Le constat secondaire est facultatif : quand il est vide, on retire seulement l'espace laissé en fin de ligne.
  const body = fill(tpl.body).replace(/[ \t]+$/gm, "").trim();
  if (!clean(i.me, 80)) missing.add("mon prénom (Paramètres)");
  if (missing.size) return { ok: false, error: `Champ obligatoire vide : ${[...missing].join(", ")}. Le mail n'est pas parti.` };
  const all = subject + "\n" + body;
  const left = all.match(FIELD) ?? all.match(/\[[^\]\n]{1,40}\]/);
  if (left) return { ok: false, error: `Champ non rempli dans le mail (${left[0]}) : complète ton profil dans Paramètres. Le mail n'est pas parti.` };
  return { ok: true, subject, body };
}

/** Forme d'accroche d'un jeu de constats, si elle a un texte. */
export function hookVariantOf(checks: Check[]): HookVariant | null {
  const v = hookOf(checks)?.variant ?? "";
  return isHookVariant(v) ? v : null;
}
