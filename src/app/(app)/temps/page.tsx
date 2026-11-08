import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/server/core";
import { hfmt, missionOptions, weekStart } from "@/server/opts";
import { eur, fd, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, ModTable, ModTip, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton, PatchCheck } from "@/components/mod/cells";

export const metadata = { title: "Temps" };
const GRID = "100px minmax(0,1.6fr) minmax(0,2fr) 80px 90px 40px";

export default async function TimePage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const t = today();
  const ws = weekStart(t);
  const tjm = (await getSettings()).tjmCents;
  const all = await db.query.timeEntries.findMany({ orderBy: [desc(schema.timeEntries.date), desc(schema.timeEntries.createdAt)], with: { mission: { with: { company: { columns: { name: true } } } } } });
  const week = all.filter((x) => x.date >= ws);
  const weekH = week.reduce((a, x) => a + x.hours, 0);
  const weekBill = week.filter((x) => x.billable).reduce((a, x) => a + x.hours, 0);
  const monthH = all.filter((x) => x.date.startsWith(t.slice(0, 7))).reduce((a, x) => a + x.hours, 0);
  const rows = all.filter((x) => (!f || (f === "semaine" ? x.date >= ws : x.date.startsWith(t.slice(0, 7)))) && match(q, x.mission?.title, x.mission?.company.name, x.description));
  return (
    <>
      <PageHeader title="Temps" actions={<FormButton form="time" label="Saisir du temps" primary missions={await missionOptions()} />} />
      <div className="flex flex-col gap-4">
        <ModTip>Saisis ton temps chaque jour, même le non facturable : c&apos;est ce qui te dira si tes forfaits sont bien calibrés.</ModTip>
        <Stats
          items={[
            { l: "Heures cette semaine", v: hfmt(weekH) },
            { l: "Part facturable", v: weekH ? `${Math.round((weekBill / weekH) * 100)} %` : "—", s: "cette semaine" },
            { l: "Valeur facturable", v: tjm ? eur((weekBill / 7) * tjm, { round: true }) : "—", s: tjm ? `au TJM de ${eur(tjm, { round: true })}` : "Renseigne ton TJM dans Paramètres" },
            { l: "Heures ce mois", v: hfmt(monthH) },
          ]}
        />
        <ModTable
          base="/temps"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tout" },
            { k: "semaine", l: "Cette semaine" },
            { k: "mois", l: "Ce mois" },
          ]}
          cols={["Date", "Mission", "Description", "Durée", "Facturable", ""]}
          grid={GRID}
          minW={780}
          empty="Aucune saisie dans cette période."
          count={rows.length}
        >
          {rows.map((x) => (
            <Row key={x.id} grid={GRID}>
              <Cell t={fd(x.date)} className="num" />
              <Cell t={x.mission?.title ?? "Interne"} sub={x.mission?.company.name ?? "non rattaché"} />
              <Cell t={x.description || "—"} className="text-muted-fg" />
              <Cell t={hfmt(x.hours)} className="num" />
              <PatchCheck entity="time" id={x.id} field="billable" value={x.billable} label={x.billable ? "Marquer non facturable" : "Marquer facturable"} />
              <DeleteButton entity="time" id={x.id} />
            </Row>
          ))}
        </ModTable>
      </div>
    </>
  );
}
