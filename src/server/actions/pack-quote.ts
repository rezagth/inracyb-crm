"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { today } from "@/lib/format";
import { buildPackQuote } from "@/lib/pack-quote";
import { pilotSlotsLeft } from "@/lib/pricing";
import { pilotsSigned } from "../queries";
import { saveQuoteAction } from "./documents";

type R = { ok: true; id: string } | { ok: false; error: string };

/** Devis « Pack + Suivi » en brouillon pour une entreprise : domaine du dernier diagnostic, prix pilote s'il reste des places. */
export async function createPackQuoteAction(companyId: string): Promise<R> {
  await requireUser();
  const id = z.string().min(1).max(64).safeParse(companyId);
  if (!id.success) return { ok: false, error: "Entreprise invalide." };
  const d = (
    await db
      .select({ mail: schema.companyDiagnostics.mailDomain })
      .from(schema.companyDiagnostics)
      .where(and(eq(schema.companyDiagnostics.companyId, id.data), eq(schema.companyDiagnostics.status, "fait")))
      .orderBy(desc(schema.companyDiagnostics.createdAt))
      .limit(1)
  )[0];
  const q = buildPackQuote({ slotsLeft: pilotSlotsLeft(await pilotsSigned()), today: today(), domain: d?.mail ?? "" });
  const r = await saveQuoteAction(null, false, { companyId: id.data, ...q, lines: q.lines.map((l) => ({ ...l })) });
  return r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error };
}
