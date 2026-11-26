import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseChecks } from "@/lib/diagnostic";
import { mailAuthFinding, type ReportCta } from "@/lib/diagnostic-report";
import { packOfferText, pilotSlotsLeft, suiviOfferText } from "@/lib/pricing";
import { offerPitch, offersForCompany } from "@/lib/pack-quote";
import { reportLinkFor } from "./campaigns";
import { getProfile, pilotsSigned } from "./queries";

/** Lien du dernier diagnostic réussi d'une entreprise, ou null. */
export async function latestReportLink(companyId: string): Promise<string | null> {
  const d = (await db.select({ id: schema.companyDiagnostics.id }).from(schema.companyDiagnostics).where(and(eq(schema.companyDiagnostics.companyId, companyId), eq(schema.companyDiagnostics.status, "fait"))).orderBy(desc(schema.companyDiagnostics.createdAt)).limit(1))[0];
  return d ? reportLinkFor(d.id) : null;
}

/** Encadré d'action du rapport public : offre Pack puis suivi mensuel, seulement pour un constat de messagerie. */
export async function reportCta(findingsJson: string, sector = ""): Promise<ReportCta> {
  const p = await getProfile();
  const slots = pilotSlotsLeft(await pilotsSigned());
  // Phase O : l'offre la plus pertinente pour le secteur et la messagerie, puis le Pack si un constat de courrier le justifie.
  const top = offersForCompany(sector, findingsJson).find((k) => k !== "pack");
  const pack = mailAuthFinding(parseChecks(findingsJson)) ? `${packOfferText(slots)} ${suiviOfferText(slots)}` : "";
  const offer = [top ? offerPitch(top, slots) : "", pack].filter(Boolean).join(" ");
  return { offer, calUrl: p.calUrl, contact: [p.phone, p.email].map((x) => x.trim()).filter(Boolean).join(" · ") };
}
