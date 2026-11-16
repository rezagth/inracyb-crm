/**
 * Diagnostic d'un domaine à partir de données publiques : règles pures (aucun réseau ici), donc testables.
 * Les mesures (DNS, certificat, page d'accueil) arrivent par une « sonde » (Probe) fournie par l'appelant.
 *
 * Principe de prudence : un constat n'est « certain » que s'il est mesuré sans ambiguïté.
 * Une erreur, un délai dépassé ou une réponse douteuse ne produit jamais de constat : au mieux « non détecté ».
 * Aucun score n'est calculé.
 */
import { fd } from "./format";

export const RULES_VERSION = "2026-11-16.1";

/** Réponse DNS : enregistrements trouvés, absence confirmée, ou mesure impossible (erreur, délai, résolveurs en désaccord). */
export type Dns = { kind: "records"; values: string[] } | { kind: "absent" } | { kind: "error"; detail: string };
export type TlsInfo = { kind: "ok"; /** fin de validité, ISO */ validTo: string; authorized: boolean; authError: string } | { kind: "error"; detail: string };
export type HttpInfo = { kind: "ok"; status: number; url: string; headers: Record<string, string>; contentType: string; body: string } | { kind: "error"; detail: string };
export type DnsType = "TXT" | "MX" | "NS";

export interface Probe {
  dns(name: string, type: DnsType): Promise<Dns>;
  tls(host: string): Promise<TlsInfo>;
  http(url: string): Promise<HttpInfo>;
}

/**
 * constat : écart mesuré · conforme : rien à signaler · info : observation vraie mais mineure ou à vérifier ·
 * non_detecte : rien trouvé, sans pouvoir conclure à l'absence · erreur : mesure impossible.
 */
export type CheckStatus = "constat" | "conforme" | "info" | "non_detecte" | "erreur";
export type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  /** true : mesuré, reproductible, sans interprétation. Seuls les constats certains peuvent figurer dans un mail. */
  certain: boolean;
  /** ce qui a été mesuré, tel quel */
  proof: string;
  /** phrase prudente, datée, utilisable telle quelle */
  wording: string;
  /** ordre d'importance (1 = le plus parlant) */
  rank: number;
};
export type Diagnostic = { mailDomain: string; webHost: string; checkedOn: string; rulesVersion: string; checks: Check[]; /** id du constat principal, "" s'il n'y en a aucun de certain */ main: string; certainCount: number };

/** Constats utilisables dans un mail : écart mesuré et certain. */
export const mailable = (c: Check): boolean => c.status === "constat" && c.certain;

/** Nettoie une valeur venue de l'extérieur avant de l'afficher : caractères de contrôle retirés, longueur bornée. */
export function clean(s: unknown, max = 200): string {
  const t = String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
export const isDomain = (d: string): boolean => DOMAIN_RE.test(d);

/** Messageries grand public : le domaine n'appartient pas à l'entreprise, on ne le diagnostique pas. */
const WEBMAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr", "ymail.com", "icloud.com", "me.com", "mac.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "bbox.fr", "numericable.fr", "aliceadsl.fr", "club-internet.fr", "gmx.fr", "gmx.com", "proton.me", "protonmail.com", "aol.com", "aol.fr"]);

/** Domaines à examiner pour une entreprise : celui de sa messagerie (sauf messagerie grand public) et celui de son site. */
export function targetsOf(email: string, siteUrl: string): { mailDomain: string; webHost: string } {
  const e = email.trim().toLowerCase();
  const d = e.includes("@") ? e.slice(e.lastIndexOf("@") + 1) : "";
  const mailDomain = isDomain(d) && !WEBMAIL.has(d) ? d : "";
  let host = "";
  try {
    host = siteUrl ? new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : "https://" + siteUrl).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }
  const webHost = isDomain(host) && !WEBMAIL.has(host.replace(/^www\./, "")) ? host : mailDomain;
  return { mailDomain: mailDomain || (webHost ? webHost.replace(/^www\./, "") : ""), webHost };
}

/** Accord de deux résolveurs indépendants : une absence ou un contenu n'est retenu que s'ils disent la même chose. */
export function mergeDns(a: Dns, b: Dns): Dns {
  if (a.kind === "error" || b.kind === "error") return { kind: "error", detail: a.kind === "error" ? a.detail : (b as { detail: string }).detail };
  if (a.kind === "absent" && b.kind === "absent") return a;
  if (a.kind === "records" && b.kind === "records") {
    const norm = (v: string[]) => [...v].map((x) => x.trim().toLowerCase()).sort().join("\n");
    return norm(a.values) === norm(b.values) ? a : { kind: "error", detail: "réponses différentes selon le résolveur" };
  }
  return { kind: "error", detail: "réponses différentes selon le résolveur" };
}

/** Réponse JSON d'un résolveur DNS sur HTTPS (RFC 8484, format JSON de Cloudflare et Google). */
export function parseDoh(json: unknown, type: DnsType): Dns {
  const TYPE = { TXT: 16, MX: 15, NS: 2 } as const;
  if (!json || typeof json !== "object") return { kind: "error", detail: "réponse illisible" };
  const o = json as { Status?: unknown; Answer?: unknown };
  if (o.Status === 3) return { kind: "absent" };
  if (o.Status !== 0) return { kind: "error", detail: `code DNS ${clean(o.Status, 10)}` };
  const answers = Array.isArray(o.Answer) ? o.Answer : [];
  const values = answers
    .filter((a): a is { type: number; data: string } => !!a && typeof a === "object" && (a as { type?: unknown }).type === TYPE[type] && typeof (a as { data?: unknown }).data === "string")
    .slice(0, 50)
    .map((a) => (type === "TXT" ? unquoteTxt(a.data) : a.data.trim()).slice(0, 2000));
  return values.length ? { kind: "records", values } : { kind: "absent" };
}

/** Un enregistrement TXT arrive en morceaux entre guillemets : "v=spf1 …" "suite". */
function unquoteTxt(data: string): string {
  const parts = data.match(/"((?:[^"\\]|\\.)*)"/g);
  return parts ? parts.map((p) => p.slice(1, -1).replace(/\\(.)/g, "$1")).join("") : data;
}

const mk = (id: string, label: string, rank: number, status: CheckStatus, certain: boolean, proof: string, wording: string): Check => ({ id, label, status, certain, proof: clean(proof, 400), wording, rank });
const unknown = (id: string, label: string, rank: number, what: string, r: { detail: string }): Check => mk(id, label, rank, "erreur", false, `Mesure impossible : ${clean(r.detail, 120)}`, `${what} n'a pas pu être vérifié (${clean(r.detail, 120)}). Aucune conclusion.`);

// ——— Messagerie ———

/** Le domaine reçoit-il des e-mails ? Un « MX nul » (priorité 0, cible « . ») déclare explicitement que non. */
export function receivesMail(mx: Dns): boolean {
  return mx.kind === "records" && mx.values.some((v) => !/^\d+\s+\.$/.test(v.trim()));
}

export function evalMx(domain: string, mx: Dns): Check {
  const L = "Serveurs de messagerie (MX)";
  if (mx.kind === "error") return unknown("mx", L, 20, "La réception des e-mails", mx);
  if (mx.kind === "absent" || !receivesMail(mx)) return mk("mx", L, 20, "info", true, mx.kind === "absent" ? `Aucun enregistrement MX pour ${domain}` : `MX nul sur ${domain}`, `Le domaine ${domain} ne déclare aucun serveur de réception d'e-mails.`);
  return mk("mx", L, 20, "conforme", true, mx.values.slice(0, 5).join(" ; "), `Le domaine ${domain} déclare ${mx.values.length} serveur(s) de réception d'e-mails.`);
}

/** SPF : un seul enregistrement « v=spf1 » attendu, terminé par une règle qui limite les expéditeurs. Sans MX, rien n'est affirmé. */
export function evalSpf(domain: string, txt: Dns, mx: Dns, on: string): Check {
  const L = "SPF (expéditeurs autorisés)";
  if (txt.kind === "error") return unknown("spf", L, 2, "L'enregistrement SPF", txt);
  const receives = receivesMail(mx);
  const spf = txt.kind === "records" ? txt.values.filter((v) => /^v=spf1(\s|$)/i.test(v.trim())) : [];
  if (spf.length === 0) {
    const w = `Le ${fd(on)}, le domaine ${domain} ne publiait pas d'enregistrement SPF. Sans SPF, les serveurs destinataires ne peuvent pas vérifier quels serveurs ont le droit d'envoyer des e-mails au nom de ${domain}.`;
    return mk("spf", L, 2, receives ? "constat" : "info", receives, `Aucun enregistrement TXT « v=spf1 » sur ${domain}`, w);
  }
  if (spf.length > 1) return mk("spf", L, 2, receives ? "constat" : "info", receives, `${spf.length} enregistrements « v=spf1 » sur ${domain}`, `Le ${fd(on)}, le domaine ${domain} publiait ${spf.length} enregistrements SPF. La norme n'en admet qu'un : dans ce cas la vérification SPF échoue chez les destinataires.`);
  const rec = spf[0].trim();
  const all = /(?:^|\s)([+\-~?]?)all(?:\s|$)/i.exec(rec);
  if (all && (all[1] === "+" || all[1] === "")) return mk("spf", L, 2, receives ? "constat" : "info", receives, rec, `Le ${fd(on)}, l'enregistrement SPF de ${domain} se terminait par « +all » : il autorise n'importe quel serveur à envoyer des e-mails au nom du domaine.`);
  if (all && all[1] === "?") return mk("spf", L, 2, "info", true, rec, `L'enregistrement SPF de ${domain} se termine par « ?all » (neutre) : il ne dit pas aux destinataires de se méfier des autres serveurs.`);
  if (!all && !/(?:^|\s)redirect=/i.test(rec)) return mk("spf", L, 2, "info", false, rec, `L'enregistrement SPF de ${domain} ne contient pas de règle finale « all » : à vérifier.`);
  return mk("spf", L, 2, "conforme", true, rec, `Le domaine ${domain} publie un enregistrement SPF.`);
}

/** Domaines où chercher la politique DMARC : le domaine lui-même, puis ses parents (la politique s'hérite du domaine principal). */
export function dmarcNames(domain: string): string[] {
  const labels = domain.split(".");
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) out.push("_dmarc." + labels.slice(i).join("."));
  return out;
}

/** DMARC : absent (certain seulement si absent du domaine et de tous ses parents) ou en simple observation (p=none). */
export function evalDmarc(domain: string, lookups: { name: string; res: Dns }[], mx: Dns, on: string): Check {
  const L = "DMARC (protection contre l'usurpation)";
  const receives = receivesMail(mx);
  for (const { name, res } of lookups) {
    if (res.kind === "error") return unknown("dmarc", L, 3, "La politique DMARC", res);
    const recs = res.kind === "records" ? res.values.filter((v) => /^v=dmarc1\s*(;|$)/i.test(v.trim())) : [];
    if (recs.length === 0) continue;
    if (recs.length > 1) return mk("dmarc", L, 3, "info", false, `${recs.length} enregistrements DMARC sur ${name}`, `Plusieurs enregistrements DMARC sont publiés sur ${name} : à vérifier.`);
    const rec = recs[0].trim();
    const inherited = name !== "_dmarc." + domain;
    const tag = (k: string) => new RegExp(`(?:^|;)\\s*${k}\\s*=\\s*([a-z]+)\\s*(?:;|$)`, "i").exec(rec)?.[1]?.toLowerCase() ?? "";
    const policy = (inherited && tag("sp")) || tag("p");
    if (policy === "reject" || policy === "quarantine") return mk("dmarc", L, 3, "conforme", true, rec, `Le domaine ${domain} publie une politique DMARC (${policy}).`);
    if (policy === "none") return mk("dmarc", L, 4, receives ? "constat" : "info", receives, rec, `Le ${fd(on)}, la politique DMARC de ${domain} était en mode observation (« p=none ») : les e-mails qui usurpent le domaine sont signalés dans des rapports, mais pas bloqués par les destinataires.`);
    return mk("dmarc", L, 3, "info", false, rec, `L'enregistrement DMARC de ${domain} n'indique pas de politique reconnue : à vérifier.`);
  }
  if (!lookups.length) return mk("dmarc", L, 3, "erreur", false, "Aucune mesure", "La politique DMARC n'a pas pu être vérifiée. Aucune conclusion.");
  const w = `Le ${fd(on)}, le domaine ${domain} ne publiait pas de politique DMARC. Sans DMARC, les destinataires n'ont pas de consigne pour rejeter les e-mails qui usurpent le nom de ${domain}.`;
  return mk("dmarc", L, 3, receives ? "constat" : "info", receives, `Aucun enregistrement « v=DMARC1 » sur ${lookups.map((l) => l.name).join(", ")}`, w);
}

/** Sélecteurs DKIM les plus courants. Le sélecteur réel peut porter n'importe quel nom : ne rien trouver ne prouve rien. */
export const DKIM_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "k2", "mail", "dkim", "s1", "s2"] as const;

/** DKIM : « détecté » ou « non détecté », jamais « absent ». Ne produit jamais de constat. */
export function evalDkim(domain: string, results: { selector: string; res: Dns }[]): Check {
  const L = "DKIM (signature des e-mails)";
  const found = results.filter((r) => r.res.kind === "records" && r.res.values.some((v) => /(^|;)\s*p=\s*[a-z0-9+/]{20,}/i.test(v.replace(/\s+/g, "")))).map((r) => r.selector);
  if (found.length) return mk("dkim", L, 21, "conforme", true, `Sélecteur(s) trouvé(s) : ${found.join(", ")}`, `Une clé DKIM est publiée pour ${domain} (sélecteur ${found[0]}).`);
  return mk("dkim", L, 21, "non_detecte", false, `Sélecteurs essayés : ${results.map((r) => r.selector).join(", ") || "aucun"}`, `Aucune clé DKIM n'a été détectée pour ${domain} avec les sélecteurs courants. Cela ne prouve pas son absence : le sélecteur peut porter un autre nom.`);
}

export function evalMtaSts(domain: string, res: Dns): Check {
  const L = "MTA-STS (chiffrement imposé à la réception)";
  if (res.kind === "error") return unknown("mta-sts", L, 22, "MTA-STS", res);
  const ok = res.kind === "records" && res.values.some((v) => /^v=stsv1\s*(;|$)/i.test(v.trim()));
  return ok ? mk("mta-sts", L, 22, "conforme", true, `Enregistrement présent sur _mta-sts.${domain}`, `Le domaine ${domain} publie une politique MTA-STS.`) : mk("mta-sts", L, 22, "info", true, `Aucun enregistrement « v=STSv1 » sur _mta-sts.${domain}`, `Le domaine ${domain} ne publie pas de politique MTA-STS (mesure complémentaire, encore peu répandue).`);
}

// ——— Site web ———

const daysBetweenIso = (from: string, to: string) => Math.floor((Date.parse(to.slice(0, 10) + "T12:00:00Z") - Date.parse(from.slice(0, 10) + "T12:00:00Z")) / 86_400_000);
export const TLS_SOON_DAYS = 14;

/** Certificat du site : expiré, ou expirant sous 14 jours. Un certificat refusé pour une autre raison n'est pas interprété. */
export function evalTls(host: string, t: TlsInfo, on: string): Check {
  const L = "Certificat HTTPS";
  if (t.kind === "error") return unknown("tls", L, 1, "Le certificat du site", t);
  if (!/^\d{4}-\d{2}-\d{2}/.test(t.validTo)) return mk("tls", L, 1, "erreur", false, "Date de fin de validité illisible", "Le certificat du site n'a pas pu être lu. Aucune conclusion.");
  const left = daysBetweenIso(on, t.validTo);
  const until = fd(t.validTo.slice(0, 10));
  if (left < 0) return mk("tls", L, 1, "constat", true, `Certificat de ${host} expiré depuis le ${until}`, `Le ${fd(on)}, le certificat HTTPS de ${host} était expiré depuis le ${until} : les navigateurs affichent un avertissement de sécurité aux visiteurs.`);
  if (left <= TLS_SOON_DAYS) return mk("tls", L, 5, "constat", true, `Certificat de ${host} valable jusqu'au ${until} (${left} jour(s))`, `Le ${fd(on)}, le certificat HTTPS de ${host} arrivait à expiration le ${until}, soit dans ${left} jour(s). S'il n'est pas renouvelé, les navigateurs afficheront un avertissement de sécurité.`);
  if (!t.authorized) return mk("tls", L, 23, "info", false, `Certificat de ${host} non validé : ${clean(t.authError, 80)}`, `Le certificat de ${host} n'a pas été validé automatiquement (${clean(t.authError, 80)}) : à vérifier dans un navigateur.`);
  return mk("tls", L, 23, "conforme", true, `Certificat de ${host} valable jusqu'au ${until}`, `Le certificat HTTPS de ${host} est valide jusqu'au ${until}.`);
}

/** En-têtes de sécurité de la page d'accueil. Seule une page servie normalement (HTTPS, code 200) est interprétée. */
export function evalHeaders(host: string, h: HttpInfo, on: string): Check[] {
  const defs = [
    { id: "hsts", label: "En-tête HSTS", rank: 6 },
    { id: "csp", label: "En-tête Content-Security-Policy", rank: 7 },
    { id: "nosniff", label: "En-tête X-Content-Type-Options", rank: 24 },
    { id: "frame", label: "Protection contre l'intégration dans une autre page", rank: 25 },
  ];
  if (h.kind === "error") return defs.map((d) => unknown(d.id, d.label, d.rank, "La page d'accueil", h));
  if (h.status !== 200 || !/^https:\/\//i.test(h.url)) return defs.map((d) => mk(d.id, d.label, d.rank, "erreur", false, `Réponse ${h.status} sur ${clean(h.url, 120)}`, `La page d'accueil de ${host} n'a pas répondu normalement en HTTPS (code ${h.status}). Aucune conclusion.`));
  const get = (k: string) => (h.headers[k] ?? "").trim();
  const url = clean(h.url, 120);
  const csp = get("content-security-policy");
  return [
    get("strict-transport-security")
      ? mk("hsts", defs[0].label, 26, "conforme", true, `Strict-Transport-Security: ${get("strict-transport-security")}`, `Le site ${host} impose HTTPS à ses visiteurs (HSTS).`)
      : mk("hsts", defs[0].label, 6, "constat", true, `Aucun en-tête Strict-Transport-Security sur ${url}`, `Le ${fd(on)}, la page d'accueil ${url} ne renvoyait pas l'en-tête HSTS : rien n'impose au navigateur de revenir en HTTPS lors des visites suivantes.`),
    csp
      ? mk("csp", defs[1].label, 27, "conforme", true, `Content-Security-Policy: ${csp}`, `Le site ${host} publie une politique de sécurité du contenu (CSP).`)
      : // Vrai et mesuré, mais absent de la plupart des sites, y compris très bien tenus : une information, pas une accroche.
        mk("csp", defs[1].label, 7, "info", true, `Aucun en-tête Content-Security-Policy sur ${url}`, `La page d'accueil ${url} ne renvoie pas d'en-tête Content-Security-Policy, une protection qui limite l'effet d'un script injecté dans la page (encore peu répandue).`),
    /nosniff/i.test(get("x-content-type-options"))
      ? mk("nosniff", defs[2].label, 28, "conforme", true, "X-Content-Type-Options: nosniff", "L'en-tête X-Content-Type-Options est présent.")
      : mk("nosniff", defs[2].label, 24, "info", true, `Aucun en-tête X-Content-Type-Options sur ${url}`, `La page d'accueil ${url} ne renvoie pas l'en-tête X-Content-Type-Options (réglage mineur).`),
    get("x-frame-options") || /frame-ancestors/i.test(csp)
      ? mk("frame", defs[3].label, 29, "conforme", true, get("x-frame-options") ? `X-Frame-Options: ${get("x-frame-options")}` : "CSP frame-ancestors", "Le site limite son intégration dans une autre page.")
      : mk("frame", defs[3].label, 25, "info", true, `Ni X-Frame-Options ni frame-ancestors sur ${url}`, `La page d'accueil ${url} n'interdit pas son intégration dans une autre page (réglage mineur).`),
  ];
}

/** security.txt : présent seulement si le fichier ressemble vraiment à un security.txt (une page d'erreur déguisée ne compte pas). */
export function evalSecurityTxt(host: string, h: HttpInfo): Check {
  const L = "Fichier security.txt";
  if (h.kind === "error") return unknown("security-txt", L, 30, "Le fichier security.txt", h);
  if (h.status === 200 && /text\/plain/i.test(h.contentType) && /^contact:\s*\S+/im.test(h.body)) return mk("security-txt", L, 30, "conforme", true, `https://${host}/.well-known/security.txt`, `Le site ${host} publie un fichier security.txt (contact pour signaler une faille).`);
  if (h.status === 404 || h.status === 410) return mk("security-txt", L, 30, "info", true, `Code ${h.status} sur https://${host}/.well-known/security.txt`, `Le site ${host} ne publie pas de fichier security.txt indiquant à qui signaler une faille (bonne pratique, facultative).`);
  return mk("security-txt", L, 30, "non_detecte", false, `Code ${h.status} sur https://${host}/.well-known/security.txt`, `Le fichier security.txt de ${host} n'a pas été détecté (réponse inhabituelle). Aucune conclusion.`);
}

// ——— Domaines proches ———

/** Quelques variantes du nom de domaine (autres extensions, tiret en plus ou en moins). Liste courte et fixe : ce n'est pas une recherche exhaustive. */
export function lookalikes(domain: string): string[] {
  const labels = domain.split(".");
  if (labels.length !== 2) return [];
  const [name, tld] = labels;
  const out = ["fr", "com", "net", "eu", "org"].filter((t) => t !== tld).map((t) => `${name}.${t}`);
  if (name.includes("-")) out.push(`${name.replace(/-/g, "")}.${tld}`);
  return out.filter(isDomain).slice(0, 6);
}

/** Domaines proches : simple existence dans le DNS. Peut appartenir à l'entreprise elle-même : jamais un constat. */
export function evalLookalikes(domain: string, results: { name: string; res: Dns }[]): Check {
  const L = "Domaines proches";
  const reg = results.filter((r) => r.res.kind === "records").map((r) => r.name);
  if (!results.length) return mk("proches", L, 31, "non_detecte", false, "Aucune variante essayée", "Aucun domaine proche n'a été recherché.");
  if (reg.length) return mk("proches", L, 31, "info", false, `Enregistré(s) : ${reg.join(", ")}`, `Domaine proche enregistré, à vérifier : ${reg.join(", ")}. Il peut vous appartenir ou appartenir à un tiers sans rapport ; à contrôler de votre côté.`);
  return mk("proches", L, 31, "non_detecte", false, `Variantes essayées : ${results.map((r) => r.name).join(", ")}`, "Aucun domaine proche enregistré n'a été détecté parmi les variantes essayées.");
}

// ——— Assemblage ———

/** Borne chaque mesure dans le temps : un service lent donne « mesure impossible », jamais un blocage. */
async function guard<T>(p: Promise<T>, ms: number, onFail: (detail: string) => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((resolve) => { timer = setTimeout(() => resolve(onFail("délai dépassé")), ms); })]);
  } catch {
    return onFail("erreur de mesure");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Lance toutes les mesures passives d'un domaine et les interprète.
 * mailDomain : domaine de la messagerie ("" = pas de contrôle de messagerie) ; webHost : hôte du site ("" = pas de contrôle du site).
 */
export async function diagnose(target: { mailDomain: string; webHost: string }, probe: Probe, on: string, timeoutMs = 8000): Promise<Diagnostic> {
  const dnsErr = (detail: string): Dns => ({ kind: "error", detail });
  const dns = (name: string, type: DnsType) => guard(probe.dns(name, type), timeoutMs, dnsErr);
  const checks: Check[] = [];
  const jobs: Promise<void>[] = [];
  const d = target.mailDomain;
  if (d && isDomain(d)) {
    jobs.push(
      (async () => {
        // Toutes les requêtes partent ensemble : la durée totale reste bornée par le délai d'une seule.
        const [mx, txt, sts, dm, dk, near] = await Promise.all([
          dns(d, "MX"),
          dns(d, "TXT"),
          dns("_mta-sts." + d, "TXT"),
          Promise.all(dmarcNames(d).map(async (name) => ({ name, res: await dns(name, "TXT") }))),
          Promise.all(DKIM_SELECTORS.map(async (selector) => ({ selector, res: await dns(`${selector}._domainkey.${d}`, "TXT") }))),
          Promise.all(lookalikes(d).map(async (name) => ({ name, res: await dns(name, "NS") }))),
        ]);
        checks.push(evalMx(d, mx), evalSpf(d, txt, mx, on), evalDmarc(d, dm, mx, on), evalDkim(d, dk), evalMtaSts(d, sts), evalLookalikes(d, near));
      })(),
    );
  }
  const h = target.webHost;
  if (h && isDomain(h)) {
    jobs.push(
      (async () => {
        const [tls, home, sec] = await Promise.all([
          guard(probe.tls(h), timeoutMs, (detail): TlsInfo => ({ kind: "error", detail })),
          guard(probe.http(`https://${h}/`), timeoutMs, (detail): HttpInfo => ({ kind: "error", detail })),
          guard(probe.http(`https://${h}/.well-known/security.txt`), timeoutMs, (detail): HttpInfo => ({ kind: "error", detail })),
        ]);
        checks.push(evalTls(h, tls, on), ...evalHeaders(h, home, on), evalSecurityTxt(h, sec));
      })(),
    );
  }
  await Promise.all(jobs);
  checks.sort((a, b) => a.rank - b.rank);
  const certain = checks.filter(mailable);
  return { mailDomain: d, webHost: h, checkedOn: on, rulesVersion: RULES_VERSION, checks, main: certain[0]?.id ?? "", certainCount: certain.length };
}

export const STATUS_LABEL: Record<CheckStatus, string> = { constat: "Constat", conforme: "Rien à signaler", info: "Information", non_detecte: "Non détecté", erreur: "Non vérifié" };

/** Durée de validité d'un diagnostic : au-delà, les constats doivent être mesurés de nouveau avant tout envoi. */
export const DIAGNOSTIC_FRESH_DAYS = 14;

/**
 * Barrière de qualité : un diagnostic n'ouvre l'entrée dans la séquence que s'il est terminé, récent,
 * produit par les règles en vigueur, et s'il contient au moins un constat certain.
 */
export function usableDiagnostic(d: { status: string; certainCount: number; rulesVersion: string; checkedOn: string } | undefined | null, today: string): boolean {
  if (!d || d.status !== "fait" || d.certainCount < 1 || d.rulesVersion !== RULES_VERSION || !/^\d{4}-\d{2}-\d{2}$/.test(d.checkedOn)) return false;
  const age = daysBetweenIso(d.checkedOn, today);
  return age >= 0 && age <= DIAGNOSTIC_FRESH_DAYS;
}

/** Relit les constats stockés (JSON). Tout ce qui n'a pas la forme attendue est ignoré. */
export function parseChecks(json: string): Check[] {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter((c): c is Check => !!c && typeof c === "object" && typeof (c as Check).id === "string" && typeof (c as Check).wording === "string" && typeof (c as Check).proof === "string" && typeof (c as Check).status === "string" && typeof (c as Check).certain === "boolean");
  } catch {
    return [];
  }
}
