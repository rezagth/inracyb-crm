import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { isDraftNumber } from "@/lib/billing";
import { documentPdfFilename, renderDocumentPdf, type DocInput } from "@/lib/document-pdf";
import { getSettings } from "@/server/core";
import { getInvoice, getQuote } from "@/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PDF d'un devis (/api/exports/pdf/devis/<id>) ou d'une facture ou d'un avoir (/api/exports/pdf/facture/<id>).
 * Réservé à l'utilisateur connecté. Un brouillon n'a pas de PDF : son numéro est provisoire, sans valeur légale.
 * ?telecharger=1 : enregistre le fichier au lieu de l'ouvrir.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const { kind, id } = await ctx.params;
  const settings = await getSettings();

  let input: DocInput | null = null;
  if (kind === "devis") {
    const q = await getQuote(id);
    if (q) input = { kind: "devis", number: q.number, issueDate: q.issueDate, dueDate: q.validUntil, subject: q.subject, note: q.note, discountBp: q.discountBp, lines: q.lines, totals: q.totals, company: q.company, settings, signedBy: q.signedBy, signedAt: q.signedAt };
  } else if (kind === "facture") {
    const iv = await getInvoice(id);
    if (iv) {
      const creditFor = iv.creditForId ? (await db.select({ number: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.id, iv.creditForId)).limit(1))[0]?.number : null;
      input = {
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
      };
    }
  } else {
    return new Response("Type de document inconnu", { status: 404 });
  }
  if (!input) return new Response("Document introuvable", { status: 404 });
  if (isDraftNumber(input.number)) return new Response("Un brouillon n'a pas de PDF : émets d'abord le document pour lui donner son numéro définitif.", { status: 409 });

  const pdf = await renderDocumentPdf(input);
  const file = documentPdfFilename(input.kind, input.number);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": `${req.nextUrl.searchParams.get("telecharger") ? "attachment" : "inline"}; filename="${file}"`,
    },
  });
}
