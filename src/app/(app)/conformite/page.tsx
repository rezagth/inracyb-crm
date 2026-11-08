import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { RGPD_STATUS } from "@/lib/forms";
import { fd, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, ModTable, ModTip, PillCell, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton, PatchCheck, PatchSelect } from "@/components/mod/cells";

export const metadata = { title: "Conformité" };
const GRID = "40px minmax(0,3fr) 140px 170px 40px";
const RG = "minmax(0,1.6fr) minmax(0,1.1fr) minmax(0,1.6fr) minmax(0,1.2fr) 130px 40px";

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const t = today();
  const obs = (await db.select().from(schema.obligations)).sort((a, b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
  const rgpd = (await db.select().from(schema.rgpdRecords).orderBy(asc(schema.rgpdRecords.createdAt)));
  const pending = obs.filter((o) => !o.done);
  const late = pending.filter((o) => o.due && o.due < t);
  const next = pending.filter((o) => o.due && o.due >= t)[0];
  const rows = obs.filter((o) => (!f || (f === "afaire" ? !o.done : o.done)) && match(q, o.title, o.category, o.note));
  return (
    <>
      <PageHeader title="Conformité" />
      <div className="flex flex-col gap-4">
        <ModTip>Tes obligations d&apos;entrepreneur et ta conformité RGPD au même endroit. Les dates indiquées sont à confirmer sur les sites officiels (urssaf.fr, impots.gouv.fr, cnil.fr).</ModTip>
        <Stats
          items={[
            { l: "Obligations remplies", v: `${obs.length - pending.length} / ${obs.length}` },
            { l: "En retard", v: String(late.length), s: late[0]?.title ?? "aucune", alert: late.length > 0 },
            { l: "Prochaine échéance", v: next ? fd(next.due) : "—", s: next?.title },
            { l: "Registre RGPD", v: `${rgpd.filter((r) => r.status === "valide").length} / ${rgpd.length}`, s: "traitements validés" },
          ]}
        />
        <ModTable
          title="Obligations"
          base="/conformite"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Toutes", n: obs.length },
            { k: "afaire", l: "À faire", n: pending.length },
            { k: "faites", l: "Faites" },
          ]}
          actions={<FormButton form="obligation" label="Ajouter" primary small />}
          cols={["", "Obligation", "Catégorie", "Échéance", ""]}
          grid={GRID}
          minW={760}
          empty="Rien dans cette vue."
          count={rows.length}
        >
          {rows.map((o) => (
            <Row key={o.id} grid={GRID}>
              <PatchCheck entity="obligation" id={o.id} field="done" value={o.done} label={(o.done ? "Rouvrir : " : "Marquer comme faite : ") + o.title} />
              <span className="flex min-w-0 flex-col gap-0.5 py-1">
                <span className={o.done ? "text-subtle-fg line-through" : ""}>{o.title}</span>
                {o.note && <span className="text-xs leading-snug text-subtle-fg">{o.note}</span>}
              </span>
              <Cell t={o.category} className="text-muted-fg" />
              {!o.due ? <Cell t="—" className="text-subtle-fg" /> : !o.done && o.due < t ? <PillCell t="En retard" tone="ko" sub={fd(o.due)} /> : <Cell t={fd(o.due)} className="num" />}
              <DeleteButton entity="obligation" id={o.id} />
            </Row>
          ))}
        </ModTable>
        <ModTable title="Registre RGPD des traitements" base="/conformite" search={false} actions={<FormButton form="rgpd" label="Ajouter un traitement" small />} cols={["Traitement", "Base légale", "Données", "Conservation", "Statut", ""]} grid={RG} minW={940} empty="Aucun traitement." count={rgpd.length}>
          {rgpd.map((r) => (
            <Row key={r.id} grid={RG}>
              <Cell t={r.name} sub={r.purpose} />
              <Cell t={r.basis} className="text-muted-fg" />
              <Cell t={r.data} className="text-muted-fg" />
              <Cell t={r.keep} className="text-muted-fg" />
              <PatchSelect entity="rgpd" id={r.id} field="status" value={r.status} options={RGPD_STATUS} label="Statut du traitement" />
              <DeleteButton entity="rgpd" id={r.id} />
            </Row>
          ))}
        </ModTable>
      </div>
    </>
  );
}
