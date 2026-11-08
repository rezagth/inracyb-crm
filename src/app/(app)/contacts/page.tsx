import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { initials } from "@/lib/format";
import { Avatar, PageHeader, toneFor } from "@/components/ui";
import { Cell, ModTable, Row, match } from "@/components/mod/layout";

export const metadata = { title: "Contacts" };
const GRID = "minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,1.6fr) minmax(0,1fr)";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const all = await db.query.contacts.findMany({ orderBy: [asc(schema.contacts.lastName), asc(schema.contacts.firstName)], with: { company: { columns: { id: true, name: true } } } });
  const rows = all.filter((c) => match(q, c.firstName, c.lastName, c.role, c.email, c.company.name));
  return (
    <>
      <PageHeader title="Contacts" subtitle={`${rows.length} interlocuteur${rows.length > 1 ? "s" : ""} · ajoute-les depuis la fiche d'une entreprise`} />
      <ModTable base="/contacts" q={q} cols={["Contact", "Entreprise", "Fonction", "E-mail", "Téléphone"]} grid={GRID} empty={q ? "Aucun contact ne correspond." : "Aucun contact. Ils s'ajoutent depuis la fiche d'une entreprise."} count={rows.length}>
        {rows.map((c) => (
          <Row key={c.id} grid={GRID}>
            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar text={initials(`${c.firstName} ${c.lastName}`)} tone={toneFor(c.id)} />
              <span className="truncate font-medium">
                {c.firstName} {c.lastName}
              </span>
            </span>
            <Link href={`/entreprises/${c.company.id}?tab=contacts`} className="link truncate">
              {c.company.name}
            </Link>
            <Cell t={c.role || "—"} className="text-muted-fg" />
            <span className="truncate text-muted-fg">{c.email ? <a className="link" href={`mailto:${c.email}`}>{c.email}</a> : "—"}</span>
            <span className="num truncate text-muted-fg">{c.phone ? <a className="link" href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a> : "—"}</span>
          </Row>
        ))}
      </ModTable>
    </>
  );
}
