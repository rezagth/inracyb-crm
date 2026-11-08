"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { parseBankCsv } from "@/lib/bank";
import { addPaymentAction } from "./documents";
import type { ActionResult } from "../core";
import { autoOn, billContracts, fiscalTasks, lateInvoiceTasks } from "../automations";

type R = { ok: true; message: string } | { ok: false; error: string };

export async function importBankCsvAction(text: string): Promise<R> {
  await requireUser();
  if (typeof text !== "string" || text.length > 2_000_000) return { ok: false, error: "Fichier trop volumineux (2 Mo maximum)." };
  const txs = parseBankCsv(text);
  if (!txs.length) return { ok: false, error: "Aucun crédit lisible dans ce fichier. Vérifie qu'il s'agit d'un export CSV avec des colonnes Date, Libellé et Montant (ou Crédit)." };
  let n = 0;
  await db.transaction(async (tx) => {
            for (const t of txs) {
              const hash = createHash("sha256").update(`${t.date}|${t.label}|${t.amountCents}`).digest("hex");
              const r = await tx.insert(schema.bankLines).values({ ...t, hash }).onConflictDoNothing().returning({ id: schema.bankLines.id });
              n += r.length;
            }
          });
  revalidatePath("/integrations");
  return { ok: true, message: n ? `${n} encaissement(s) importé(s) · rapproche-les ci-dessous` : "Aucun nouvel encaissement dans ce fichier" };
}

export async function matchBankLineAction(lineId: string, invoiceId: string): Promise<R> {
  await requireUser();
  const line = (await db.select().from(schema.bankLines).where(eq(schema.bankLines.id, lineId)).limit(1))[0];
  if (!line || line.status !== "a_rapprocher") return { ok: false, error: "Ligne déjà traitée." };
  if (!invoiceId) return { ok: false, error: "Choisis la facture correspondante." };
  const r = await addPaymentAction(invoiceId, { amount: (line.amountCents / 100).toFixed(2), date: line.date, method: "Virement bancaire" });
  if (!r.ok) return r;
  await db.update(schema.bankLines).set({ status: "rapproche", invoiceId }).where(eq(schema.bankLines.id, lineId));
  revalidatePath("/", "layout");
  return { ok: true, message: `Rapproché · ${r.message}` };
}

export async function ignoreBankLineAction(lineId: string): Promise<R> {
  await requireUser();
  await db.update(schema.bankLines).set({ status: "ignore" }).where(eq(schema.bankLines.id, lineId));
  revalidatePath("/integrations");
  return { ok: true, message: "Ligne ignorée" };
}

const integ = z.object({
  calUrl: z.union([z.url("Lien de réservation invalide (https://…)."), z.literal("")]).optional(),
  payLink: z.union([z.url("Lien de paiement invalide (https://…)."), z.literal("")]).optional(),
  bankName: z.string().trim().max(120).optional(),
  esignProvider: z.string().trim().max(120).optional(),
  einvoicePlatform: z.string().trim().max(120).optional(),
});

/** Enregistre un réglage d'intégration (un champ à la fois). */
export async function updateIntegrationAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireUser();
  const raw = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v).trim()]));
  const p = integ.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Valeur invalide." };
  const values = Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined));
  if (!Object.keys(values).length) return { ok: false, error: "Rien à enregistrer." };
  await db.update(schema.settings).set(values).where(eq(schema.settings.id, 1));
  revalidatePath("/", "layout");
  return { ok: true, message: "Enregistré" };
}

/* ---------- automatisations ---------- */
const AUTO_KEYS = ["acompte", "solde", "contrats", "retard", "ticket", "prospectJ0", "rdvPrep", "fiscal"] as const;

export async function toggleAutomationAction(key: string): Promise<R> {
  await requireUser();
  const k = z.enum(AUTO_KEYS).safeParse(key);
  if (!k.success) return { ok: false, error: "Automatisation inconnue." };
  const row = (await db.select().from(schema.automations).where(eq(schema.automations.key, k.data)).limit(1))[0];
  const next = !(row?.enabled ?? true);
  await db.insert(schema.automations).values({ key: k.data, enabled: next }).onConflictDoUpdate({ target: schema.automations.key, set: { enabled: next } });
  revalidatePath("/automatisations");
  return { ok: true, message: next ? "Automatisation activée" : "Automatisation désactivée" };
}

export async function runAutomationsNowAction(): Promise<R> {
  await requireUser();
  const parts: string[] = [];
  if ((await autoOn("contrats"))) {
    const r = (await billContracts());
    parts.push(r.ok ? r.message : r.error);
  }
  if ((await autoOn("retard"))) {
    const n = (await lateInvoiceTasks());
    parts.push(n ? `${n} tâche(s) de relance créée(s)` : "aucune facture en retard sans relance");
  }
  if ((await autoOn("fiscal"))) {
    const n = (await fiscalTasks());
    parts.push(n ? `${n} rappel(s) fiscal(aux) créé(s)` : "aucun nouveau rappel fiscal");
  }
  revalidatePath("/", "layout");
  return { ok: true, message: parts.join(" · ") || "Rien à exécuter" };
}

/* ---------- rapports enregistrés ---------- */
export async function saveReportAction(name: string, config: string): Promise<R> {
  await requireUser();
  const n = z.string().trim().min(1).max(120).safeParse(name);
  let raw: unknown = null;
  try {
    raw = JSON.parse(config || "{}");
  } catch {}
  const c = z.object({ metric: z.enum(["ca", "pipe", "count", "calls"]), group: z.enum(["mois", "secteur", "source", "etape"]), viz: z.enum(["v", "h"]) }).safeParse(raw);
  if (!n.success || !c.success) return { ok: false, error: "Rapport invalide." };
  await db.insert(schema.savedReports).values({ name: n.data, config: JSON.stringify(c.data) });
  revalidatePath("/rapports");
  return { ok: true, message: "Rapport enregistré" };
}

export async function deleteReportAction(id: string): Promise<R> {
  await requireUser();
  await db.delete(schema.savedReports).where(eq(schema.savedReports.id, id));
  revalidatePath("/rapports");
  return { ok: true, message: "Rapport supprimé" };
}
