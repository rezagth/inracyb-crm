/**
 * Extraction de coordonnées professionnelles publiées sur le site d'une entreprise (pages Contact, Mentions légales).
 * Partie sans effet de bord : analyse de texte HTML, testable sans réseau.
 */

const GENERIC = new Set(["contact", "contacts", "info", "infos", "accueil", "secretariat", "secretariats", "cabinet", "direction", "bonjour", "hello", "commercial", "rdv", "admin", "office", "agence", "etude", "compta", "comptabilite", "reception", "standard", "mail", "email", "service", "services"]);
const BAD_LOCAL = /^(no-?reply|donotreply|do-not-reply|postmaster|abuse|webmaster|privacy|dpo|rgpd|mailer-daemon|root|support-?noreply)$/i;
const BAD_DOMAIN = /(sentry|wixpress|example\.|domain\.|yourdomain|email\.com|godaddy|schema\.org|w3\.org|googleapis|gstatic|cloudflare|jquery|bootstrap)/i;
const ASSET_TLD = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|woff2?|ttf|eot|map|pdf)$/i;

const dec = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x40;|&#64;|&commat;/gi, "@")
    .replace(/&#x2e;|&#46;|&period;/gi, ".")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/%40/g, "@");
}

const EMAIL_ONE = /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;
const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}/gi;

export function isJunkEmail(e: string): boolean {
  const [local, domain] = e.split("@");
  if (!local || !domain || e.length > 80) return true;
  return BAD_LOCAL.test(local) || BAD_DOMAIN.test(domain) || ASSET_TLD.test(e) || /^\d+x\d*$/.test(local);
}

/** Adresses e-mail publiées dans la page (liens mailto: et texte), nettoyées et sans doublon. */
export function extractEmails(html: string): string[] {
  const text = decodeEntities(html)
    .replace(/\s*[[(]\s*(?:at|arobase)\s*[\])]\s*/gi, "@")
    .replace(/\s*[[(]\s*(?:dot|point)\s*[\])]\s*/gi, ".");
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const e = raw.toLowerCase().replace(/^mailto:/, "").replace(/[.,;:]+$/, "");
    if (!seen.has(e) && EMAIL_ONE.test(e) && !isJunkEmail(e)) {
      seen.add(e);
      out.push(e);
    }
  };
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) push(dec(m[1]).split(",")[0] ?? "");
  for (const m of text.matchAll(EMAIL_RE)) push(m[0]);
  return out;
}

const PHONE_RE = /(?:(?:\+|00)33[\s.\-()]*(?:\(0\))?[\s.\-]*|0)[1-9](?:[\s.\-]?\d{2}){4}/g;

export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  d = d.replace(/^\+330?/, "0").replace(/^00330?/, "0");
  if (!/^0[1-9]\d{8}$/.test(d)) return null;
  if (d.startsWith("08")) return null; // numéros spéciaux (surtaxés) : jamais utiles pour prospecter
  return d.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/** Numéros français publiés dans la page (liens tel: en premier), formatés « 01 23 45 67 89 ». */
export function extractPhones(html: string): string[] {
  const text = decodeEntities(html);
  const out: string[] = [];
  const push = (raw: string) => {
    const p = normalizePhone(raw);
    if (p && !out.includes(p)) out.push(p);
  };
  for (const m of text.matchAll(/href=["']tel:([^"']+)["']/gi)) push(dec(m[1]));
  const plain = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  for (const m of plain.matchAll(PHONE_RE)) push(m[0]);
  return out;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Liens internes les plus utiles : contact, mentions légales, à propos. Même site uniquement. */
export function contactLinks(html: string, baseUrl: string, max = 3): string[] {
  const host = hostOf(baseUrl);
  const found: { url: string; rank: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const label = (m[2] ?? "").replace(/<[^>]+>/g, " ").toLowerCase();
    const href = m[1];
    const hay = (href + " " + label).toLowerCase();
    const rank = /contact/.test(hay) ? 0 : /mentions|legal|légal/.test(hay) ? 1 : /propos|equipe|équipe|cabinet|etude|étude|agence/.test(hay) ? 2 : -1;
    if (rank < 0) continue;
    try {
      const u = new URL(href, baseUrl);
      if (!/^https?:$/.test(u.protocol) || hostOf(u.href) !== host || /\.(pdf|jpe?g|png|zip)$/i.test(u.pathname)) continue;
      u.hash = "";
      found.push({ url: u.href, rank });
    } catch {
      /* lien invalide : ignoré */
    }
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.rank - b.rank)
    .filter((f) => !seen.has(f.url) && !!seen.add(f.url))
    .slice(0, max)
    .map((f) => f.url);
}

const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const baseDomain = (h: string) => h.split(".").slice(-2).join(".");

/** Meilleure adresse : nominative du dirigeant sur le domaine du site, puis nominative, puis générique (contact@…). */
export function pickBestEmail(emails: string[], siteHost: string, lastName = ""): { best: string; others: string[] } {
  const ln = ascii(lastName);
  const score = (e: string) => {
    const [local, domain] = e.split("@");
    const l = ascii(local);
    let s = 0;
    if (siteHost && baseDomain(domain) === baseDomain(siteHost)) s += 4;
    if (ln.length >= 3 && l.includes(ln)) s += 5;
    else if (!GENERIC.has(l) && /[.\-_]/.test(local) && l.length >= 5) s += 2;
    else if (GENERIC.has(l)) s += 1;
    return s;
  };
  const sorted = [...emails].sort((a, b) => score(b) - score(a));
  return { best: sorted[0] ?? "", others: sorted.slice(1, 5) };
}

/** Site web saisi dans les notes d'une entreprise (« Site web : https://… »). */
export function siteFromNotes(notes: string): string {
  const m = /site web\s*:\s*(\S+)/i.exec(notes);
  if (!m) return "";
  const raw = m[1].replace(/[),.;]+$/, "");
  const url = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
  return hostOf(url).includes(".") ? url : "";
}
