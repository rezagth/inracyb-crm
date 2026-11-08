import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { PARTNER_STATUS } from "@/lib/forms";
import { PageHeader } from "@/components/ui";
import { Cell, ModTable, ModTip, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton, PatchNumber, PatchSelect } from "@/components/mod/cells";

export const metadata = { title: "Partenaires" };
const GRID = "minmax(0,1.8fr) minmax(0,1.2fr) minmax(0,1.4fr) 100px 120px 150px 80px";

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const all = (await db.select().from(schema.partners).orderBy(asc(schema.partners.name)));
  const rows = all.filter((p) => (!f || (f === "apporteurs" ? p.type === "Apporteur d'affaires" : p.type !== "Apporteur d'affaires")) && match(q, p.name, p.specialty, p.contact));
  return (
    <>
      <PageHeader title="Partenaires" actions={<FormButton form="partner" label="Nouveau partenaire" primary />} />
      <div className="flex flex-col gap-4">
        <ModTip>Trouve des partenaires pour ce que tu ne fais pas (tests d&apos;intrusion, SOC 24 h/24) : tu restes l&apos;interlocuteur du client. Les apporteurs d&apos;affaires (comptables, avocats) sont ta meilleure source de clients : note les leads qu&apos;ils t&apos;envoient.</ModTip>
        <Stats
          items={[
            { l: "Partenaires actifs", v: String(all.filter((p) => p.status === "actif").length) },
            { l: "À trouver ou contacter", v: String(all.filter((p) => p.status === "a_trouver" || p.status === "a_contacter").length) },
            { l: "Leads reçus", v: String(all.reduce((a, p) => a + p.leads, 0)), s: "via tes apporteurs" },
          ]}
        />
        <ModTable
          base="/partenaires"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tous", n: all.length },
            { k: "partenaires", l: "Partenaires" },
            { k: "apporteurs", l: "Apporteurs" },
          ]}
          cols={["Partenaire", "Type", "Contact", "Commission", "Leads", "Statut", ""]}
          grid={GRID}
          minW={900}
          empty="Aucun partenaire. Commence par un expert-comptable ou un avocat de ton réseau."
          count={rows.length}
        >
          {rows.map((p) => (
            <Row key={p.id} grid={GRID}>
              <Cell t={p.name} sub={p.specialty} className="font-medium" />
              <Cell t={p.type} className="text-muted-fg" />
              <Cell t={p.contact || "—"} className="text-muted-fg" />
              <Cell t={p.commission || "—"} className="num" />
              <PatchNumber entity="partner" id={p.id} field="leads" value={p.leads} label={`Leads de ${p.name}`} />
              <PatchSelect entity="partner" id={p.id} field="status" value={p.status} options={PARTNER_STATUS} label={`Statut de ${p.name}`} />
              <DeleteButton entity="partner" id={p.id} />
            </Row>
          ))}
        </ModTable>
      </div>
    </>
  );
}
