import "server-only";
import { connect } from "node:tls";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { siteFromNotes } from "@/lib/contact-extract";
import { diagnose, mergeDns, parseDoh, targetsOf, type Dns, type DnsType, type HttpInfo, type Probe, type TlsInfo } from "@/lib/diagnostic";
import { today } from "@/lib/format";
import { fetchPublic, publicAddress } from "./web-fetch";

/** Deux résolveurs DNS publics et indépendants, interrogés en HTTPS. Une réponse n'est retenue que s'ils sont d'accord. */
const RESOLVERS = ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"];

async function doh(base: string, name: string, type: DnsType): Promise<Dns> {
  try {
    const res = await fetch(`${base}?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return { kind: "error", detail: `résolveur indisponible (HTTP ${res.status})` };
    return parseDoh(await res.json().catch(() => null), type);
  } catch {
    return { kind: "error", detail: "résolveur injoignable" };
  }
}

/** Lecture du certificat présenté sur le port 443 (connexion HTTPS ordinaire, sans envoyer de requête). L'adresse est vérifiée publique avant la connexion. */
async function tlsInfo(host: string): Promise<TlsInfo> {
  let ip: string;
  try {
    ip = await publicAddress(host);
  } catch {
    return { kind: "error", detail: "hôte introuvable ou non public" };
  }
  return new Promise<TlsInfo>((resolve) => {
    let done = false;
    const finish = (r: TlsInfo) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(r);
    };
    const socket = connect({ host: ip, port: 443, servername: host, rejectUnauthorized: false, timeout: 5000 }, () => {
      const cert = socket.getPeerCertificate();
      const end = cert?.valid_to ? new Date(cert.valid_to) : null;
      if (!end || Number.isNaN(end.getTime())) return finish({ kind: "error", detail: "certificat illisible" });
      finish({ kind: "ok", validTo: end.toISOString(), authorized: socket.authorized, authError: String(socket.authorizationError ?? "") });
    });
    socket.on("timeout", () => finish({ kind: "error", detail: "délai dépassé" }));
    socket.on("error", () => finish({ kind: "error", detail: "connexion HTTPS impossible" }));
  });
}

async function httpInfo(url: string): Promise<HttpInfo> {
  const r = await fetchPublic(url, Date.now() + 7000, "text/html,text/plain;q=0.9,*/*;q=0.5");
  if ("error" in r) return { kind: "error", detail: r.error };
  return { kind: "ok", status: r.status, url: r.url, headers: r.headers, contentType: r.contentType, body: r.body.slice(0, 20_000) };
}

/** Sonde réelle : uniquement des lectures publiques et passives (DNS, certificat du port 443, page d'accueil et security.txt). */
export const publicProbe: Probe = {
  dns: async (name, type) => {
    const [a, b] = await Promise.all(RESOLVERS.map((r) => doh(r, name, type)));
    return mergeDns(a, b);
  },
  tls: tlsInfo,
  http: httpInfo,
};

/** Met des entreprises en file d'attente de diagnostic (une seule demande en attente par entreprise). Renvoie le nombre ajouté. */
export async function queueDiagnostics(companyIds: string[]): Promise<number> {
  if (!companyIds.length) return 0;
  const pending = new Set((await db.select({ companyId: schema.companyDiagnostics.companyId }).from(schema.companyDiagnostics).where(and(eq(schema.companyDiagnostics.status, "a_faire"), inArray(schema.companyDiagnostics.companyId, companyIds)))).map((r) => r.companyId));
  const existing = new Set((await db.select({ id: schema.companies.id }).from(schema.companies).where(inArray(schema.companies.id, companyIds))).map((r) => r.id));
  const add = [...new Set(companyIds)].filter((id) => existing.has(id) && !pending.has(id));
  if (add.length) await db.insert(schema.companyDiagnostics).values(add.map((companyId) => ({ companyId })));
  return add.length;
}

export type DiagnosticRun = { done: number; skipped: number; failed: number; waiting: number; message: string };

/**
 * Traite la file d'attente par petits lots, dans un budget de temps (la fonction s'arrête avant la limite d'exécution
 * de l'hébergeur) : ce qui reste est repris au déclenchement suivant.
 */
export async function runDiagnostics(opts: { budgetMs?: number; probe?: Probe; batch?: number } = {}): Promise<DiagnosticRun> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 40_000;
  const probe = opts.probe ?? publicProbe;
  const batch = Math.max(1, opts.batch ?? 3);
  let done = 0, skipped = 0, failed = 0;
  const seen = new Set<string>();
  // Au moins un lot ; un lot suivant ne démarre que s'il reste le temps de le finir (chaque mesure est bornée à 8 s).
  while (seen.size === 0 || Date.now() - started < budget - 10_000) {
    const rows = (await db.select().from(schema.companyDiagnostics).where(eq(schema.companyDiagnostics.status, "a_faire")).orderBy(asc(schema.companyDiagnostics.createdAt)).limit(batch + seen.size)).filter((r) => !seen.has(r.id)).slice(0, batch);
    if (!rows.length) break;
    await Promise.all(
      rows.map(async (row) => {
        seen.add(row.id);
        try {
          const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, row.companyId)).limit(1))[0];
          const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, row.companyId)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];
          const target = targetsOf(ct?.email ?? "", siteFromNotes(c?.notes ?? ""));
          if (!c || (!target.mailDomain && !target.webHost)) {
            await db.update(schema.companyDiagnostics).set({ status: "sans_domaine", checkedOn: today() }).where(eq(schema.companyDiagnostics.id, row.id));
            skipped++;
            return;
          }
          const d = await diagnose(target, probe, today());
          await db.update(schema.companyDiagnostics).set({ status: "fait", mailDomain: d.mailDomain, webHost: d.webHost, findings: JSON.stringify(d.checks), mainFinding: d.main, certainCount: d.certainCount, rulesVersion: d.rulesVersion, checkedOn: d.checkedOn }).where(eq(schema.companyDiagnostics.id, row.id));
          done++;
        } catch (e) {
          console.error("diagnostic : échec", row.id, e instanceof Error ? e.message : "");
          await db.update(schema.companyDiagnostics).set({ status: "erreur", checkedOn: today() }).where(eq(schema.companyDiagnostics.id, row.id)).catch(() => {});
          failed++;
        }
      }),
    );
  }
  const waiting = (await db.select({ id: schema.companyDiagnostics.id }).from(schema.companyDiagnostics).where(eq(schema.companyDiagnostics.status, "a_faire"))).length;
  const parts = [`${done} diagnostic(s) terminé(s)`, skipped ? `${skipped} sans domaine exploitable` : "", failed ? `${failed} en échec` : "", waiting ? `${waiting} en attente (repris au prochain déclenchement)` : ""].filter(Boolean);
  return { done, skipped, failed, waiting, message: parts.join(" · ") };
}

/** Dernier diagnostic terminé de chaque entreprise. */
export async function latestDiagnostics(): Promise<Map<string, typeof schema.companyDiagnostics.$inferSelect>> {
  const rows = await db.select().from(schema.companyDiagnostics).where(eq(schema.companyDiagnostics.status, "fait")).orderBy(desc(schema.companyDiagnostics.createdAt));
  const out = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!out.has(r.companyId)) out.set(r.companyId, r);
  return out;
}
