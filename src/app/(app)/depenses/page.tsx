import { financeData } from "@/server/finance";
import { eur, fd, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, ModTable, ModTip, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton, PatchCheck } from "@/components/mod/cells";

export const metadata = { title: "Dépenses" };
const GRID = "100px minmax(0,1.6fr) minmax(0,1.2fr) 110px 100px 100px 40px";
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const d = await financeData();
  const all = [...d.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const missing = all.filter((e) => !e.proof).length;
  const rows = all.filter((e) => (!f || (f === "recurrentes" ? e.recurring !== "Non" : !e.proof)) && match(q, e.supplier, e.category));
  return (
    <>
      <PageHeader title="Dépenses" actions={<FormButton form="expense" label="Nouvelle dépense" primary />} />
      <div className="flex flex-col gap-4">
        <ModTip>En micro-entreprise, les dépenses ne se déduisent pas de ton chiffre d&apos;affaires : ce suivi sert à piloter ta trésorerie et à garder tes justificatifs. Coche le justificatif dès que tu l&apos;as rangé.</ModTip>
        <Stats
          items={[
            { l: `Dépenses ${today().slice(0, 4)}`, v: eur(d.expYear, { round: true }) },
            { l: "Ce mois", v: eur(d.expMonth, { round: true }), s: MONTHS[Number(today().slice(5, 7)) - 1] },
            { l: "Abonnements", v: eur(d.recurMonthly, { round: true }), s: "par mois en moyenne" },
            { l: "Justificatifs manquants", v: String(missing), alert: missing > 0 },
          ]}
        />
        <ModTable
          base="/depenses"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Toutes", n: all.length },
            { k: "recurrentes", l: "Récurrentes" },
            { k: "sansjustif", l: "Sans justificatif", n: missing },
          ]}
          cols={["Date", "Fournisseur", "Catégorie", "Montant TTC", "Récurrence", "Justificatif", ""]}
          grid={GRID}
          minW={800}
          empty="Aucune dépense dans cette vue."
          count={rows.length}
        >
          {rows.map((e) => (
            <Row key={e.id} grid={GRID}>
              <Cell t={fd(e.date)} className="num" />
              <Cell t={e.supplier} />
              <Cell t={e.category} className="text-muted-fg" />
              <Cell t={eur(e.amountCents)} className="num" />
              <Cell t={e.recurring} className="text-muted-fg" />
              <PatchCheck entity="expense" id={e.id} field="proof" value={e.proof} label={e.proof ? "Justificatif conservé" : "Marquer le justificatif comme conservé"} />
              <DeleteButton entity="expense" id={e.id} />
            </Row>
          ))}
        </ModTable>
      </div>
    </>
  );
}
