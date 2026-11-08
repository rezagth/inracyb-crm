import Link from "next/link";
import { db, schema } from "@/db";
import { financeData } from "@/server/finance";
import { hfmt } from "@/server/opts";
import { eur, pct } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { BarCell, Cell, LinkCell, ModTable, ModTip, Panel, Panels, Row, Stats } from "@/components/mod/layout";

export const metadata = { title: "Rentabilité" };
const GRID = "minmax(0,1.8fr) 130px 110px minmax(0,1.6fr) 110px";

export default async function ProfitPage() {
  const d = await financeData();
  const s = d.s;
  const toHt = (c: number) => (s.tvaFranchise ? c : Math.round(c / 1.2));
  const companies = await db.query.companies.findMany({
    columns: { id: true, name: true },
    with: { invoices: { columns: { id: true }, with: { payments: { columns: { amountCents: true } } } }, missions: { columns: { id: true }, with: { times: { columns: { hours: true } } } }, contracts: { columns: { status: true, monthlyCents: true } } },
  });
  const rows = companies
    .map((c) => {
      const ca = c.invoices.flatMap((i) => i.payments).reduce((a, p) => a + toHt(p.amountCents), 0);
      const h = c.missions.flatMap((m) => m.times).reduce((a, x) => a + x.hours, 0);
      return { id: c.id, name: c.name, ca, h, eph: h ? ca / h : 0, mrr: c.contracts.filter((k) => k.status === "actif").reduce((a, k) => a + k.monthlyCents, 0) };
    })
    .filter((r) => r.ca || r.h || r.mrr)
    .sort((a, b) => b.ca - a.ca);
  const totalH = (await db.select().from(schema.timeEntries)).reduce((a, x) => a + x.hours, 0);
  const hSum = rows.reduce((a, r) => a + r.h, 0),
    caSum = rows.reduce((a, r) => a + (r.h ? r.ca : 0), 0);
  const target = s.tjmCents ? s.tjmCents / 7 : 0;
  const maxEph = Math.max(1, ...rows.map((r) => r.eph));
  const goalNet = s.goalNetCents;
  const charges = d.recurMonthly * 12;
  const caNeeded = goalNet ? Math.round((goalNet + charges) / Math.max(0.01, 1 - d.effRate / 100)) : 0;
  const fromMrr = d.mrr * 12;
  const remaining = Math.max(0, caNeeded - fromMrr);
  const avgA = s.avgAuditCents,
    avgR = s.avgRssiCents;
  const over = goalNet && s.caCeilingCents && caNeeded > s.caCeilingCents;
  return (
    <>
      <PageHeader title="Rentabilité" />
      <div className="flex flex-col gap-4">
        <ModTip>Ce que chaque client te rapporte vraiment (encaissé divisé par le temps passé), et combien de clients il te faut pour atteindre ton objectif de revenu.</ModTip>
        <Stats
          items={[
            { l: "Encaissé cette année", v: eur(d.cashYear, { round: true }) },
            { l: "Heures saisies", v: hfmt(totalH), s: "toutes missions" },
            { l: "Revenu horaire moyen", v: hSum ? `${eur(caSum / hSum, { round: true })} / h` : "—", s: target ? `cible : ${eur(target, { round: true })} / h (TJM ÷ 7)` : "Renseigne ton TJM pour une cible" },
            { l: "CA annuel nécessaire", v: goalNet ? eur(caNeeded, { round: true }) : "—", s: goalNet ? `pour ${eur(goalNet, { round: true })} net` : "Fixe ton objectif net dans Paramètres", alert: !!over },
          ]}
        />
        <Panels>
          <Panel
            title="Prévisionnel : de quoi as-tu besoin ?"
            rows={
              goalNet
                ? [
                    { l: "Objectif de revenu net annuel", v: eur(goalNet, { round: true }) },
                    { l: "Abonnements et charges (an)", v: eur(charges, { round: true }) },
                    { l: "Cotisations (taux effectif)", v: pct(d.effRate) },
                    { l: "Chiffre d'affaires nécessaire", v: eur(caNeeded, { round: true }), strong: true },
                    { l: "Déjà couvert par tes contrats (MRR × 12)", v: eur(fromMrr, { round: true }), pct: caNeeded ? (fromMrr / caNeeded) * 100 : 0, color: "var(--ok-fg)" },
                    { l: "Reste à trouver", v: eur(remaining, { round: true }) },
                    { l: "… soit en audits", v: avgA ? `${Math.ceil(remaining / avgA)} audits à ${eur(avgA, { round: true })}` : "prix moyen à définir" },
                    { l: "… ou en clients RSSI", v: avgR ? `${Math.ceil(remaining / (avgR * 12))} clients à ${eur(avgR, { round: true })} / mois` : "mensuel moyen à définir" },
                    { l: "… ou un mélange 50/50", v: avgA && avgR ? `${Math.ceil(remaining / 2 / (avgR * 12))} clients RSSI + ${Math.ceil(remaining / 2 / avgA)} audits` : "—" },
                    { l: "Par mois", v: eur(caNeeded / 12, { round: true }) },
                  ]
                : [{ l: "Objectif de revenu net", v: "à définir" }]
            }
            note={over ? `Attention : ce chiffre d'affaires dépasse le plafond de la micro-entreprise (${eur(s.caCeilingCents, { round: true })}). Il faudra changer de statut : parles-en à un expert-comptable.` : "Règle ton objectif net, ton prix moyen d'audit et ton mensuel RSSI dans Paramètres › Objectifs."}
          >
            <Link href="/parametres" className="btn btn-sec btn-sm self-start">
              Régler mes objectifs
            </Link>
          </Panel>
        </Panels>
        <ModTable title="Rentabilité par client" base="/rentabilite" search={false} cols={["Client", "Encaissé (HT)", "Temps passé", "Revenu horaire", "MRR"]} grid={GRID} minW={820} empty="Pas encore de données : encaisse des factures et saisis ton temps." count={rows.length}>
          {rows.map((r) => (
            <Row key={r.id} grid={GRID}>
              <LinkCell href={`/entreprises/${r.id}`} t={r.name} />
              <Cell t={eur(r.ca, { round: true })} className="num" />
              <Cell t={hfmt(r.h)} className="num" />
              {r.h ? <BarCell pct={(r.eph / maxEph) * 100} t={`${eur(r.eph, { round: true })} / h`} color={target && r.eph < target ? "var(--warn-fg)" : "var(--ok-fg)"} /> : <Cell t="temps non saisi" className="text-subtle-fg" />}
              <Cell t={r.mrr ? eur(r.mrr, { round: true }) : "—"} className="num" />
            </Row>
          ))}
        </ModTable>
      </div>
    </>
  );
}
