import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { fdt, today } from "@/lib/format";
import { weekStart } from "@/server/opts";
import { PageHeader } from "@/components/ui";
import { Cell, LinkCell, ModTable, ModTip, PillCell, Row, Stats, match } from "@/components/mod/layout";

export const metadata = { title: "Activité" };
const GRID = "130px 150px minmax(0,1.2fr) minmax(0,3fr)";
const EVT: Record<string, [string, "info" | "warn" | "ok" | "neu"]> = {
  call: ["Appel", "info"],
  mail: ["Mail", "info"],
  quote: ["Devis / contrat", "warn"],
  invoice: ["Facture", "warn"],
  payment: ["Paiement", "ok"],
  stage: ["Pipeline", "neu"],
  create: ["Création", "neu"],
  note: ["Note", "neu"],
  task: ["Tâche", "neu"],
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const all = await db.query.events.findMany({ orderBy: [desc(schema.events.createdAt)], limit: 1000, with: { company: { columns: { id: true, name: true } } } });
  const t = today();
  const day = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);
  const ws = weekStart(t);
  const rows = all.filter((e) => (!f || (f === "quote" ? e.type === "quote" || e.type === "invoice" || e.type === "payment" : e.type === f)) && match(q, e.text, e.company?.name)).slice(0, 300);
  return (
    <>
      <PageHeader title="Activité" />
      <div className="flex flex-col gap-4">
        <ModTip>Tout ce qui s&apos;est passé dans ton entreprise, du plus récent au plus ancien : appels, mails, devis, factures, paiements, étapes du pipeline.</ModTip>
        <Stats
          items={[
            { l: "Événements aujourd'hui", v: String(all.filter((e) => day(e.createdAt) === t).length) },
            { l: "Cette semaine", v: String(all.filter((e) => day(e.createdAt) >= ws).length) },
            { l: "Au total", v: String(all.length) },
          ]}
        />
        <ModTable
          base="/activite"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tout" },
            { k: "call", l: "Appels" },
            { k: "mail", l: "Mails" },
            { k: "quote", l: "Devis et factures" },
            { k: "stage", l: "Pipeline" },
            { k: "note", l: "Notes" },
          ]}
          cols={["Quand", "Type", "Entreprise", "Détail"]}
          grid={GRID}
          minW={860}
          empty="Aucun événement dans cette vue."
          count={rows.length}
        >
          {rows.map((e) => {
            const ty = EVT[e.type] ?? ["Autre", "neu"];
            return (
              <Row key={e.id} grid={GRID}>
                <Cell t={fdt(e.createdAt)} className="num" />
                <PillCell t={ty[0]} tone={ty[1]} />
                {e.company ? <LinkCell href={`/entreprises/${e.company.id}`} t={e.company.name} /> : <Cell t="—" className="text-subtle-fg" />}
                <Cell t={e.text} />
              </Row>
            );
          })}
        </ModTable>
      </div>
    </>
  );
}
