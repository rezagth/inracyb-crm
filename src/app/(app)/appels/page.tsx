import Link from "next/link";
import { and, desc, eq, gte, inArray, like, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { fd, today, addDays } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, ModTable, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton } from "@/components/mod/cells";
import { Card } from "@/components/ui";
import { rankQueue, telHref } from "@/lib/call-queue";
import { REPLIED_REASON } from "@/lib/campaign";
import { REPORT_VIEWED } from "@/lib/report-link";
import { CallQueue, type QueueRow } from "./call-queue";

export const metadata = { title: "Appels" };
const GRID = "110px minmax(0,1.4fr) 140px 80px minmax(0,2fr) 40px";
const TONE: Record<string, string> = { "RDV obtenu": "ok", Joint: "info", Messagerie: "warn", "Pas de réponse": "neu" };

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const all = await db.query.calls.findMany({ orderBy: [desc(schema.calls.date), desc(schema.calls.createdAt)], with: { company: { columns: { id: true, name: true } } } });
  const t = today();
  const week = all.filter((c) => c.date > addDays(t, -7));
  const reached = week.filter((c) => c.result === "Joint" || c.result === "RDV obtenu").length;
  const queue = await callQueue(t);
  const rows = all.filter((c) => (!f || (f === "semaine" ? c.date > addDays(t, -7) : c.result === f)) && match(q, c.company.name, c.note, c.result));
  return (
    <>
      <PageHeader title="Appels" subtitle="Le journal de tous tes appels. Les appels guidés de la Prospection s'y enregistrent tout seuls." actions={<FormButton form="call" label="Noter un appel" icon="phone" primary companies={(await companyOptions())} />} />
      <div className="flex flex-col gap-4">
        <Card title={`À appeler aujourd'hui (${queue.length})`}>
          <CallQueue rows={queue} today={t} />
        </Card>
        <Stats
          items={[
            { l: "Appels sur 7 jours", v: String(week.length) },
            { l: "Taux de joignabilité", v: week.length ? `${Math.round((reached / week.length) * 100)} %` : "—", s: "Joint ou RDV, sur 7 jours" },
            { l: "RDV obtenus sur 7 jours", v: String(week.filter((c) => c.result === "RDV obtenu").length) },
            { l: "Aujourd'hui", v: String(all.filter((c) => c.date === t).length) },
          ]}
        />
        <ModTable
          title="Journal des appels"
          base="/appels"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tous", n: all.length },
            { k: "semaine", l: "7 derniers jours" },
            { k: "RDV obtenu", l: "RDV" },
            { k: "Messagerie", l: "Messagerie" },
          ]}
          cols={["Date", "Entreprise", "Résultat", "Durée", "Note", ""]}
          grid={GRID}
          empty="Aucun appel noté pour l'instant. Lance un appel guidé depuis la Prospection."
          count={rows.length}
        >
          {rows.map((c) => (
            <Row key={c.id} grid={GRID}>
              <span className="num text-muted-fg">{fd(c.date)}</span>
              <Link href={`/entreprises/${c.company.id}`} className="link truncate font-medium">
                {c.company.name}
              </Link>
              <span>
                <span className={`pill tone-${TONE[c.result] ?? "neu"}`}>{c.result}</span>
              </span>
              <span className="num text-muted-fg">{c.durationMin ? `${c.durationMin} min` : "—"}</span>
              <Cell t={c.note || "—"} className="text-muted-fg" />
              <DeleteButton entity="call" id={c.id} label="Supprimer l'appel" />
            </Row>
          ))}
        </ModTable>
      </div>
    </>
  );
}

/** File d'appels du jour : tâches « appel » ouvertes dont l'échéance est arrivée, les plus chaudes d'abord. */
async function callQueue(t: string): Promise<QueueRow[]> {
  const tasks = await db.select().from(schema.tasks).where(and(eq(schema.tasks.kind, "appel"), eq(schema.tasks.done, false), lte(schema.tasks.dueDate, t)));
  const ids = [...new Set(tasks.map((x) => x.companyId).filter((x): x is string => !!x))];
  if (!ids.length) return [];
  const [companies, contacts, views, replied, openings, tries] = await Promise.all([
    db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(inArray(schema.companies.id, ids)),
    db.select().from(schema.contacts).where(inArray(schema.contacts.companyId, ids)),
    db.select({ companyId: schema.events.companyId, at: schema.events.createdAt }).from(schema.events).where(and(inArray(schema.events.companyId, ids), like(schema.events.text, `${REPORT_VIEWED}%`))),
    db.select({ companyId: schema.mailCampaignItems.companyId }).from(schema.mailCampaignItems).where(and(inArray(schema.mailCampaignItems.companyId, ids), eq(schema.mailCampaignItems.stopReason, REPLIED_REASON))),
    db.select({ companyId: schema.events.companyId, text: schema.events.text, at: schema.events.createdAt }).from(schema.events).where(and(inArray(schema.events.companyId, ids), like(schema.events.text, "Appel prévu le %"))).orderBy(desc(schema.events.createdAt)),
    db.select({ companyId: schema.calls.companyId, at: schema.calls.createdAt }).from(schema.calls).where(and(inArray(schema.calls.companyId, ids), inArray(schema.calls.result, ["Pas de réponse", "Messagerie"]), gte(schema.calls.date, addDays(t, -60)))),
  ]);
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
  return rankQueue(entries, t).map(({ viewedOn: _v, replied: _r, createdAt: _c, ...row }) => row);
}
