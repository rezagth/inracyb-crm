import Link from "next/link";
import { listCompanies } from "@/server/queries";
import { eur } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icon";
import { Board } from "./board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const rows = await listCompanies();
  const open = rows.filter((c) => !["gagne", "perdu"].includes(c.stage));
  const cards = rows.map((c) => ({
    id: c.id,
    name: c.name,
    stage: c.stage,
    sector: c.sector,
    offer: c.offer,
    priority: c.priority,
    amountCents: c.amountCents,
    lastContact: c.lastContact,
    contact: c.contacts[0] ? [c.contacts[0].firstName, c.contacts[0].lastName].filter(Boolean).join(" ") : "",
  }));
  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={`${open.length} affaire${open.length > 1 ? "s" : ""} ouverte${open.length > 1 ? "s" : ""} · ${eur(open.reduce((a, c) => a + c.amountCents, 0), { round: true })} en jeu`}
        actions={
          <Link href="/entreprises/nouvelle" className="btn btn-pri">
            <Icon name="plus" />
            Nouvelle affaire
          </Link>
        }
      />
      <Board initial={cards} />
    </>
  );
}
