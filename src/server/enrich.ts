import "server-only";
import { contactLinks, extractEmails, extractPhones, hostOf } from "@/lib/contact-extract";
import { fetchHtml } from "./web-fetch";

export type Crawl = { emails: string[]; phones: string[]; pages: number };

/** Lit au plus 4 pages d'un site (accueil, contact, mentions légales) et en extrait e-mails et téléphones. */
export async function crawlSite(siteUrl: string, budgetMs = 20_000): Promise<Crawl> {
  const deadline = Date.now() + budgetMs;
  const emails: string[] = [];
  const phones: string[] = [];
  const add = (html: string) => {
    for (const e of extractEmails(html)) if (!emails.includes(e)) emails.push(e);
    for (const p of extractPhones(html)) if (!phones.includes(p)) phones.push(p);
  };
  const home = await fetchHtml(siteUrl, deadline);
  if (!home) return { emails, phones, pages: 0 };
  let pages = 1;
  add(home.html);
  let links = contactLinks(home.html, home.url, 3);
  if (!links.length) {
    const origin = new URL(home.url).origin;
    links = [`${origin}/contact`, `${origin}/mentions-legales`];
  }
  for (const l of links) {
    if ((emails.length && phones.length) || pages >= 4) break;
    if (hostOf(l) !== hostOf(home.url)) continue;
    const p = await fetchHtml(l, deadline);
    if (p) {
      pages++;
      add(p.html);
    }
  }
  return { emails, phones, pages };
}
