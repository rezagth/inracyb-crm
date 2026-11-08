import Link from "next/link";
import { listInvoices } from "@/server/queries";
import { isDraftNumber } from "@/lib/billing";
import { eur, fd, today } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Icon } from "@/components/icon";

export const metadata = { title: "Factures" };

const FILTERS = [
  ["", "Toutes"],
  ["brouillon", "Brouillons"],
  ["ouvertes", "À encaisser"],
  ["retard", "En retard"],
  ["payee", "Payées"],
  ["avoir", "Avoirs"],
] as const;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "" } = await searchParams;
  const all = await listInvoices();
  const t = today();
  const open = all.filter((i) => i.kind === "facture" && i.status === "envoyee" && i.totals.rest > 0);
  const late = open.filter((i) => i.dueDate < t);
  const year = t.slice(0, 4);
  const billedYear = all.filter((i) => i.kind === "facture" && i.status !== "brouillon" && i.status !== "annulee" && i.issueDate.startsWith(year)).reduce((a, i) => a + i.totals.ht, 0);
  const rows = all.filter((i) => {
    if (f === "brouillon") return i.status === "brouillon";
    if (f === "ouvertes") return open.includes(i);
    if (f === "retard") return late.includes(i);
    if (f === "payee") return i.status === "payee";
    if (f === "avoir") return i.kind === "avoir";
    return true;
  });
  return (
    <>
      <PageHeader
        title="Factures"
        subtitle="Numérotation continue, attribuée à l'émission. Une facture émise se corrige par un avoir."
        actions={
          <>
            <a href={`/api/exports/livre-des-recettes?annee=${year}`} className="btn btn-sec">
              <Icon name="download" />
              Livre des recettes {year}
            </a>
            <Link href="/factures/nouvelle" className="btn btn-pri">
              <Icon name="plus" />
              Nouvelle facture
            </Link>
          </>
        }
      />
      <div className="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <StatCard icon="receipt" label={`Facturé HT ${year}`} value={eur(billedYear, { round: true })} />
        <StatCard icon="bank" label="À encaisser" value={eur(open.reduce((a, i) => a + i.totals.rest, 0), { round: true })} sub={`${open.length} facture(s)`} />
        <StatCard icon="info" label="En retard" value={eur(late.reduce((a, i) => a + i.totals.rest, 0), { round: true })} sub={late.length ? `${late.length} facture(s) à relancer` : "Aucun retard"} tone={late.length ? "ko" : undefined} />
      </div>
      <Card>
        <div className="border-b border-border-subtle px-5 py-3">
          <nav className="seg" aria-label="Filtre">
            {FILTERS.map(([k, l]) => (
              <Link key={k} href={k ? `/factures?f=${k}` : "/factures"} className={f === k ? "on" : ""} aria-current={f === k ? "page" : undefined}>
                {l}
              </Link>
            ))}
          </nav>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Aucune facture" text="Crée une facture ou transforme un devis accepté." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className="th">Numéro</th>
                  <th className="th">Client</th>
                  <th className="th">Objet</th>
                  <th className="th">Émise le</th>
                  <th className="th">Échéance</th>
                  <th className="th text-right">Montant</th>
                  <th className="th text-right">Reste dû</th>
                  <th className="th">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="tr">
                    <td className="td whitespace-nowrap font-mono text-xs">
                      <Link className="link" href={`/factures/${i.id}`}>
                        {isDraftNumber(i.number) ? "Brouillon" : i.number}
                      </Link>
                    </td>
                    <td className="td">
                      <Link className="link" href={`/entreprises/${i.companyId}`}>
                        {i.company.name}
                      </Link>
                    </td>
                    <td className="td max-w-[240px] truncate text-muted-fg">{i.subject}</td>
                    <td className="td num text-muted-fg">{fd(i.issueDate)}</td>
                    <td className={`td num ${i.display.key === "retard" ? "text-ko" : "text-muted-fg"}`}>{i.kind === "avoir" ? "—" : fd(i.dueDate)}</td>
                    <td className="td num text-right">{eur(i.totals.ttc)}</td>
                    <td className="td num text-right">{i.status === "envoyee" ? eur(i.totals.rest) : "—"}</td>
                    <td className="td">
                      <Badge tone={i.display.tone}>{i.display.label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
