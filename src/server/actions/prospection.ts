"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { stageOf, stageRank } from "@/lib/constants";
import { fd, today } from "@/lib/format";
import { OFFER_KIT, nextBiz, type OfferKey } from "@/lib/prospection";
import { EMAIL_RE } from "@/lib/brevo";
import { brevoConfig, sendBrevoMail } from "../brevo";
import { logEvent, type DbOrTx } from "../core";
import { optoutSet } from "../campaigns";

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

/** Enregistre un mail de séquence (journal, historique, relance suivante, étape du pipeline). Partagé par « marquer envoyé » et « envoyer via Brevo ». */
async function recordMailSent(companyId: string, offer: OfferKey, step: number, subject: string, via = ""): Promise<R> {
  const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
  if (!c) return { ok: false, error: "Entreprise introuvable." };
  const O = OFFER_KIT[offer];
  const cur = STEPS[step],
    next = STEPS[step + 1];
  const due = next ? new Date(Date.parse(today() + "T12:00:00Z") + (next.d - cur.d) * 86_400_000).toISOString().slice(0, 10) : null;
  await db.transaction(async (tx) => {
    await tx.insert(schema.mailSends).values({ companyId, offer, step, subject, sentOn: today() });
    await logEvent(tx, companyId, "mail", `Mail ${cur.k} envoyé${via} (${O.l}) : « ${subject} »`);
    if (next && due) await tx.insert(schema.tasks).values({ title: `Envoyer la relance ${next.k} à ${c.name} (${O.l})`, companyId, dueDate: due, priority: "moyenne" });
    await bump(tx, companyId, "contacte");
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `Mail ${cur.k} ${via ? "envoyé" : "marqué comme envoyé"}${next ? ` · relance ${next.k} prévue le ${fd(due)}` : " · séquence terminée"}`, nextStep: next ? step + 1 : step };
}

/** Marque un mail de séquence comme envoyé (envoi fait à la main) et planifie la relance suivante. */
export async function markMailSentAction(companyId: string, offer: string, step: number, subject: string): Promise<R> {
  await requireUser();
  const of = offerZ.safeParse(offer);
  const st = z.number().int().min(0).max(3).safeParse(step);
  const sj = z.string().max(300).safeParse(subject ?? "");
  if (!of.success || !st.success || !sj.success) return { ok: false, error: "Mail invalide." };
  return recordMailSent(companyId, of.data as OfferKey, st.data, sj.data);
}

/**
 * Envoie un mail de la séquence via Brevo depuis l'adresse de l'entreprise, puis l'enregistre comme les envois manuels.
 * Le destinataire est lu en base (contact principal), jamais fourni par le navigateur.
 */
export async function sendSequenceMailAction(companyId: string, offer: string, step: number, subject: string, body: string): Promise<R> {
  await requireUser();
  const of = offerZ.safeParse(offer);
  const st = z.number().int().min(0).max(3).safeParse(step);
  const sj = z.string().trim().min(1).max(300).safeParse(subject ?? "");
  const bd = z.string().trim().min(1).max(10_000).safeParse(body ?? "");
  if (!of.success || !st.success || !sj.success || !bd.success) return { ok: false, error: "Mail invalide." };

  const cfg = brevoConfig();
  if (!cfg.apiKey) return { ok: false, error: "Brevo n'est pas configuré : ajoute BREVO_API_KEY dans .env (et dans Vercel)." };

  const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
  if (!c) return { ok: false, error: "Entreprise introuvable." };
  const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, companyId)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];
  const email = ct?.email.trim() ?? "";
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Ajoute d'abord une adresse e-mail valide au contact principal de cette entreprise." };

  if ((await optoutSet()).has(email.toLowerCase())) return { ok: false, error: `${c.name} s'est désinscrite : aucun mail ne doit lui être envoyé.` };
  // Garde-fous : jamais deux fois la même étape, et un plafond par jour pour protéger la réputation du domaine.
  const already = (await db.select({ id: schema.mailSends.id }).from(schema.mailSends).where(and(eq(schema.mailSends.companyId, companyId), eq(schema.mailSends.offer, of.data), eq(schema.mailSends.step, st.data))).limit(1))[0];
  if (already) return { ok: false, error: `Le mail ${STEPS[st.data].k} a déjà été envoyé à ${c.name}. Rien n'a été renvoyé.` };
  const todayCount = Number((await db.select({ n: sql<number>`count(*)` }).from(schema.mailSends).where(eq(schema.mailSends.sentOn, today())))[0]?.n ?? 0);
  if (todayCount >= cfg.dailyLimit) return { ok: false, error: `Limite du jour atteinte (${cfg.dailyLimit} mails). Augmente MAIL_DAILY_LIMIT quand ton domaine est réchauffé.` };

  const name = [ct?.firstName, ct?.lastName].filter(Boolean).join(" ");
  const sent = await sendBrevoMail({ to: { email, name: name || undefined }, subject: sj.data, text: bd.data, tags: ["crm", "prospection", of.data, STEPS[st.data].k] });
  if (!sent.ok) return { ok: false, error: sent.error };

  try {
    return await recordMailSent(companyId, of.data as OfferKey, st.data, sj.data, " via Brevo");
  } catch {
    return { ok: false, error: `Le mail est bien parti vers ${email}, mais son enregistrement a échoué : utilise « Marquer comme envoyé » pour le noter (ne le renvoie pas).` };
  }
}
