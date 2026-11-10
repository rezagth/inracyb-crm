"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { exclusionOf, EXCLUSION_LABEL, type Exclusion } from "@/lib/campaign";
import { today } from "@/lib/format";
import { prospectList } from "../queries";
import { logEvent } from "../core";
import { optoutSet, recordOptout, runCampaigns } from "../campaigns";

type R = { ok: true; message: string } | { ok: false; error: string };
const offerZ = z.enum(["audit", "ciso", "ia"]);
const MAX_PER_CAMPAIGN = 500;

/** Crée la campagne avec les entreprises cochées (re-filtrées côté serveur : jamais de Perdu, désinscrit, sans e-mail ou déjà en campagne), puis envoie le premier lot du jour. */
export async function createCampaignAction(name: string, offer: string, companyIds: string[]): Promise<R> {
  await requireUser();
  const n = z.string().trim().min(1).max(120).safeParse(name ?? "");
  const o = offerZ.safeParse(offer);
  const ids = z.array(z.string().min(1).max(64)).min(1).max(MAX_PER_CAMPAIGN).safeParse(companyIds);
  if (!n.success) return { ok: false, error: "Donne un nom à la campagne." };
  if (!o.success) return { ok: false, error: "Offre invalide." };
  if (!ids.success) return { ok: false, error: `Sélectionne entre 1 et ${MAX_PER_CAMPAIGN} entreprises.` };

  const wanted = new Set(ids.data);
  const optouts = await optoutSet();
  const active = await db
    .select({ companyId: schema.mailCampaignItems.companyId })
    .from(schema.mailCampaignItems)
    .innerJoin(schema.mailCampaigns, eq(schema.mailCampaigns.id, schema.mailCampaignItems.campaignId))
    .where(and(eq(schema.mailCampaignItems.status, "en_cours"), inArray(schema.mailCampaigns.status, ["active", "pause"])));
  const inCampaign = new Set(active.map((a) => a.companyId));

  const eligible: string[] = [];
  const excluded: Partial<Record<Exclusion, number>> = {};
  for (const p of (await prospectList()).filter((p) => wanted.has(p.id))) {
    const ex = exclusionOf({ id: p.id, name: p.name, stage: p.stage, email: p.email }, optouts, inCampaign);
    if (ex) excluded[ex] = (excluded[ex] ?? 0) + 1;
    else eligible.push(p.id);
  }
  if (!eligible.length) return { ok: false, error: "Aucune des entreprises choisies n'est éligible (e-mail manquant, perdue, désinscrite ou déjà en campagne)." };

  const t = today();
  const camp = (await db.insert(schema.mailCampaigns).values({ name: n.data, offer: o.data }).returning({ id: schema.mailCampaigns.id }))[0];
  await db.insert(schema.mailCampaignItems).values(eligible.map((companyId) => ({ campaignId: camp.id, companyId, nextStep: 0, nextDue: t })));
  await logEvent(db, null, "mail", `Campagne « ${n.data} » créée : ${eligible.length} entreprise(s)`);
  const run = await runCampaigns({ campaignId: camp.id });
  revalidatePath("/campagnes");
  revalidatePath("/", "layout");
  const ex = Object.entries(excluded).map(([k, v]) => `${v} ${EXCLUSION_LABEL[k as Exclusion]}`).join(", ");
  return { ok: true, message: `Campagne créée (${eligible.length} entreprise(s)${ex ? `, ${ex} exclue(s)` : ""}). ${run.message}` };
}

/** Envoie maintenant les mails arrivés à échéance (même traitement que le déclenchement automatique quotidien). */
export async function runCampaignsNowAction(): Promise<R> {
  await requireUser();
  const r = await runCampaigns();
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
  await db.update(schema.mailCampaignItems).set({ status: "arrete", stopReason: k.data === "reponse" ? "A répondu" : "Désinscrit" }).where(eq(schema.mailCampaignItems.id, itemId));
  revalidatePath("/campagnes");
  return { ok: true, message: k.data === "reponse" ? "Relances arrêtées." : "Désinscrit : plus aucun mail de campagne." };
}
