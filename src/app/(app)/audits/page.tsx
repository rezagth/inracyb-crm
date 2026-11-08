import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { CONTROLS, auditScore } from "@/lib/audit";
import { fd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { BarCell, Cell, LinkCell, ModTable, ModTip, PillCell, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";

export const metadata = { title: "Audits" };
const GRID = "minmax(0,2fr) 110px minmax(0,1.4fr) 100px 120px 110px";

export default async function AuditsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const all = (await db.query.audits.findMany({ orderBy: [desc(schema.audits.date)], with: { company: { columns: { id: true, name: true } } } })).map((a) => ({ ...a, sc: auditScore(JSON.parse(a.answers || "{}")) }));
  const rows = all.filter((a) => (!f || a.status === f) && match(q, a.company.name));
  const scored = all.filter((a) => a.sc.answered);
  return (
    <>
      <PageHeader title="Audits" actions={<FormButton form="audit" label="Nouvel audit" primary companies={(await companyOptions())} redirectTo="/audits/{id}" />} />
      <div className="flex flex-col gap-4">
        <ModTip>Ton questionnaire d&apos;audit en {CONTROLS.length} points de contrôle : tu coches sur place, le score se calcule, le plan d&apos;action et le rapport se génèrent en un clic.</ModTip>
        <Stats
          items={[
            { l: "Audits en cours", v: String(all.filter((a) => a.status === "en_cours").length) },
            { l: "Audits terminés", v: String(all.filter((a) => a.status === "termine").length) },
            { l: "Score moyen", v: scored.length ? `${Math.round(scored.reduce((x, a) => x + a.sc.pct, 0) / scored.length)} %` : "—", s: "tous clients" },
          ]}
        />
        <ModTable
          base="/audits"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tous", n: all.length },
            { k: "en_cours", l: "En cours" },
            { k: "termine", l: "Terminés" },
          ]}
          cols={["Client", "Date", "Avancement", "Score", "Statut", ""]}
          grid={GRID}
          minW={820}
          empty="Aucun audit. Démarre-en un pour ton prochain client."
          count={rows.length}
        >
          {rows.map((a) => (
            <Row key={a.id} grid={GRID}>
              <LinkCell href={`/audits/${a.id}`} t={a.company.name} />
              <Cell t={fd(a.date)} className="num" />
              <BarCell pct={(a.sc.answered / a.sc.total) * 100} t={`${a.sc.answered} / ${a.sc.total}`} />
              <PillCell t={`${a.sc.pct} %`} tone={a.sc.pct >= 75 ? "ok" : a.sc.pct >= 40 ? "warn" : "ko"} />
              <PillCell t={a.status === "termine" ? "Terminé" : "En cours"} tone={a.status === "termine" ? "ok" : "info"} />
              <Link href={`/audits/${a.id}`} className="btn btn-sec btn-sm justify-self-start">
                Ouvrir
              </Link>
            </Row>
          ))}
        </ModTable>
      </div>
    </>
  );
}
