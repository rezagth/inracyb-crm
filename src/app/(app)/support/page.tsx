import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { TICKET_STATUS } from "@/lib/forms";
import { daysBetween, fd, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, LinkCell, ModTable, ModTip, PillCell, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { PatchSelect } from "@/components/mod/cells";

export const metadata = { title: "Support" };
const GRID = "minmax(0,2.2fr) 110px 120px 140px 140px";
const SLA: Record<string, string> = { haute: "4 h ouvrées", normale: "1 jour ouvré", basse: "3 jours ouvrés" };
const PRIO = { haute: ["Haute", "ko"], normale: ["Normale", "info"], basse: ["Basse", "neu"] } as const;

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const t = today();
  const all = (await db.query.tickets.findMany({ orderBy: [desc(schema.tickets.openedOn)], with: { company: { columns: { id: true, name: true } } } })).sort((a, b) => Number(a.status === "resolu") - Number(b.status === "resolu"));
  const open = all.filter((x) => x.status !== "resolu");
  const hot = open.filter((x) => x.priority === "haute").length;
  const rows = all.filter((x) => (!f || (f === "ouverts" ? x.status !== "resolu" : x.status === "resolu")) && match(q, x.subject, x.company.name));
  return (
    <>
      <PageHeader title="Support" actions={<FormButton form="ticket" label="Nouveau ticket" primary companies={(await companyOptions())} />} />
      <div className="flex flex-col gap-4">
        <ModTip>Les demandes de tes clients en RSSI externalisé. Délais cibles en heures ouvrées (pas d&apos;astreinte 24 h/24) : écris-les dans tes contrats.</ModTip>
        <Stats
          items={[
            { l: "Tickets ouverts", v: String(open.length) },
            { l: "Priorité haute ouverts", v: String(hot), s: hot ? "à traiter en premier" : "aucun", alert: hot > 0 },
            { l: "Résolus ce mois", v: String(all.filter((x) => x.status === "resolu" && (x.resolvedOn ?? "").startsWith(t.slice(0, 7))).length) },
          ]}
        />
        <ModTable
          base="/support"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tous", n: all.length },
            { k: "ouverts", l: "Ouverts", n: open.length },
            { k: "resolus", l: "Résolus" },
          ]}
          cols={["Ticket", "Priorité", "Ouvert le", "Délai cible", "Statut"]}
          grid={GRID}
          minW={820}
          empty="Aucun ticket dans cette vue."
          count={rows.length}
        >
          {rows.map((x) => {
            const p = PRIO[x.priority as keyof typeof PRIO] ?? PRIO.normale;
            const age = daysBetween(x.openedOn, t);
            return (
              <Row key={x.id} grid={GRID}>
                <LinkCell href={`/entreprises/${x.company.id}`} t={x.subject} sub={x.company.name + (x.description ? ` · ${x.description}` : "")} />
                <PillCell t={p[0]} tone={p[1]} />
                <Cell t={fd(x.openedOn)} sub={x.status === "resolu" ? "résolu" : age ? `il y a ${age} j` : "aujourd'hui"} className="num" />
                <Cell t={SLA[x.priority] ?? ""} sub="délai cible" />
                <PatchSelect entity="ticket" id={x.id} field="status" value={x.status} options={TICKET_STATUS} label="Statut du ticket" />
              </Row>
            );
          })}
        </ModTable>
      </div>
    </>
  );
}
