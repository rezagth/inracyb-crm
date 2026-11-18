"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { CAMPAIGN_OFFERS, entryExclusion, ENTRY_EXCLUSION_LABEL, serviceOf, type EntryExclusion } from "@/lib/campaign";
import { usableDiagnostic } from "@/lib/diagnostic";
import { isSegment, segmentOfSector } from "@/lib/diagnostic-mails";
import { today } from "@/lib/format";
import { prospectList } from "../queries";
import { logEvent } from "../core";
import { latestDiagnostics, queueDiagnostics, runDiagnostics } from "../diagnostic";
import { crossHistories, optoutSet, recordOptout, recordRun, restDays, resumeService, runCampaigns } from "../campaigns";
import { registerReply } from "../replies";

type R = { ok: true; message: string } | { ok: false; error: string };
const offerZ = z.enum(CAMPAIGN_OFFERS as [string, ...string[]]);
const MAX_PER_CAMPAIGN = 500;

/** Crée la campagne avec les entreprises cochées (re-filtrées côté serveur : jamais de Perdu, désinscrit, sans e-mail ou déjà en campagne), puis envoie le premier lot du jour. */
export async function createCampaignAction(name: string, offer: string, companyIds: string[], segment = ""): Promise<R> {
  await requireUser();
  const n = z.string().trim().min(1).max(120).safeParse(name ?? "");
  const o = offerZ.safeParse(offer);
  const ids = z.array(z.string().min(1).max(64)).min(1).max(MAX_PER_CAMPAIGN).safeParse(companyIds);
  if (!n.success) return { ok: false, error: "Donne un nom à la campagne." };
  if (!o.success) return { ok: false, error: "Offre invalide." };
  if (o.data === "diagnostic" && !isSegment(segment)) return { ok: false, error: "Choisis le segment de la campagne Diagnostic : il détermine le texte des mails." };
  if (!ids.success) return { ok: false, error: `Sélectionne entre 1 et ${MAX_PER_CAMPAIGN} entreprises.` };

  const wanted = new Set(ids.data);
  const optouts = await optoutSet();
  const active = await db
    .select({ companyId: schema.mailCampaignItems.companyId })
    .from(schema.mailCampaignItems)
    .innerJoin(schema.mailCampaigns, eq(schema.mailCampaigns.id, schema.mailCampaignItems.campaignId))
    .where(and(eq(schema.mailCampaignItems.status, "en_cours"), inArray(schema.mailCampaigns.status, ["active", "pause"])));
  const inCampaign = new Set(active.map((a) => a.companyId));

  const target = serviceOf(o.data);
  const history = await crossHistories(target);
  const t = today();
  const rest = restDays();
  const diagnostics = target === "diagnostic" ? await latestDiagnostics() : new Map();
  const eligible: string[] = [];
  const excluded: Partial<Record<EntryExclusion, number>> = {};
  for (const p of (await prospectList()).filter((p) => wanted.has(p.id))) {
    // Diagnostic : le secteur doit correspondre au segment (le texte en dépend), et il faut un constat d'accroche mesuré récemment.
    const ex = entryExclusion({ id: p.id, name: p.name, stage: p.stage, email: p.email, emailSource: p.emailSource }, optouts, inCampaign, target, history.get(p.id), t, rest) ?? (target !== "diagnostic" ? null : segmentOfSector(p.sector) !== segment ? "hors-segment" : !usableDiagnostic(diagnostics.get(p.id), t) ? "sans-constat" : null);
    if (ex) excluded[ex] = (excluded[ex] ?? 0) + 1;
    else eligible.push(p.id);
  }
  if (!eligible.length) return { ok: false, error: "Aucune des entreprises choisies n'est éligible (e-mail manquant, perdue, désinscrite, déjà en campagne, en délai de repos ou adresse d'origine inconnue)." };

  // Campagne et entrées dans la même transaction : si une entreprise vient d'entrer dans une autre séquence (index unique), rien n'est créé.
  let camp: { id: string };
  try {
    camp = await db.transaction(async (tx) => {
      const c = (await tx.insert(schema.mailCampaigns).values({ name: n.data, offer: o.data, segment: o.data === "diagnostic" ? segment : "" }).returning({ id: schema.mailCampaigns.id }))[0];
      await tx.insert(schema.mailCampaignItems).values(eligible.map((companyId) => ({ campaignId: c.id, companyId, nextStep: 0, nextDue: t })));
      return c;
    });
  } catch {
    return { ok: false, error: "Une des entreprises vient d'entrer dans une autre campagne : recharge la page et relance." };
  }
  await logEvent(db, null, "mail", `Campagne « ${n.data} » créée : ${eligible.length} entreprise(s)`);
  const run = await runCampaigns({ campaignId: camp.id });
  revalidatePath("/campagnes");
  revalidatePath("/", "layout");
  const ex = Object.entries(excluded).map(([k, v]) => `${v} ${ENTRY_EXCLUSION_LABEL[k as EntryExclusion]}`).join(", ");
  return { ok: true, message: `Campagne créée (${eligible.length} entreprise(s)${ex ? `, ${ex} exclue(s)` : ""}). ${run.message}` };
}

/** Envoie maintenant les mails arrivés à échéance (même traitement que le déclenchement automatique quotidien). */
export async function runCampaignsNowAction(): Promise<R> {
  await requireUser();
  const r = await runCampaigns();
  await recordRun("manuel", r);
  revalidatePath("/campagnes");
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
}

export async function setCampaignStatusAction(campaignId: string, status: string): Promise<R> {
  await requireUser();
  const s = z.enum(["active", "pause", "terminee"]).safeParse(status);
  if (!s.success) return { ok: false, error: "Statut invalide." };
  await db.update(schema.mailCampaigns).set({ status: s.data }).where(eq(schema.mailCampaigns.id, campaignId));
  if (s.data === "terminee") await db.update(schema.mailCampaignItems).set({ status: "arrete", stopReason: "Campagne terminée" }).where(and(eq(schema.mailCampaignItems.campaignId, campaignId), eq(schema.mailCampaignItems.status, "en_cours")));
  revalidatePath("/campagnes");
  return { ok: true, message: s.data === "pause" ? "Campagne en pause : plus aucun envoi." : s.data === "active" ? "Campagne reprise." : "Campagne terminée : les relances restantes sont annulées." };
}

/** Arrête les relances d'une entreprise : elle a répondu, ou demande à ne plus être contactée (alors désinscrite pour toute campagne). */
export async function stopItemAction(itemId: string, kind: string): Promise<R> {
  await requireUser();
  const k = z.enum(["reponse", "desinscrit"]).safeParse(kind);
  if (!k.success) return { ok: false, error: "Action invalide." };
  const item = (await db.select().from(schema.mailCampaignItems).where(eq(schema.mailCampaignItems.id, itemId)).limit(1))[0];
  if (!item) return { ok: false, error: "Entrée introuvable." };
  if (k.data === "desinscrit") {
    const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, item.companyId))).find((c) => c.email.trim());
    if (ct) await recordOptout(ct.email, "demande manuelle");
  }
  if (k.data === "desinscrit") {
    await db.update(schema.mailCampaignItems).set({ status: "arrete", stopReason: "Désinscrit" }).where(eq(schema.mailCampaignItems.id, itemId));
    revalidatePath("/campagnes");
    return { ok: true, message: "Désinscrit : plus aucun mail de campagne." };
  }
  return replyReceived(item.companyId);
}

/** Réponse reçue : arrête toute séquence en cours de l'entreprise, le note au journal, crée une tâche prioritaire et un brouillon de réponse (logique partagée avec la lecture automatique des réponses). */
async function replyReceived(companyId: string): Promise<R> {
  const r = await registerReply(companyId, "reponse");
  if (!r.ok) return { ok: false, error: "Entreprise introuvable." };
  return { ok: true, message: `Relances arrêtées. Tâche créée : répondre à ${r.name}. Un brouillon de réponse est dans le journal de la fiche.` };
}

/** Bouton « Réponse reçue » de la fiche entreprise : même effet que sur la page Campagnes, sans chercher la ligne. */
export async function replyReceivedAction(companyId: string): Promise<R> {
  await requireUser();
  const id = z.string().min(1).max(64).safeParse(companyId);
  if (!id.success) return { ok: false, error: "Entreprise invalide." };
  const active = (await db.select({ id: schema.mailCampaignItems.id }).from(schema.mailCampaignItems).where(and(eq(schema.mailCampaignItems.companyId, id.data), eq(schema.mailCampaignItems.status, "en_cours"))).limit(1))[0];
  if (!active) return { ok: false, error: "Cette entreprise n'a aucune séquence en cours." };
  return replyReceived(id.data);
}

/** Reprend un service mis en pause automatiquement (rebonds, plainte). À faire après avoir corrigé la cause. */
export async function resumeServiceAction(service: string): Promise<R> {
  await requireUser();
  const s = z.enum(["audit", "diagnostic"]).safeParse(service);
  if (!s.success) return { ok: false, error: "Service invalide." };
  await resumeService(s.data);
  revalidatePath("/campagnes");
  return { ok: true, message: "Service repris : les envois repartent au prochain déclenchement." };
}

/** Met des entreprises en file d'attente de diagnostic et traite tout de suite ce qui tient dans le temps imparti ; le reste part au prochain passage automatique. */
export async function queueDiagnosticsAction(companyIds: string[]): Promise<R> {
  await requireUser();
  const ids = z.array(z.string().min(1).max(64)).min(1).max(200).safeParse(companyIds);
  if (!ids.success) return { ok: false, error: "Sélectionne entre 1 et 200 entreprises." };
  const added = await queueDiagnostics(ids.data);
  const r = await runDiagnostics({ budgetMs: 40_000 });
  revalidatePath("/campagnes");
  return { ok: true, message: `${added} entreprise(s) ajoutée(s) à la file. ${r.message}` };
}
