import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { INCIDENT_STATUS } from "@/lib/forms";
import { fd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, LinkCell, ModTable, ModTip, PillCell, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { PatchSelect } from "@/components/mod/cells";

export const metadata = { title: "Incidents" };
const GRID = "minmax(0,2.4fr) 150px 100px 110px 130px 130px";
const SEV = { faible: ["Faible", "neu"], moyenne: ["Moyenne", "warn"], grave: ["Grave", "ko"] } as const;

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const all = await db.query.incidents.findMany({ orderBy: [desc(schema.incidents.date)], with: { company: { columns: { id: true, name: true } } } });
  const open = all.filter((i) => i.status !== "clos");
  const rows = all.filter((i) => (!f || (f === "ouverts" ? i.status !== "clos" : i.status === "clos")) && match(q, i.title, i.type, i.company.name));
  return (
    <>
      <PageHeader title="Incidents" actions={<FormButton form="incident" label="Déclarer un incident" primary companies={(await companyOptions())} />} />
      <div className="flex flex-col gap-4">
        <ModTip>
          Le registre des incidents de tes clients. Si des données personnelles sont touchées et qu&apos;il existe un risque pour les personnes, le client (responsable de traitement) doit notifier la CNIL dans les 72 heures (article 33 du RGPD) : aide-le à le faire. Ta procédure de réponse est dans la Base de connaissances.
        </ModTip>
        <Stats
          items={[
            { l: "Incidents ouverts", v: String(open.length) },
            { l: "Graves ouverts", v: String(open.filter((i) => i.severity === "grave").length), alert: open.some((i) => i.severity === "grave") },
            { l: "Données personnelles touchées", v: String(all.filter((i) => i.personalData === "oui").length), s: "vérifier la notification CNIL", alert: open.some((i) => i.personalData === "oui") },
            { l: "Total", v: String(all.length) },
          ]}
        />
        <ModTable
          base="/incidents"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tous", n: all.length },
            { k: "ouverts", l: "Ouverts", n: open.length },
            { k: "clos", l: "Clos" },
          ]}
          cols={["Incident", "Type", "Gravité", "Date", "Données perso.", "Statut"]}
          grid={GRID}
          minW={920}
          empty="Aucun incident dans cette vue."
          count={rows.length}
        >
          {rows.map((i) => {
            const sv = SEV[i.severity as keyof typeof SEV] ?? SEV.moyenne;
            return (
              <Row key={i.id} grid={GRID}>
                <LinkCell href={`/entreprises/${i.company.id}`} t={i.title} sub={i.company.name + (i.actions ? ` · ${i.actions}` : "")} />
                <Cell t={i.type} className="text-muted-fg" />
                <PillCell t={sv[0]} tone={sv[1]} />
                <Cell t={fd(i.date)} className="num" />
                <PillCell t={i.personalData === "oui" ? "Oui · CNIL ?" : i.personalData === "inconnu" ? "À vérifier" : "Non"} tone={i.personalData === "oui" ? "ko" : i.personalData === "inconnu" ? "warn" : "neu"} />
                <PatchSelect entity="incident" id={i.id} field="status" value={i.status} options={INCIDENT_STATUS} label="Statut de l'incident" />
              </Row>
            );
          })}
        </ModTable>
      </div>
    </>
  );
}
