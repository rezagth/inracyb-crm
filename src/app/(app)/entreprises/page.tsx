import Link from "next/link";
import { listCompanies } from "@/server/queries";
import { stageOf, statusOfStage } from "@/lib/constants";
import { eur, fd, initials } from "@/lib/format";
import { Avatar, Badge, Card, EmptyState, PageHeader, toneFor } from "@/components/ui";
import { Icon } from "@/components/icon";

export const metadata = { title: "Entreprises" };

const FILTERS = [
  ["", "Toutes"],
  ["prospect", "Prospects"],
  ["discussion", "En discussion"],
  ["client", "Clients"],
  ["perdu", "Perdus"],
] as const;

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "" } = await searchParams;
  const rows = await listCompanies({ q: q.trim() || undefined, status: status || undefined });
  const qs = (st: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (st) p.set("status", st);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  return (
    <>
      <PageHeader
        title="Entreprises"
        subtitle={`${rows.length} entreprise${rows.length > 1 ? "s" : ""}`}
        actions={
          <Link href="/entreprises/nouvelle" className="btn btn-pri">
            <Icon name="plus" />
            Nouvelle entreprise
          </Link>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3">
          <form className="flex h-9 w-full max-w-[300px] items-center gap-2 rounded-lg border border-border px-2.5 text-subtle-fg">
            <Icon name="search" />
            <input name="q" defaultValue={q} placeholder="Nom, secteur, ville…" aria-label="Filtrer les entreprises" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none" />
            {status && <input type="hidden" name="status" value={status} />}
          </form>
          <nav className="seg" aria-label="Statut">
            {FILTERS.map(([k, l]) => (
              <Link key={k} href={`/entreprises${qs(k)}`} className={status === k ? "on" : ""} aria-current={status === k ? "page" : undefined}>
                {l}
              </Link>
            ))}
          </nav>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title={q || status ? "Aucune entreprise ne correspond" : "Aucune entreprise pour l'instant"}
            text="Ajoute ton premier prospect pour démarrer."
            action={
              <Link href="/entreprises/nouvelle" className="btn btn-pri btn-sm">
                <Icon name="plus" />
                Nouvelle entreprise
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className="th">Entreprise</th>
                  <th className="th">Secteur</th>
                  <th className="th">Statut</th>
                  <th className="th">Étape</th>
                  <th className="th text-right">Montant estimé</th>
                  <th className="th">Dernier contact</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const st = statusOfStage(c.stage);
                  const contact = c.contacts[0];
                  return (
                    <tr key={c.id} className="tr">
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <Avatar text={initials(c.name)} tone={toneFor(c.id)} />
                          <div className="flex min-w-0 flex-col">
                            <Link href={`/entreprises/${c.id}`} className="link truncate font-medium">
                              {c.name}
                            </Link>
                            {contact && <span className="truncate text-xs text-subtle-fg">{[contact.firstName, contact.lastName].join(" ")}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="td text-muted-fg">{c.sector}</td>
                      <td className="td">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="td text-muted-fg">{stageOf(c.stage).label}</td>
                      <td className="td num text-right">{c.amountCents ? eur(c.amountCents, { round: true }) : "—"}</td>
                      <td className="td num text-muted-fg">{fd(c.lastContact)}</td>
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
