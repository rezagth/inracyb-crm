import Link from "next/link";
import { listQuotes } from "@/server/queries";
import { QUOTE_STATUS } from "@/lib/constants";
import { eur, fd } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icon";

export const metadata = { title: "Devis" };

const FILTERS = [
  ["", "Tous"],
  ["brouillon", "Brouillons"],
  ["envoye", "Envoyés"],
  ["accepte", "Acceptés"],
  ["refuse", "Refusés"],
] as const;

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  const all = await listQuotes();
  const rows = status ? all.filter((q) => q.status === status) : all;
  const sent = all.filter((q) => q.status === "envoye");
  const decided = all.filter((q) => q.status === "accepte" || q.status === "refuse");
  const rate = decided.length ? Math.round((all.filter((q) => q.status === "accepte").length / decided.length) * 100) : null;
  return (
    <>
      <PageHeader
        title="Devis"
        subtitle={`${sent.length} en attente de réponse · ${eur(sent.reduce((a, q) => a + q.totalHtCents, 0), { round: true })} HT${rate !== null ? ` · taux de signature ${rate} %` : ""}`}
        actions={
          <Link href="/devis/nouveau" className="btn btn-pri">
            <Icon name="plus" />
            Nouveau devis
          </Link>
        }
      />
      <Card>
        <div className="border-b border-border-subtle px-5 py-3">
          <nav className="seg" aria-label="Statut">
            {FILTERS.map(([k, l]) => (
              <Link key={k} href={k ? `/devis?status=${k}` : "/devis"} className={status === k ? "on" : ""} aria-current={status === k ? "page" : undefined}>
                {l}
              </Link>
            ))}
          </nav>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Aucun devis" text="Crée un devis depuis une fiche entreprise ou avec le bouton ci-dessus." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className="th">Numéro</th>
                  <th className="th">Client</th>
                  <th className="th">Objet</th>
                  <th className="th">Date</th>
                  <th className="th">Validité</th>
                  <th className="th text-right">Montant HT</th>
                  <th className="th">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => {
                  const st = QUOTE_STATUS[q.status] ?? { label: q.status, tone: "neu" as const };
                  return (
                    <tr key={q.id} className="tr">
                      <td className="td whitespace-nowrap font-mono text-xs">
                        <Link className="link" href={`/devis/${q.id}`}>
                          {q.number.startsWith("BROUILLON-") ? "Brouillon" : q.number}
                        </Link>
                      </td>
                      <td className="td">
                        <Link className="link" href={`/entreprises/${q.companyId}`}>
                          {q.company.name}
                        </Link>
                      </td>
                      <td className="td max-w-[260px] truncate text-muted-fg">{q.subject}</td>
                      <td className="td num text-muted-fg">{fd(q.issueDate)}</td>
                      <td className="td num text-muted-fg">{fd(q.validUntil)}</td>
                      <td className="td num text-right">{eur(q.totals.ht)}</td>
                      <td className="td">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
