import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, eur, today } from "@/lib/format";
import { draftNumber, getSettings, logEvent, type DbOrTx } from "./core";
import { fiscalReminders } from "@/lib/fiscal";
import { cashYearHt } from "./finance";
import { syncStratcyber } from "./stratcyber-sync";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export async function autoOn(key: string) {
  return (await db.select().from(schema.automations).where(eq(schema.automations.key, key)).limit(1))[0]?.enabled !== false;
}
export async function bumpRuns(tx: DbOrTx, key: string, n = 1) {
  await tx.insert(schema.automations).values({ key, runs: n, lastRunAt: new Date() }).onConflictDoUpdate({ target: schema.automations.key, set: { runs: sql`${schema.automations.runs} + ${n}`, lastRunAt: new Date() } });
}

/** Factures du mois des contrats actifs, en brouillon, sans jamais facturer deux fois le même mois. */
export async function billContracts(contractId?: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const s = (await getSettings());
  const t = today();
  const month = t.slice(0, 7);
  const label = `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
  const list = (await db
      .select()
      .from(schema.contracts)
      .where(contractId ? and(eq(schema.contracts.id, contractId), eq(schema.contracts.status, "actif")) : eq(schema.contracts.status, "actif")))
    .filter((c) => c.start.slice(0, 7) <= month && (!c.end || c.end.slice(0, 7) >= month));
  if (!list.length) return { ok: false, error: "Aucun contrat actif à facturer ce mois-ci." };
  let n = 0;
  await db.transaction(async (tx) => {
            for (const c of list) {
              if ((await tx.select().from(schema.contractBillings).where(and(eq(schema.contractBillings.contractId, c.id), eq(schema.contractBillings.month, month))).limit(1))[0]) continue;
              const subject = `${c.offer} — ${label}`;
              const inv = (await tx
                      .insert(schema.invoices)
                      .values({ number: draftNumber(), companyId: c.companyId, subject, status: "brouillon", issueDate: t, dueDate: addDays(t, s.payDays), totalHtCents: c.monthlyCents })
                      .returning({ id: schema.invoices.id }))[0];
              await tx.insert(schema.invoiceLines).values({ invoiceId: inv.id, position: 0, label: subject, quantity: 1, unit: "mois", unitPriceCents: c.monthlyCents });
              await tx.insert(schema.contractBillings).values({ contractId: c.id, month, invoiceId: inv.id });
              await logEvent(tx, c.companyId, "invoice", `Facture du contrat créée en brouillon (${label}) — ${eur(c.monthlyCents)} HT`);
              n++;
            }
            if (n) await bumpRuns(tx, "contrats", n);
          });
  return { ok: true, message: n ? `${n} facture(s) de ${label} créée(s) en brouillon : relis-les puis émets-les dans Factures` : `Tout est déjà facturé pour ${label}` };
}

/** Une tâche de relance par facture échue (une seule fois par facture). */
export async function lateInvoiceTasks(): Promise<number> {
  const t = today();
  const late = (await db
      .select({ id: schema.invoices.id, number: schema.invoices.number, companyId: schema.invoices.companyId })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.kind, "facture"), eq(schema.invoices.status, "envoyee"), sql`${schema.invoices.dueDate} < ${t}`)));
  let n = 0;
  await db.transaction(async (tx) => {
            for (const iv of late) {
              const title = `Relancer le paiement : facture ${iv.number}`;
              if ((await tx.select().from(schema.tasks).where(eq(schema.tasks.title, title)).limit(1))[0]) continue;
              await tx.insert(schema.tasks).values({ title, companyId: iv.companyId, dueDate: t, priority: "haute" });
              n++;
            }
            if (n) await bumpRuns(tx, "retard", n);
          });
  return n;
}

/** Rappels fiscaux : déclaration URSSAF à venir, plafond de CA et seuil de TVA à 80/90/100 % (une tâche par rappel). */
export async function fiscalTasks(): Promise<number> {
  const s = (await getSettings());
  const t = today();
  const reminders = fiscalReminders({
    today: t,
    periodicity: s.urssafPeriod,
    cashYearCents: (await cashYearHt(s, t.slice(0, 4))),
    ceilingCents: s.caCeilingCents,
    tvaThresholdCents: s.tvaThresholdCents,
    tvaFranchise: s.tvaFranchise,
  });
  let n = 0;
  await db.transaction(async (tx) => {
            for (const r of reminders) {
              if ((await tx.select().from(schema.tasks).where(eq(schema.tasks.title, r.title)).limit(1))[0]) continue;
              await tx.insert(schema.tasks).values({ title: r.title, dueDate: r.dueDate, priority: r.priority });
              n++;
            }
            if (n) await bumpRuns(tx, "fiscal", n);
          });
  return n;
}

/** Passage automatique à l'ouverture du CRM (au plus une fois par jour). */
export async function dailyScan() {
  const t = today();
  const row = (await db.select().from(schema.automations).where(eq(schema.automations.key, "_scan")).limit(1))[0];
  const last = row?.lastRunAt ? new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(row.lastRunAt) : "";
  if (last === t) return;
  await db.insert(schema.automations).values({ key: "_scan", enabled: false, lastRunAt: new Date() }).onConflictDoUpdate({ target: schema.automations.key, set: { lastRunAt: new Date() } });
  try {
    if ((await autoOn("contrats")) && (await db.select().from(schema.contracts).where(eq(schema.contracts.status, "actif")).limit(1))[0]) await billContracts();
    if ((await autoOn("retard"))) await lateInvoiceTasks();
    if ((await autoOn("fiscal"))) await fiscalTasks();
    void syncStratcyber().catch(() => undefined);
  } catch {
    /* une automatisation ne doit jamais bloquer l'ouverture du CRM */
  }
}
