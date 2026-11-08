import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { getSettings } from "@/server/core";
import { billContractsAction } from "@/server/actions/clients";
import { CONTRACT_STATUS } from "@/lib/forms";
import { addDays, daysBetween, eur, fd, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, LinkCell, ModTable, ModTip, PillCell, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { PatchSelect, RunButton } from "@/components/mod/cells";

export const metadata = { title: "Contrats" };
const GRID = "minmax(0,1.6fr) 120px minmax(0,1.4fr) 80px 140px 170px";
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const s = (await getSettings());
  const t = today();
  const month = t.slice(0, 7);
  const mLabel = MONTHS[Number(month.slice(5)) - 1];
  const all = await db.query.contracts.findMany({ orderBy: [desc(schema.contracts.createdAt)], with: { company: { columns: { id: true, name: true } }, billings: true } });
  const active = all.filter((c) => c.status === "actif");
  const mrr = active.reduce((a, c) => a + c.monthlyCents, 0);
  const rows = all.filter((c) => (!f || c.status === f) && match(q, c.company.name, c.offer));
  return (
    <>
      <PageHeader title="Contrats" />
      <div className="flex flex-col gap-4">
        <ModTip>Tes contrats récurrents (RSSI externalisé, maintenance IA). Le MRR est ton revenu mensuel garanti : c&apos;est lui qui rend ton activité stable.</ModTip>
        <Stats
          items={[
            { l: "MRR (revenu mensuel récurrent)", v: eur(mrr, { round: true }), s: `${active.length} contrat(s) actif(s)` },
            { l: "ARR (sur 12 mois)", v: eur(mrr * 12, { round: true }), s: "MRR × 12" },
            { l: "Objectif de MRR", v: s.goalMrrCents ? `${Math.round((mrr / s.goalMrrCents) * 100)} %` : "—", s: s.goalMrrCents ? `sur ${eur(s.goalMrrCents, { round: true })}` : "À définir dans Paramètres" },
            { l: "Fin de contrat sous 90 jours", v: String(active.filter((c) => c.end && c.end <= addDays(t, 90)).length), s: "Anticipe le renouvellement" },
          ]}
        />
        <ModTable
          base="/contrats"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tous", n: all.length },
            { k: "actif", l: "Actifs", n: active.length },
            { k: "brouillon", l: "Brouillons" },
            { k: "termine", l: "Terminés" },
          ]}
          actions={
            <>
              <RunButton action={billContractsAction.bind(null, undefined)} label="Générer les factures du mois" />
              <FormButton form="contract" label="Nouveau contrat" primary small companies={(await companyOptions())} />
            </>
          }
          cols={["Client / offre", "Mensuel", "Période", "Préavis", "Statut", "Ce mois-ci"]}
          grid={GRID}
          minW={880}
          empty="Aucun contrat. Un client RSSI signé = un contrat ici."
          count={rows.length}
        >
          {rows.map((c) => {
            const billed = c.billings.some((b) => b.month === month);
            const left = c.end ? daysBetween(t, c.end) : null;
            return (
              <Row key={c.id} grid={GRID}>
                <LinkCell href={`/entreprises/${c.company.id}`} t={c.company.name} sub={c.offer} />
                <Cell t={eur(c.monthlyCents)} sub="HT par mois" className="num" />
                <Cell t={`${fd(c.start)} → ${fd(c.end)}`} sub={left !== null ? (left >= 0 ? `fin dans ${left} jours` : "terminé") : ""} />
                <Cell t={c.notice} />
                <PatchSelect entity="contract" id={c.id} field="status" value={c.status} options={CONTRACT_STATUS} label="Statut du contrat" />
                {billed ? <PillCell t={`${mLabel} facturé`} tone="ok" /> : c.status === "actif" ? <RunButton action={billContractsAction.bind(null, c.id)} label={`Facturer ${mLabel.toLowerCase()}`} /> : <Cell t="—" className="text-subtle-fg" />}
              </Row>
            );
          })}
        </ModTable>
      </div>
    </>
  );
}
