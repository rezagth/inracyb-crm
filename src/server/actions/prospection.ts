"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { stageOf, stageRank } from "@/lib/constants";
import { fd, today } from "@/lib/format";
import { OFFER_KIT, nextBiz, type OfferKey } from "@/lib/prospection";
import { logEvent, type DbOrTx } from "../core";

type R = { ok: true; message: string; nextStep?: number } | { ok: false; error: string };
const offerZ = z.enum(["audit", "ciso", "ia"]);

async function bump(tx: DbOrTx, id: string, target: string) {
  const c = (await tx.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1))[0];
  if (c && c.stage !== "perdu" && stageRank(c.stage) < stageRank(target)) {
    await tx.update(schema.companies).set({ stage: target }).where(eq(schema.companies.id, id));
    await logEvent(tx, id, "stage", `Étape : ${stageOf(c.stage).label} → ${stageOf(target).label}`);
  }
  await tx.update(schema.companies).set({ lastContact: today() }).where(eq(schema.companies.id, id));
}

const LABELS = { rdv: "RDV obtenu", rappel: "À rappeler", mail: "Mail demandé", messagerie: "Messagerie", non: "Pas intéressé" } as const;
const RESULT = { rdv: "RDV obtenu", rappel: "Joint", mail: "Joint", messagerie: "Messagerie", non: "Joint" } as const;

/** Fin d'un appel guidé : journal, historique, étape du pipeline et relance planifiée. */
export async function endCallAction(companyId: string, offer: string, outcome: string, notes: string): Promise<R> {
  await requireUser();
  const o = z.enum(["rdv", "rappel", "mail", "messagerie", "non"]).safeParse(outcome);
  const of = offerZ.safeParse(offer);
  const n = z.string().max(2000).safeParse(notes ?? "");
  if (!o.success || !of.success || !n.success) return { ok: false, error: "Résultat d'appel invalide." };
  const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
  if (!c) return { ok: false, error: "Entreprise introuvable." };
  const O = OFFER_KIT[of.data as OfferKey];
  const label = LABELS[o.data];
  const note = (n.data.trim() ? n.data.trim() + " — " : "") + `${label} (${O.l})`;
  const due = nextBiz(2)[1];
  await db.transaction(async (tx) => {
            await tx.insert(schema.calls).values({ companyId, date: today(), result: RESULT[o.data], durationMin: o.data === "messagerie" ? 1 : 0, offer: of.data, note });
            await logEvent(tx, companyId, "call", `Appel guidé — ${label} · ${O.l}${n.data.trim() ? " · " + n.data.trim() : ""}`);
            if (o.data === "non") {
              await tx.update(schema.companies).set({ stage: "perdu", lastContact: today() }).where(eq(schema.companies.id, companyId));
              await logEvent(tx, companyId, "stage", `Étape : ${stageOf(c.stage).label} → Perdu`);
            } else await bump(tx, companyId, o.data === "rdv" ? "rdv" : "contacte");
            if (o.data === "rappel" || o.data === "messagerie")
              await tx.insert(schema.tasks).values({ title: `${o.data === "rappel" ? "Rappeler " : "Retenter l'appel — "}${c.name}`, companyId, dueDate: due, priority: "moyenne" });
          });
  revalidatePath("/", "layout");
  const message =
    o.data === "rdv"
      ? "Bravo ! Fixe maintenant la date du rendez-vous"
      : o.data === "mail"
        ? "Appel enregistré · envoie le mail J0 maintenant"
        : o.data === "non"
          ? `Appel enregistré · ${c.name} passé en Perdu`
          : `Appel enregistré · relance planifiée le ${fd(due)}`;
  return { ok: true, message };
}

const STEPS = [
  { k: "J0", d: 0 },
  { k: "J+3", d: 3 },
  { k: "J+7", d: 7 },
  { k: "J+14", d: 14 },
];

/** Marque un mail de séquence comme envoyé et planifie la relance suivante. */
export async function markMailSentAction(companyId: string, offer: string, step: number, subject: string): Promise<R> {
  await requireUser();
  const of = offerZ.safeParse(offer);
  const st = z.number().int().min(0).max(3).safeParse(step);
  const sj = z.string().max(300).safeParse(subject ?? "");
  if (!of.success || !st.success || !sj.success) return { ok: false, error: "Mail invalide." };
  const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
  if (!c) return { ok: false, error: "Entreprise introuvable." };
  const O = OFFER_KIT[of.data as OfferKey];
  const cur = STEPS[st.data],
    next = STEPS[st.data + 1];
  const due = next ? new Date(Date.parse(today() + "T12:00:00Z") + (next.d - cur.d) * 86_400_000).toISOString().slice(0, 10) : null;
  await db.transaction(async (tx) => {
            await tx.insert(schema.mailSends).values({ companyId, offer: of.data, step: st.data, subject: sj.data, sentOn: today() });
            await logEvent(tx, companyId, "mail", `Mail ${cur.k} envoyé (${O.l}) : « ${sj.data} »`);
            if (next && due) await tx.insert(schema.tasks).values({ title: `Envoyer la relance ${next.k} à ${c.name} (${O.l})`, companyId, dueDate: due, priority: "moyenne" });
            await bump(tx, companyId, "contacte");
          });
  revalidatePath("/", "layout");
  return { ok: true, message: `Mail ${cur.k} marqué comme envoyé${next ? ` · relance ${next.k} prévue le ${fd(due)}` : " · séquence terminée"}`, nextStep: next ? st.data + 1 : st.data };
}
