import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { DOC_STATUS } from "@/lib/forms";
import { fd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, LinkCell, ModTable, ModTip, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton, PatchSelect } from "@/components/mod/cells";

export const metadata = { title: "Documents" };
const GRID = "minmax(0,2.2fr) 120px minmax(0,1.2fr) 110px 150px 40px";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const all = await db.query.documents.findMany({ orderBy: [asc(schema.documents.type), asc(schema.documents.name)], with: { company: { columns: { id: true, name: true } } } });
  const rows = all.filter((d) => (!f || (f === "modeles" ? d.type === "Modèle" : d.type !== "Modèle")) && match(q, d.name, d.type, d.company?.name));
  return (
    <>
      <PageHeader title="Documents" actions={<FormButton form="doc" label="Nouveau document" primary companies={(await companyOptions())} redirectTo="/documents/{id}" />} />
      <div className="flex flex-col gap-4">
        <ModTip>Tes modèles et documents clés. Fais relire tes modèles juridiques (CGV, contrats, accord RGPD) par un professionnel avant de les utiliser. Tu peux coller le texte d&apos;un modèle ou le lien vers le fichier.</ModTip>
        <Stats
          items={[
            { l: "Modèles", v: String(all.filter((d) => d.type === "Modèle").length) },
            { l: "Documents clients", v: String(all.filter((d) => d.type !== "Modèle").length) },
            { l: "À rédiger ou relire", v: String(all.filter((d) => d.status === "a_rediger" || d.status === "a_relire").length) },
          ]}
        />
        <ModTable
          base="/documents"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tous", n: all.length },
            { k: "modeles", l: "Modèles" },
            { k: "clients", l: "Clients" },
          ]}
          cols={["Document", "Type", "Client", "Mis à jour", "Statut", ""]}
          grid={GRID}
          minW={860}
          empty="Aucun document dans cette vue."
          count={rows.length}
        >
          {rows.map((d) => (
            <Row key={d.id} grid={GRID}>
              <LinkCell href={`/documents/${d.id}`} t={d.name} />
              <Cell t={d.type} className="text-muted-fg" />
              {d.company ? <LinkCell href={`/entreprises/${d.company.id}`} t={d.company.name} /> : <Cell t="—" className="text-subtle-fg" />}
              <Cell t={fd(d.updatedOn)} className="num" />
              <PatchSelect entity="doc" id={d.id} field="status" value={d.status} options={DOC_STATUS} label="Statut du document" />
              <DeleteButton entity="doc" id={d.id} />
            </Row>
          ))}
        </ModTable>
      </div>
    </>
  );
}
