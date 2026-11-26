import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { planAuditSwitch } from "@/lib/campaign";
import { reservedSectors } from "./campaigns";

/** Séquences Audit en cours à arrêter pour libérer le Diagnostic (voir planAuditSwitch). */
export async function auditSwitchPlan() {
  const rows = await db
    .select({ itemId: schema.mailCampaignItems.id, companyId: schema.mailCampaignItems.companyId, offer: schema.mailCampaigns.offer, sector: schema.companies.sector, feedStage: schema.feedItems.stage })
    .from(schema.mailCampaignItems)
    .innerJoin(schema.mailCampaigns, eq(schema.mailCampaigns.id, schema.mailCampaignItems.campaignId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.mailCampaignItems.companyId))
    .leftJoin(schema.feedItems, eq(schema.feedItems.companyId, schema.mailCampaignItems.companyId))
    .where(and(eq(schema.mailCampaignItems.status, "en_cours")));
  const plan = planAuditSwitch(rows.map((r) => ({ ...r, feedStage: r.feedStage ?? "" })), reservedSectors());
  const company = new Map(rows.map((r) => [r.itemId, r.companyId]));
  return plan.map((p) => ({ ...p, companyId: company.get(p.itemId)! }));
}
