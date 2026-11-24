import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isDraftNumber, type Totals } from "@/lib/billing";
import type { DocInput } from "@/lib/document-pdf";
import { getSettings } from "./core";
import { getInvoice, getQuote } from "./queries";

export type LoadedDoc = {
  input: DocInput;
  companyId: string;
  /** Statut en base : brouillon | envoye | accepte | refuse (devis) ; brouillon | envoyee | payee | annulee (facture, avoir). */
  status: string;
  totals: Totals;
  contacts: { firstName: string; lastName: string; email: string }[];
  /** Facture annulée par cet avoir (numéro), le cas échéant. */
  creditFor: string | null;
};

/** Données d'un devis, d'une facture ou d'un avoir, prêtes pour le PDF et pour l'envoi. Partagé par la route PDF et l'envoi par e-mail. */
export async function loadDocument(kind: "devis" | "facture", id: string): Promise<LoadedDoc | null> {
  const settings = await getSettings();
  if (kind === "devis") {
    const q = await getQuote(id);
    if (!q) return null;
    return {
      input: { kind: "devis", number: q.number, issueDate: q.issueDate, dueDate: q.validUntil, subject: q.subject, note: q.note, discountBp: q.discountBp, lines: q.lines, totals: q.totals, company: q.company, settings, signedBy: q.signedBy, signedAt: q.signedAt },
      companyId: q.companyId,
      status: q.status,
      totals: q.totals,
      contacts: q.company.contacts,
      creditFor: null,
    };
  }
  const iv = await getInvoice(id);
  if (!iv) return null;
  const creditFor = iv.creditForId ? ((await db.select({ number: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.id, iv.creditForId)).limit(1))[0]?.number ?? null) : null;
  return {
    input: {
      kind: iv.kind === "avoir" ? "avoir" : "facture",
      number: iv.number,
      issueDate: iv.issueDate,
      dueDate: iv.dueDate,
      subject: iv.subject,
      note: iv.note,
      discountBp: iv.discountBp,
      lines: iv.lines,
      totals: iv.totals,
      company: iv.company,
      settings,
      creditFor,
      quoteNumber: iv.quote && !isDraftNumber(iv.quote.number) ? iv.quote.number : null,
    },
    companyId: iv.companyId,
    status: iv.status,
    totals: iv.totals,
    contacts: iv.company.contacts,
    creditFor,
  };
}
