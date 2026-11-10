import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { prospectList } from "@/server/queries";
import { getSettings } from "@/server/core";
import { brevoConfig, brevoReady } from "@/server/brevo";
import { appUrl, optoutSet } from "@/server/campaigns";
import { exclusionOf, EXCLUSION_LABEL } from "@/lib/campaign";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Campagnes } from "./campagnes";

export const metadata = { title: "Campagnes" };
export const maxDuration = 60;

export default async function CampagnesPage() {
  const s = await getSettings();
  const t = today();
  const optouts = await optoutSet();
  const campaigns = await db.select().from(schema.mailCampaigns).orderBy(sql`${schema.mailCampaigns.createdAt} desc`);
  const items = await db
    .select({ item: schema.mailCampaignItems, company: schema.companies.name })
    .from(schema.mailCampaignItems)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.mailCampaignItems.companyId));
  const inCampaign = new Set(items.filter((i) => i.item.status === "en_cours").map((i) => i.item.companyId));
  const prospects = (await prospectList()).map((p) => {
    const ex = exclusionOf({ id: p.id, name: p.name, stage: p.stage, email: p.email }, optouts, inCampaign);
    return { id: p.id, name: p.name, sector: p.sector, email: p.email, why: ex ? EXCLUSION_LABEL[ex] : null };
  });
  const sentToday = Number((await db.select({ n: sql<number>`count(*)` }).from(schema.mailSends).where(eq(schema.mailSends.sentOn, t)))[0]?.n ?? 0);
  const offers = s.offers.split(",").filter((x): x is "audit" | "ciso" | "ia" => ["audit", "ciso", "ia"].includes(x));
  return (
    <>
      <PageHeader title="Campagnes" subtitle="Envoie une séquence de mails (J0, J+3, J+7, J+14) à plusieurs entreprises d'un coup : le CRM étale les envois et s'arrête tout seul si l'entreprise avance, est perdue ou se désinscrit." />
      <Campagnes
        prospects={prospects}
        offers={offers.length ? offers : ["audit"]}
        ready={brevoReady()}
        urlOk={!!appUrl()}
        dailyLimit={brevoConfig().dailyLimit}
        sentToday={sentToday}
        fromEmail={brevoConfig().fromEmail}
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          offer: c.offer,
          status: c.status,
          items: items.filter((i) => i.item.campaignId === c.id).map((i) => ({ id: i.item.id, company: i.company, step: i.item.nextStep, due: i.item.nextDue, status: i.item.status, reason: i.item.stopReason, error: i.item.lastError })),
        }))}
      />
    </>
  );
}
