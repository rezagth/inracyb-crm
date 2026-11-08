import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "@/lib/format";
import { paymentStatusOf, signPayload } from "@/lib/stratcyber-link";

/**
 * Envoie à StratCyber (cockpit RSSI) la liste des clients (gagnés ou sous contrat) et leur statut de paiement.
 * Sens unique CRM → StratCyber, jamais l'inverse. N'envoie que : identifiant, nom, secteur, statut.
 * Sans STRATCYBER_URL et STRATCYBER_WEBHOOK_SECRET dans .env, ne fait rien. Idempotent : peut être relancé.
 */
async function post(url: string, secret: string, body: object): Promise<boolean> {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-infracyb-timestamp": ts, "x-infracyb-signature": signPayload(secret, ts, raw) },
      body: raw,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncStratcyber(): Promise<{ ok: boolean; message: string }> {
  const base = process.env.STRATCYBER_URL?.replace(/\/$/, "");
  const secret = process.env.STRATCYBER_WEBHOOK_SECRET;
  if (!base || !secret) return { ok: false, message: "Lien StratCyber non configuré (STRATCYBER_URL / STRATCYBER_WEBHOOK_SECRET)." };
  const url = `${base}/api/integrations/crm`;
  const t = today();

  const contracts = (await db.select().from(schema.contracts));
  const won = await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.stage, "gagne"));
  const companyIds = [...new Set([...contracts.map((c) => c.companyId), ...won.map((w) => w.id)])];
  if (companyIds.length === 0) return { ok: true, message: "Aucun client à envoyer." };
  const companies = (await db.select().from(schema.companies).where(inArray(schema.companies.id, companyIds)));
  const late = (await db
      .select({ companyId: schema.invoices.companyId, dueDate: schema.invoices.dueDate })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.kind, "facture"), eq(schema.invoices.status, "envoyee"), lt(schema.invoices.dueDate, t))));

  let sent = 0;
  let failed = 0;
  for (const co of companies) {
    const { status, overdueDays } = paymentStatusOf(
      contracts.filter((c) => c.companyId === co.id).map((c) => c.status),
      late.filter((l) => l.companyId === co.id).map((l) => l.dueDate),
      t,
    );
    const up = await post(url, secret, { event: "client.upsert", crmId: co.id, name: co.name, sector: co.sector });
    const st = up && (await post(url, secret, { event: "payment.status", crmId: co.id, status, overdueDays }));
    if (up && st) sent++;
    else failed++;
  }
  return failed ? { ok: false, message: `${sent} client(s) envoyé(s), ${failed} en échec (StratCyber injoignable ou secret différent).` } : { ok: true, message: `${sent} client(s) synchronisé(s) avec StratCyber.` };
}
