"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { today } from "@/lib/format";
import { buildOfferQuote, OFFER_KEYS } from "@/lib/pack-quote";
import { pilotSlotsLeft } from "@/lib/pricing";
import { pilotsSigned } from "../queries";
import { saveQuoteAction } from "./documents";

type R = { ok: true; id: string } | { ok: false; error: string };

/** Devis prérempli d'une offre, en brouillon : domaine du dernier diagnostic, prix pilote s'il reste des places. */
export async function createOfferQuoteAction(companyId: string, offer: string): Promise<R> {
  await requireUser();
  const p = z.object({ companyId: z.string().min(1).max(64), offer: z.enum(OFFER_KEYS as [string, ...string[]]) }).safeParse({ companyId, offer });
  if (!p.success) return { ok: false, error: "Offre ou entreprise invalide." };
  const d = (
    await db
      .select({ mail: schema.companyDiagnostics.mailDomain })
      .from(schema.companyDiagnostics)
      .where(and(eq(schema.companyDiagnostics.companyId, p.data.companyId), eq(schema.companyDiagnostics.status, "fait")))
      .orderBy(desc(schema.companyDiagnostics.createdAt))
      .limit(1)
  )[0];
  const q = buildOfferQuote(p.data.offer as (typeof OFFER_KEYS)[number], { slotsLeft: pilotSlotsLeft(await pilotsSigned()), today: today(), domain: d?.mail ?? "" });
  const r = await saveQuoteAction(null, false, { companyId: p.data.companyId, ...q, lines: q.lines.map((l) => ({ ...l })) });
  return r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error };
}

/** Raccourci historique : devis Pack Courrier + Suivi. */
export async function createPackQuoteAction(companyId: string): Promise<R> {
  return createOfferQuoteAction(companyId, "pack");
}
