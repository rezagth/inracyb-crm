"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { addDays, today } from "@/lib/format";
import { stageOf, stageRank } from "@/lib/constants";
import { OUTCOMES, OUTCOME_LABEL, planOutcome } from "@/lib/call-queue";
import { logEvent } from "../core";
import { latestReportLink } from "../report-link";

type R = { ok: true; message: string; copy?: string } | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const input = z.object({
  taskId: z.string().min(1).max(64),
  outcome: z.enum(OUTCOMES),
  date: isoDate.optional(),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  note: z.string().max(1000).optional(),
});

const addMinutes = (hhmm: string, n: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + n);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * Résultat d'un appel de la file du jour, en un clic : appel au journal, tâche fermée ou reprogrammée,
 * séquence de mails arrêtée si besoin, étape du pipeline, rendez-vous créé.
 */
export async function logCallOutcomeAction(raw: z.input<typeof input>): Promise<R> {
  await requireUser();
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, error: "Résultat d'appel invalide." };
  const v = p.data;
  const t = today();
  if (v.outcome === "rappeler" && (!v.date || v.date < t)) return { ok: false, error: "Choisis la date du rappel (aujourd'hui ou plus tard)." };
  if (v.outcome === "rdv" && (!v.date || v.date < t || !v.start)) return { ok: false, error: "Indique la date et l'heure du rendez-vous." };

  const task = (await db.select().from(schema.tasks).where(eq(schema.tasks.id, v.taskId)).limit(1))[0];
  if (!task || task.done || !task.companyId) return { ok: false, error: "Cet appel n'est plus dans la file (déjà traité ?)." };
  const companyId = task.companyId;
  const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
  if (!c) return { ok: false, error: "Entreprise introuvable." };

  // Essais sans réponse déjà notés depuis la création de cette tâche.
  const tries = await db
    .select({ id: schema.calls.id })
    .from(schema.calls)
    .where(and(eq(schema.calls.companyId, companyId), inArray(schema.calls.result, ["Pas de réponse", "Messagerie"]), gte(schema.calls.createdAt, task.createdAt)));
  const plan = planOutcome(v.outcome, { today: t, attempts: tries.length, date: v.date, company: c.name });
  const note = [v.note?.trim(), OUTCOME_LABEL[v.outcome]].filter(Boolean).join(" — ");

  await db.transaction(async (tx) => {
    await tx.insert(schema.calls).values({ companyId, date: t, result: plan.callResult, durationMin: 0, note });
    await logEvent(tx, companyId, "call", `Appel — ${plan.note}${v.note?.trim() ? " · " + v.note.trim() : ""}`);

    if (plan.nextDue) await tx.update(schema.tasks).set({ dueDate: plan.nextDue }).where(eq(schema.tasks.id, task.id));
    else await tx.update(schema.tasks).set({ done: true, doneAt: new Date() }).where(eq(schema.tasks.id, task.id));

    if (plan.stopSequence) {
      await tx
        .update(schema.mailCampaignItems)
        .set({ status: "arrete", stopReason: plan.stopSequence })
        .where(and(eq(schema.mailCampaignItems.companyId, companyId), eq(schema.mailCampaignItems.status, "en_cours")));
      // Plus d'autre appel prévu pour cette entreprise : la conversation a eu lieu.
      await tx.update(schema.tasks).set({ done: true, doneAt: new Date() }).where(and(eq(schema.tasks.companyId, companyId), eq(schema.tasks.kind, "appel"), eq(schema.tasks.done, false)));
    }

    if (plan.stage === "perdu" && c.stage !== "perdu" && c.stage !== "gagne") {
      await tx.update(schema.companies).set({ stage: "perdu" }).where(eq(schema.companies.id, companyId));
      await logEvent(tx, companyId, "stage", `Étape : ${stageOf(c.stage).label} → Perdu`);
    } else if (plan.stage && plan.stage !== "perdu" && c.stage !== "perdu" && stageRank(c.stage) < stageRank(plan.stage)) {
      await tx.update(schema.companies).set({ stage: plan.stage }).where(eq(schema.companies.id, companyId));
      await logEvent(tx, companyId, "stage", `Étape : ${stageOf(c.stage).label} → ${stageOf(plan.stage).label}`);
    }
    await tx.update(schema.companies).set({ lastContact: t }).where(eq(schema.companies.id, companyId));

    if (plan.followUp) await tx.insert(schema.tasks).values({ title: plan.followUp.slice(0, 300), companyId, dueDate: t, priority: "haute" });

    if (v.outcome === "rdv" && v.date && v.start) {
      const title = `Premier échange — ${c.name}`;
      await tx.insert(schema.meetings).values({ companyId, title, date: v.date, start: v.start, end: addMinutes(v.start, 30), mode: "Visio", note: v.note?.trim() ?? "" });
      await logEvent(tx, companyId, "note", `Rendez-vous planifié : ${title} le ${v.date.split("-").reverse().join("/")} à ${v.start} (Visio)`);
      if (v.date > t) await tx.insert(schema.tasks).values({ title: `Préparer le rendez-vous : ${title}`, companyId, dueDate: addDays(v.date, -1), priority: "moyenne" });
    }
  });
  revalidatePath("/", "layout");

  if (v.outcome === "interesse") {
    const link = await latestReportLink(companyId);
    return { ok: true, message: link ? "Noté · lien de la synthèse copié, envoie-le maintenant" : "Noté · tâche « Envoyer la synthèse » créée", copy: link ?? undefined };
  }
  const msg: Record<(typeof OUTCOMES)[number], string> = {
    pas_de_reponse: plan.nextDue ? "Noté · nouvel essai dans 2 jours ouvrés" : "Noté · 3 essais sans réponse, appel retiré de la file",
    messagerie: plan.nextDue ? "Noté · nouvel essai dans 2 jours ouvrés" : "Noté · 3 essais sans réponse, appel retiré de la file",
    rappeler: "Rappel programmé",
    interesse: "",
    pas_interesse: `${c.name} passé en Perdu · plus de mail ni d'appel`,
    rdv: "Bravo ! Rendez-vous créé, pipeline à jour",
  };
  return { ok: true, message: msg[v.outcome] };
}
