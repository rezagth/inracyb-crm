import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { OFFERS } from "@/lib/constants";
import { eur, fd, initials } from "@/lib/format";
import { Avatar, EmptyState, PageHeader, toneFor } from "@/components/ui";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const rows = await db.query.companies.findMany({
    where: eq(schema.companies.stage, "gagne"),
    with: {
      contacts: { where: eq(schema.contacts.isPrimary, true), limit: 1 },
      quotes: { columns: { status: true, totalHtCents: true } },
      contracts: { columns: { status: true, monthlyCents: true } },
      invoices: { columns: { kind: true }, with: { payments: { columns: { amountCents: true } } } },
    },
  });
  return (
    <>
      <PageHeader title="Clients" subtitle={`${rows.length} client${rows.length > 1 ? "s" : ""} gagné${rows.length > 1 ? "s" : ""}`} />
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="Pas encore de client" text="Un devis accepté ou un contrat signé fait passer l'entreprise en client." action={<Link href="/pipeline" className="btn btn-pri btn-sm">Voir le pipeline</Link>} />
        </div>
      ) : (
        <section className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {rows.map((c, i) => {
            const signed = c.quotes.filter((q) => q.status === "accepte").reduce((a, q) => a + q.totalHtCents, 0);
            const mrr = c.contracts.filter((k) => k.status === "actif").reduce((a, k) => a + k.monthlyCents, 0);
            const paid = c.invoices.flatMap((iv) => iv.payments).reduce((a, p) => a + p.amountCents, 0);
            const ct = c.contacts[0];
            return (
              <Link key={c.id} href={`/entreprises/${c.id}`} className="card rise flex flex-col gap-3.5 p-5 transition-shadow hover:shadow-[var(--shadow-hover)]" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="flex w-full items-center gap-3">
                  <Avatar text={initials(c.name)} tone={toneFor(c.id)} size={40} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold">{c.name}</span>
                    <span className="truncate text-xs text-subtle-fg">
                      {c.sector}
                      {c.city ? ` · ${c.city}` : ""}
                    </span>
                  </span>
                </span>
                <span className="chip self-start">{OFFERS.find((o) => o.id === c.offer)?.label}</span>
                <span className="flex w-full justify-between text-[13px]">
                  <span className="text-muted-fg">CA signé</span>
                  <span className="num font-semibold">{eur(signed, { round: true })}</span>
                </span>
                <span className="flex w-full justify-between text-[13px]">
                  <span className="text-muted-fg">Encaissé</span>
                  <span className="num">{eur(paid, { round: true })}</span>
                </span>
                {mrr > 0 && (
                  <span className="flex w-full justify-between text-[13px]">
                    <span className="text-muted-fg">Récurrent</span>
                    <span className="num">{eur(mrr, { round: true })} / mois</span>
                  </span>
                )}
                <span className="flex w-full justify-between border-t border-border-subtle pt-3 text-xs text-subtle-fg">
                  <span className="truncate">{ct ? `${ct.firstName} ${ct.lastName}` : "Aucun contact"}</span>
                  <span className="num">Contact {fd(c.lastContact)}</span>
                </span>
              </Link>
            );
          })}
        </section>
      )}
    </>
  );
}
