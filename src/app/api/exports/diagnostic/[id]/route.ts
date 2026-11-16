import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { parseChecks } from "@/lib/diagnostic";
import { renderReport } from "@/lib/diagnostic-report";
import { getProfile } from "@/server/queries";

export const dynamic = "force-dynamic";

/** Rapport de diagnostic d'une page (HTML imprimable). Réservé à l'utilisateur connecté ; ajouter ?telecharger=1 pour l'enregistrer en fichier. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const { id } = await ctx.params;
  const d = (await db.select().from(schema.companyDiagnostics).where(eq(schema.companyDiagnostics.id, id)).limit(1))[0];
  if (!d || d.status !== "fait") return new Response("Diagnostic introuvable", { status: 404 });
  const c = (await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, d.companyId)).limit(1))[0];
  const p = await getProfile();
  const html = renderReport({ company: c?.name ?? "", mailDomain: d.mailDomain, webHost: d.webHost, checkedOn: d.checkedOn, rulesVersion: d.rulesVersion, checks: parseChecks(d.findings), author: p.me, authorCompany: p.company, authorContact: [p.email, p.phone].filter(Boolean).join(" · ") });
  const file = `diagnostic-${(d.mailDomain || d.webHost || "domaine").replace(/[^a-z0-9.-]/gi, "")}-${d.checkedOn}.html`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
      ...(req.nextUrl.searchParams.get("telecharger") ? { "content-disposition": `attachment; filename="${file}"` } : {}),
    },
  });
}
