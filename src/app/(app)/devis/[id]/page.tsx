import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuote } from "@/server/queries";
import { getSettings } from "@/server/core";
import { INVOICE_STATUS, QUOTE_STATUS } from "@/lib/constants";
import { isDraftNumber } from "@/lib/billing";
import { eur, fd, fdt } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DocSheet } from "@/components/documents/doc-sheet";
import { PrintButton } from "@/components/documents/print-button";
import { PdfButton } from "@/components/documents/pdf-button";
import { QuoteActions } from "./actions-panel";
import { mailtoHref, quoteMail } from "@/lib/billing-mails";
import { documentPdfFilename } from "@/lib/document-pdf";
import { brevoReady } from "@/server/brevo";
import { lastDocumentSend } from "@/server/queries";

export const metadata = { title: "Devis" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await getQuote(id);
  if (!q) notFound();
  const s = (await getSettings());
  const st = QUOTE_STATUS[q.status] ?? { label: q.status, tone: "neu" as const };
  const contact = q.company.contacts.find((c) => c.email);
  const quoteMailText = quoteMail({ number: q.number, subject: q.subject, totalHtCents: q.totals.ht, validUntil: q.validUntil, firstName: contact?.firstName ?? "", sender: { legalName: s.legalName, tradeName: s.tradeName, phone: s.phone, iban: s.iban, payLink: s.payLink, latePenalty: s.latePenalty } });
  const mailto = mailtoHref(contact?.email, quoteMailText);
  const lastSent = brevoReady() && !isDraftNumber(q.number) ? await lastDocumentSend(q.companyId, `Devis ${q.number} envoy`) : null;
  const send = brevoReady() && !isDraftNumber(q.number)
    ? {
        recipients: q.company.contacts.filter((c) => c.email).map((c) => ({ email: c.email, name: `${c.firstName} ${c.lastName}`.trim() })),
        attachment: documentPdfFilename("devis", q.number),
        mail: quoteMailText,
        alreadySent: lastSent ? `Déjà envoyé le ${fdt(lastSent.createdAt)} (${lastSent.text}). Un nouvel envoi repartira avec le PDF.` : null,
      }
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
        actions={
          <span className="flex gap-2">
            <Link className="btn btn-sec" href={`/devis/${q.id}/contrat`}>Contrat de mission</Link>
            {!isDraftNumber(q.number) && <PdfButton kind="devis" id={q.id} />}
            <PrintButton />
          </span>
        }
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
          <QuoteActions id={q.id} status={q.status} remainingHt={q.totalHtCents - q.invoicedHt} mailto={mailto} send={send} />
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
