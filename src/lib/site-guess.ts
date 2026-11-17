/**
 * Site web d'une entreprise sans Google : adresses de site évidentes tirées de son nom, puis preuve par le SIREN publié
 * sur le site (mentions légales, obligatoires en France). Seule l'adresse du SITE est déduite, et elle n'est retenue que si
 * le SIREN de l'entreprise y figure ; l'adresse mail, elle, est toujours lue sur le site, jamais devinée.
 * Règles pures (sans réseau), donc testables.
 */

/** Formes juridiques et mots vides retirés du nom avant de construire une adresse de site. */
const LEGAL = new Set(["sas", "sasu", "sarl", "sa", "eurl", "sci", "snc", "scp", "selarl", "selas", "selafa", "selca", "sca", "scs", "gie", "earl", "scop", "scic", "ste", "societe", "et", "de", "des", "du", "la", "le", "les", "l", "d", "en", "france"]);
/** Mots fréquents qui, retirés, donnent souvent l'adresse réelle (« Cabinet Dupont » → dupont.fr). */
const SOFT = new Set(["cabinet", "groupe", "group", "agence", "office", "etude", "conseil", "conseils", "expertise", "comptable", "audit", "avocats", "avocat", "notaires", "notaire", "associes", "associe", "informatique", "solutions", "systemes", "systems", "services", "consulting", "france"]);
const TLDS = [".fr", ".com"] as const;
export const MAX_SITE_GUESSES = 6;

const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Mots d'un nom : lettres et chiffres seulement, apostrophes et ponctuation retirées. */
const words = (s: string) => ascii(s).replace(/['’`]/g, " ").split(/[^a-z0-9]+/).filter(Boolean);
const label = (parts: string[], sep: string) => parts.join(sep);
const validLabel = (l: string) => l.length >= 3 && l.length <= 40 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(l) && !/--/.test(l);

/**
 * Adresses de site à essayer pour un nom d'entreprise, de la plus probable à la moins probable, sans doublon :
 * le sigle ou nom d'usage entre parenthèses d'abord (souvent la marque), puis le nom entier sans forme juridique,
 * puis le nom sans les mots génériques ; chacun en .fr puis .com, collé puis avec des tirets.
 */
export function siteCandidates(name: string, max = MAX_SITE_GUESSES): string[] {
  const aliases = [...name.matchAll(/\(([^()]+)\)/g)].map((m) => m[1]);
  const main = name.replace(/\([^()]*\)/g, " ");
  const bases: string[][] = [];
  for (const a of aliases) {
    const w = words(a).filter((x) => !LEGAL.has(x));
    if (w.length && w.length <= 3) bases.push(w);
  }
  const full = words(main).filter((x) => !LEGAL.has(x));
  if (full.length) bases.push(full);
  const core = full.filter((x) => !SOFT.has(x));
  if (core.length && core.length < full.length) bases.push(core);
  // Initiales espacées (« A C E V E X ») : une seule suite de lettres.
  const out: string[] = [];
  for (const b of bases) {
    const glued = b.every((x) => x.length === 1) ? [b.join("")] : [label(b, ""), label(b, "-")];
    for (const l of glued) {
      if (!validLabel(l)) continue;
      for (const tld of TLDS) if (!out.includes(l + tld)) out.push(l + tld);
    }
  }
  return out.slice(0, max);
}

/** Texte visible d'une page, entités courantes décodées : le SIREN y est cherché, pas dans les attributs ni les scripts. */
function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;/gi, "&");
}

/**
 * Le SIREN figure-t-il sur la page ? Accepte les écritures courantes : « 123456789 », « 123 456 789 », « 123.456.789 »,
 * SIRET (le SIREN suivi de 5 chiffres), numéro de TVA (FR + 2 chiffres + SIREN). Refuse un SIREN noyé dans un nombre
 * plus long qui ne commence pas par lui (téléphone, identifiant…).
 */
export function pageHasSiren(html: string, siren: string): boolean {
  if (!/^\d{9}$/.test(siren)) return false;
  const text = visibleText(html);
  const sep = "[\\s.\\u00a0\\u202f-]?";
  const digits = siren.split("").join(sep);
  const plain = new RegExp(`(?<![\\d])${digits}(?![\\d]{1,4}(?![\\d]))`);
  const tva = new RegExp(`FR${sep}\\d{2}${sep}${digits}(?!\\d)`, "i");
  return plain.test(text) || tva.test(text);
}
