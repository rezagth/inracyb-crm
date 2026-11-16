import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BOUNCE_REASONS, REASON } from "@/lib/brevo-events";
import { REPLIED_REASON, serviceOf } from "@/lib/campaign";
import type { ProspectRecord } from "@/lib/campaign-report";
import { isSegment, segmentOfSector } from "@/lib/diagnostic-mails";

const day = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);

/** Une ligne par entreprise et par campagne, avec ce qui lui est arrivé : la matière du bilan par service et segment. */
export async function prospectRecords(): Promise<ProspectRecord[]> {
  const items = await db
    .select({ item: schema.mailCampaignItems, offer: schema.mailCampaigns.offer, segment: schema.mailCampaigns.segment, sector: schema.companies.sector })
    .from(schema.mailCampaignItems)
    .innerJoin(schema.mailCampaigns, eq(schema.mailCampaigns.id, schema.mailCampaignItems.campaignId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.mailCampaignItems.companyId));
  const sends = await db.select({ companyId: schema.mailSends.companyId, offer: schema.mailSends.offer, sentOn: schema.mailSends.sentOn }).from(schema.mailSends);
  const contacts = await db.select({ companyId: schema.contacts.companyId, email: schema.contacts.email }).from(schema.contacts);
  const delivered = await db.select({ email: schema.mailEvents.email, service: schema.mailEvents.service }).from(schema.mailEvents).where(eq(schema.mailEvents.type, "delivre"));
  const meetings = await db.select({ companyId: schema.meetings.companyId, date: schema.meetings.date }).from(schema.meetings);
  const quotes = await db.select({ companyId: schema.quotes.companyId, signedAt: schema.quotes.signedAt, issueDate: schema.quotes.issueDate }).from(schema.quotes).where(eq(schema.quotes.status, "accepte"));

  // Brevo n'envoie l'accusé de remise que si l'événement « delivered » est coché dans le webhook : sans aucun accusé, la colonne reste inconnue.
  const tracked = delivered.length > 0;
  const deliveredTo = new Set(delivered.map((d) => d.service + "|" + d.email));
  return items.map(({ item, offer, segment, sector }) => {
    const service = serviceOf(offer);
    const mine = sends.filter((s) => s.companyId === item.companyId && s.offer === offer).map((s) => s.sentOn).sort();
    const emails = contacts.filter((c) => c.companyId === item.companyId).map((c) => c.email.trim().toLowerCase()).filter(Boolean);
    return {
      service,
      segment: service === "diagnostic" ? (isSegment(segment) ? segment : "autres") : (segmentOfSector(sector) ?? "autres"),
      firstSend: mine[0] ?? null,
      mails: mine.length,
      delivered: tracked ? emails.some((e) => deliveredTo.has(service + "|" + e)) : null,
      bounced: BOUNCE_REASONS.includes(item.stopReason),
      complained: item.stopReason === REASON.spam,
      optedOut: item.stopReason === REASON.desinscrit,
      replied: item.stopReason === REPLIED_REASON,
      meetings: meetings.filter((m) => m.companyId === item.companyId).map((m) => m.date),
      signed: quotes.filter((q) => q.companyId === item.companyId).map((q) => (q.signedAt ? day(q.signedAt) : q.issueDate)),
    };
  });
}
