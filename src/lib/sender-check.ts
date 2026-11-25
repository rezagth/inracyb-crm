/**
 * Santé du domaine d'expédition de la prospection (SPF, DKIM de Brevo, DMARC).
 * Règle pure : les lectures DNS sont fournies par l'appelant. Un domaine qui n'applique pas DMARC (quarantine ou reject,
 * à 100 %) avec une signature DKIM valide ne peut pas dépasser SENDER_UNVERIFIED_CAP envois de diagnostic par jour.
 */
import type { Dns } from "./diagnostic";

/** Plafond quotidien du service Diagnostic tant que le domaine d'envoi n'est pas strict. */
export const SENDER_UNVERIFIED_CAP = 10;
/** Sélecteurs DKIM publiés par Brevo (brevo1/brevo2 aujourd'hui, mail pour les anciens comptes Sendinblue). */
export const BREVO_DKIM_SELECTORS = ["brevo1", "brevo2", "mail"] as const;

export type DmarcPolicy = "none" | "quarantine" | "reject";
export type SenderLookups = {
  domain: string;
  spf: Dns;
  dmarc: Dns;
  /** DMARC du domaine parent (utile pour un sous-domaine d'envoi) ; null si le domaine est déjà le domaine principal */
  parentDmarc: Dns | null;
  dkim: Dns[];
};
export type SenderHealth = {
  domain: string;
  spf: "ok" | "absent" | "inconnu";
  dkim: "ok" | "absent" | "inconnu";
  dmarc: { policy: DmarcPolicy | "absent" | "inconnu"; pct: number; inherited: boolean; record: string };
  /** DMARC appliqué à 100 % et DKIM valide : la montée en charge au-delà du plafond prudent est permise */
  strict: boolean;
  /** ce qu'il reste à corriger, en phrases courtes */
  issues: string[];
};

/** Domaine d'une adresse d'expédition, en minuscules ; "" si l'adresse est illisible. */
export function senderDomain(email: string): string {
  const m = /^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(email.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Domaine parent « organisationnel » simple (deux derniers niveaux) ; null s'il n'y a pas de parent. */
export function parentDomain(domain: string): string | null {
  const parts = domain.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : null;
}

const tags = (record: string): Record<string, string> =>
  Object.fromEntries(
    record
      .split(";")
      .map((x) => x.trim().split("="))
      .filter((kv) => kv.length === 2 && kv[0])
      .map(([k, v]) => [k.trim().toLowerCase(), v.trim().toLowerCase()]),
  );

const dmarcRecord = (d: Dns): string | null => (d.kind === "records" ? (d.values.find((v) => /^v=dmarc1\b/i.test(v.trim())) ?? null) : null);

export function senderHealth(l: SenderLookups): SenderHealth {
  const issues: string[] = [];

  const spf: SenderHealth["spf"] = l.spf.kind === "error" ? "inconnu" : l.spf.kind === "records" && l.spf.values.some((v) => /^v=spf1\b/i.test(v.trim())) ? "ok" : "absent";

  const dkimFound = l.dkim.some((d) => d.kind === "records" && d.values.some((v) => /(^|;)\s*p=\s*[a-z0-9+/]{20,}/i.test(v.replace(/\s+/g, ""))));
  const dkim: SenderHealth["dkim"] = dkimFound ? "ok" : l.dkim.every((d) => d.kind === "error") ? "inconnu" : "absent";

  let dmarc: SenderHealth["dmarc"] = { policy: "absent", pct: 100, inherited: false, record: "" };
  const own = dmarcRecord(l.dmarc);
  const parent = l.parentDmarc ? dmarcRecord(l.parentDmarc) : null;
  if (l.dmarc.kind === "error" || (!own && l.parentDmarc?.kind === "error")) dmarc = { ...dmarc, policy: "inconnu" };
  else if (own || parent) {
    const t = tags((own ?? parent)!);
    // Un sous-domaine sans DMARC propre suit « sp » du parent, sinon « p ».
    const raw = own ? t.p : (t.sp ?? t.p);
    const policy: DmarcPolicy | "absent" = raw === "reject" || raw === "quarantine" || raw === "none" ? raw : "absent";
    const pct = Number.parseInt(t.pct ?? "100", 10);
    dmarc = { policy, pct: Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 100, inherited: !own, record: (own ?? parent)!.slice(0, 300) };
  }

  if (spf === "absent") issues.push(`Aucun SPF publié pour ${l.domain}.`);
  if (dkim === "absent") issues.push(`Aucune signature DKIM de Brevo trouvée pour ${l.domain} (Brevo > Expéditeurs, domaines > Authentifier).`);
  if (dmarc.policy === "absent") issues.push(`Aucune politique DMARC pour ${l.domain}.`);
  if (dmarc.policy === "none") issues.push(`DMARC de ${l.domain} en « p=none » : passer à « p=quarantine » une fois les envois légitimes vérifiés dans les rapports.`);
  if ((dmarc.policy === "quarantine" || dmarc.policy === "reject") && dmarc.pct < 100) issues.push(`DMARC appliqué à ${dmarc.pct} % seulement : terminer à « pct=100 ».`);
  if (spf === "inconnu" || dkim === "inconnu" || dmarc.policy === "inconnu") issues.push("Vérification DNS impossible pour l'instant : nouvel essai plus tard.");

  const strict = dkim === "ok" && (dmarc.policy === "quarantine" || dmarc.policy === "reject") && dmarc.pct === 100;
  return { domain: l.domain, spf, dkim, dmarc, strict, issues };
}
