"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { CONTROLS } from "@/lib/audit";
import { addDays, today } from "@/lib/format";
import { logEvent } from "../core";
import { billContracts } from "../automations";

type R = { ok: true; message: string } | { ok: false; error: string };

/** Crée en brouillon la facture du mois pour chaque contrat actif pas encore facturé ce mois-ci. */
export async function billContractsAction(contractId?: string): Promise<R> {
  await requireUser();
  const r = (await billContracts(contractId));
  revalidatePath("/", "layout");
  return r;
}

const ans = z.enum(["oui", "partiel", "non", "na", ""]);

export async function setAuditAnswerAction(auditId: string, controlId: string, value: string): Promise<R> {
  await requireUser();
  const v = ans.safeParse(value);
  if (!v.success || !CONTROLS.some((c) => c.id === controlId)) return { ok: false, error: "Réponse invalide." };
  const a = (await db.select().from(schema.audits).where(eq(schema.audits.id, auditId)).limit(1))[0];
  if (!a) return { ok: false, error: "Audit introuvable." };
  const answers = JSON.parse(a.answers || "{}") as Record<string, string>;
  if (v.data) answers[controlId] = v.data;
  else delete answers[controlId];
  await db.update(schema.audits).set({ answers: JSON.stringify(answers) }).where(eq(schema.audits.id, auditId));
  revalidatePath(`/audits/${auditId}`);
  return { ok: true, message: "Réponse enregistrée" };
}

export async function setAuditNoteAction(auditId: string, controlId: string, note: string): Promise<R> {
  await requireUser();
  const n = z.string().max(2000).safeParse(note);
  if (!n.success || !CONTROLS.some((c) => c.id === controlId)) return { ok: false, error: "Note invalide." };
  const a = (await db.select().from(schema.audits).where(eq(schema.audits.id, auditId)).limit(1))[0];
  if (!a) return { ok: false, error: "Audit introuvable." };
  const notes = JSON.parse(a.notes || "{}") as Record<string, string>;
  if (n.data.trim()) notes[controlId] = n.data.trim();
  else delete notes[controlId];
  await db.update(schema.audits).set({ notes: JSON.stringify(notes) }).where(eq(schema.audits.id, auditId));
  return { ok: true, message: "Note enregistrée" };
}

export async function setAuditStatusAction(auditId: string, status: string): Promise<R> {
  await requireUser();
  const st = z.enum(["en_cours", "termine"]).safeParse(status);
  if (!st.success) return { ok: false, error: "Statut invalide." };
  const a = (await db.select().from(schema.audits).where(eq(schema.audits.id, auditId)).limit(1))[0];
  if (!a) return { ok: false, error: "Audit introuvable." };
  await db.transaction(async (tx) => {
            await tx.update(schema.audits).set({ status: st.data }).where(eq(schema.audits.id, auditId));
            if (st.data === "termine") await logEvent(tx, a.companyId, "note", "Audit cyber terminé");
          });
  revalidatePath("/", "layout");
  return { ok: true, message: st.data === "termine" ? "Audit terminé" : "Audit rouvert" };
}

/** Ajoute au plan d'action du client une action par point « Non » ou « Partiel » (sans doublon). */
export async function auditPlanAction(auditId: string): Promise<R> {
  await requireUser();
  const a = (await db.select().from(schema.audits).where(eq(schema.audits.id, auditId)).limit(1))[0];
  if (!a) return { ok: false, error: "Audit introuvable." };
  const answers = JSON.parse(a.answers || "{}") as Record<string, string>;
  const existing = new Set((await db.select({ t: schema.securityActions.title }).from(schema.securityActions).where(eq(schema.securityActions.companyId, a.companyId))).map((x) => x.t));
  const add = CONTROLS.filter((c) => (answers[c.id] === "non" || answers[c.id] === "partiel") && !existing.has(c.reco));
  if (!add.length) return { ok: true, message: "Plan d'action déjà à jour pour cet audit" };
  const t = today();
  await db.transaction(async (tx) => {
            for (const c of add)
              await tx.insert(schema.securityActions).values({ companyId: a.companyId, title: c.reco, priority: c.prio, owner: "Moi", status: "a_faire", due: addDays(t, c.prio === "haute" ? 14 : c.prio === "moyenne" ? 30 : 60), auditId: a.id });
            await logEvent(tx, a.companyId, "note", `${add.length} action(s) ajoutée(s) au plan depuis l'audit`);
          });
  revalidatePath("/", "layout");
  return { ok: true, message: `${add.length} action(s) ajoutée(s) au plan d'action` };
}
