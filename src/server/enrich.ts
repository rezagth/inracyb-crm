import "server-only";
import { contactLinks, extractEmails, extractPhones, hostOf } from "@/lib/contact-extract";
import { pageHasSiren } from "@/lib/site-guess";
import { fetchHtml } from "./web-fetch";

export type Crawl = { emails: string[]; phones: string[]; pages: number; error?: string; /** SIREN demandé trouvé sur une page lue */ sirenFound?: boolean };

/**
 * Lit au plus 4 pages d'un site (accueil, contact, mentions légales) et en extrait e-mails et téléphones.
 * Avec `siren`, cherche aussi ce SIREN dans le texte des pages (mentions légales en dernier recours) : c'est la preuve
 * que le site est bien celui de l'entreprise. On lit alors jusqu'à 5 pages.
 */
export async function crawlSite(siteUrl: string, budgetMs = 20_000, siren = ""): Promise<Crawl> {
  const deadline = Date.now() + budgetMs;
  const emails: string[] = [];
  const phones: string[] = [];
  let sirenFound = false;
  const add = (html: string) => {
    for (const e of extractEmails(html)) if (!emails.includes(e)) emails.push(e);
    for (const p of extractPhones(html)) if (!phones.includes(p)) phones.push(p);
    if (siren && !sirenFound) sirenFound = pageHasSiren(html, siren);
  };
  const home = await fetchHtml(siteUrl, deadline);
  if ("error" in home) return { emails, phones, pages: 0, error: home.error, ...(siren ? { sirenFound } : {}) };
  let pages = 1;
  add(home.html);
  const origin = new URL(home.url).origin;
  let links = contactLinks(home.html, home.url, 3);
  if (!links.length) links = [`${origin}/contact`, `${origin}/mentions-legales`];
  // Pour prouver le site, les mentions légales sont lues même si la page d'accueil n'y renvoie pas.
  if (siren && !links.some((l) => /mentions|legal|légal/i.test(l))) links.push(`${origin}/mentions-legales`);
  const max = siren ? 5 : 4;
  const seen = new Set([home.url]);
  for (const l of links) {
    if ((emails.length && phones.length && (!siren || sirenFound)) || pages >= max) break;
    if (seen.has(l) || hostOf(l) !== hostOf(home.url)) continue;
    seen.add(l);
    const p = await fetchHtml(l, deadline);
    if (!("error" in p)) {
      pages++;
      add(p.html);
    }
  }
  return { emails, phones, pages, ...(siren ? { sirenFound } : {}) };
}
