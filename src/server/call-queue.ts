import "server-only";
import { and, desc, eq, gte, inArray, like, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays } from "@/lib/format";
import { rankQueue, telHref, type QueueRow } from "@/lib/call-queue";
import { REPLIED_REASON } from "@/lib/campaign";
import { REPORT_VIEWED } from "@/lib/report-link";
import { LEAD_EVENT } from "@/lib/lead";

/** File d'appels du jour : tâches « appel » ouvertes dont l'échéance est arrivée, les plus chaudes d'abord. */
export async function callQueue(t: string): Promise<QueueRow[]> {
  const tasks = await db.select().from(schema.tasks).where(and(eq(schema.tasks.kind, "appel"), eq(schema.tasks.done, false), lte(schema.tasks.dueDate, t)));
  const ids = [...new Set(tasks.map((x) => x.companyId).filter((x): x is string => !!x))];
  if (!ids.length) return [];
  const [companies, contacts, views, replied, openings, tries, inbound] = await Promise.all([
    db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(inArray(schema.companies.id, ids)),
    db.select().from(schema.contacts).where(inArray(schema.contacts.companyId, ids)),
    db.select({ companyId: schema.events.companyId, at: schema.events.createdAt }).from(schema.events).where(and(inArray(schema.events.companyId, ids), like(schema.events.text, `${REPORT_VIEWED}%`))),
    db.select({ companyId: schema.mailCampaignItems.companyId }).from(schema.mailCampaignItems).where(and(inArray(schema.mailCampaignItems.companyId, ids), eq(schema.mailCampaignItems.stopReason, REPLIED_REASON))),
    db.select({ companyId: schema.events.companyId, text: schema.events.text, at: schema.events.createdAt }).from(schema.events).where(and(inArray(schema.events.companyId, ids), like(schema.events.text, "Appel prévu le %"))).orderBy(desc(schema.events.createdAt)),
    db.select({ companyId: schema.calls.companyId, at: schema.calls.createdAt }).from(schema.calls).where(and(inArray(schema.calls.companyId, ids), inArray(schema.calls.result, ["Pas de réponse", "Messagerie"]), gte(schema.calls.date, addDays(t, -60)))),
    db.select({ companyId: schema.events.companyId }).from(schema.events).where(and(inArray(schema.events.companyId, ids), like(schema.events.text, `${LEAD_EVENT}%`), gte(schema.events.createdAt, new Date(Date.now() - 7 * 86_400_000)))),
  ]);
  const inboundSet = new Set(inbound.map((r) => r.companyId));
  const name = new Map(companies.map((c) => [c.id, c.name]));
  const iso = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);
  const viewed = new Map<string, string>();
  for (const v of views) if (v.companyId && iso(v.at) > (viewed.get(v.companyId) ?? "")) viewed.set(v.companyId, iso(v.at));
  const repliedSet = new Set(replied.map((r) => r.companyId));
  const entries = tasks
    .filter((x) => x.companyId && name.has(x.companyId))
    .map((x) => {
      const cid = x.companyId!;
      const cts = contacts.filter((c) => c.companyId === cid).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      const ct = cts.find((c) => telHref(c.phone)) ?? cts[0];
      // Le numéro cité dans le titre de la tâche prime : c'est celui qu'on a préparé.
      const fromTitle = / au ([+\d][\d .]{7,20}\d)/.exec(x.title)?.[1] ?? "";
      const phone = fromTitle || ct?.phone || "";
      const contact = ct && !/^standard$/i.test(ct.firstName) ? [ct.firstName, ct.lastName].filter(Boolean).join(" ") + (ct.role ? ` (${ct.role})` : "") : "";
      const opening = openings.find((o) => o.companyId === cid)?.text.split("\n\n").slice(1).join("\n\n") ?? "";
      return {
        taskId: x.id,
        dueDate: x.dueDate,
        viewedOn: viewed.get(cid) ?? "",
        replied: repliedSet.has(cid),
        inbound: inboundSet.has(cid),
        createdAt: x.createdAt.getTime(),
        companyId: cid,
        company: name.get(cid)!,
        contact,
        phone,
        tel: telHref(phone),
        title: x.title,
        opening,
        attempts: tries.filter((c) => c.companyId === cid && c.at >= x.createdAt).length,
      };
    });
  return rankQueue(entries, t).map(({ viewedOn: _v, replied: _r, createdAt: _c, inbound: _i, ...row }) => row);
}
