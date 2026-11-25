import "server-only";
import { publicProbe } from "./diagnostic";
import { brevoConfig } from "./brevo";
import type { Probe } from "@/lib/diagnostic";
import { BREVO_DKIM_SELECTORS, parentDomain, senderDomain, senderHealth, type SenderHealth } from "@/lib/sender-check";

/** Résultat gardé une heure par instance : quelques lectures DNS publiques, pas à chaque affichage. */
let cache: { at: number; domain: string; health: SenderHealth } | null = null;
const TTL = 60 * 60 * 1000;

/** Santé du domaine d'expédition de la prospection. Une lecture impossible n'est jamais « stricte » (prudence). */
export async function checkSender(opts: { probe?: Probe; fresh?: boolean } = {}): Promise<SenderHealth> {
  const domain = senderDomain(brevoConfig().fromEmail);
  if (!opts.fresh && !opts.probe && cache && cache.domain === domain && Date.now() - cache.at < TTL) return cache.health;
  const probe = opts.probe ?? publicProbe;
  if (!domain) return { domain: "", spf: "inconnu", dkim: "inconnu", dmarc: { policy: "inconnu", pct: 100, inherited: false, record: "" }, strict: false, issues: ["Adresse d'expédition illisible (MAIL_FROM_EMAIL)."] };
  let health: SenderHealth;
  try {
    const parent = parentDomain(domain);
    const [spf, dmarc, parentDmarc, ...dkim] = await Promise.all([
      probe.dns(domain, "TXT"),
      probe.dns(`_dmarc.${domain}`, "TXT"),
      parent ? probe.dns(`_dmarc.${parent}`, "TXT") : Promise.resolve(null),
      ...BREVO_DKIM_SELECTORS.map((sel) => probe.dns(`${sel}._domainkey.${domain}`, "TXT")),
    ]);
    health = senderHealth({ domain, spf, dmarc, parentDmarc, dkim });
  } catch {
    health = senderHealth({ domain, spf: { kind: "error", detail: "" }, dmarc: { kind: "error", detail: "" }, parentDmarc: null, dkim: [{ kind: "error", detail: "" }] });
  }
  if (!opts.probe) cache = { at: Date.now(), domain, health };
  return health;
}
