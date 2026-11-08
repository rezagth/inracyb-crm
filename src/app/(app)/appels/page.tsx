import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { fd, today, addDays } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, ModTable, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton } from "@/components/mod/cells";

export const metadata = { title: "Appels" };
const GRID = "110px minmax(0,1.4fr) 140px 80px minmax(0,2fr) 40px";
const TONE: Record<string, string> = { "RDV obtenu": "ok", Joint: "info", Messagerie: "warn", "Pas de réponse": "neu" };

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const all = await db.query.calls.findMany({ orderBy: [desc(schema.calls.date), desc(schema.calls.createdAt)], with: { company: { columns: { id: true, name: true } } } });
  const t = today();
  const week = all.filter((c) => c.date > addDays(t, -7));
  const reached = week.filter((c) => c.result === "Joint" || c.result === "RDV obtenu").length;
  const rows = all.filter((c) => (!f || (f === "semaine" ? c.date > addDays(t, -7) : c.result === f)) && match(q, c.company.name, c.note, c.result));
  return (
    <>
      <PageHeader title="Appels" subtitle="Le journal de tous tes appels. Les appels guidés de la Prospection s'y enregistrent tout seuls." actions={<FormButton form="call" label="Noter un appel" icon="phone" primary companies={(await companyOptions())} />} />
      <div className="flex flex-col gap-4">
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
