import { financeData } from "@/server/finance";
import { eur, fd, pct, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icon";
import { ModTip, Panel, Panels, Stats } from "@/components/mod/layout";

export const metadata = { title: "Trésorerie" };

export default async function TreasuryPage() {
  const d = await financeData();
  const s = d.s;
  const year = today().slice(0, 4);
  const max = Math.max(1, ...d.months.map((m) => m.cents));
  const ceil = s.caCeilingCents,
    tva = s.tvaThresholdCents;
  return (
    <>
      <PageHeader title="Trésorerie" />
      <div className="flex flex-col gap-4">
        <ModTip>Taux, plafonds et seuils viennent de Paramètres : vérifie-les chaque année sur urssaf.fr et impots.gouv.fr. Les montants encaissés sont comptés hors taxes.</ModTip>
        <Stats
          items={[
            { l: `Encaissé en ${year}`, v: eur(d.cashYear, { round: true }), s: s.goalCaCents ? `${Math.round((d.cashYear / s.goalCaCents) * 100)} % de l'objectif` : "Objectif à définir dans Paramètres" },
            { l: "Cotisations estimées", v: eur(d.cotisYear, { round: true }), s: `taux effectif ${pct(d.effRate)}` },
            { l: `Dépenses ${year}`, v: eur(d.expYear, { round: true }) },
            { l: "Reste estimé", v: eur(d.cashYear - d.cotisYear - d.expYear, { round: true }), s: "encaissé − cotisations − dépenses" },
          ]}
        />
        <Panels>
          <Panel
            title="Seuils de la micro-entreprise"
            rows={[
              { l: "Plafond de chiffre d'affaires", v: ceil ? `${Math.round((d.cashYear / ceil) * 100)} % de ${eur(ceil, { round: true })}` : "à définir", pct: ceil ? (d.cashYear / ceil) * 100 : 0, color: ceil && d.cashYear / ceil > 0.8 ? "var(--ko-fg)" : "var(--ok-fg)" },
              { l: "Seuil de franchise de TVA", v: tva ? `${Math.round((d.cashYear / tva) * 100)} % de ${eur(tva, { round: true })}` : "à définir", pct: tva ? (d.cashYear / tva) * 100 : 0, color: tva && d.cashYear / tva > 0.8 ? "var(--warn-fg)" : "var(--accent)" },
              { l: "Franchise de TVA", v: s.tvaFranchise ? "Oui — TVA non applicable" : "Non — TVA à 20 %" },
            ]}
            note="Au-delà du seuil de franchise, tu devras facturer la TVA : surveille cette jauge."
          />
          <Panel
            title="Cotisations sociales"
            rows={[
              { l: "Taux de base", v: pct(s.socialRate) },
              { l: "ACRE", v: s.acre ? `−${pct(s.acreRate)} sur le taux` : "Non" },
              { l: "Formation professionnelle", v: pct(s.cfpRate) },
              { l: "Versement libératoire", v: s.vlEnabled ? pct(s.vlRate) : "Non" },
              { l: "Taux effectif", v: pct(d.effRate) },
              { l: "Prochaine déclaration", v: `${d.urssaf.label} · avant le ${fd(d.urssaf.deadline)}` },
              { l: "Montant estimé", v: eur(d.urssaf.amount), strong: true },
            ]}
          />
          <Panel
            title="Prévision à 3 mois"
            rows={[
              { l: "Contrats récurrents (MRR × 3)", v: `+ ${eur(d.mrr * 3, { round: true })}` },
              { l: "Factures à encaisser", v: `+ ${eur(d.due, { round: true })}` },
              { l: "Abonnements (× 3)", v: `− ${eur(d.recurMonthly * 3, { round: true })}` },
              { l: "Solde prévisionnel", v: eur(d.forecast, { round: true }), tone: d.forecast >= 0 ? "ok" : "ko" },
            ]}
            note="Hors nouvelles ventes et hors cotisations : c'est ton socle minimum."
          />
          <Panel title="Encaissements par mois" rows={d.months.map((m) => ({ l: m.label, v: eur(m.cents, { round: true }), pct: (m.cents / max) * 100 }))}>
            <a href={`/api/exports/livre-des-recettes?annee=${year}`} className="btn btn-sec btn-sm self-start">
              <Icon name="download" />
              Livre des recettes (CSV)
            </a>
          </Panel>
        </Panels>
      </div>
    </>
  );
}
