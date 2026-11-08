import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { hfmt, missionOptions } from "@/server/opts";
import { MISSION_STATUS } from "@/lib/forms";
import { addDays, fd, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { BarCell, Cell, LinkCell, ModTable, ModTip, PillCell, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { PatchSelect } from "@/components/mod/cells";

export const metadata = { title: "Missions" };
const GRID = "minmax(0,2fr) 140px minmax(0,1.4fr) 150px 110px";
const active = (s: string) => s === "a_demarrer" || s === "en_cours";

export default async function MissionsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const t = today();
  const all = await db.query.missions.findMany({ orderBy: [asc(schema.missions.due)], with: { company: { columns: { id: true, name: true } }, times: { columns: { hours: true, date: true } } } });
  const monthH = all.flatMap((m) => m.times).filter((x) => x.date.startsWith(t.slice(0, 7))).reduce((a, x) => a + x.hours, 0);
  const late = all.filter((m) => active(m.status) && m.due < t);
  const rows = all.filter((m) => (!f || (f === "actives" ? active(m.status) : !active(m.status))) && match(q, m.title, m.company.name, m.offer));
  const missions = await missionOptions();
  return (
    <>
      <PageHeader title="Missions" />
      <div className="flex flex-col gap-4">
        <ModTip>Ce que tu dois livrer : audits, RSSI du mois, projets IA. Le temps saisi se compare au budget pour savoir si tes prix tiennent (7 h par jour).</ModTip>
        <Stats
          items={[
            { l: "Missions en cours", v: String(all.filter((m) => m.status === "en_cours").length) },
            { l: "Heures saisies ce mois", v: hfmt(monthH), s: "toutes missions" },
            { l: "En retard", v: String(late.length), s: "échéance dépassée", alert: late.length > 0 },
            { l: "À livrer sous 7 jours", v: String(all.filter((m) => active(m.status) && m.due >= t && m.due <= addDays(t, 7)).length) },
          ]}
        />
        <ModTable
          base="/missions"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Toutes", n: all.length },
            { k: "actives", l: "Actives" },
            { k: "terminees", l: "Terminées" },
          ]}
          actions={
            <>
              <FormButton form="time" label="Saisir du temps" small icon="p_temps" missions={missions} />
              <FormButton form="mission" label="Nouvelle mission" primary small companies={(await companyOptions())} />
            </>
          }
          cols={["Mission", "Échéance", "Temps passé / budget", "Statut", ""]}
          grid={GRID}
          minW={840}
          empty="Aucune mission dans cette vue."
          count={rows.length}
        >
          {rows.map((m) => {
            const h = m.times.reduce((a, x) => a + x.hours, 0);
            const budgetH = m.budgetDays * 7;
            const pct = budgetH ? (h / budgetH) * 100 : 0;
            return (
              <Row key={m.id} grid={GRID}>
                <LinkCell href={`/entreprises/${m.company.id}`} t={m.title} sub={`${m.company.name} · ${m.offer}`} />
                {active(m.status) && m.due < t ? <PillCell t="En retard" tone="ko" sub={fd(m.due)} /> : <Cell t={fd(m.due)} sub={`début ${fd(m.start).slice(0, 5)}`} className="num" />}
                <BarCell pct={pct} t={`${hfmt(h)} / ${String(m.budgetDays).replace(".", ",")} j`} color={pct > 100 ? "var(--ko-fg)" : "var(--accent)"} />
                <PatchSelect entity="mission" id={m.id} field="status" value={m.status} options={MISSION_STATUS} label="Statut de la mission" />
                <FormButton form="time" label="Temps" small icon="plus" missions={missions} preset={{ missionId: m.id }} />
              </Row>
            );
          })}
        </ModTable>
      </div>
    </>
  );
}
