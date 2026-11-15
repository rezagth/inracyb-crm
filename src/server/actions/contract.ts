"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { logEvent } from "../core";
import { getQuote } from "../queries";
import { postToStratcyber } from "../stratcyber-sync";

type R = { ok: true; message: string } | { ok: false; error: string };

/**
 * Note dans le CRM que le contrat a été envoyé, et en laisse une trace dans StratCyber (référence et montant seulement).
 * Si StratCyber n'est pas configuré ou injoignable, la trace CRM est quand même enregistrée.
 */
export async function markContractSentAction(quoteId: string, reference: string): Promise<R> {
  await requireUser();
  const ref = String(reference).slice(0, 60);
  const q = await getQuote(quoteId);
  if (!q) return { ok: false, error: "Devis introuvable." };
  await logEvent(db, q.companyId, "note", `Contrat ${ref} envoyé au client.`);

  const traced = await postToStratcyber({
    event: "contract.sent",
    crmId: q.companyId,
    name: q.company.name,
    sector: q.company.sector,
    reference: ref,
    amountHtCents: q.totals.ht,
  });
  revalidatePath(`/devis/${quoteId}`);
  return {
    ok: true,
    message: traced ? "Envoi noté dans le CRM et dans StratCyber." : "Envoi noté dans le CRM (StratCyber non configuré ou injoignable : trace non transmise).",
  };
}
