import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isDraftNumber } from "@/lib/billing";
import { documentPdfFilename, renderDocumentPdf } from "@/lib/document-pdf";
import { loadDocument } from "@/server/document-pdf";

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
  if (kind !== "devis" && kind !== "facture") return new Response("Type de document inconnu", { status: 404 });
  const doc = await loadDocument(kind, id);
  if (!doc) return new Response("Document introuvable", { status: 404 });
  if (isDraftNumber(doc.input.number)) return new Response("Un brouillon n'a pas de PDF : émets d'abord le document pour lui donner son numéro définitif.", { status: 409 });

  const pdf = await renderDocumentPdf(doc.input);
  const file = documentPdfFilename(doc.input.kind, doc.input.number);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": `${req.nextUrl.searchParams.get("telecharger") ? "attachment" : "inline"}; filename="${file}"`,
    },
  });
}
