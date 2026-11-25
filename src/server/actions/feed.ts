"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { parseDepartements } from "@/lib/feed";
import { EFFECTIF_CODES } from "@/lib/prospect-search";
import { logEvent } from "../core";
import { getFeedSettings, runFeed } from "../feed";

type R = { ok: true; message: string } | { ok: false; error: string };

/** Interrupteur général de l'alimentation automatique. */
export async function setFeedEnabledAction(enabled: boolean): Promise<R> {
  await requireUser();
  await getFeedSettings();
  await db.update(schema.feedSettings).set({ enabled: enabled === true }).where(eq(schema.feedSettings.id, 1));
  await logEvent(db, null, "note", enabled === true ? "Alimentation automatique mise en marche." : "Alimentation automatique arrêtée.");
  revalidatePath("/alimentation");
  return { ok: true, message: enabled === true ? "Alimentation en marche : prochain passage au prochain jour ouvré." : "Alimentation arrêtée : plus aucune recherche, aucun import, aucune inscription." };
}

const settingsZ = z.object({
  feedDiagnostic: z.boolean(),
  feedAudit: z.boolean(),
  feedPrescripteur: z.boolean().optional(),
  departements: z.string().max(200),
  effectifs: z.array(z.string()).max(8).refine((a) => a.every((c) => EFFECTIF_CODES.includes(c)), "Taille invalide."),
  importPerSegment: z.number().int().min(0).max(200),
  placesDaily: z.number().int().min(0).max(500),
});

export async function saveFeedSettingsAction(input: unknown): Promise<R> {
  await requireUser();
  const p = settingsZ.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Réglages invalides." };
  const typed = p.data.departements.split(/[\s,;]+/).filter(Boolean);
  const depts = parseDepartements(p.data.departements);
  if (depts.length !== new Set(typed.map((d) => d.toUpperCase())).size) return { ok: false, error: "Départements : 2 ou 3 chiffres séparés par des virgules (ex. 75, 92, 69), ou 2A / 2B." };
  if (!p.data.effectifs.length) return { ok: false, error: "Choisis au moins une taille d'entreprise." };
  await getFeedSettings();
  await db.update(schema.feedSettings).set({ feedDiagnostic: p.data.feedDiagnostic, feedAudit: p.data.feedAudit, feedPrescripteur: p.data.feedPrescripteur === true, departements: depts.join(","), effectifs: p.data.effectifs.join(","), importPerSegment: p.data.importPerSegment, placesDaily: p.data.placesDaily, cursors: "{}" }).where(eq(schema.feedSettings.id, 1));
  revalidatePath("/alimentation");
  return { ok: true, message: "Réglages enregistrés. La recherche repart du début avec ces critères." };
}

/** Lance un passage tout de suite (même traitement que le passage automatique). */
export async function runFeedNowAction(): Promise<R> {
  await requireUser();
  const r = await runFeed({ source: "manuel", budgetMs: 45_000 });
  revalidatePath("/alimentation");
  revalidatePath("/campagnes");
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
}
