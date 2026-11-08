import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { fd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, LinkCell, ModTable, ModTip, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton } from "@/components/mod/cells";

export const metadata = { title: "Base de connaissances" };
const GRID = "minmax(0,3fr) 130px 120px 110px 40px";

export default async function KbPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const all = (await db.select().from(schema.kbArticles).orderBy(asc(schema.kbArticles.category), asc(schema.kbArticles.title)));
  const rows = all.filter((k) => (!f || k.category === f) && match(q, k.title, k.body));
  return (
    <>
      <PageHeader title="Base de connaissances" actions={<FormButton form="kb" label="Nouvel article" primary redirectTo="/savoir/{id}" />} />
      <div className="flex flex-col gap-4">
        <ModTip>Tes procédures, checklists et modèles internes : tout ce que tu ne veux pas réinventer à chaque client.</ModTip>
        <Stats
          items={[
            { l: "Articles", v: String(all.length) },
            { l: "Procédures", v: String(all.filter((k) => k.category === "Procédure").length) },
            { l: "Checklists", v: String(all.filter((k) => k.category === "Checklist").length) },
          ]}
        />
        <ModTable
          base="/savoir"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tous", n: all.length },
            { k: "Procédure", l: "Procédures" },
            { k: "Checklist", l: "Checklists" },
            { k: "Modèle", l: "Modèles" },
            { k: "Note", l: "Notes" },
          ]}
          cols={["Article", "Catégorie", "Mis à jour", "", ""]}
          grid={GRID}
          minW={720}
          empty="Aucun article dans cette vue."
          count={rows.length}
        >
          {rows.map((k) => (
            <Row key={k.id} grid={GRID}>
              <LinkCell href={`/savoir/${k.id}`} t={k.title} />
              <Cell t={k.category} className="text-muted-fg" />
              <Cell t={fd(k.updatedOn)} className="num" />
              <FormButton form="kb" id={k.id} label="Modifier" small icon={null} preset={{ title: k.title, category: k.category, body: k.body }} />
              <DeleteButton entity="kb" id={k.id} />
            </Row>
          ))}
        </ModTable>
      </div>
    </>
  );
}
