import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuote } from "@/server/queries";
import { getSettings } from "@/server/core";
import { INVOICE_STATUS, QUOTE_STATUS } from "@/lib/constants";
import { isDraftNumber } from "@/lib/billing";
import { eur, fd } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DocSheet } from "@/components/documents/doc-sheet";
import { PrintButton } from "@/components/documents/print-button";
import { QuoteActions } from "./actions-panel";

export const metadata = { title: "Devis" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await getQuote(id);
  if (!q) notFound();
  const s = (await getSettings());
  const st = QUOTE_STATUS[q.status] ?? { label: q.status, tone: "neu" as const };
  const contact = q.company.contacts.find((c) => c.email);
  const mailto = contact
    ? `mailto:${contact.email}?subject=${encodeURIComponent(`Devis ${q.number} — ${q.subject}`)}&body=${encodeURIComponent(
        `Bonjour ${contact.firstName},\n\nComme convenu, vous trouverez ci-joint le devis ${q.number} pour « ${q.subject} », d'un montant de ${eur(q.totals.ht)} HT, valable jusqu'au ${fd(q.validUntil)}.\n\nPour l'accepter, il suffit de me le retourner signé avec la mention « Bon pour accord ». Je reste disponible pour en parler.\n\nBien cordialement,\n${s.legalName || s.tradeName}\n${s.tradeName}`,
      )}`
    : null;
  return (
    <>
      <PageHeader
        title={isDraftNumber(q.number) ? "Devis (brouillon)" : `Devis ${q.number}`}
        back={{ href: "/devis", label: "Devis" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            <Link className="link" href={`/entreprises/${q.companyId}`}>
              {q.company.name}
            </Link>
          </span>
        }
        actions={<PrintButton />}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <DocSheet
          kind="devis"
          number={q.number}
          issueDate={q.issueDate}
          dueDate={q.validUntil}
          subject={q.subject}
          note={q.note}
          discountBp={q.discountBp}
          lines={q.lines}
          totals={q.totals}
          company={q.company}
          settings={s}
          signedBy={q.signedBy}
          signedAt={q.signedAt}
        />
        <aside className="no-print flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
          <QuoteActions id={q.id} status={q.status} remainingHt={q.totalHtCents - q.invoicedHt} mailto={mailto} />
          {q.invoices.length > 0 && (
            <Card title="Factures liées">
              <ul>
                {q.invoices.map((iv) => (
                  <li key={iv.id} className="flex items-center justify-between gap-2 border-t border-border-subtle px-5 py-2.5 text-[13px] first:border-t-0">
                    <Link className="link font-mono text-xs" href={`/factures/${iv.id}`}>
                      {isDraftNumber(iv.number) ? "Brouillon" : iv.number}
                    </Link>
                    <span className="num">{eur(iv.totalHtCents)}</span>
                    <Badge tone={INVOICE_STATUS[iv.status]?.tone ?? "neu"}>{INVOICE_STATUS[iv.status]?.label ?? iv.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
