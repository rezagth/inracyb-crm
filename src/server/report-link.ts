import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseChecks } from "@/lib/diagnostic";
import { mailAuthFinding, type ReportCta } from "@/lib/diagnostic-report";
import { packOfferText, pilotSlotsLeft } from "@/lib/pricing";
import { reportLinkFor } from "./campaigns";
import { getProfile, pilotsSigned } from "./queries";

/** Lien du dernier diagnostic réussi d'une entreprise, ou null. */
export async function latestReportLink(companyId: string): Promise<string | null> {
  const d = (await db.select({ id: schema.companyDiagnostics.id }).from(schema.companyDiagnostics).where(and(eq(schema.companyDiagnostics.companyId, companyId), eq(schema.companyDiagnostics.status, "fait"))).orderBy(desc(schema.companyDiagnostics.createdAt)).limit(1))[0];
  return d ? reportLinkFor(d.id) : null;
}

/** Encadré d'action du rapport public : offre Pack seulement pour un constat de messagerie. */
export async function reportCta(findingsJson: string): Promise<ReportCta> {
  const p = await getProfile();
  const offer = mailAuthFinding(parseChecks(findingsJson)) ? packOfferText(pilotSlotsLeft(await pilotsSigned())) : "";
  return { offer, calUrl: p.calUrl, contact: [p.phone, p.email].map((x) => x.trim()).filter(Boolean).join(" · ") };
}
